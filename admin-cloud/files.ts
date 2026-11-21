import { Buffer } from "node:buffer"
import { HttpError } from "../admin-server/validation"
import { coverLimit } from "./protocol"

// Bounded structural validation. Partial upload chunks only get header checks;
// the assembled image must pass this again before the upload is committed.
// This is deliberately not described as a malware scan or a full image decode.
export function validateCover(bytes: Uint8Array, total: number): "image/webp" | "image/jpeg" {
  const b = Buffer.from(bytes), complete=b.length===total
  const bad = (): never => { throw new HttpError(400, "완전한 정적 WebP 또는 JPEG 이미지(최대 2048px·1 MB)를 선택해 주세요.") }
  const dimensions = (width: number, height: number) => {
    if (!width || !height || width > 2048 || height > 2048 || width * height > 3_000_000) bad()
  }
  if (total < 12 || total > coverLimit || b.length > total) bad()
  if (b[0] === 0xff && b[1] === 0xd8) {
    let offset=2,frame=false,scan=false,tables=false
    while(offset<b.length) {
      if(b[offset++]!==0xff)bad()
      while(b[offset]===0xff)offset++
      const marker=b[offset++]
      if(marker===0xd9) {if(!frame||!scan||!tables||offset!==total)bad();return 'image/jpeg'}
      if(offset+2>b.length){if(!complete&&frame)return 'image/jpeg';bad()}
      const length=b.readUInt16BE(offset)
      if(length<2)bad()
      if(offset+length>b.length){if(!complete&&frame)return 'image/jpeg';bad()}
      if(marker===0xc0||marker===0xc2) {
        if(frame||length<11||b[offset+2]!==8||length!==8+3*b[offset+7])bad()
        dimensions(b.readUInt16BE(offset+5),b.readUInt16BE(offset+3));frame=true
      }else if(marker===0xdb){tables=true}
      else if(marker===0xda) {
        if(!frame||length<6||length!==6+2*b[offset+2])bad()
        scan=true;offset+=length
        let entropy=0
        while(offset<b.length) {
          if(b[offset]!==0xff){offset++;entropy++;continue}
          const next=b[offset+1]
          if(next===0||next>=0xd0&&next<=0xd7){offset+=2;entropy++;continue}
          if(next===0xff){offset++;continue}
          break
        }
        if(complete&&!entropy)bad()
        continue
      }else if(![0xc4,0xdd,0xfe].includes(marker)&&!(marker>=0xe0&&marker<=0xef))bad()
      offset+=length
    }
    if(!complete&&frame)return 'image/jpeg'
    bad()
  }
  if(b.length<30||b.toString('ascii',0,4)!=='RIFF'||b.toString('ascii',8,12)!=='WEBP'||b.readUInt32LE(4)+8!==total)bad()
  let offset=12,frame=false,extended=false
  while(offset+8<=b.length) {
    const format=b.toString('ascii',offset,offset+4),length=b.readUInt32LE(offset+4),start=offset+8,end=start+length
    if(end+(length%2)>total)bad()
    if(format==='VP8X') {
      if(extended||offset!==12||length!==10||end>b.length||b[start]&2)bad()
      dimensions(b.readUIntLE(start+4,3)+1,b.readUIntLE(start+7,3)+1);extended=true
    }else if(format==='VP8 '||format==='VP8L') {
      if(frame)bad()
      if(format==='VP8 ') {
        if(length<=10||start+10>b.length||b[start]&1||b.toString('hex',start+3,start+6)!=='9d012a')bad()
        dimensions(b.readUInt16LE(start+6)&0x3fff,b.readUInt16LE(start+8)&0x3fff)
      }else {
        if(length<=5||start+5>b.length||b[start]!==0x2f)bad()
        const bits=b.readUInt32LE(start+1);dimensions((bits&0x3fff)+1,((bits>>>14)&0x3fff)+1)
      }
      frame=true
    }else if(!['ALPH','ICCP','EXIF','XMP '].includes(format))bad()
    if(end>b.length){if(!complete&&(frame||extended))return 'image/webp';bad()}
    offset=end+(length%2)
  }
  if(!complete&&(frame||extended))return 'image/webp'
  if(!frame||offset!==total)bad()
  return 'image/webp'
}
