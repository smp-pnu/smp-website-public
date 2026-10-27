import type { Database } from "../cloudflare/bindings";
import type { ContentItem } from "../lib/content-model";
import type { ReaderPdf } from "../lib/report-reader";
import { readReaderChunks } from "../free/server/reader-chunks";
export async function managedPdf(
  request: Request,
  item: ContentItem,
  db: Database,
  assets: { fetch: typeof fetch },
) {
  const row = await db
    .prepare(
      "SELECT item,cover FROM free_content WHERE id=? AND kind='research' AND body_revision=revision",
    )
    .bind(item.id)
    .first<{ item: string; cover: string }>();
  const missing = () => new Response("Not found", { status: 404 });
  if (
    !row ||
    !row.cover ||
    JSON.parse(row.item).managedPdf?.identity !== item.managedPdf?.identity
  )
    return missing();
  const url = new URL(request.url),
    cover = JSON.parse(row.cover),
    pdf: ReaderPdf = cover.reader?.pdf;
  if (
    (url.searchParams.has("edition") &&
      url.searchParams.get("edition") !== item.managedPdf?.identity) ||
    (url.searchParams.has("index") && url.searchParams.get("index") !== "0") ||
    url.searchParams.has("source")
  )
    return missing();
  if (!pdf) return missing();
  const prepared = url.searchParams.get("prepared"),
    pack = url.searchParams.get("pages");
  if (prepared && prepared !== cover.pdfHash) return missing();
  if (url.searchParams.has("pages")) {
    if (
      !pack ||
      !prepared ||
      !cover.reader?.pagePack?.url.endsWith(`/${pack}.pack`) ||
      request.headers.has("range")
    )
      return missing();
    const value = await assets.fetch(
      new Request(new URL(cover.reader.pagePack.url, url)),
    );
    const type = value.headers.get("content-type")?.split(";")[0];
    if (
      value.status !== 200 ||
      !value.body ||
      (type && type !== "application/octet-stream") ||
      (value.headers.has("content-length") &&
        Number(value.headers.get("content-length")) !==
          cover.reader.pagePack.bytes)
    ) {
      await value.body?.cancel();
      return missing();
    }
    // Assets may omit the type/length of an unknown .pack extension. The
    // reader requires these headers before its own full hash verification.
    return new Response(value.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(cover.reader.pagePack.bytes),
        "Content-Security-Policy": "sandbox",
        "Cache-Control": "no-store",
      },
    });
  }
  // Keep the native Fetcher as the receiver. Copying its fetch method to a
  // plain object works with local arrow-function mocks but fails in workerd.
  const response = await readReaderChunks(request, pdf, {
    CMS_DB: db,
    ASSETS: assets,
  });
  if (!response) return missing();
  const headers = new Headers(response.headers);
  headers.set(
    "Content-Disposition",
    `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(item.managedPdf!.name)}`,
  );
  headers.set("Content-Security-Policy", "sandbox");
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}
