import type { ContentBlock } from "./notion-model"

// Older publisher releases cached a generated PDF excerpt as a top-level
// toggle. Hide those cached blocks from both report HTML and RSS responses.
export function withoutGeneratedPdfExcerpt(blocks:ContentBlock[],id:string):ContentBlock[] {
  const title=(block:ContentBlock) => {
    const value=block[block.type] as {rich_text?:{plain_text?:string;text?:{content?:string}}[]}|undefined
    return value?.rich_text?.map(part=>part.plain_text??part.text?.content??"").join("").trim()
  }
  return blocks.filter(block=>block.id!==`${id}-excerpt` && !(block.type==="toggle" && title(block)==="PDF 원문 발췌"))
}
