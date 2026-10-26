import { useEffect, useRef, useState } from "react"
import { ArrowUp, ArrowDown, Trash2, ImagePlus, Plus, Save } from "lucide-react"
import { api } from "./server-storage"
import { encodePdfCover } from "./pdf-cover"
import { useConfirmation } from "./confirm"
import {
  blockLabels,
  newBlock,
  noticeLimits,
  type BlockType,
  type Notice,
  type NoticeBlock,
} from "./notice-model"
import { NoticeContent } from "./notice-preview"

async function photo(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12 * 1024 * 1024)
    throw Error("12 MB 이하 JPG·PNG·WebP 사진을 선택해 주세요.")
  const url = URL.createObjectURL(file),
    image = new Image()
  try {
    image.src = url
    await image.decode()
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 30_000_000)
      throw Error("사진 크기를 줄여서 등록해 주세요.")
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight)),
      canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) throw Error("사진을 준비하지 못했어요.")
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await encodePdfCover(canvas, new AbortController().signal)
  } finally {
    URL.revokeObjectURL(url)
  }
}
type Props = {
  notice: Notice
  busy: boolean
  onSave: (fields: Notice) => Promise<void>
  onDirty: (value: boolean) => void
  onUploadBusy: (value: boolean) => void
}
export function NoticeEditor({ notice, busy, onSave, onDirty, onUploadBusy }: Props) {
  const [form, setForm] = useState(notice),
    [preview, setPreview] = useState(false),
    [error, setError] = useState(""),
    [uploading, setUploading] = useState(false)
  const confirm = useConfirmation(),
    active = useRef(true),
    uploadingRef = useRef(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(notice),
    locked = busy || uploading || !!notice.trashedAt
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  useEffect(() => {
    onDirty(dirty)
    return () => onDirty(false)
  }, [dirty, onDirty])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])
  const change = (id: string, patch: Partial<NoticeBlock>) =>
    setForm((old) => ({ ...old, blocks: old.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)) }))
  const add = (type: BlockType) => setForm((old) => ({ ...old, blocks: [...old.blocks, newBlock(type)] }))
  const move = (index: number, offset: number) =>
    setForm((old) => {
      const blocks = [...old.blocks]
      ;[blocks[index], blocks[index + offset]] = [blocks[index + offset], blocks[index]]
      return { ...old, blocks }
    })
  const upload = async (file: File) => {
    if (locked || uploadingRef.current) return
    uploadingRef.current = true
    setUploading(true)
    onUploadBusy(true)
    setError("")
    try {
      const blob = await photo(file)
      const { id } = await (
        await api(`/notices/${notice.id}/images`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: await blob.arrayBuffer(),
        })
      ).json()
      if (active.current)
        setForm((old) => ({ ...old, blocks: [...old.blocks, { ...newBlock("image"), assetId: id }] }))
    } catch (e) {
      if (active.current) setError((e as Error).message)
    } finally {
      uploadingRef.current = false
      onUploadBusy(false)
      if (active.current) setUploading(false)
    }
  }
  const full = form.blocks.length >= noticeLimits.blocks
  return (
    <section className="notice-editor">
      <div className="editor-tabs">
        <button aria-pressed={!preview} onClick={() => setPreview(false)}>
          작성
        </button>
        <button aria-pressed={preview} onClick={() => setPreview(true)}>
          미리보기
        </button>
        <span className="muted">{dirty ? "저장 전 변경" : "저장됨"}</span>
      </div>
      {error && (
        <p className="error-panel" role="alert">
          {error}
        </p>
      )}
      {preview ? (
        <article className="article-preview notice-preview">
          <p className="preview-category">
            {form.category || "공지사항"} · {form.date}
          </p>
          <h1>{form.title || "제목 없음"}</h1>
          <NoticeContent blocks={form.blocks} />
        </article>
      ) : (
        <>
          <fieldset disabled={locked} className="notice-fields">
            <legend>공지 정보</legend>
            <div className="field-grid">
              <label className="span-2">
                <span>제목</span>
                <input
                  value={form.title}
                  maxLength={200}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label>
                <span>분류</span>
                <input
                  value={form.category}
                  maxLength={40}
                  placeholder="모집 · 행사 · 운영"
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </label>
              <label>
                <span>게시 기준일</span>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </label>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(e) => setForm({ ...form, pinned: e.target.checked })}
              />
              상단 고정
            </label>
          </fieldset>
          <div className="block-list">
            {form.blocks.map((block, index) => (
              <section
                className="notice-block"
                key={block.id}
                aria-label={`${index + 1}번째 ${blockLabels[block.type]}`}
              >
                <header>
                  <span>{index + 1}</span>
                  {block.type === "image" ? (
                    <strong>사진</strong>
                  ) : (
                    <select
                      aria-label={`${index + 1}번째 내용 형식`}
                      value={block.type}
                      disabled={locked}
                      onChange={(e) => change(block.id, { type: e.target.value as BlockType })}
                    >
                      {Object.entries(blockLabels)
                        .filter(([key]) => key !== "image")
                        .map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                    </select>
                  )}
                  <div className="block-controls">
                    <button
                      aria-label="내용 위로"
                      disabled={locked || index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      aria-label="내용 아래로"
                      disabled={locked || index === form.blocks.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      aria-label="내용 삭제"
                      disabled={locked}
                      onClick={async () => {
                        if (
                          (!block.text && !block.assetId) ||
                          (await confirm(
                            "이 내용을 본문에서 뺄까요? 저장 전에는 목록으로 나갔다 돌아오면 복구할 수 있습니다.",
                          ))
                        )
                          setForm((old) => ({ ...old, blocks: old.blocks.filter((b) => b.id !== block.id) }))
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </header>
                {block.type === "image" && (
                  <img
                    className="notice-image-editor"
                    src={`/api/notice-assets/${block.assetId}`}
                    alt={block.text || "첨부 사진"}
                  />
                )}
                {block.type !== "divider" && (
                  <textarea
                    aria-label={`${index + 1}번째 ${block.type === "image" ? "사진 설명" : "내용"}`}
                    disabled={locked}
                    value={block.text}
                    maxLength={4000}
                    rows={block.type === "paragraph" ? 4 : 2}
                    placeholder={block.type === "image" ? "사진 설명 · 대체 텍스트" : "내용 입력"}
                    onChange={(e) => change(block.id, { text: e.target.value })}
                  />
                )}
                {!["image", "divider"].includes(block.type) && (
                  <details>
                    <summary>링크 연결</summary>
                    <input
                      aria-label={`${index + 1}번째 링크 주소`}
                      disabled={locked}
                      type="url"
                      value={block.href || ""}
                      placeholder="https://…"
                      maxLength={1000}
                      onChange={(e) => change(block.id, { href: e.target.value })}
                    />
                  </details>
                )}
              </section>
            ))}
          </div>
          {!notice.trashedAt && (
            <div className="block-toolbar">
              {(["paragraph", "heading", "bullet", "quote", "divider"] as const).map((type) => (
                <button className="secondary" key={type} disabled={locked || full} onClick={() => add(type)}>
                  <Plus size={13} />
                  {blockLabels[type]}
                </button>
              ))}
              <label className={`secondary file-picker ${locked || full ? "disabled" : ""}`}>
                <ImagePlus size={14} />
                {uploading ? "사진 준비 중…" : "사진 추가"}
                <input
                  type="file"
                  aria-label="공지 사진 선택"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={
                    locked ||
                    full ||
                    form.blocks.filter((b) => b.type === "image").length >= noticeLimits.images
                  }
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void upload(file)
                    e.target.value = ""
                  }}
                />
              </label>
            </div>
          )}
        </>
      )}
      {!notice.trashedAt && (
        <div className="review-actions">
          <button className="primary" disabled={locked || !dirty} onClick={() => void onSave(form)}>
            <Save size={16} />
            변경 저장
          </button>
          <small>
            {form.blocks.reduce((sum, b) => sum + b.text.length, 0).toLocaleString()} / 12,000자 · 사진은 자동
            축소해 저장합니다.
          </small>
        </div>
      )}
    </section>
  )
}
