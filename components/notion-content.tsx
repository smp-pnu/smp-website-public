import { ContentImage } from "./content-image"
import type { ReactNode } from "react"
import { fileUrl, plainText, safeUrl, type RichText } from "@/lib/content-model"
import { blockValue, type ContentBlock } from "@/lib/notion-model"

function RichTextContent({ value = [] }: { value?: RichText[] }) {
  return value.map((part, index) => {
    let node: ReactNode = part.plain_text ?? part.text?.content ?? ""
    const style = part.annotations
    if (style?.code) node = <code className="rounded bg-white/10 px-1.5 py-0.5 text-sm">{node}</code>
    if (style?.bold) node = <strong className="font-semibold text-white">{node}</strong>
    if (style?.italic) node = <em>{node}</em>
    if (style?.strikethrough) node = <s>{node}</s>
    if (style?.underline) node = <u>{node}</u>
    const href = safeUrl(part.href ?? part.text?.link?.url)
    return <span key={index}>{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-site-accent underline underline-offset-4">{node}</a> : node}</span>
  })
}

function Block({ block }: { block: ContentBlock }) {
  const value = blockValue(block)
  const text = <RichTextContent value={value.rich_text} />
  const children = block.children?.length ? <NotionContent blocks={block.children} toc={false} /> : null
  switch (block.type) {
    case "paragraph": return <div className={!plainText(value.rich_text).trim() && !children ? "notion-paragraph notion-paragraph--empty" : "notion-paragraph"}><p className="min-h-6 whitespace-pre-wrap">{text}</p>{children}</div>
    case "heading_1": return <><h2 id={`block-${block.id}`} className="scroll-mt-28 pt-5 text-2xl font-medium text-white">{text}</h2>{children}</>
    case "heading_2": return <><h3 id={`block-${block.id}`} className="scroll-mt-28 pt-3 text-xl font-medium text-white">{text}</h3>{children}</>
    case "heading_3": return <><h4 id={`block-${block.id}`} className="scroll-mt-28 pt-2 text-lg font-medium text-white">{text}</h4>{children}</>
    case "bulleted_list_item":
    case "numbered_list_item": return <li className="pl-1">{text}{children}</li>
    case "quote": return <blockquote className="border-l-2 border-sky-300/60 pl-5">{text}{children}</blockquote>
    case "callout": return <aside className="rounded border border-site-line bg-white/5 p-5">{text}{children}</aside>
    case "toggle": return <details className="rounded border border-site-line p-4"><summary className="cursor-pointer text-white">{text}</summary>{children}</details>
    case "to_do": return <div><p><span aria-label={value.checked ? "완료" : "미완료"}>{value.checked ? "☑" : "☐"}</span> {text}</p>{children}</div>
    case "divider": return <hr className="border-site-line" />
    case "code": return <pre className="overflow-x-auto rounded bg-black/40 p-5 text-sm"><code>{plainText(value.rich_text)}</code></pre>
    case "image": {
      const url = fileUrl(value)
      return url ? <figure><ContentImage src={url} alt={plainText(value.caption) || "본문 이미지"} /><figcaption className="mt-2 text-center text-sm text-site-muted"><RichTextContent value={value.caption} /></figcaption></figure> : null
    }
    case "file": case "pdf": case "video": case "audio": case "bookmark": case "link_preview": case "embed": {
      const url = fileUrl(value) ?? safeUrl(value.url)
      return url ? <a href={url} target="_blank" rel="noopener noreferrer" className="block break-all rounded border border-site-line p-4 text-site-accent underline underline-offset-4">{plainText(value.caption) || value.name || "첨부 자료 열기"} ↗</a> : null
    }
    case "column_list": return <div className="grid gap-6 sm:grid-flow-col sm:auto-cols-fr">{block.children?.map(child => <div key={child.id}><NotionContent blocks={child.children ?? []} toc={false} /></div>)}</div>
    case "column": return children
    case "table": return <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><tbody>{block.children?.map((row, rowIndex) => <tr key={row.id}>{blockValue(row).cells?.map((cell, columnIndex) => {
      const header = (value.has_column_header && rowIndex === 0) || (value.has_row_header && columnIndex === 0)
      return header ? <th key={columnIndex} scope={rowIndex === 0 ? "col" : "row"} className="border border-site-line bg-white/10 p-3 font-medium text-white"><RichTextContent value={cell} /></th> : <td key={columnIndex} className="border border-site-line p-3"><RichTextContent value={cell} /></td>
    })}</tr>)}</tbody></table></div>
    case "table_of_contents": return null
    default: return <p className="rounded border border-site-line-soft p-3 text-sm text-site-muted">이 콘텐츠 형식은 웹사이트에서 표시할 수 없습니다.</p>
  }
}

export function NotionContent({ blocks, toc = true }: { blocks: ContentBlock[]; toc?: boolean }) {
  const headings = toc ? blocks.filter(block => ["heading_1", "heading_2", "heading_3"].includes(block.type) && plainText(blockValue(block).rich_text).trim()).slice(0,30) : []
  const nodes: ReactNode[] = []
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index]
    if (block.type === "bulleted_list_item" || block.type === "numbered_list_item") {
      const group = [block]
      while (blocks[index + 1]?.type === block.type) group.push(blocks[++index])
      const Tag = block.type === "bulleted_list_item" ? "ul" : "ol"
      nodes.push(<Tag key={block.id} className={`${Tag === "ul" ? "list-disc" : "list-decimal"} space-y-2 pl-6`}>{group.map(item => <Block key={item.id} block={item} />)}</Tag>)
    } else nodes.push(<Block key={block.id} block={block} />)
  }
  return <div className="notion-content space-y-5 break-words leading-8 text-site-body">
    {headings.length >= 3 && <details className="border-y border-site-line-soft py-4"><summary className="cursor-pointer text-sm text-site-body">이 글의 내용</summary><nav aria-label="본문 목차" className="mt-3"><ul className="space-y-1">{headings.map(block=><li key={block.id}><a href={`#block-${block.id}`} className="inline-flex min-h-9 items-center text-sm text-site-accent hover:underline">{plainText(blockValue(block).rich_text)}</a></li>)}</ul></nav></details>}
    {nodes}</div>
}
