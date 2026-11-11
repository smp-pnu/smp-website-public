import type { ContentItem } from "./content-model";
import { SITE_SHORT_NAME_KO } from "./site-config";

// The public Open Graph tags and admin preview must describe the same edition.
export function contentShareText(item: ContentItem) {
  const company = item.company?.trim();
  const subject = item.kind === "research" && company && !item.title.includes(company)
    ? `${company}${item.ticker ? ` (${item.ticker})` : ""} 기업분석 · ${item.title}`
    : item.title;
  const description = [item.company, item.ticker, item.industry,
    item.summary || `${item.author || "SMP"}의 ${item.category || "리포트"}`]
    .filter(Boolean).join(" · ").replace(/\s+/g, " ").slice(0, 200);
  return { title: `${subject} | ${SITE_SHORT_NAME_KO}`, description };
}
