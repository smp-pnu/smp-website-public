// Node-only artwork renderer. Fonts and images are local; no external API or
// request-time rendering is used. Coordinates follow the approved 1200×630 draft.
import {readdir} from 'node:fs/promises'
import {createCanvas,GlobalFonts,loadImage,type SKRSContext2D} from '@napi-rs/canvas'
import sharp from 'sharp'
import {reportShareCopy,type ShareText} from '../../lib/report-share-image'

let fontPromise:Promise<string>|undefined
function shareFont() {
  return fontPromise??= (async()=>{
    const root='node_modules/@fontsource-variable/noto-sans-kr/files'
    const files=(await readdir(root)).filter(file=>file.endsWith('-wght-normal.woff2')).sort()
    const names:string[]=[]
    for(const [i,file] of files.entries()) {
      // Each Unicode subset needs a separate fallback family; registering all
      // subsets under one alias makes the last one replace the earlier glyphs.
      const name=`SMPShare${i}`
      if(!GlobalFonts.registerFromPath(`${root}/${file}`,name))throw Error('Sharing font unavailable')
      names.push(`"${name}"`)
    }
    if(!names.length)throw Error('Sharing fonts missing')
    return names.join(',')
  })()
}
export function wrapShareText(ctx:Pick<SKRSContext2D,'measureText'>,text:string,width:number) {
  const lines:string[]=[]
  let line=''
  for(const word of text.split(' ')) {
    const candidate=line?line+' '+word:word
    if(ctx.measureText(candidate).width<=width){line=candidate;continue}
    if(line){lines.push(line);line=''}
    for(const char of word) {
      if(line && ctx.measureText(line+char).width>width){lines.push(line);line=''}
      line+=char
    }
  }
  if(line)lines.push(line)
  return lines
}
function textBlock(ctx:SKRSContext2D,text:string,font:string,x:number,y:number,width:number,maxLines:number,maxSize:number,minSize:number,weight=400,maxHeight=145) {
  ctx.fontVariationSettings=`"wght" ${weight}`
  let size=maxSize,lines:string[]=[]
  for(;size>=minSize;size-=2){ctx.font=`${weight} ${size}px ${font}`;lines=wrapShareText(ctx,text,width);if(lines.length<=maxLines && size+(lines.length-1)*size*1.5<=maxHeight)break}
  size=Math.max(size,minSize);ctx.font=`${weight} ${size}px ${font}`
  if(lines.length>maxLines){lines=lines.slice(0,maxLines);let last=lines[maxLines-1];while(last && ctx.measureText(last+'…').width>width)last=last.slice(0,-1);lines[maxLines-1]=last+'…'}
  lines.forEach((line,i)=>ctx.fillText(line,x,y+i*size*1.5))
}
export async function createShareRenderer() {
  const font=await shareFont()
  const photo=await loadImage('design/share-background.jpg')
  // SVG rasterized at output resolution, never enlarged from a small PNG.
  const logo=await loadImage(await sharp('public/share/smp-symbol-clean.svg',{density:288}).resize({width:528}).png().toBuffer())
  return async(data:Buffer,item:ShareText)=>{
    const canvas=createCanvas(2400,1260),ctx=canvas.getContext('2d')
    ctx.scale(2,2);ctx.drawImage(photo,0,0,1200,630)
    ctx.fillStyle='rgba(7,18,29,.28)';ctx.fillRect(0,0,1200,630)
    const shade=ctx.createLinearGradient(0,0,1200,0)
    shade.addColorStop(0,'rgba(7,18,29,.7)');shade.addColorStop(.57,'rgba(7,18,29,.24)');shade.addColorStop(1,'rgba(7,18,29,.06)')
    ctx.fillStyle=shade;ctx.fillRect(0,0,1200,630)
    ctx.drawImage(logo,84,50.4,264,264*229/490)
    const copy=reportShareCopy(item)
    ctx.fillStyle='#ffffff';ctx.textBaseline='top'
    textBlock(ctx,copy.company,font,96,264.6,550,2,73,38,600,100)
    textBlock(ctx,copy.title,font,96,378,470,3,34,26)
    ctx.font=`400 19px ${font}`;ctx.fillStyle='#dee5ea';ctx.fillText('pnusmp.com',96,556)
    const cover=await sharp(data,{limitInputPixels:20_000_000}).resize({width:750,height:1084,fit:'inside'}).png().toBuffer({resolveWithObject:true})
    const coverImage=await loadImage(cover.data),w=cover.info.width/2,h=cover.info.height/2,left=1116-w,top=(630-h)/2
    ctx.shadowColor='#0007';ctx.shadowBlur=28;ctx.shadowOffsetY=16
    ctx.fillStyle='#fff';ctx.fillRect(left,top,w,h)
    ctx.shadowColor='transparent';ctx.drawImage(coverImage,left,top,w,h)
    const pixels=await canvas.encode('png')
    let image=await sharp(pixels).jpeg({quality:88,chromaSubsampling:'4:4:4'}).toBuffer()
    for(const quality of [82,76]) {
      if(image.length<=1024*1024)break
      image=await sharp(pixels).jpeg({quality,chromaSubsampling:'4:4:4'}).toBuffer()
    }
    return image
  }
}
