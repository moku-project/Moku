import { gql, baseUrl } from './gql'
import type { ReadSession, ReadingStats, MediaKind } from '$lib/types/history'

const SESSION_FIELDS = `id startPage endPage startedAt endedAt durationMs chapters
	media { id title thumbnailUrl contentType }
	startChapter { id title }
	endChapter { id title }`

interface SessionRow {
	id: string
	startPage: number
	endPage: number
	startedAt: string
	endedAt: string
	durationMs: number
	chapters: number
	media: { id: string; title: string; thumbnailUrl: string | null; contentType: string }
	startChapter: { id: string; title: string | null } | null
	endChapter: { id: string; title: string | null } | null
}

export interface ResumePoint {
	chapterId: string
	page: number | null
	progress: number
	completed: boolean
	updatedAt: string
}

export interface ReadingStatsResult {
	stats: ReadingStats
	/** Local date -> chapters opened, for the activity grid. */
	daily: Record<string, number>
}

function toSession(r: SessionRow): ReadSession {
	return {
		id:               r.id,
		mangaId:          r.media.id,
		mangaTitle:       r.media.title,
		thumbnailUrl:     r.media.thumbnailUrl ?? '',
		startChapterId:   r.startChapter?.id ?? '',
		startChapterName: r.startChapter?.title ?? '',
		endChapterId:     r.endChapter?.id ?? '',
		endChapterName:   r.endChapter?.title ?? '',
		startPage:        r.startPage,
		endPage:          r.endPage,
		startedAt:        Date.parse(r.startedAt),
		endedAt:          Date.parse(r.endedAt),
		durationMs:       r.durationMs,
		chaptersSpanned:  r.chapters,
		contentType:      r.media.contentType.toUpperCase() as MediaKind,
	}
}

function toInput(s: ReadSession) {
	return {
		id:             s.id,
		mediaId:        s.mangaId,
		startChapterId: s.startChapterId || null,
		endChapterId:   s.endChapterId || null,
		startPage:      Math.max(0, Math.round(s.startPage)),
		endPage:        Math.max(0, Math.round(s.endPage)),
		startedAt:      new Date(s.startedAt).toISOString(),
		endedAt:        new Date(s.endedAt).toISOString(),
		durationMs:     Math.max(0, Math.round(s.durationMs)),
		chapters:       Math.max(1, s.chaptersSpanned),
	}
}

/** Servers from before history moved to Tsunagu don't know these fields. */
export function historyUnsupported(e: unknown): boolean {
	return /Cannot query field|Unknown (field|argument)|readingSessions|readingStats|resumePoint|HTTP 422/i.test(String(e))
}

export const history = {
	async readingSessions(limit = 1000, mediaId?: string): Promise<ReadSession[]> {
		const data = await gql<{ readingSessions: SessionRow[] }>(
			`query ReadingSessions($limit: Int, $mediaId: ID) { readingSessions(limit: $limit, mediaId: $mediaId) { ${SESSION_FIELDS} } }`,
			{ limit, mediaId: mediaId ?? null },
			baseUrl(),
		)
		return data.readingSessions.map(toSession)
	},

	async readingStats(timeZone: string): Promise<ReadingStatsResult> {
		const data = await gql<{ readingStats: {
			totalChaptersRead: number; totalTitlesRead: number; totalMinutesRead: number; chaptersThisWeek: number
			firstReadAt: string | null; lastReadAt: string | null; currentStreakDays: number; longestStreakDays: number
			lastStreakDate: string; days: { date: string; chapters: number }[]
		} }>(
			`query ReadingStats($timeZone: String) { readingStats(timeZone: $timeZone) {
				totalChaptersRead totalTitlesRead totalMinutesRead chaptersThisWeek firstReadAt lastReadAt
				currentStreakDays longestStreakDays lastStreakDate days { date chapters }
			} }`,
			{ timeZone },
			baseUrl(),
		)
		const s = data.readingStats
		const daily: Record<string, number> = {}
		for (const d of s.days) if (d.chapters > 0) daily[d.date] = d.chapters
		return {
			stats: {
				totalChaptersRead: s.totalChaptersRead,
				totalMangaRead:    s.totalTitlesRead,
				totalMinutesRead:  s.totalMinutesRead,
				chaptersThisWeek:  s.chaptersThisWeek,
				firstReadAt:       s.firstReadAt ? Date.parse(s.firstReadAt) : 0,
				lastReadAt:        s.lastReadAt ? Date.parse(s.lastReadAt) : 0,
				currentStreakDays: s.currentStreakDays,
				longestStreakDays: s.longestStreakDays,
				lastStreakDate:    s.lastStreakDate,
			},
			daily,
		}
	},

	async recordReadingSession(s: ReadSession): Promise<void> {
		await gql(
			`mutation RecordReadingSession($input: ReadingSessionInput!) { recordReadingSession(input: $input) { id } }`,
			{ input: toInput(s) },
			baseUrl(),
		)
	},

	async importReadingHistory(
		source: string,
		sessions: ReadSession[],
		days: { date: string; seconds: number; chapters: number }[],
	): Promise<{ imported: number; skipped: number }> {
		const data = await gql<{ importReadingHistory: { imported: number; skipped: number } }>(
			`mutation ImportReadingHistory($source: String!, $sessions: [ReadingSessionInput!]!, $days: [ReadingDayInput!]!) {
				importReadingHistory(source: $source, sessions: $sessions, days: $days) { imported skipped }
			}`,
			{ source, sessions: sessions.map(toInput), days },
			baseUrl(),
		)
		return data.importReadingHistory
	},

	async clearReadingHistory(mediaId?: string): Promise<number> {
		const data = await gql<{ clearReadingHistory: number }>(
			`mutation ClearReadingHistory($mediaId: ID) { clearReadingHistory(mediaId: $mediaId) }`,
			{ mediaId: mediaId ?? null },
			baseUrl(),
		)
		return data.clearReadingHistory
	},

	async resetReadingStats(): Promise<void> {
		await gql(`mutation ResetReadingStats { resetReadingStats }`, undefined, baseUrl())
	},

	async resumePoint(mediaId: string): Promise<ResumePoint | null> {
		const data = await gql<{ media: { resumePoint: ResumePoint | null } | null }>(
			`query ResumePoint($id: ID!) { media(id: $id) { resumePoint { chapterId page progress completed updatedAt } } }`,
			{ id: mediaId },
			baseUrl(),
		)
		return data.media?.resumePoint ?? null
	},
}
