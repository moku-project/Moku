import { tsunagu } from '$lib/server-adapters/tsunagu'
import { historyUnsupported } from '$lib/server-adapters/tsunagu/history'
import { clearLegacyLibrary, loadLegacyLibrary } from '$lib/core/persistence/persist'
import type { ReadSession, ReadingStats, MediaKind } from '$lib/types/history'
import { DEFAULT_READING_STATS } from '$lib/types/history'

const HISTORY_LIMIT  = 1000
const SESSION_GAP_MS = 60 * 60 * 1_000

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

function timeZone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'UTC' }
}

// History and stats belong to the server, so a fresh server shows none and paired devices show the same.
class HistoryStore {
  sessions        = $state<ReadSession[]>([])
  active          = $state<ActiveSession | null>(null)
  stats           = $state.raw<ReadingStats>({ ...DEFAULT_READING_STATS })
  dailyReadCounts = $state.raw<Record<string, number>>({})
  /** False on servers from before history moved there; nothing is recorded then. */
  supported       = $state(true)

  #unsent: ReadSession[] = []
  #statsTimer: ReturnType<typeof setTimeout> | null = null
  #generation = 0

  /** Replaces everything shown with what the connected server has. Called on every connect. */
  async connect() {
    const gen = ++this.#generation
    this.sessions = []
    this.stats = { ...DEFAULT_READING_STATS }
    this.dailyReadCounts = {}
    this.#unsent = []
    await this.#uploadLegacy().catch(e => console.warn('[moku] history upload:', e))
    if (gen === this.#generation) await this.refresh()
  }

  async refresh() {
    const gen = this.#generation
    try {
      const [sessions, stats] = await Promise.all([
        tsunagu.readingSessions(HISTORY_LIMIT),
        tsunagu.readingStats(timeZone()),
      ])
      if (gen !== this.#generation) return
      this.supported       = true
      this.sessions        = sessions
      this.stats           = stats.stats
      this.dailyReadCounts = stats.daily
    } catch (e) {
      if (historyUnsupported(e)) this.supported = false
      else console.error('[moku] history:', e)
    }
  }

  // Only history whose titles this server has, under the same IDs and names, can be the history it lost.
  async #uploadLegacy() {
    const legacy = await loadLegacyLibrary()
    if (!legacy) return
    const library = await tsunagu.library()
    const titles  = new Map(library.map(e => [e.id, e.title]))
    const sessions = legacy.sessions.filter(s => titles.get(s.mangaId) === s.mangaTitle)
    if (legacy.sessions.length && !sessions.length) return
    const days = Object.entries(legacy.stats.days).map(([date, [seconds, chapters]]) => ({ date, seconds, chapters }))
    await tsunagu.importReadingHistory(legacy.source, sessions, days)
    await clearLegacyLibrary()
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
    if (a) this.#commit(Date.now())
    this.#start(mangaId, mangaTitle, thumbnailUrl, chapterId, chapterName, page, contentType)
  }

  #start(
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
      this.#commit(a.lastTickAt)
      this.#start(a.mangaId, a.mangaTitle, a.thumbnailUrl, chapterId, chapterName, page, a.contentType)
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
    this.#commit(Date.now())
    this.active = null
  }

  async flush() {
    if (this.active) { this.#commit(Date.now()); this.active = null }
    await this.#send()
  }

  /** Hides the history list on the server; reading stats keep their totals. */
  async clearHistory() {
    this.sessions = []
    await tsunagu.clearReadingHistory()
  }

  async clearMangaHistory(mangaId: string) {
    this.sessions = this.sessions.filter(s => s.mangaId !== mangaId)
    await tsunagu.clearReadingHistory(mangaId)
  }

  async resetStats() {
    await tsunagu.resetReadingStats()
    await this.refresh()
  }

  #commit(endedAt: number) {
    const a = this.active
    if (!a) return

    const durationMs = Math.min(endedAt - a.startedAt, SESSION_GAP_MS)
    if (durationMs < 1_000 || !this.supported) return

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
    this.sessions = [session, ...this.sessions].slice(0, HISTORY_LIMIT)
    this.#unsent.push(session)
    void this.#send()
  }

  // A session that couldn't be sent waits for the next one, so a short server hiccup loses nothing.
  async #send() {
    const batch = this.#unsent.splice(0)
    for (const s of batch) {
      try {
        await tsunagu.recordReadingSession(s)
      } catch (e) {
        if (historyUnsupported(e)) { this.supported = false; return }
        this.#unsent.push(s)
        console.warn('[moku] session not saved yet:', e)
      }
    }
    if (batch.length) this.#refreshStatsSoon()
  }

  #refreshStatsSoon() {
    if (this.#statsTimer) clearTimeout(this.#statsTimer)
    this.#statsTimer = setTimeout(() => {
      this.#statsTimer = null
      const gen = this.#generation
      tsunagu.readingStats(timeZone())
        .then(s => { if (gen === this.#generation) { this.stats = s.stats; this.dailyReadCounts = s.daily } })
        .catch(() => {})
    }, 1_000)
  }
}

export const historyState = new HistoryStore()
