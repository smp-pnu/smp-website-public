import type { Entry } from "../../cms/model";
import type { AdminSection } from "../admin-navigation";
export type EntryListData = { items: Entry[]; total: number; groups: string[] };
export type Query = {
  section: AdminSection;
  q: string;
  group: string;
  filter: string;
  page: number;
  tick: number;
  onPage: (page: number) => void;
};
export function entryListPath({
  section,
  q,
  group,
  filter,
  page,
}: Omit<Query, "tick" | "onPage">) {
  if (
    !["research", "notice", "members"].includes(section) ||
    (section === "members" && !group)
  )
    return null;
  return `/${section}?${new URLSearchParams({ q, group, state: filter === "trash" ? "all" : filter, trash: filter === "trash" ? "1" : "0", page: String(page) })}`;
}
