import Image from "next/image"
import type { ReactNode } from "react"

export function BackgroundChapter({ image, children }: { image: string; children: ReactNode }) {
  return (
    <div className="relative isolate border-t-2 border-black" data-background-chapter={image}>
      <div className="pointer-events-none absolute inset-0 -z-10 [clip-path:inset(0)]" aria-hidden="true">
        <div className="fixed inset-0 overflow-hidden bg-black">
          <Image src={image} alt="" fill sizes="100vw" className="object-cover object-center" />
          <div className="absolute inset-0 bg-black/70" />
        </div>
      </div>
      {children}
    </div>
  )
}
