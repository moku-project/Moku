import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { pageServerUrl } from "$lib/core/cache/pageCache";
import { PDFPAGE_RE, onPdfRelease } from "$lib/core/cache/pdfPageUrl";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const docCache = new Map<string, PDFDocumentLoadingTask>();

onPdfRelease(chapterId => {
  const task = docCache.get(chapterId);
  docCache.delete(chapterId);
  // Frees the parsed document and its worker-side memory, not just the map entry.
  void task?.destroy();
});

function loadDoc(mediaId: string, chapterId: string): Promise<PDFDocumentProxy> {
  const cached = docCache.get(chapterId);
  if (cached) return cached.promise;
  const task = pdfjsLib.getDocument({ url: `${pageServerUrl()}/content/${mediaId}/${chapterId}/pdf` });
  docCache.set(chapterId, task);
  task.promise.catch(() => { if (docCache.get(chapterId) === task) docCache.delete(chapterId); });
  return task.promise;
}

export async function renderPdfPage(url: string): Promise<Blob> {
  const m = PDFPAGE_RE.exec(url);
  if (!m) throw new Error(`not a pdf page url: ${url}`);
  const [, mediaId, chapterId, pageStr] = m;

  const doc  = await loadDoc(mediaId, chapterId);
  const page = await doc.getPage(parseInt(pageStr, 10));
  const viewport = page.getViewport({ scale: 2 });

  const canvas = document.createElement("canvas");
  canvas.width  = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();

  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/png"));
  // Release the backing store now instead of waiting for GC.
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error(`failed to encode rendered pdf page ${pageStr}`);
  return blob;
}

