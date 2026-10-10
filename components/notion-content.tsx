import Image from "next/image"
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
    return <span key={index}>{href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-sky-300 underline underline-offset-4">{node}</a> : node}</span>
  })
}

function Block({ block }: { block: ContentBlock }) {
  const value = blockValue(block)
  const text = <RichTextContent value={value.rich_text} />
  const children = block.children?.length ? <NotionContent blocks={block.children} /> : null
  switch (block.type) {
    case "paragraph": return <div><p className="min-h-6 whitespace-pre-wrap">{text}</p>{children}</div>
    case "heading_1": return <><h2 className="pt-5 text-2xl font-medium text-white">{text}</h2>{children}</>
    case "heading_2": return <><h3 className="pt-3 text-xl font-medium text-white">{text}</h3>{children}</>
    case "heading_3": return <><h4 className="pt-2 text-lg font-medium text-white">{text}</h4>{children}</>
    case "bulleted_list_item":
    case "numbered_list_item": return <li className="pl-1">{text}{children}</li>
    case "quote": return <blockquote className="border-l-2 border-sky-300/60 pl-5">{text}{children}</blockquote>
    case "callout": return <aside className="rounded border border-white/20 bg-white/5 p-5">{text}{children}</aside>
    case "toggle": return <details className="rounded border border-white/20 p-4"><summary className="cursor-pointer text-white">{text}</summary>{children}</details>
    case "to_do": return <div><p><span aria-label={value.checked ? "완료" : "미완료"}>{value.checked ? "☑" : "☐"}</span> {text}</p>{children}</div>
    case "divider": return <hr className="border-white/20" />
    case "code": return <pre className="overflow-x-auto rounded bg-black/40 p-5 text-sm"><code>{plainText(value.rich_text)}</code></pre>
    case "image": {
      const url = fileUrl(value)
      return url ? <figure><Image src={url} alt={plainText(value.caption) || "본문 이미지"} width={1200} height={800} unoptimized className="h-auto w-full rounded" /><figcaption className="mt-2 text-center text-sm text-slate-400"><RichTextContent value={value.caption} /></figcaption></figure> : null
    }
    case "file": case "pdf": case "video": case "audio": case "bookmark": case "link_preview": case "embed": {
      const url = fileUrl(value) ?? safeUrl(value.url)
      return url ? <a href={url} target="_blank" rel="noopener noreferrer" className="block break-all rounded border border-white/20 p-4 text-sky-300 underline underline-offset-4">{plainText(value.caption) || value.name || "첨부 자료 열기"} ↗</a> : null
    }
    case "column_list": return <div className="grid gap-6 sm:grid-flow-col sm:auto-cols-fr">{block.children?.map(child => <div key={child.id}><NotionContent blocks={child.children ?? []} /></div>)}</div>
    case "column": return children
    case "table": return <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><tbody>{block.children?.map((row, rowIndex) => <tr key={row.id}>{blockValue(row).cells?.map((cell, columnIndex) => {
      const header = (value.has_column_header && rowIndex === 0) || (value.has_row_header && columnIndex === 0)
      return header ? <th key={columnIndex} scope={rowIndex === 0 ? "col" : "row"} className="border border-white/20 bg-white/10 p-3 font-medium text-white"><RichTextContent value={cell} /></th> : <td key={columnIndex} className="border border-white/20 p-3"><RichTextContent value={cell} /></td>
    })}</tr>)}</tbody></table></div>
    case "table_of_contents": return null
    default: return <p className="rounded border border-white/10 p-3 text-sm text-slate-400">이 콘텐츠 형식은 웹사이트에서 표시할 수 없습니다.</p>
  }
}

export function NotionContent({ blocks }: { blocks: ContentBlock[] }) {
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
  return <div className="space-y-5 break-words leading-8 text-slate-200">{nodes}</div>
}
