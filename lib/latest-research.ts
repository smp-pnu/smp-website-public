import { sortContent, type ContentItem } from "./content-model"

// Older semesters can contain later re-publication dates. Keep the homepage
// on the current semester, then include the complete latest dated edition.
export function latestResearchEdition(items: ContentItem[]) {
  const reports = items.filter(item => item.kind === "research")
  const semester = reports.reduce((latest, item) => (item.semester ?? "") > latest ? item.semester! : latest, "")
  const current = semester ? reports.filter(item => item.semester === semester) : reports
  const date = current.reduce((latest, item) => item.date > latest ? item.date : latest, "")
  return date ? sortContent(current.filter(item => item.date === date)) : []
}
