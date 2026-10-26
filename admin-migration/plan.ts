import { createHash } from "node:crypto"
import { fileUrl, normalizeId, plainText, sortContent, toContentItem, type ContentItem, type NotionPage } from "../lib/content-model"
import { toMember } from "../lib/member-model"
import { blockValue, type ContentBlock } from "../lib/notion-model"
import { driveDownloadUrl, getPdfSources, isNotionFileUrl } from "../lib/pdf-source"
import { reportActivity, reportType, researchFacts } from "../lib/research-metadata"
import { limits } from "../admin-lab/model"
import { noticeLimits } from "../admin-lab/notice-model"

export type Kind = "research" | "notice" | "members"
export type PublicationRow = {
  id: string; kind: Kind; revision: string; item: string
  blocks: string | null; cover: string | null; body_revision: string | null
}
export type Snapshot = {
  capturedAt: string
  sources: Record<Kind, NotionPage[]>
  noticeBodies: Record<string, ContentBlock[]>
  publication: PublicationRow[]
}
export type MigrationIssue = { code: string; severity: "blocker" | "review"; sourceKey?: string; detail: string }
export type AssetReference = {
  key: string
  provider: "drive" | "notion-expiring" | "site-static" | "external"
  url: string
  role: string
}
export type StagedRecord = {
  sourceKey: string; legacyPublicId: string; kind: Kind
  sourceRevision: string; sourceHash: string; snapshotHash: string
  sourcePublished: boolean; effectivePublished: boolean; state: "review-only"
  normalized: Record<string, unknown>
  source: NotionPage
  body: ContentBlock[]
  publication: PublicationRow | null
  assets: AssetReference[]
}
export const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex")

// Index references only; never fetch a URL found in content.
export function assetReference(url: string, role: string): AssetReference {
  const drive = driveDownloadUrl(url)
  if (drive) {
    return { key: `drive:${new URL(drive).searchParams.get("id")}`, provider: "drive", url, role }
  }
  try {
    const u = new URL(url), id = u.searchParams.get("id")
    if (u.origin === "https://drive.usercontent.google.com" && !u.username && !u.password
      && u.pathname === "/download" && id && /^[\w-]{10,200}$/.test(id)) {
      return { key: `drive:${id}`, provider: "drive", url, role }
    }
  } catch { /* An invalid reference is retained for review, never requested. */ }
  if (isNotionFileUrl(url)) {
    return { key: `notion:${sha(new URL(url).pathname)}`, provider: "notion-expiring", url, role }
  }
  try {
    const u = new URL(url, "https://pnusmp.com")
    if (["https://pnusmp.com", "https://smp-website-free.smp-website.workers.dev"].includes(u.origin)
      && /^\/(report-covers|_reader-pdfs)\//.test(u.pathname)) {
      return { key: `static:${u.pathname}`, provider: "site-static", url, role }
    }
  } catch { /* Preserve unrecognized sources for manual review. */ }
  return { key: `external:${sha(url)}`, provider: "external", url, role }
}

function inventoryBlocks(
  blocks: ContentBlock[], assets: AssetReference[],
  types: Record<string, number>, annotations: Record<string, number>,
) {
  let count = 0, textLength = 0
  const walk = (rows: ContentBlock[]) => {
    for (const block of rows) {
      count++
      types[block.type] = (types[block.type] ?? 0) + 1
      const value = blockValue(block)
      for (const rich of [...(value.rich_text ?? []), ...(value.caption ?? []), ...(value.cells ?? []).flat()]) {
        textLength += plainText([rich]).length
        for (const [key, enabled] of Object.entries(rich.annotations ?? {})) {
          if (enabled && String(enabled) !== "default") annotations[key] = (annotations[key] ?? 0) + 1
        }
      }
      if (["image", "file", "pdf", "video", "audio"].includes(block.type)) {
        const url = value.file?.url ?? value.external?.url
        if (url) assets.push(assetReference(url, block.type))
      }
      if (block.children) walk(block.children)
    }
  }
  walk(blocks)
  return { count, textLength }
}

