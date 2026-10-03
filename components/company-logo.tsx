import logos from "@/data/company-logos.json"

type Logo = { src: string; width: number; height: number; source: string }

export function CompanyLogo({ index, name }: { index: number; name: string }) {
  const logo = (logos as Record<string, Logo>)[String(index)]

  // Use real text for unavailable originals, not an enlarged slide thumbnail.
  if (!logo) {
    return <span className="text-center text-base font-medium leading-relaxed tracking-tight text-white">{name}</span>
  }

  // The official Shinhan asset is a sprite; expose only its logo viewport.
  if (index === 22) {
    return <svg role="img" aria-label={name} viewBox="0 0 189 33" className="block h-auto max-h-12 w-full max-w-40 overflow-hidden" style={{ filter: "brightness(0) invert(1)" }}>
      <title>{name}</title>
      <image href={logo.src} width={logo.width} height={logo.height} />
    </svg>
  }

  const vector = logo.src.endsWith(".svg")
  return <img
    src={logo.src}
    alt={name}
    title={name}
    width={logo.width}
    height={logo.height}
    loading="lazy"
    decoding="async"
    className="block h-auto max-h-12 w-full object-contain"
    style={{ maxWidth: vector ? 160 : Math.min(160, logo.width), filter: "brightness(0) invert(1)" }}
  />
}
