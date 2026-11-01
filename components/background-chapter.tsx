import Image from "next/image"
import type { ReactNode } from "react"

export function BackgroundChapter({ image, children }: { image: string; children: ReactNode }) {
  return (
    <div className="relative isolate bg-black" data-background-chapter={image}>
      {/* Cover fractional-pixel joins without exposing the fixed hero underneath. */}
      <div className="pointer-events-none absolute inset-0 -z-10 [clip-path:inset(-1px_0)]" aria-hidden="true">
        <div className="site-backdrop fixed inset-0 overflow-hidden">
          <Image src={image} alt="" fill sizes="100vw" className="site-photo object-cover object-center" />
        </div>
      </div>
      {children}
    </div>
  )
}
