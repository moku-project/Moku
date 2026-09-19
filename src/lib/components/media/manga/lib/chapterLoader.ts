import { readerState }                                          from "$lib/state/mangaReader.svelte";
import { seriesState }                                         from "$lib/state/series.svelte";
import { settingsState }                                       from "$lib/state/settings.svelte";
import { fetchPages, buildPageGroups }                          from "./pageLoader";
import { cancelQueuedFetches, revokeBlobUrl, preloadBlobUrls } from "$lib/core/cache/imageCache";
import { clearResolvedUrlCache, clearPageCache, measureAspect, isDegenerateAspect } from "$lib/core/cache/pageCache";
import { clearPdfChapterCache }                                from "$lib/core/cache/pdfRender";

function absolutePageUrl(p: string): string {
  if (p.startsWith("http")) return p;
  const url  = settingsState.settings.serverUrl;
  const base = typeof url === "string" && url.trim() ? url.replace(/\/$/, "") : "http://localhost:6007";
  return `${base}${p}`;
}

export function scheduleResumeDismiss() {
  setTimeout(() => { readerState.resumeFading = true; }, 1500);
  setTimeout(() => { readerState.resumeVisible = false; readerState.resumeFading = false; }, 2500);
}

interface Prefetch {
  chapterId: string;
  urls:      string[];
}

let current: Prefetch | null = null;

let prevPrefetch: Prefetch | null = null;
let nextPrefetch: Prefetch | null = null;

function takeIfMatches(p: Prefetch | null, id: string): string[] | null {
  return p && p.chapterId === id && p.urls.length > 0 ? p.urls : null;
}

async function getPagesForChapter(
  mangaId: string,
  chapterId: string,
  useBlob: boolean,
  signal: AbortSignal,
  priorityPage = 0,
): Promise<string[]> {
  const chapter = seriesState.chaptersFor(mangaId).find(c => c.id === chapterId);
  const contentPages = (count: number) => {
    const segment = chapter?.pdfSource ? "pdfpage" : "pages";
    return Array.from({ length: count }, (_, i) =>
      absolutePageUrl(`/content/${mangaId}/${chapterId}/${segment}/${i + 1}`));
  };

  if (chapter?.downloaded && chapter.pageCount && chapter.pageCount > 0) {
    return contentPages(chapter.pageCount);
  }
  if (chapter?.pages && chapter.pages.length > 0) {
    return chapter.pages.map(absolutePageUrl);
  }
  if (chapter?.pageCount && chapter.pageCount > 0) {
    return contentPages(chapter.pageCount);
  }
  return fetchPages(mangaId, chapterId, useBlob, signal, priorityPage);
}

async function stripDegenerateEdges(urls: string[], useBlob: boolean): Promise<string[]> {
  if (urls.length < 2) return urls;
  let out = urls;
  const lastAspect = await measureAspect(out[out.length - 1], useBlob);
  if (isDegenerateAspect(lastAspect)) out = out.slice(0, -1);
  if (out.length < 2) return out;
  const firstAspect = await measureAspect(out[0], useBlob);
  if (isDegenerateAspect(firstAspect)) out = out.slice(1);
  return out;
}

export type StartPos = "first" | "last" | "boundaryForward" | "boundaryBack" | "exact";

export function getPrevPrefetchUrls(): string[] | null {
  return prevPrefetch && prevPrefetch.urls.length > 0 ? prevPrefetch.urls : null;
}
export function getNextPrefetchUrls(): string[] | null {
  return nextPrefetch && nextPrefetch.urls.length > 0 ? nextPrefetch.urls : null;
}

