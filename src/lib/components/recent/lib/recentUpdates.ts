import { dayLabel } from '$lib/core/util'
import { deriveChapterNumber } from '$lib/state/series.svelte'
import type { RecentChapter } from '$lib/server-adapters/types'

export interface RecentUpdate {
  id:            string
  name:          string
  chapterNumber: number
  sourceOrder:   number
  isRead:        boolean
  lastPageRead:  number
  mangaId:       string
  fetchedAt:     string
  downloaded:    boolean
  manga: { id: string; title: string; thumbnailUrl: string; inLibrary: boolean; contentType?: string } | null
}

export interface UpdateGroup {
  label: string
  items: RecentUpdate[]
}

export interface UpdateStatus {
  isRunning:    boolean
  finishedJobs: number | null
  totalJobs:    number | null
  lastUpdated?: unknown
}

/** 0 when the update has no usable date. */
export function fetchedAtMs(item: Pick<RecentUpdate, 'fetchedAt'>): number {
  if (!item.fetchedAt) return 0
  const numeric = Number(item.fetchedAt)
  if (Number.isFinite(numeric)) return numeric * 1000
  const ts = new Date(item.fetchedAt).getTime()
  return Number.isFinite(ts) ? ts : 0
}

export function parseServerTimestamp(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
    const parsed = new Date(value).getTime()
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function groupUpdatesByDay(updates: RecentUpdate[]): UpdateGroup[] {
  const grouped: Record<string, RecentUpdate[]> = {}
  const order: Record<string, number> = {}
  for (const item of updates) {
    const ts = fetchedAtMs(item)
    const label = ts ? dayLabel(ts) : 'Earlier'
    if (!grouped[label]) {
      grouped[label] = []
      order[label] = ts
    }
    grouped[label].push(item)
    if (ts > order[label]) order[label] = ts
  }
  return Object.entries(grouped)
    .sort(([a], [b]) => order[b] - order[a])
    .map(([label, items]) => ({ label, items }))
}

export function mapRecentChapterToUpdate(rc: RecentChapter): RecentUpdate {
  return {
    id:            rc.chapter.id,
    name:          rc.chapter.title ?? '',
    chapterNumber: deriveChapterNumber(rc.chapter.number, rc.chapter.title ?? ''),
    sourceOrder:   rc.chapter.sourceOrder ?? 0,
    isRead:        rc.chapter.readingProgress?.completed ?? rc.chapter.completed ?? false,
    lastPageRead:  0,
    mangaId:       rc.mediaId,
    fetchedAt:     rc.foundAt ?? rc.chapter.uploadedAt ?? '',
    downloaded:    rc.chapter.downloaded ?? (rc.chapter.download?.status === 'DONE'),
    manga: {
      id:           rc.mediaId,
      title:        rc.libraryEntryTitle,
      thumbnailUrl: rc.libraryEntryCoverPath ?? '',
      inLibrary:    true,
      contentType:  rc.contentType,
    },
  }
}
