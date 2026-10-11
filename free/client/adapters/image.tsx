import type { ImgHTMLAttributes } from "react"
type Props = ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean; unoptimized?: boolean; quality?: number }
export default function Image({ fill, priority, unoptimized: _u, quality: _q, style, ...props }: Props) {
  const img=<img {...props} loading={props.loading ?? (priority ? "eager" : "lazy")} fetchPriority={props.fetchPriority ?? (priority ? "high" : undefined)}
    style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style} />
  return typeof props.src==="string"&&/^\/backgrounds\/[\w-]+\.webp$/.test(props.src)
    ?<picture><source media="(max-width: 639px)" srcSet={props.src.replace(/\.webp$/,"-mobile.webp")} />{img}</picture>:img
}
