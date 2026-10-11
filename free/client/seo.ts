import type { ContentItem } from "../../lib/content-model"
import { metadataHtml } from "../seo/metadata"

export function updatePageMetadata(path:string,item?:ContentItem) {
  const fragment=document.createElement("template")
  fragment.innerHTML=metadataHtml(path,item)
  document.head.querySelectorAll("[data-smp-seo], title").forEach(node=>node.remove())
  document.head.append(fragment.content)
}