export function createMigrationPlan(snapshot: Snapshot) {
  if (!Number.isFinite(Date.parse(snapshot.capturedAt))) throw Error("Invalid snapshot time")
  const issues: MigrationIssue[] = [], records: StagedRecord[] = [], seen = new Set<string>()
  const publicRows = new Map(snapshot.publication.map(row => [`${row.kind}:${row.id}`, row]))
  const types: Record<string, number> = {}, annotations: Record<string, number> = {}
  const stats = {
    counts: { research: 0, notice: 0, members: 0 },
    published: { research: 0, notice: 0, members: 0 },
    publicRows: { research: 0, notice: 0, members: 0 },
    pdfBytes: 0, pdfBytesKnown: 0, readerPages: 0, readerPackBytes: 0,
    preparedPacks: 0, reusableCovers: 0, oversizePdfs: 0, missingNoticeBodies: 0, nonV4Ids: 0,
  }
  const add = (code: string, detail: string, sourceKey?: string, severity: MigrationIssue["severity"] = "blocker") => {
    issues.push({ code, detail, ...(sourceKey ? { sourceKey } : {}), severity })
  }

  for (const kind of ["research", "notice", "members"] as const) {
    for (const page of snapshot.sources[kind]) {
      const id = normalizeId(page.id)
      if (!id) throw Error("Invalid source ID")
      const key = `notion:${kind}:${id}`
      if (seen.has(id)) throw Error("Repeated source page; refusing an ambiguous migration")
      seen.add(id)
      if (page.archived || page.in_trash) {
        add("archived-source", "Archived source requires explicit inclusion review", key)
        continue
      }
      if (id[12] !== "4") stats.nonV4Ids++
      const revision = page.last_edited_time ?? page.created_time
      if (!Number.isFinite(Date.parse(revision))) throw Error("Invalid source revision")
      const row = publicRows.get(`${kind}:${id}`) ?? null, assets: AssetReference[] = []
      let normalized: Record<string, unknown>, body: ContentBlock[] = [], effective = false

      if (kind === "members") {
        const parent = page.parent?.data_source_id ?? ""
        const publicMember = toMember(page, parent)
        effective = !!publicMember
        const member = publicMember ?? toMember({
          ...page, properties: { ...page.properties, 공개: { type: "checkbox", checkbox: true } },
        }, parent)
        normalized = { ...(member ?? {}), sourceProperties: page.properties }
        if (!member) add("member-mapping", "Member cannot be represented by the current public model", key)
        const photo = page.properties["사진"]?.files?.[0]
        const photoUrl = (photo ? fileUrl(photo) : null) ?? page.properties["사진 링크"]?.url
        if (photoUrl) assets.push(assetReference(photoUrl, "member-photo"))
      } else {
        const item = toContentItem(page, kind, Date.parse(snapshot.capturedAt))
        effective = !!item
        // Project private/scheduled fields through the same mapping, then restore
        // the real date. This temporary projection never changes source visibility.
        const candidate = item ?? toContentItem({
          ...page, properties: {
            ...page.properties, 공개: { type: "checkbox", checkbox: true },
            게시일: { type: "date", date: { start: "1970-01-01" } },
          },
        }, kind, Date.parse(snapshot.capturedAt))
        if (!candidate) add("content-mapping", "Content title or fields need manual review", key)
        normalized = { ...(candidate ?? {}), date: page.properties["게시일"]?.date?.start ?? "", sourceProperties: page.properties }
        if (candidate) {
          for (const attachment of candidate.attachments) assets.push(assetReference(attachment.url, "attachment"))
          if (kind === "research") {
            const pdfs = getPdfSources(candidate)
            for (const pdf of pdfs) assets.push(assetReference(pdf.url, "pdf-original"))
            if (!pdfs.length) add("pdf-missing", "No supported source PDF reference", key)
            if (pdfs.length > 1) add("multiple-pdfs", "Keep all attachments and select the primary PDF explicitly", key, "review")
            normalized = {
              ...normalized, reportType: reportType(candidate), activity: reportActivity(candidate),
              investment: researchFacts(candidate.summary),
            }
            if (row?.blocks) {
              const parsed: unknown = JSON.parse(row.blocks)
              body = Array.isArray(parsed) ? parsed : []
              inventoryBlocks(body, assets, {}, {})
            }
          }
        }
        if (kind === "notice") {
          if (!Object.hasOwn(snapshot.noticeBodies, id)) {
            stats.missingNoticeBodies++
            add("notice-body-missing", "Original notice body was not captured", key)
          }
          body = snapshot.noticeBodies[id] ?? []
          const localTypes: Record<string, number> = {}, localAnnotations: Record<string, number> = {}
          const sizes = inventoryBlocks(body, assets, localTypes, localAnnotations)
          for (const [name, count] of Object.entries(localTypes)) types[name] = (types[name] ?? 0) + count
          for (const [name, count] of Object.entries(localAnnotations)) annotations[name] = (annotations[name] ?? 0) + count
          const supported = new Set(["paragraph", "heading_2", "bulleted_list_item", "numbered_list_item", "quote", "divider", "image"])
          const unsupported = Object.keys(localTypes).filter(type => !supported.has(type))
          if (unsupported.length) add("notice-editor-gap", `Unsupported current editor blocks: ${unsupported.join(", ")}`, key)
          if (Object.keys(localAnnotations).length) add("notice-inline-formatting", "Preserve inline formatting before enabling editing", key)
          if (sizes.count > noticeLimits.blocks || sizes.textLength > noticeLimits.characters) {
            add("notice-editor-capacity", "Notice exceeds current editor limits", key)
          }
        }
      }

      if (effective) stats.published[kind]++
      if (row) {
        stats.publicRows[kind]++
        if (row.revision !== revision) add("source-revision-drift", "Notion and prepared public version differ; refresh snapshot before cutover", key)
      }
      if (effective !== !!row) add("publication-drift", "Notion visibility and current public catalog differ", key)
      if (kind === "research" && row?.cover) {
        const cover = JSON.parse(row.cover), reader = cover.reader
        if (cover.url) assets.push(assetReference(cover.url, "cover"))
        if (cover.previewUrl) assets.push(assetReference(cover.previewUrl, "preview"))
        if (reader?.pagePack?.url) assets.push(assetReference(reader.pagePack.url, "reader-pack"))
        for (const readerPage of reader?.pages ?? []) {
          if (readerPage.url) assets.push(assetReference(readerPage.url, "reader-page"))
        }
        if (reader?.source?.bytes) {
          stats.pdfBytes += reader.source.bytes
          stats.pdfBytesKnown++
          if (reader.source.bytes > limits.fileBytes) {
            stats.oversizePdfs++
            add("pdf-upload-limit", "Existing source PDF exceeds trial upload size; preserve Drive reference", key)
          }
        }
        // Eligible metadata only: a future importer must still verify the source
        // version/hash and deployed asset availability before declaring reuse safe.
        if (cover.pdfHash && row.body_revision === row.revision && row.revision === revision) {
          stats.reusableCovers++
          if (reader?.pagePack) {
            stats.preparedPacks++
            stats.readerPackBytes += reader.pagePack.bytes ?? 0
          }
          stats.readerPages += reader?.pageCount ?? 0
        }
      }
      stats.counts[kind]++
      const record = {
        sourceKey: key, legacyPublicId: id, kind, sourceRevision: revision, sourceHash: sha({ page, body }),
        sourcePublished: page.properties["공개"]?.checkbox === true, effectivePublished: effective,
        state: "review-only" as const, normalized, source: page, body, publication: row, assets,
      }
      records.push({ ...record, snapshotHash: sha(record) })
    }
  }

  for (const row of snapshot.publication) {
    if (!seen.has(row.id)) add("unmatched-public-record", "Published record has no matching source snapshot", `notion:${row.kind}:${row.id}`)
  }
  if (stats.counts.research > limits.drafts || stats.pdfBytes > limits.totalBytes) {
    add("trial-storage", "Existing library exceeds the trial binary-storage capacity; use external original files")
  }
  if (stats.counts.members) add("member-admin-missing", "Member editor, generations, roles and profile-photo management are not implemented")
  add("publication-owner", "Separate Notion/admin ownership and keep old published revisions while editing")
  add("pipeline-not-connected", "Connect approved revisions to public catalog, PDF preparation, search, sitemap and visibility checks")
  add("drive-write-connection", "Verify school-account Drive upload/refresh authorization and original-file ownership")
  add("deletion-handoff", "Adapt or pause the Notion-to-Drive cleanup before any source archival; keep shared-file reference checks")
  add("handover-and-restore", "Rehearse successor passkey enrollment and restore from a private, portable backup")
  if (stats.nonV4Ids) add("legacy-url-map", "Current upload IDs require UUIDv4; preserve legacy public IDs separately instead of changing URLs")
  if (records.some(record => record.assets.some(asset => asset.provider === "notion-expiring"))) {
    add("expiring-source-assets", "Copy expiring Notion files to stable storage before removing the Notion dependency")
  }

  const references = new Map<string, Set<string>>()
  for (const record of records) {
    for (const asset of record.assets) {
      const refs = references.get(asset.key) ?? new Set()
      refs.add(record.sourceKey)
      references.set(asset.key, refs)
    }
  }
  const sharedAssets = [...references].filter(([, refs]) => refs.size > 1)
    .map(([key, refs]) => ({ key, sourceKeys: [...refs].sort() }))
  const reportOrder = sortContent(records.filter(record => record.kind === "research" && record.effectivePublished)
    .map(record => record.normalized as ContentItem)).map(record => record.id)
  return {
    version: 1, mode: "offline-read-only", cutoverAllowed: false, capturedAt: snapshot.capturedAt,
    stats, noticeBlockTypes: types, noticeAnnotations: annotations, sharedAssets, reportOrder, issues, records,
  }
}
export type MigrationPlan = ReturnType<typeof createMigrationPlan>
