import { ListPage, DetailPage, ResearchDetailPage, SearchPage, NetworkPage } from "./content-pages"

export const Research=()=> <ListPage kind="research" />
export const Notices=()=> <ListPage kind="notice" />
export const ResearchDetail=ResearchDetailPage
export const NoticeDetail=()=> <DetailPage kind="notice" />
// Reuse the same component so toggling keeps the loaded member catalog in memory.
export { SearchPage as Search, NetworkPage as Network, NetworkPage as Members }
