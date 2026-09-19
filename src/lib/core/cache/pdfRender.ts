import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { pageServerUrl } from "$lib/core/cache/pageCache";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const PDFPAGE_RE = /\/content\/([^/]+)\/([^/]+)\/pdfpage\/(\d+)(?:[?#].*)?$/;

const docCache = new Map<string, Promise<PDFDocumentProxy>>();

export function isPdfPageUrl(url: string): boolean {
  return PDFPAGE_RE.test(url);
}

function loadDoc(mediaId: string, chapterId: string): Promise<PDFDocumentProxy> {
  const cached = docCache.get(chapterId);
  if (cached) return cached;
  const p = pdfjsLib.getDocument({ url: `${pageServerUrl()}/content/${mediaId}/${chapterId}/pdf` }).promise;
  docCache.set(chapterId, p);
  p.catch(() => docCache.delete(chapterId));
  return p;
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
  await page.render({ canvasContext: ctx, viewport }).promise;

  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error(`failed to encode rendered pdf page ${pageStr}`);
  return blob;
}

export function clearPdfChapterCache(chapterId: string): void {
  docCache.delete(chapterId);
}
