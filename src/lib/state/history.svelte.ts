import { saveLibrary }        from '$lib/core/persistence/persist'
import type { ReadSession, ReadingStats, MediaKind, StatsLedger } from '$lib/types/history'
import { computeStats, dailyChapterCounts, emptyLedger, recordSession } from '$lib/core/readingStats'

const MAX_SESSIONS    = 1000
const SESSION_GAP_MS  = 60 * 60 * 1_000

export interface ActiveSession {
  id:               string
  mangaId:          string
  mangaTitle:       string
  thumbnailUrl:     string
  startChapterId:   string
  startChapterName: string
  endChapterId:     string
  endChapterName:   string
  startPage:        number
  endPage:          number
  startedAt:        number
  lastTickAt:       number
  seenChapterIds:   Set<string>
  contentType:      MediaKind
}

class HistoryStore {
  sessions         = $state<ReadSession[]>([])
  active           = $state<ActiveSession | null>(null)
  // The ledger is mutated in place on every commit and can get long, so it is
  // kept out of Svelte's deep proxy; _publish copies out what the UI reads.
  private ledger: StatsLedger = emptyLedger()
  stats            = $state.raw<ReadingStats>(computeStats(this.ledger))
  dailyReadCounts  = $state.raw<Record<string, number>>({})

  load(sessions: ReadSession[], ledger: StatsLedger) {
    this.sessions = sessions
    this.ledger   = ledger
    this._publish()
  }

  private _publish() {
    this.stats           = computeStats(this.ledger)
    this.dailyReadCounts = dailyChapterCounts(this.ledger)
  }

  openSession(
    mangaId:      string,
    mangaTitle:   string,
    thumbnailUrl: string,
    chapterId:    string,
    chapterName:  string,
    page:         number,
    contentType:  MediaKind = 'MANGA',
  ) {
    const a = this.active
    if (a && a.mangaId === mangaId && Date.now() - a.lastTickAt <= SESSION_GAP_MS) {
      this.tickSession(chapterId, chapterName, page)
      return
    }
    if (a) this._commit(Date.now())
    this._start(mangaId, mangaTitle, thumbnailUrl, chapterId, chapterName, page, contentType)
  }

  private _start(
    mangaId: string, mangaTitle: string, thumbnailUrl: string,
    chapterId: string, chapterName: string, page: number, contentType: MediaKind,
  ) {
    this.active = {
      id:               crypto.randomUUID(),
      mangaId,
      mangaTitle,
      thumbnailUrl,
      startChapterId:   chapterId,
      startChapterName: chapterName,
      endChapterId:     chapterId,
      endChapterName:   chapterName,
      startPage:        page,
      endPage:          page,
      startedAt:        Date.now(),
      lastTickAt:       Date.now(),
      seenChapterIds:   new Set([chapterId]),
      contentType,
    }
  }

  tickSession(chapterId: string, chapterName: string, page: number) {
    const a = this.active
    if (!a) return
    const now = Date.now()

    if (now - a.lastTickAt > SESSION_GAP_MS) {
      this._commit(a.lastTickAt)
      this._start(a.mangaId, a.mangaTitle, a.thumbnailUrl, chapterId, chapterName, page, a.contentType)
      return
    }

    a.lastTickAt     = now
    a.endPage        = page
    a.endChapterId   = chapterId
    a.endChapterName = chapterName
    a.seenChapterIds.add(chapterId)
  }

  closeSession() {
    if (!this.active) return
    this._commit(Date.now())
    this.active = null
  }

  /** Clears the session log only; reading stats keep their totals. */
  async clearHistory() {
    this.sessions = []
    await this._persist()
  }

  clearMangaHistory(mangaId: string) {
    this.sessions = this.sessions.filter(s => s.mangaId !== mangaId)
    void this._persist()
  }

  async resetStats() {
    this.ledger = emptyLedger()
    this._publish()
    await this._persist()
  }

  private _commit(endedAt: number) {
    const a = this.active
    if (!a) return

    const durationMs = Math.min(endedAt - a.startedAt, SESSION_GAP_MS)
    if (durationMs < 1_000) return

    const session: ReadSession = {
      id:               a.id,
      mangaId:          a.mangaId,
      mangaTitle:       a.mangaTitle,
      thumbnailUrl:     a.thumbnailUrl,
      startChapterId:   a.startChapterId,
      startChapterName: a.startChapterName,
      endChapterId:     a.endChapterId,
      endChapterName:   a.endChapterName,
      startPage:        a.startPage,
      endPage:          a.endPage,
      startedAt:        a.startedAt,
      endedAt,
      durationMs,
      chaptersSpanned:  a.seenChapterIds.size,
      contentType:      a.contentType,
    }

    recordSession(this.ledger, session, a.seenChapterIds)
    this.sessions = [session, ...this.sessions].slice(0, MAX_SESSIONS)
    this._publish()

    void this._persist()
  }

  private async _persist() {
    const bookmarks = (await import('$lib/state/series.svelte')).seriesState.bookmarks
    await saveLibrary({
      sessions: this.sessions,
      bookmarks,
      stats:    this.ledger,
    })
  }
}

export const historyState = new HistoryStore()
