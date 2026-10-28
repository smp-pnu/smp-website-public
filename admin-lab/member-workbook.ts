import { unzipSync } from "fflate"
import { rosterLimits, type RosterSheet } from "./member-import-model"

const decode = (data: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(data)
export function parseRosterCsv(text: string): RosterSheet {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false
  text = text.replace(/^\uFEFF/, "")
  const first = text.split(/\r?\n/,1)[0], delimiter = first.includes("\t") && !first.includes(",") ? "\t" : ","
  const pushCell = () => { if (cell.length > 1000 || row.length >= rosterLimits.columns) throw Error("셀 길이 또는 열 수가 너무 많아요."); row.push(cell); cell = "" }
  const pushRow = () => { pushCell(); if (rows.length >= rosterLimits.rows) throw Error("한 시트에 최대 1,000행까지 읽을 수 있어요."); rows.push(row); row = [] }
  for (let i=0;i<text.length;i++) {
    const c=text[i]
    if (c==='"') { if (quoted && text[i+1]==='"') { cell+='"';i++ } else if (!cell || quoted) quoted=!quoted; else cell+=c }
    else if (c===delimiter && !quoted) pushCell()
    else if ((c==='\n'||c==='\r') && !quoted) { if(c==='\r'&&text[i+1]==='\n')i++;pushRow() }
    else cell+=c
  }
  if(quoted)throw Error("CSV 따옴표가 닫히지 않았어요. UTF-8 CSV로 다시 저장해 주세요.")
  if(cell || row.length)pushRow()
  return {name:"명단",rows,hiddenRows:[]}
}
function xml(bytes: Uint8Array) {
  const text = decode(bytes)
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error("외부 참조가 있는 엑셀은 읽을 수 없어요.")
  const doc = new DOMParser().parseFromString(text,"application/xml")
  if (doc.getElementsByTagName("parsererror").length) throw Error("엑셀 내부 문서가 손상됐어요.")
  return doc
}
const elements = (node: Document | Element, tag: string) => Array.from(node.getElementsByTagNameNS("*",tag))
const allText = (node: Element) => elements(node,"t").map(n=>n.textContent??"").join("")
function columnIndex(ref: string) { let n=0;for(const c of ref.match(/^[A-Z]+/)?.[0]??"")n=n*26+c.charCodeAt(0)-64;return n-1 }
export function parseRosterXlsx(bytes: Uint8Array): RosterSheet[] {
  if(bytes.byteLength>rosterLimits.file)throw Error("명단 파일은 2 MB 이하로 올려 주세요.")
  let size=0, entries=0
  const files=unzipSync(bytes,{filter:entry=>{
    if(++entries>1000)throw Error("엑셀 내부 파일이 너무 많아요.")
    const include=/^(?:xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml))$/.test(entry.name)
    if(include){size+=entry.originalSize;if(entry.originalSize>4*1024*1024||size>12*1024*1024)throw Error("엑셀 압축 해제 용량이 너무 커요. 필요한 시트만 새 파일에 저장해 주세요.")}
    return include
  }})
  if(!files["xl/workbook.xml"]||!files["xl/_rels/workbook.xml.rels"])throw Error("올바른 .xlsx 파일을 선택해 주세요.")
  const shared=files["xl/sharedStrings.xml"]?elements(xml(files["xl/sharedStrings.xml"]),"si").map(allText):[]
  if(shared.length>50000)throw Error("엑셀의 텍스트가 너무 많아요.")
  const rels=new Map(elements(xml(files["xl/_rels/workbook.xml.rels"]),"Relationship").filter(r=>r.getAttribute("TargetMode")!=="External").map(r=>[r.getAttribute("Id"),r.getAttribute("Target")??""]))
  const sheets=elements(xml(files["xl/workbook.xml"]),"sheet").filter(s=>!s.getAttribute("state")||s.getAttribute("state")==="visible")
  if(sheets.length>rosterLimits.sheets)throw Error("시트는 최대 20개까지 읽을 수 있어요.")
  return sheets.map(sheet=>{
    const relation=Array.from(sheet.attributes).find(a=>a.localName==="id")?.value??""
    let target=rels.get(relation)??""
    target=target.startsWith("/xl/")?target.slice(1):`xl/${target.replace(/^\.\//,"")}`
    if(!/^xl\/worksheets\/sheet\d+\.xml$/.test(target)||!files[target])throw Error("시트 연결을 읽지 못했어요. .xlsx로 다시 저장해 주세요.")
    const doc=xml(files[target]), rows:string[][]=[], hiddenRows:number[]=[]
    for(const row of elements(doc,"row")) {
      const r=Number(row.getAttribute("r"))-1
      const cells=elements(row,"c");if(!cells.some(c=>elements(c,"v").length||elements(c,"is").length||elements(c,"f").length))continue
      if(!Number.isInteger(r)||r<0||r>=rosterLimits.rows)throw Error("명단은 1,000행 안에 배치해 주세요.")
      while(rows.length<=r)rows.push([])
      if(row.getAttribute("hidden")==="1")hiddenRows.push(r)
      for(const c of cells) {
        if(!elements(c,"v").length&&!elements(c,"is").length&&!elements(c,"f").length)continue
        const column=columnIndex(c.getAttribute("r")??"")
        if(column<0||column>=rosterLimits.columns)throw Error("명단은 앞쪽 40개 열 안에 배치해 주세요.")
        // Never evaluate formulas, follow hyperlinks or load embedded media.
        const raw=elements(c,"v")[0]?.textContent??"",type=c.getAttribute("t")
        const value=elements(c,"f").length?"":type==="s"?shared[Number(raw)]??"":type==="inlineStr"?allText(c):type==="e"?"":raw
        if(value.length>1000)throw Error("긴 본문이 있는 파일이에요. 명단 시트만 새 파일에 저장해 주세요.")
        rows[r][column]=value
      }
    }
    const merges=elements(doc,"mergeCell").flatMap(m=>{
      const match=/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(m.getAttribute("ref")??"")
      if(!match)return []
      return [{row:Number(match[2])-1,column:columnIndex(match[1]),endRow:Number(match[4])-1,endColumn:columnIndex(match[3])}]
    })
    return {name:sheet.getAttribute("name")??"시트",rows,hiddenRows,merges}
  }).filter(s=>s.rows.length)
}
export async function readRosterWorkbook(file: File): Promise<RosterSheet[]> {
  if(file.size>rosterLimits.file)throw Error("명단 파일은 2 MB 이하로 올려 주세요.")
  const bytes=new Uint8Array(await file.arrayBuffer())
  if(/\.xlsx$/i.test(file.name))return parseRosterXlsx(bytes)
  if(/\.(?:csv|tsv)$/i.test(file.name))return [parseRosterCsv(decode(bytes))]
  throw Error(".xlsx 또는 UTF-8 CSV 파일을 선택해 주세요. 오래된 .xls 파일은 .xlsx로 다시 저장하면 됩니다.")
}
