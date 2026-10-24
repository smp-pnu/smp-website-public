import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"

type Confirm = (message: string) => Promise<boolean>
const Context = createContext<Confirm | null>(null)

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("")
  const pending = useRef<((answer: boolean) => void) | null>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const cancel = useRef<HTMLButtonElement>(null)
  const accept = useRef<HTMLButtonElement>(null)
  const finish = useCallback((answer: boolean) => {
    const resolve = pending.current
    pending.current = null; setMessage(""); resolve?.(answer)
    previousFocus.current?.focus()
  }, [])
  const ask = useCallback<Confirm>((text) => {
    if (pending.current) return Promise.resolve(false)
    previousFocus.current = document.activeElement as HTMLElement | null
    return new Promise(resolve => { pending.current = resolve; setMessage(text) })
  }, [])
  useEffect(() => {
    if (!message) return
    cancel.current?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); finish(false) }
      if (event.key === "Tab") {
        event.preventDefault()
        if (document.activeElement === cancel.current) accept.current?.focus()
        else cancel.current?.focus()
      }
    }
    document.addEventListener("keydown", key, true)
    return () => document.removeEventListener("keydown", key, true)
  }, [message, finish])
  useEffect(() => () => { pending.current?.(false) }, [])
  return <Context.Provider value={ask}>
    <div inert={!!message}>{children}</div>
    {message && <div className="confirm-backdrop"><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
      <h2 id="confirm-title">변경하기 전에 확인해 주세요</h2><p id="confirm-message">{message}</p>
      <div className="button-row"><button ref={cancel} className="secondary" onClick={() => finish(false)}>취소</button><button ref={accept} className="primary" onClick={() => finish(true)}>확인</button></div>
    </section></div>}
  </Context.Provider>
}
export function useConfirmation() {
  const ask = useContext(Context)
  if (!ask) throw Error("ConfirmationProvider is required")
  return ask
}
