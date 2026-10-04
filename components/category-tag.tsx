// Match Notion's select palette, with contrast suited to the site's dark theme.
const colors: Record<string, string> = {
  default: "bg-slate-300/10 text-slate-300",
  gray: "bg-zinc-300/10 text-zinc-300",
  brown: "bg-[#bd967e]/10 text-[#d8b69f]",
  orange: "bg-[#edab76]/10 text-[#edb385]",
  yellow: "bg-[#dfbe70]/10 text-[#dfc68f]",
  green: "bg-[#8ebda6]/10 text-[#9bcdb3]",
  blue: "bg-[#8bbbe1]/10 text-[#a8cce7]",
  purple: "bg-[#bba1d8]/10 text-[#c9b3e4]",
  pink: "bg-[#d49cbd]/10 text-[#e0b0cf]",
  red: "bg-[#da9696]/10 text-[#e4aaaa]",
}

export function CategoryTag({ name, color = "default" }: { name: string; color?: string }) {
  return <span className={`inline-flex max-w-full items-center rounded-[3px] px-2 py-0.5 text-sm leading-5 ${colors[color] ?? colors.default}`}>{name}</span>
}
