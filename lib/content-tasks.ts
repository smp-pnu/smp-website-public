import "server-only"
import { syncReportMetadata } from "./report-metadata-service"
import { reconcileReportCovers, syncReportCover } from "./cover-service"
import { coverStorageEnabled } from "./cover-store"

// Node hosts execute these tasks directly. The Workers build replaces this
// boundary with a durable queue; native PDF/image libraries never enter it.
export async function prepareContent(id: string, eventType: string) {
  if (["page.created", "page.properties_updated", "page.content_updated", "page.undeleted"].includes(eventType)) {
    await syncReportMetadata(id)
  }
  const cover = coverStorageEnabled() ? await syncReportCover(id, false) : null
  return { prepared: !!cover }
}

export async function reconcileContent() {
  return reconcileReportCovers()
}
