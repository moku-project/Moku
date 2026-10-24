import { readerState } from "$lib/state/mangaReader.svelte";
import { DEFAULT_MANGA_PREFS } from "$lib/types/settings";
import { seriesState, seriesKey, seriesAliases } from "$lib/state/series.svelte";
import { loadLibrary, libraryState }        from "$lib/state/library.svelte";
import { cache, CACHE_KEYS }               from "$lib/core/cache/queryCache";
import { readTriggersAutomation }           from "$lib/state/automation.svelte";
import { settingsState }                    from "$lib/state/settings.svelte";
import { tsunagu }                          from "$lib/server-adapters/tsunagu";
import type { MangaPrefs }                  from "$lib/types/settings";

export function getMangaPrefs(mangaId?: string): MangaPrefs {
  const id = mangaId ?? seriesKey(readerState.activeManga);
  if (!id) return { ...DEFAULT_MANGA_PREFS };
  return { ...DEFAULT_MANGA_PREFS, ...(settingsState.settings.mangaPrefs?.[id] ?? {}) };
}

export function markChapterRead(id: string, markedRead: Set<string>) {
  if (markedRead.has(id)) return;
  markedRead.add(id);

  const chapter = readerState.activeChapterList.find(c => c.id === id) ?? readerState.activeChapter;
  const manga   = readerState.activeManga;

  if (manga && chapter) {
    seriesState.setBookmark({
      mangaId:      seriesKey(manga),
      mangaTitle:   manga.title,
      thumbnailUrl: manga.thumbnailUrl,
      chapterId:    id,
      chapterName:  chapter.name,
      pageNumber:   readerState.pageUrls.length,
    }, seriesAliases(manga));
  }

  if (!manga) { markedRead.delete(id); return; }
  const realMediaId = manga.mediaId ?? manga.libraryEntryId ?? manga.id;
  const wasRead = chapter?.read ?? false;

  tsunagu.markChapterRead(realMediaId, id)
    .then(() => {
      const active = readerState.activeManga;
      if (!active) return;

      for (const key of seriesAliases(active)) {
        seriesState.patchChapters(key, chapters =>
          chapters.map(c => c.id === id ? { ...c, read: true } : c),
        );
      }

      if (!wasRead) libraryState.patchUnreadCount(realMediaId, -1);
      cache.clear(CACHE_KEYS.RECENT_UPDATES);

      // Delete-after-read, download-ahead and max-kept rules run on the server;
      // refetch download state once it has had a moment to act.
      if (readTriggersAutomation(realMediaId)) {
        setTimeout(() => {
          seriesState.loadChapters(active.id, { force: true, mediaId: realMediaId }).catch(console.error);
          loadLibrary(true).catch(console.error);
        }, 1500);
      }
    })
    .catch(e => { markedRead.delete(id); console.error(e); });
}

export function toggleBookmark(chapter: typeof readerState.activeChapter, pageNumber: number) {
  const manga = readerState.activeManga;
  if (!chapter || !manga) return;

  const ids = seriesAliases(manga);
  const existing = seriesState.findBookmark(ids, chapter.id);
  if (existing && existing.pageNumber === pageNumber) {
    seriesState.removeBookmark(ids);
  } else {
    seriesState.setBookmark({
      mangaId:      seriesKey(manga),
      mangaTitle:   manga.title,
      thumbnailUrl: manga.thumbnailUrl,
      chapterId:    chapter.id,
      chapterName:  chapter.name,
      pageNumber,
    }, ids);
  }
}
