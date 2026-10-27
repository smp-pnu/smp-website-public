// This worker only validates structure/page count. It neither renders nor follows links.
import { parentPort, workerData } from 'node:worker_threads'
try {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = getDocument({ data: new Uint8Array(workerData), enableXfa: false, verbosity: 0 })
  task.onPassword = () => { parentPort.postMessage({ error: '암호가 걸린 PDF는 업로드할 수 없어요.' }); void task.destroy() }
  try { const pdf = await task.promise; parentPort.postMessage({ pages: pdf.numPages }) }
  finally { await task.destroy() }
} catch { parentPort.postMessage({ error: '서버에서 PDF 구조를 확인하지 못했어요.' }) }
