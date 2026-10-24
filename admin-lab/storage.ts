import { checkCapacity, type Assets, type Draft } from "./model"

const DB_NAME = "smp-pdf-admin-lab-v1"
let connection: Promise<IDBDatabase> | undefined
function database() {
  return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const drafts = request.result.createObjectStore("drafts", { keyPath: "id" })
      drafts.createIndex("hash", "hash", { unique: true })
      request.result.createObjectStore("assets", { keyPath: "id" })
    }
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); connection = undefined }
      resolve(request.result)
    }
    request.onerror = () => { connection = undefined; reject(Error("브라우저 저장소를 열 수 없어요. 일반 창에서 다시 시도해 주세요.")) }
    request.onblocked = () => { connection = undefined; reject(Error("다른 시험실 탭을 닫고 다시 열어 주세요.")) }
  })
}
async function read<T>(store: string, key?: string): Promise<T> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = key ? db.transaction(store).objectStore(store).get(key) : db.transaction(store).objectStore(store).getAll()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
export const listDrafts = () => read<Draft[]>("drafts")
export const readAssets = (id: string) => read<Assets | undefined>("assets", id)

// Both stores and limits participate in one transaction: concurrent tabs cannot
// double-insert the same PDF or race past the browser's storage budget.
export async function insertDraft(draft: Draft, assets: Assets): Promise<Draft> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["drafts", "assets"], "readwrite")
    const store = tx.objectStore("drafts")
    let result = draft
    let failure: Error | undefined
    const request = store.getAll()
    request.onsuccess = () => {
      const existing = request.result as Draft[]
      const duplicate = existing.find(item => item.hash === draft.hash)
      if (duplicate) { result = duplicate; return }
      try { checkCapacity(existing, draft.storedBytes) }
      catch (error) { failure = error as Error; tx.abort(); return }
      store.add(draft); tx.objectStore("assets").add(assets)
    }
    tx.oncomplete = () => resolve(result)
    tx.onabort = tx.onerror = () => reject(failure ?? Error("저장하지 못했어요. 브라우저 저장 공간과 설정을 확인해 주세요."))
  })
}
export async function mutateDraft(id: string, expectedRevision: number, update: (draft: Draft) => Draft | null): Promise<void> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["drafts", "assets"], "readwrite")
    const store = tx.objectStore("drafts")
    let failure: Error | undefined
    const request = store.get(id)
    request.onsuccess = () => {
      try {
        const current = request.result as Draft | undefined
        if (!current || current.revision !== expectedRevision) throw Error("다른 탭에서 변경됐어요. 목록을 새로고침한 뒤 다시 확인해 주세요.")
        const next = update(current)
        if (next) store.put(next)
        else { store.delete(id); tx.objectStore("assets").delete(id) }
      } catch (error) { failure = error as Error; tx.abort() }
    }
    tx.oncomplete = () => resolve()
    tx.onabort = tx.onerror = () => reject(failure ?? Error("변경을 저장하지 못했어요."))
  })
}
