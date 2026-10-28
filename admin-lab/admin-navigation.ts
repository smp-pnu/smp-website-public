export const adminSections = [
  "dashboard",
  "research",
  "notice",
  "members",
  "recruitment",
  "upload",
  "security",
  "storage",
] as const;
export type AdminSection = (typeof adminSections)[number];
export type AdminRoute = {
  section: AdminSection;
  q: string;
  group: string;
  filter: string;
  page: number;
  entry?: string;
};
export function readAdminRoute(hash: string): AdminRoute {
  const [name, search = ""] = hash.replace(/^#/, "").split("?");
  const section = adminSections.includes(name as AdminSection)
    ? (name as AdminSection)
    : "dashboard";
  const params = new URLSearchParams(search);
  const rawPage = Number(params.get("page"));
  const entry = params.get("entry") ?? "";
  return {
    section,
    q: (params.get("q") ?? "").slice(0, 100),
    group: (params.get("group") ?? "").slice(0, 30),
    filter: ["public", "draft", "trash"].includes(params.get("filter") ?? "")
      ? params.get("filter")!
      : "all",
    page:
      Number.isInteger(rawPage) && rawPage >= 1 ? Math.min(1000, rawPage) : 1,
    ...(["research", "notice", "members"].includes(section) &&
    /^[a-f0-9]{32}$/.test(entry)
      ? { entry }
      : {}),
  };
}
export function adminSection(hash: string): AdminSection {
  return readAdminRoute(hash).section;
}
export function adminRouteHash(
  route: Partial<AdminRoute> & { section: AdminSection },
) {
  const params = new URLSearchParams();
  if (route.q) params.set("q", route.q);
  if (route.group) params.set("group", route.group);
  if (route.filter && route.filter !== "all")
    params.set("filter", route.filter);
  if (route.page && route.page > 1) params.set("page", String(route.page));
  if (route.entry) params.set("entry", route.entry);
  return "#" + route.section + (params.size ? "?" + params : "");
}
export const adminHistoryKey = "smpAdminNavigationIndex";
export function writeAdminRoute(
  route: Partial<AdminRoute> & { section: AdminSection },
  replace = false,
) {
  const hash = adminRouteHash(route);
  if (location.hash === hash) return;
  const index =
    (Number(history.state?.[adminHistoryKey]) || 0) + (replace ? 0 : 1);
  history[replace ? "replaceState" : "pushState"](
    { ...history.state, [adminHistoryKey]: index },
    "",
    location.pathname + location.search + hash,
  );
  window.dispatchEvent(new Event("admin-route-pushed"));
}
export function writeAdminSection(section: AdminSection) {
  writeAdminRoute({ section });
}
const resumeKey = "smp-admin-upload-return";
export type UploadReturn = { target?: string; title?: string; expires: number };
export function saveUploadReturn(target?: string, title?: string) {
  try {
    sessionStorage.setItem(
      resumeKey,
      JSON.stringify({ target, title, expires: Date.now() + 30 * 60_000 }),
    );
  } catch {
    /* The ordinary upload menu remains available. */
  }
}
export function readUploadReturn(): UploadReturn | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(resumeKey) ?? "null");
    if (
      !value ||
      !Number.isFinite(value.expires) ||
      value.expires <= Date.now() ||
      value.expires > Date.now() + 30 * 60_000 ||
      (value.target !== undefined && !/^[a-f0-9]{32}$/.test(value.target)) ||
      (value.title !== undefined &&
        (typeof value.title !== "string" || value.title.length > 500))
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export function clearUploadReturn() {
  try {
    sessionStorage.removeItem(resumeKey);
  } catch {}
}
