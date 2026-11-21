import test from 'node:test'
import assert from 'node:assert/strict'
import {renderReaderPages} from '../lib/pdf-preview-render'

// Valid synthetic PDFs: only the catalogue action/attachment differs.
function document(extra='') {
  const objects=[`<< /Type /Catalog /Pages 2 0 R ${extra} >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Contents 4 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
    '<< /Type /Filespec /F (sample.txt) /EF << /F 6 0 R >> >>',
    '<< /Type /EmbeddedFile /Length 4 >>\nstream\ntest\nendstream']
  let text='%PDF-1.7\n';const offsets:number[]=[]
  objects.forEach((object,i)=>{offsets.push(text.length);text+=`${i+1} 0 obj\n${object}\nendobj\n`})
  const xref=text.length
  text+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Root 1 0 R /Size ${objects.length+1} >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(text)
}
test('valid PDF renders, while executable actions and embedded files cannot publish',async()=>{
  assert.equal((await renderReaderPages(document())).pageCount,1)
  await assert.rejects(renderReaderPages(document('/OpenAction << /S /JavaScript /JS (app.alert\\(1\\)) >>')),/Active PDF content/)
  await assert.rejects(renderReaderPages(document('/Names << /EmbeddedFiles << /Names [(sample.txt) 5 0 R] >> >>')),/Active PDF content/)
})
