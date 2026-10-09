import type { FormHTMLAttributes } from "react"
import { useNavigate } from "react-router"
export default function Form({ action, prefetch: _prefetch, onSubmit, ...props }: FormHTMLAttributes<HTMLFormElement> & { action: string; prefetch?: boolean }) {
  const navigate = useNavigate()
  return <form {...props} action={action} onSubmit={event => {
    onSubmit?.(event)
    if (event.defaultPrevented || (props.method && props.method.toLowerCase() !== "get")) return
    event.preventDefault()
    const params = new URLSearchParams()
    for (const [key, value] of new FormData(event.currentTarget)) if (typeof value === "string") params.append(key, value)
    void navigate(`${action}?${params}`)
  }} />
}
