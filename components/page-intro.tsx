import type { ReactNode } from "react"

/** Shared hierarchy for internal page titles; article titles retain their own layout. */
export function PageIntro({ eyebrow, title, children }: {
  eyebrow: string
  title: ReactNode
  children?: ReactNode
}) {
  return <header className="page-intro">
    <p className="page-intro__eyebrow">{eyebrow}</p>
    <h1 className="page-intro__title">{title}</h1>
    {children && <p className="page-intro__description">{children}</p>}
  </header>
}
