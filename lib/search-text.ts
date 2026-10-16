// Shared by report filters, autocomplete and full-site search. No extra CMS calls.
export const normalizeSearchText = (value: string) => value.normalize("NFKC").toLocaleLowerCase()
export function matchesSearchTerms(text: string, terms: string[]) {
  return terms.every(term => text.includes(term)) || text.replace(/\s/g, "").includes(terms.join(""))
}
