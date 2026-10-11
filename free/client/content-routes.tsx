import { ListPage, DetailPage, SearchPage, NetworkPage } from "./content-pages"

export const Research=()=> <ListPage kind="research" />
export const Notices=()=> <ListPage kind="notice" />
export const ResearchDetail=()=> <DetailPage kind="research" />
export const NoticeDetail=()=> <DetailPage kind="notice" />
export const Members=()=> <NetworkPage members />
export { SearchPage as Search, NetworkPage as Network }
