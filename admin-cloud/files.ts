import { Buffer } from "node:buffer"
import { HttpError } from "../admin-server/validation"

// Only inspect bounded WebP headers; image decoding stays in the browser.
export function validateCover(bytes: Uint8Array, total: number) {
  const b = Buffer.from(bytes)
  const bad = () => { throw new HttpError(400, "정적인 WebP 표지(최대 2048px)를 선택해 주세요.") }
  if (b.length < 30 || b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP" || b.readUInt32LE(4) + 8 !== total) bad()
  const format = b.toString("ascii", 12, 16)
  let width = 0, height = 0
  if (format === "VP8X") {
    if (b[20] & 2) bad() // Animated covers are unnecessary and more expensive to decode.
    width = b.readUIntLE(24, 3) + 1; height = b.readUIntLE(27, 3) + 1
  } else if (format === "VP8 " && b.toString("hex", 23, 26) === "9d012a") {
    width = b.readUInt16LE(26) & 0x3fff; height = b.readUInt16LE(28) & 0x3fff
  } else if (format === "VP8L" && b[20] === 0x2f) {
    const bits = b.readUInt32LE(21)
    width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1
  }
  if (!width || !height || width > 2048 || height > 2048 || width * height > 3_000_000) bad()
}
