import { Buffer } from "node:buffer"
import { HttpError } from "../admin-server/validation"
import { chunkBytes, coverLimit } from "./protocol"

// Inspect at most the first upload chunk; never decode images in the Worker.
export function validateCover(bytes: Uint8Array, total: number): "image/webp" | "image/jpeg" {
  const b = Buffer.from(bytes.subarray(0, chunkBytes))
  const bad = (): never => { throw new HttpError(400, "정적인 WebP 또는 JPEG 표지(최대 2048px·1 MB)를 선택해 주세요.") }
  const dimensions = (width: number, height: number) => {
    if (!width || !height || width > 2048 || height > 2048 || width * height > 3_000_000) bad()
  }
  if (total < 12 || total > coverLimit || bytes.length > total) bad()
  if (b[0] === 0xff && b[1] === 0xd8) {
    let offset = 2
    while (offset + 4 <= b.length) {
      if (b[offset++] !== 0xff) bad()
      while (b[offset] === 0xff) offset++
      const marker = b[offset++]
      if (offset + 2 > b.length || marker === 0xda || marker === 0xd9) bad()
      const length = b.readUInt16BE(offset)
      if (length < 2 || offset + length > b.length) bad()
      if (marker === 0xc0 || marker === 0xc2) {
        if (length < 11 || b[offset + 2] !== 8 || length !== 8 + 3 * b[offset + 7]) bad()
        dimensions(b.readUInt16BE(offset + 5), b.readUInt16BE(offset + 3))
        return "image/jpeg"
      }
      // Canvas JPEGs use length-prefixed tables, comments and application data.
      if (![0xc4, 0xdb, 0xdd, 0xfe].includes(marker) && !(marker >= 0xe0 && marker <= 0xef)) bad()
      offset += length
    }
    bad()
  }
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
  dimensions(width, height)
  return "image/webp"
}
