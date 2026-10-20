import type { ReadSession, ReadingStats, StatsLedger } from '$lib/types/history'
import { DEFAULT_READING_STATS } from '$lib/types/history'

// Reading stats live in their own ledger so clearing history (or the 1000
// session cap) never takes them down. Chapter IDs are kept as sorted, disjoint
// inclusive ranges flattened to [a0, b0, a1, b1, ...]; a series' chapters are
// mostly consecutive IDs, so reading one end to end costs a single pair.

const DAY_MS = 86_400_000

export function emptyLedger(): StatsLedger {
  return { days: {}, series: [], chapters: [], otherChapters: [], firstReadAt: 0, lastReadAt: 0 }
}

export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Adds id to the flattened range list r in place; false if it was already there. */
export function addToRanges(r: number[], id: number): boolean {
  let lo = 0
  let hi = r.length / 2
  while (lo < hi) {
    const m = (lo + hi) >> 1
    if (r[2 * m + 1] < id - 1) lo = m + 1
    else hi = m
  }
  const i = lo
  if (i < r.length / 2 && r[2 * i] <= id + 1) {
    if (r[2 * i] <= id && id <= r[2 * i + 1]) return false
    if (r[2 * i + 1] === id - 1) {
      r[2 * i + 1] = id
      if (i + 1 < r.length / 2 && r[2 * i + 2] === id + 1) {
        r[2 * i + 1] = r[2 * i + 3]
        r.splice(2 * i + 2, 2)
      }
    } else {
      r[2 * i] = id
    }
    return true
  }
  r.splice(2 * i, 0, id, id)
  return true
}

export function rangesSize(r: number[]): number {
  let n = 0
  for (let i = 0; i < r.length; i += 2) n += r[i + 1] - r[i] + 1
  return n
}

function addChapter(l: StatsLedger, id: string) {
  const n = Number(id)
  if (id !== '' && Number.isSafeInteger(n)) addToRanges(l.chapters, n)
  else if (!l.otherChapters.includes(id)) l.otherChapters.push(id)
}

function addDay(l: StatsLedger, key: string, seconds: number, chapters: number) {
  const d = l.days[key] ?? [0, 0]
  l.days[key] = [d[0] + seconds, d[1] + chapters]
}

/** Folds a finished session into the ledger in place. */
export function recordSession(l: StatsLedger, s: ReadSession, chapterIds: Iterable<string>) {
  for (const id of chapterIds) addChapter(l, id)
  if (!l.series.includes(s.mangaId)) l.series.push(s.mangaId)
  addDay(l, dayKey(s.endedAt), Math.round(s.durationMs / 1_000), s.chaptersSpanned)
  if (s.startedAt && (!l.firstReadAt || s.startedAt < l.firstReadAt)) l.firstReadAt = s.startedAt
  l.lastReadAt = Math.max(l.lastReadAt, s.endedAt)
}

/**
 * Seeds a ledger from pre-ledger data so nobody's numbers drop on upgrade.
 * Sessions only kept their first and last chapter, which is also all the old
 * stats counted. The old daily counts were keyed by UTC date, so the sessions
 * are too here, and those counts outlived the session cap, so they win.
 */
export function ledgerFromHistory(sessions: ReadSession[], dailyReadCounts: Record<string, number>): StatsLedger {
  const l = emptyLedger()
  for (const s of sessions) {
    addChapter(l, s.endChapterId)
    if (s.chaptersSpanned > 1) addChapter(l, s.startChapterId)
    if (!l.series.includes(s.mangaId)) l.series.push(s.mangaId)
    const key = new Date(s.endedAt).toISOString().slice(0, 10)
    addDay(l, key, Math.round(Math.min(s.durationMs, 3_600_000) / 1_000), key in dailyReadCounts ? 0 : s.chaptersSpanned)
    if (s.startedAt && (!l.firstReadAt || s.startedAt < l.firstReadAt)) l.firstReadAt = s.startedAt
    l.lastReadAt = Math.max(l.lastReadAt, s.endedAt)
  }
  for (const [key, count] of Object.entries(dailyReadCounts)) {
    if (typeof count === 'number' && count > 0) addDay(l, key, 0, count)
  }
  return l
}

/** Accepts a stored ledger, dropping anything malformed instead of trusting it. */
export function normalizeLedger(raw: unknown): StatsLedger | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const l = emptyLedger()

  if (r.days && typeof r.days === 'object') {
    for (const [key, v] of Object.entries(r.days as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length === 2 && v.every(x => typeof x === 'number' && x >= 0)) l.days[key] = [v[0], v[1]]
    }
  }
  if (Array.isArray(r.series)) l.series = [...new Set(r.series.filter((x): x is string => typeof x === 'string'))]
  if (Array.isArray(r.chapters)) {
    const flat = r.chapters
    let sorted = flat.length % 2 === 0
    for (let i = 0; i < flat.length && sorted; i++) {
      sorted = Number.isSafeInteger(flat[i])
        && (i % 2 === 0 ? (i === 0 || flat[i] > flat[i - 1] + 1) : flat[i] >= flat[i - 1])
    }
    if (sorted) l.chapters = flat as number[]
    else {
      for (let i = 0; i + 1 < flat.length; i += 2) {
        const [a, b] = [flat[i], flat[i + 1]]
        if (Number.isSafeInteger(a) && Number.isSafeInteger(b) && b - a < 1_000_000) {
          for (let id = a; id <= b; id++) addToRanges(l.chapters, id)
        }
      }
    }
  }
  if (Array.isArray(r.otherChapters)) l.otherChapters = [...new Set(r.otherChapters.filter((x): x is string => typeof x === 'string'))]
  if (typeof r.firstReadAt === 'number') l.firstReadAt = r.firstReadAt
  if (typeof r.lastReadAt === 'number') l.lastReadAt = r.lastReadAt
  return l
}

function dayIndex(key: string): number {
  return Math.round(Date.parse(`${key}T00:00:00Z`) / DAY_MS)
}

export function computeStats(l: StatsLedger, now = Date.now()): ReadingStats {
  const keys = Object.keys(l.days).filter(k => l.days[k][0] > 0 || l.days[k][1] > 0).sort()
  if (!keys.length && !l.chapters.length && !l.otherChapters.length) return { ...DEFAULT_READING_STATS }

  let longest = 0
  let streak  = 0
  for (let i = 0; i < keys.length; i++) {
    streak  = i > 0 && dayIndex(keys[i]) - dayIndex(keys[i - 1]) === 1 ? streak + 1 : 1
    longest = Math.max(longest, streak)
  }
  const today   = dayIndex(dayKey(now))
  const lastDay = keys[keys.length - 1]
  const active  = lastDay !== undefined && today - dayIndex(lastDay) <= 1

  let seconds = 0
  let week    = 0
  for (const k of keys) {
    seconds += l.days[k][0]
    if (today - dayIndex(k) < 7) week += l.days[k][1]
  }

  return {
    totalChaptersRead:  rangesSize(l.chapters) + l.otherChapters.length,
    totalMangaRead:     l.series.length,
    totalMinutesRead:   Math.round(seconds / 60),
    chaptersThisWeek:   week,
    firstReadAt:        l.firstReadAt,
    lastReadAt:         l.lastReadAt,
    currentStreakDays:  active ? streak : 0,
    longestStreakDays:  longest,
    lastStreakDate:     lastDay ?? '',
  }
}

export function dailyChapterCounts(l: StatsLedger): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, [, chapters]] of Object.entries(l.days)) if (chapters > 0) out[k] = chapters
  return out
}
