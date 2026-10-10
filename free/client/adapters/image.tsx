import type { ImgHTMLAttributes } from "react"
type Props = ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean; unoptimized?: boolean; quality?: number }
export default function Image({ fill, priority, unoptimized: _u, quality: _q, style, ...props }: Props) {
  return <img {...props} loading={props.loading ?? (priority ? "eager" : "lazy")} fetchPriority={props.fetchPriority ?? (priority ? "high" : undefined)}
    style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style} />
}
