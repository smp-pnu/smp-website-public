// Match Notion's select palette, with contrast suited to the site's dark theme.
const colors: Record<string, string> = {
  default: "bg-slate-400/15 text-slate-200",
  gray: "bg-zinc-400/20 text-zinc-200",
  brown: "bg-[#604335] text-[#f1d0bb]",
  orange: "bg-[#704324] text-[#ffd0a6]",
  yellow: "bg-[#655321] text-[#f9e19b]",
  green: "bg-[#254e3f] text-[#b5e3cd]",
  blue: "bg-[#274c6b] text-[#b9ddfa]",
  purple: "bg-[#4e3969] text-[#dfc9f5]",
  pink: "bg-[#653550] text-[#f4c2df]",
  red: "bg-[#6b3535] text-[#ffc5c5]",
}

export function CategoryTag({ name, color = "default" }: { name: string; color?: string }) {
  return <span className={`inline-flex max-w-full items-center rounded px-2 py-0.5 text-sm font-medium leading-5 ${colors[color] ?? colors.default}`}>{name}</span>
}
