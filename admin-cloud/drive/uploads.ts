import { Buffer } from "node:buffer"
import { HttpError, object, text } from "../../admin-server/validation"
import type { ObjectRow } from "../store"
import type { ReportFile } from "../report-versions"
import { chunkBytes } from "../protocol"
import { DriveConnection, validFileId } from "./connection"

type Upload = {
  object_id: string
  file_id: string
  folder_id: string
  session_secret: string | null
  offset: number
  verified: number
  expected_sha256: string
  source_sha256: string | null
}
type FileInfo = {
  id: string
  size?: string
  sha256Checksum?: string
  ownedByMe?: boolean
  trashed?: boolean
  parents?: string[]
  mimeType?: string
  appProperties?: Record<string, string>
  permissions?: { type: string; role: string }[]
}
const fileFields =
  "id,size,sha256Checksum,ownedByMe,trashed,parents,mimeType,appProperties,permissions"
const conflict = () =>
  new HttpError(409, "Drive 전송 상태가 달라졌어요. 같은 PDF를 다시 선택해 이어서 확인해 주세요.")
export function safeUploadUrl(value: string) {
  try {
    const url = new URL(value)
    if (
      url.origin === "https://www.googleapis.com" &&
      !url.username &&
      !url.password &&
      /^\/upload\/drive\/v3\/files(?:\/[\w-]+)?$/.test(url.pathname) &&
      url.searchParams.get("uploadType") === "resumable" &&
      url.searchParams.has("upload_id")
    )
      return url.href
  } catch {
    /* Only a Google-issued resumable session is allowed. */
  }
  throw new HttpError(503, "Drive 업로드 주소 검증에 실패했어요.")
}
export class DriveUploads {
  readonly db
  constructor(
    readonly connection: DriveConnection,
    readonly now = connection.now,
  ) {
    this.db = connection.env.ADMIN_DB
  }
  async row(id: string) {
    const row = await this.db
      .prepare("SELECT * FROM drive_uploads WHERE object_id=?")
      .bind(id)
      .first<Upload>()
    if (!row) throw conflict()
    return row
  }
  async locked<T>(id: string, work: () => Promise<T>) {
    const lease = crypto.randomUUID()
    const claimed = await this.db
      .prepare(
        "UPDATE drive_uploads SET lease=?,lease_expires=? WHERE object_id=? AND lease_expires<=? RETURNING object_id",
      )
      .bind(lease, this.now + 120_000, id, this.now)
      .first()
    if (!claimed)
      throw new HttpError(409, "이 파일의 전송을 확인 중이에요. 잠시 후 다시 시도해 주세요.")
    try {
      return await work()
    } finally {
      await this.db
        .prepare(
          "UPDATE drive_uploads SET lease=NULL,lease_expires=0 WHERE object_id=? AND lease=?",
        )
        .bind(id, lease)
        .run()
    }
  }
  async begin(row: ObjectRow, input: unknown) {
    const raw = object(input),
      expected = text(raw.rawSha256, 64)
    if (!/^[a-f0-9]{64}$/.test(expected))
      throw new HttpError(400, "원본 파일 검증 값이 없어요. 관리자 화면을 새로고침해 주세요.")
    const ctx = await this.connection.context()
    await this.db
      .prepare(
        "INSERT OR IGNORE INTO drive_uploads(object_id,file_id,folder_id,expected_sha256) VALUES(?,'',?,?)",
      )
      .bind(row.id, ctx.folderId, expected)
      .run()
    return this.locked(row.id, async () => {
      let upload = await this.row(row.id)
      if (upload.expected_sha256 !== expected) throw conflict()
      if (upload.session_secret || upload.verified) return
      if (!upload.file_id) {
        const quota = await this.connection.quota()
        if (quota.remaining < row.pdf_bytes + 64 * 1024 * 1024)
          throw new HttpError(409, "Drive 여유 공간이 부족해요. 64MB 이상의 여유를 확보해 주세요.")
        const day = Math.floor(this.now / 86400000)
        const budget = await this.db
          .prepare(
            "INSERT INTO usage(key,hits,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 WHERE hits<10 RETURNING hits",
          )
          .bind(`drive-new:${day}`, (day + 1) * 86400000)
          .first()
        if (!budget)
          throw new HttpError(429, "Drive 새 원본 저장은 하루 10개까지 시험할 수 있어요.")
        const ids = await this.connection.request<{ ids: string[] }>(
          "/files/generateIds?count=1&space=drive&type=files",
        )
        const fileId = ids.ids?.[0]
        if (!fileId || !validFileId(fileId)) throw conflict()
        await this.db
          .prepare("UPDATE drive_uploads SET file_id=? WHERE object_id=?")
          .bind(fileId, row.id)
          .run()
        upload = { ...upload, file_id: fileId }
      }
      const authorization = { Authorization: `Bearer ${await this.connection.token()}` }
      const existing = await this.connection.fetch(
        `https://www.googleapis.com/drive/v3/files/${upload.file_id}?fields=${fileFields}`,
        { headers: authorization },
      )
      let method = "POST",
        path = "",
        body: unknown
      if (existing.status === 404) {
        await existing.body?.cancel()
        body = {
          id: upload.file_id,
          name: JSON.parse(row.data).filename,
          mimeType: "application/pdf",
          parents: [upload.folder_id],
          appProperties: { smpAdmin: ctx.namespace, uploadId: row.id, identity: row.hash },
        }
      } else {
        const file = await this.connection.json<FileInfo>(existing)
        this.checkFile(file, upload.file_id, upload.folder_id, ctx.namespace, row.hash)
        method = "PATCH"
        path = "/" + upload.file_id
        body = {}
      }
      const response = await this.connection.fetch(
        `https://www.googleapis.com/upload/drive/v3/files${path}?uploadType=resumable&fields=id,size,sha256Checksum`,
        {
          method,
          headers: {
            ...authorization,
            "Content-Type": "application/json",
            "X-Upload-Content-Type": "application/pdf",
            "X-Upload-Content-Length": String(row.pdf_bytes),
          },
          body: JSON.stringify(body),
        },
      )
      if (!response.ok) {
        await response.body?.cancel()
        throw new HttpError(
          503,
          "Drive 업로드를 시작하지 못했어요. 같은 파일로 다시 시도해 주세요.",
        )
      }
      const session = safeUploadUrl(response.headers.get("location") ?? "")
      await response.body?.cancel()
      await this.db
        .prepare("UPDATE drive_uploads SET session_secret=? WHERE object_id=?")
        .bind(await this.connection.vault.seal(session, `upload:${row.id}`), row.id)
        .run()
    })
  }
  checkFile(file: FileInfo, id: string, folderId: string, namespace: string, identity: string) {
    if (
      file.id !== id ||
      !file.ownedByMe ||
      file.mimeType !== "application/pdf" ||
      !file.parents?.includes(folderId) ||
      file.appProperties?.smpAdmin !== namespace ||
      file.appProperties?.identity !== identity ||
      file.permissions?.some((p) => p.role !== "owner")
    )
      throw new HttpError(409, "학회 전용 시험 파일의 소유권·공개 범위를 확인하지 못했어요.")
  }
  async verify(row: ObjectRow, upload: Upload) {
    const ctx = await this.connection.context()
    const file = await this.connection.request<FileInfo>(
      `/files/${upload.file_id}?fields=${fileFields}`,
    )
    this.checkFile(file, upload.file_id, upload.folder_id, ctx.namespace, row.hash)
    if (
      file.trashed ||
      Number(file.size) !== row.pdf_bytes ||
      file.sha256Checksum !== upload.expected_sha256
    )
      throw new HttpError(409, "Drive 원본의 크기 또는 SHA-256이 달라요. 기존 승인본은 유지됩니다.")
    await this.db
      .prepare("UPDATE drive_uploads SET offset=?,verified=1,source_sha256=? WHERE object_id=?")
      .bind(row.pdf_bytes, file.sha256Checksum, row.id)
      .run()
  }
  async session(upload: Upload) {
    if (!upload.session_secret) throw conflict()
    return safeUploadUrl(
      await this.connection.vault.open<string>(upload.session_secret, `upload:${upload.object_id}`),
    )
  }
  async put(row: ObjectRow, part: number, bytes: Uint8Array<ArrayBuffer>, hash: string) {
    await this.locked(row.id, async () => {
      let upload = await this.row(row.id)
      const previous = await this.db
        .prepare("SELECT hash,bytes FROM drive_upload_parts WHERE object_id=? AND part=?")
        .bind(row.id, part)
        .first<{ hash: string; bytes: number }>()
      if (previous && (previous.hash !== hash || previous.bytes !== bytes.length))
        throw new HttpError(409, "같은 업로드의 PDF 내용이 달라졌어요.")
      await this.db
        .prepare(
          "INSERT OR IGNORE INTO drive_upload_parts(object_id,part,bytes,hash) VALUES(?,?,?,?)",
        )
        .bind(row.id, part, bytes.length, hash)
        .run()
      const start = part * chunkBytes,
        end = start + bytes.length
      if (upload.verified) {
        if (upload.offset !== row.pdf_bytes) throw conflict()
        return
      }
      const url = await this.session(upload)
      const authorization = { Authorization: `Bearer ${await this.connection.token()}` }
      if (previous) {
        const status = await this.connection.fetch(url, {
          method: "PUT",
          headers: {
            ...authorization,
            "Content-Length": "0",
            "Content-Range": `bytes */${row.pdf_bytes}`,
          },
        })
        if (status.status === 200 || status.status === 201) {
          await status.body?.cancel()
          await this.verify(row, upload)
          return
        }
        if (status.status === 404 || status.status === 410) {
          await status.body?.cancel()
          await this.verify(row, upload)
          return
        }
        if (status.status !== 308) {
          await status.body?.cancel()
          throw new HttpError(503, "Drive 전송 상태 확인을 다시 시도해 주세요.")
        }
        const received = this.offset(status)
        await status.body?.cancel()
        await this.db
          .prepare("UPDATE drive_uploads SET offset=? WHERE object_id=?")
          .bind(received, row.id)
          .run()
        upload = { ...upload, offset: received }
      }
      if (upload.offset < start || upload.offset > row.pdf_bytes) throw conflict()
      if (upload.offset >= end) return
      const offset = upload.offset
      const response = await this.connection.fetch(url, {
        method: "PUT",
        headers: {
          ...authorization,
          "Content-Type": "application/pdf",
          "Content-Range": `bytes ${offset}-${end - 1}/${row.pdf_bytes}`,
        },
        body: bytes.slice(offset - start),
      })
      if (response.status === 200 || response.status === 201) {
        await response.body?.cancel()
        await this.verify(row, upload)
        return
      }
      if (response.status !== 308) {
        await response.body?.cancel()
        throw new HttpError(
          503,
          "Drive 전송이 완료되지 않았어요. 같은 PDF를 다시 선택하면 이어서 확인합니다.",
        )
      }
      const received = this.offset(response)
      await response.body?.cancel()
      if (received < offset || received > end) throw conflict()
      await this.db
        .prepare("UPDATE drive_uploads SET offset=? WHERE object_id=?")
        .bind(received, row.id)
        .run()
      if (received !== end)
        throw new HttpError(503, "Drive가 파일 일부를 받았어요. 같은 PDF로 이어서 전송해 주세요.")
    })
  }
  offset(response: Response) {
    const range = response.headers.get("range")
    if (!range) return 0
    const match = range.match(/^bytes=0-(\d+)$/)
    if (!match || !Number.isSafeInteger(Number(match[1]))) throw conflict()
    return Number(match[1]) + 1
  }
  async read(file: ReportFile, part: number) {
    if (
      file.provider !== "drive" ||
      !file.file_id ||
      !file.managed ||
      file.state !== "ready" ||
      !validFileId(file.file_id)
    )
      throw conflict()
    const start = part * chunkBytes,
      end = Math.min(file.pdf_bytes, start + chunkBytes) - 1
    if (!Number.isSafeInteger(part) || part < 0 || start >= file.pdf_bytes)
      throw new HttpError(404, "파일 조각이 없어요.")
    const response = await this.connection.fetch(
      `https://www.googleapis.com/drive/v3/files/${file.file_id}?alt=media`,
      {
        headers: {
          Authorization: `Bearer ${await this.connection.token()}`,
          Range: `bytes=${start}-${end}`,
        },
      },
    )
    if (
      response.status !== 206 &&
      !(response.status === 200 && start === 0 && end + 1 === file.pdf_bytes)
    ) {
      await response.body?.cancel()
      throw new HttpError(503, "Drive 원본을 읽지 못했어요. 저장소 연결을 확인해 주세요.")
    }
    if (
      response.status === 206 &&
      response.headers.get("content-range") !== `bytes ${start}-${end}/${file.pdf_bytes}`
    ) {
      await response.body?.cancel()
      throw conflict()
    }
    // Bound the response even if an upstream unexpectedly ignores Range.
    const reader = response.body?.getReader()
    if (!reader) throw conflict()
    let length = 0
    const chunks: Uint8Array[] = []
    try {
      while (true) {
        const value = await reader.read()
        if (value.done) break
        length += value.value.length
        if (length > end - start + 1) {
          await reader.cancel()
          throw conflict()
        }
        chunks.push(value.value)
      }
    } finally {
      reader.releaseLock()
    }
    if (length !== end - start + 1) throw conflict()
    return new Uint8Array(Buffer.concat(chunks))
  }
  async cleanup(limit = 2) {
    // No DELETE file call. Only our registered, unreferenced files can be sent to
    // Drive Trash; old Notion files are never entered into this queue.
    const ctx = await this.connection.context()
    const rows = (
      await this.db
        .prepare(
          `SELECT * FROM report_files f WHERE provider='drive' AND managed=1 AND state='pending-delete' AND delete_after<=?
      AND NOT EXISTS(SELECT 1 FROM report_versions v WHERE v.asset_id=f.id)
      AND NOT EXISTS(SELECT 1 FROM report_file_bindings b WHERE b.asset_id=f.id) AND attempts<3 LIMIT ?`,
        )
        .bind(this.now, limit)
        .all<ReportFile>()
    ).results
    let removed = 0,
      failed = 0
    for (const file of rows) {
      try {
        if (!file.file_id || !file.folder_id) throw conflict()
        const remote = await this.connection.request<FileInfo>(
          `/files/${file.file_id}?fields=${fileFields}`,
        )
        this.checkFile(remote, file.file_id, file.folder_id, ctx.namespace, file.identity)
        if (remote.sha256Checksum !== file.source_sha256)
          throw new HttpError(409, "원본이 변경되어 자동 삭제를 중단했어요.")
        if (!remote.trashed)
          await this.connection.request(`/files/${file.file_id}?fields=id,trashed`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trashed: true }),
          })
        await this.db.batch([
          this.db.prepare("DELETE FROM archived_report_chunks WHERE asset_id=?").bind(file.id),
          this.db
            .prepare("UPDATE report_files SET state='deleted',last_error=NULL WHERE id=?")
            .bind(file.id),
        ])
        removed++
      } catch {
        failed++
        await this.db
          .prepare(
            "UPDATE report_files SET attempts=attempts+1,last_error='Drive 파일 확인 또는 휴지통 이동 실패',delete_after=? WHERE id=?",
          )
          .bind(this.now + 86400000, file.id)
          .run()
      }
    }
    const abandoned = (
      await this.db
        .prepare(
          `SELECT * FROM abandoned_drive_files a WHERE delete_after<=? AND attempts<3
      AND NOT EXISTS(SELECT 1 FROM report_files f WHERE f.file_id=a.file_id AND f.state<>'deleted')
      AND NOT EXISTS(SELECT 1 FROM drive_uploads d WHERE d.file_id=a.file_id) LIMIT ?`,
        )
        .bind(this.now, Math.max(0, limit - rows.length))
        .all<{ file_id: string; folder_id: string; upload_id: string }>()
    ).results
    for (const file of abandoned) {
      try {
        if (!validFileId(file.file_id)) throw conflict()
        const remote = await this.connection.request<FileInfo>(
          `/files/${file.file_id}?fields=${fileFields}`,
        )
        if (
          !remote.ownedByMe ||
          remote.appProperties?.smpAdmin !== ctx.namespace ||
          remote.appProperties?.uploadId !== file.upload_id ||
          !remote.parents?.includes(file.folder_id) ||
          remote.mimeType !== "application/pdf" ||
          remote.permissions?.some((p) => p.role !== "owner")
        )
          throw conflict()
        if (!remote.trashed)
          await this.connection.request(`/files/${file.file_id}?fields=id,trashed`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trashed: true }),
          })
        await this.db
          .prepare("DELETE FROM abandoned_drive_files WHERE file_id=?")
          .bind(file.file_id)
          .run()
        removed++
      } catch {
        failed++
        await this.db
          .prepare(
            "UPDATE abandoned_drive_files SET attempts=attempts+1,last_error='미완료 파일 확인 실패',delete_after=? WHERE file_id=?",
          )
          .bind(this.now + 86400000, file.file_id)
          .run()
      }
    }
    return { removed, failed }
  }
}