export async function loadChapter(
  mangaId: string,
  id: string,
  useBlob: boolean,
  abortCtrl: { current: AbortController | null },
  startPos: { current: StartPos; exactPage: number },
  markedRead: Set<string>,
  doublePage: boolean,
  adjacent: { prev: { id: string } | null; next: { id: string } | null },
) {
  abortCtrl.current?.abort();
  const ctrl = new AbortController();
  abortCtrl.current = ctrl;

  cancelQueuedFetches();
  {
    clearResolvedUrlCache();
    for (const url of readerState.pageUrls) revokeBlobUrl(url);
    for (const p of [prevPrefetch, nextPrefetch]) {
      if (p && p.chapterId !== id) {
        for (const url of p.urls) revokeBlobUrl(url);
        clearPageCache(p.chapterId);
        clearPdfChapterCache(p.chapterId);
      }
    }
  }

  const outgoing = current;
  if (outgoing && outgoing.chapterId !== id) clearPdfChapterCache(outgoing.chapterId);

  const pos = startPos.current;
  startPos.current = "first";
  markedRead.clear();
  readerState.resetForChapter();
  readerState.pageUrls = [];

  const bookmark = seriesState.bookmarks.find(b => b.mangaId === mangaId && b.chapterId === id);
  const resumeTo = bookmark ? bookmark.pageNumber : 0;
  readerState.resumePage      = pos === "first" && resumeTo > 1 ? resumeTo : 0;
  readerState.resumeDismissed = false;
  readerState.resumeVisible   = false;

  readerState.pageNumber = 1;
  try {
    const cached = takeIfMatches(prevPrefetch, id) ?? takeIfMatches(nextPrefetch, id) ?? takeIfMatches(outgoing, id);
    const fetched = cached ?? await getPagesForChapter(mangaId, id, useBlob, ctrl.signal, resumeTo > 1 ? resumeTo - 1 : 0);
    if (ctrl.signal.aborted) return;
    const urls = cached || !doublePage ? fetched : await stripDegenerateEdges(fetched, useBlob);
    if (ctrl.signal.aborted) return;
    readerState.pageUrls = urls;
    current = { chapterId: id, urls };
    if (useBlob && resumeTo > 1) {
      const lo = Math.max(0, resumeTo - 2);
      const hi = Math.min(urls.length, resumeTo + 4);
      preloadBlobUrls(urls.slice(lo, hi), 900);
    }
    let target: number | null = null;
    if (pos === "exact") {
      target = Math.max(1, Math.min(urls.length || 1, startPos.exactPage));
    } else if (pos === "last") {
      target = urls.length;
    } else if (pos === "boundaryForward") {
      target = doublePage && urls.length > 1 ? 2 : 1;
    } else if (pos === "boundaryBack") {
      if (doublePage) {
        const groups = buildPageGroups(urls, settingsState.settings.offsetDoubleSpreads ?? false);
        target = groups.length > 1 && groups[groups.length - 1].length === 1
          ? groups[groups.length - 2][0]
          : urls.length;
      } else {
        target = urls.length;
      }
    } else if (resumeTo > 1) {
      target = Math.min(resumeTo, urls.length || resumeTo);
    }
    if (target != null) readerState.pageNumber = target;
    readerState.pageReady = true;
    readerState.loading   = false;
    if (pos === "first" && resumeTo > 1) readerState.resumeVisible = true;

    prevPrefetch = adjacent.prev
      ? (outgoing && outgoing.chapterId === adjacent.prev.id ? outgoing : { chapterId: adjacent.prev.id, urls: [] })
      : null;
    nextPrefetch = adjacent.next
      ? (outgoing && outgoing.chapterId === adjacent.next.id ? outgoing : { chapterId: adjacent.next.id, urls: [] })
      : null;

    readerState.boundaryPrevSrc = prevPrefetch && prevPrefetch.urls.length > 0
      ? prevPrefetch.urls[prevPrefetch.urls.length - 1] : null;
    readerState.boundaryNextSrc = nextPrefetch && nextPrefetch.urls.length > 0
      ? nextPrefetch.urls[0] : null;

    if (adjacent.prev && prevPrefetch?.urls.length === 0) {
      const prevId = adjacent.prev.id;
      getPagesForChapter(mangaId, prevId, useBlob, ctrl.signal)
        .then(fetched => doublePage ? stripDegenerateEdges(fetched, useBlob) : fetched)
        .then(fetched => {
          if (ctrl.signal.aborted || prevPrefetch?.chapterId !== prevId) return;
          prevPrefetch = { chapterId: prevId, urls: fetched };
          if (current?.chapterId === id && adjacent.prev?.id === prevId) {
            readerState.boundaryPrevSrc = fetched.length > 0 ? fetched[fetched.length - 1] : null;
          }
        })
        .catch(() => {});
    }
    if (adjacent.next && nextPrefetch?.urls.length === 0) {
      const nextId = adjacent.next.id;
      getPagesForChapter(mangaId, nextId, useBlob, ctrl.signal)
        .then(fetched => doublePage ? stripDegenerateEdges(fetched, useBlob) : fetched)
        .then(fetched => {
          if (ctrl.signal.aborted || nextPrefetch?.chapterId !== nextId) return;
          nextPrefetch = { chapterId: nextId, urls: fetched };
          if (current?.chapterId === id && adjacent.next?.id === nextId) {
            readerState.boundaryNextSrc = fetched.length > 0 ? fetched[0] : null;
          }
        })
        .catch(() => {});
    }
  } catch (e: unknown) {
    if (ctrl.signal.aborted) return;
    readerState.error   = e instanceof Error ? e.message : String(e);
    readerState.loading = false;
  }
}
