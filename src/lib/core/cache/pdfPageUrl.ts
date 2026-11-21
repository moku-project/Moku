// Kept apart from pdfRender so checking a URL doesn't load PDF.js at startup.
export const PDFPAGE_RE = /\/content\/([^/]+)\/([^/]+)\/pdfpage\/(\d+)(?:[?#].*)?$/;

export function isPdfPageUrl(url: string): boolean {
  return PDFPAGE_RE.test(url);
}

let release: ((chapterId: string) => void) | null = null;

/** Set by pdfRender once it has loaded, so freeing a chapter never pulls PDF.js in. */
export function onPdfRelease(fn: (chapterId: string) => void): void {
  release = fn;
}

export function clearPdfChapterCache(chapterId: string): void {
  release?.(chapterId);
}
