import { readerState } from "$lib/state/mangaReader.svelte";
import { DEFAULT_MANGA_PREFS } from "$lib/types/settings";
import { seriesState }                      from "$lib/state/series.svelte";
import { loadLibrary }                      from "$lib/state/library.svelte";
import { readTriggersAutomation }           from "$lib/state/automation.svelte";
import { settingsState }                    from "$lib/state/settings.svelte";
import { tsunagu }                          from "$lib/server-adapters/tsunagu";
import type { MangaPrefs }                  from "$lib/types/settings";

export function getMangaPrefs(mangaId?: string): MangaPrefs {
  const id = mangaId ?? readerState.activeManga?.id;
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
      mangaId:      manga.id,
      mangaTitle:   manga.title,
      thumbnailUrl: manga.thumbnailUrl,
      chapterId:    id,
      chapterName:  chapter.name,
      pageNumber:   readerState.pageUrls.length,
    });
  }

  if (!manga) { markedRead.delete(id); return; }
  const realMediaId = manga.mediaId ?? manga.libraryEntryId ?? manga.id;

  tsunagu.markChapterRead(realMediaId, id)
    .then(() => {
      const mangaId = readerState.activeManga?.id;
      if (!mangaId) return;

      seriesState.patchChapters(mangaId, chapters =>
        chapters.map(c => c.id === id ? { ...c, read: true } : c),
      );

      // Delete-after-read, download-ahead and max-kept rules run on the server;
      // refetch download state once it has had a moment to act.
      if (readTriggersAutomation(realMediaId)) {
        setTimeout(() => {
          seriesState.loadChapters(mangaId, { force: true, mediaId: realMediaId }).catch(console.error);
          loadLibrary(true).catch(console.error);
        }, 1500);
      }
    })
    .catch(e => { markedRead.delete(id); console.error(e); });
}

export function toggleBookmark(chapter: typeof readerState.activeChapter, pageNumber: number) {
  const manga = readerState.activeManga;
  if (!chapter || !manga) return;

  const existing = seriesState.bookmarks.find(
    b => b.mangaId === manga.id && b.chapterId === chapter.id && b.pageNumber === pageNumber,
  );
  if (existing) {
    seriesState.removeBookmark(manga.id);
  } else {
    seriesState.setBookmark({
      mangaId:      manga.id,
      mangaTitle:   manga.title,
      thumbnailUrl: manga.thumbnailUrl,
      chapterId:    chapter.id,
      chapterName:  chapter.name,
      pageNumber,
    });
  }
}

