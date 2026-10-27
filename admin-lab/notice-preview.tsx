import { safeNoticeLink, type NoticeBlock } from "./notice-model"
export function NoticeContent({ blocks }: { blocks: NoticeBlock[] }) {
  let number = 0
  return (
    <div className="notice-prose">
      {blocks.map((block) => {
        const href = safeNoticeLink(block.href)
        const text = href ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {block.text}
          </a>
        ) : (
          block.text
        )
        if (block.type !== "numbered") number = 0
        switch (block.type) {
          case "heading":
            return <h2 key={block.id}>{text}</h2>
          case "bullet":
            return (
              <p className="notice-bullet" key={block.id}>
                • {text}
              </p>
            )
          case "numbered":
            return (
              <p className="notice-bullet" key={block.id}>
                {++number}. {text}
              </p>
            )
          case "quote":
            return <blockquote key={block.id}>{text}</blockquote>
          case "divider":
            return <hr key={block.id} />
          case "image":
            return (
              <figure key={block.id}>
                <img
                  src={`/api/notice-assets/${block.assetId}`}
                  alt={block.text || "공지 사진"}
                  loading="lazy"
                />
                {block.text && <figcaption>{block.text}</figcaption>}
              </figure>
            )
          default:
            return <p key={block.id}>{text}</p>
        }
      })}
    </div>
  )
}
