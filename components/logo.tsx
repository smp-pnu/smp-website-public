import Image from "next/image"
import { cn } from "@/lib/utils"

type LogoVariant = "color" | "white"

const SYMBOL_SRC: Record<LogoVariant, string> = {
  color: "/smp-symbol.svg",
  white: "/smp-symbol-white.svg",
}

const FULL_SRC: Record<LogoVariant, string> = {
  color: "/smp-symbol-full.svg",
  white: "/smp-symbol-full-white.svg",
}

/**
 * Symbol-only mark (wings icon). Used in the header and other compact spots.
 * The "white" variant reuses the same shapes and proportions as the color
 * SVG with every fill switched to solid white on a transparent background,
 * for use over the dark HOME background photo.
 */
export function LogoSymbol({
  className,
  variant = "color",
}: {
  className?: string
  variant?: LogoVariant
}) {
  return (
    <Image
      src={SYMBOL_SRC[variant]}
      alt="SMP 부산대학교 금융투자학회 심볼"
      width={98}
      height={46}
      priority
      className={cn("h-8 w-auto", className)}
    />
  )
}

/**
 * Full lockup (wings icon + STOCK MASTERS OF PNU wordmark). Used on the hero
 * and in the footer.
 */
export function LogoFull({
  className,
  variant = "color",
}: {
  className?: string
  variant?: LogoVariant
}) {
  return (
    <Image
      src={FULL_SRC[variant]}
      alt="SMP STOCK MASTERS OF PNU 로고"
      width={104}
      height={55}
      priority
      className={cn("h-14 w-auto", className)}
    />
  )
}

