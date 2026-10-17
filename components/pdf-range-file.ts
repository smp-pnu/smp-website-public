import {pdfjs} from 'react-pdf'
import {createPdfRangeLoader} from '@/lib/pdf-range-loader'
import type {ReaderTransport} from '@/lib/report-reader'

export function preparedRangeFile(url:string,hint:ReaderTransport,onFailure:()=>void) {
  let active=true
  const fail=()=>{if(active)onFailure()}
  const loader=createPdfRangeLoader(url,hint,fail)
  class Transport extends pdfjs.PDFDataRangeTransport {
    constructor(){super(hint.bytes,new Uint8Array(),true)}
    requestDataRange(begin:number,end:number){void loader.read(begin,end).then(bytes=>this.onDataRange(begin,bytes)).catch(fail)}
    abort(){active=false;loader.abort()}
  }
  const range=new Transport()
  loader.prefetch()
  return {file:{range},dispose:()=>range.abort()}
}
