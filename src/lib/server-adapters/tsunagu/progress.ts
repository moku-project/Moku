import { gql, baseUrl } from './gql'
import type { ReadingProgress } from '$lib/server-adapters/types'

export const progress = {
	async readingProgress(libraryEntryId: string): Promise<ReadingProgress[]> {
		const data = await gql<{ readingProgress: ReadingProgress[] }>(
			`query ReadingProgress($mediaId: ID!) {
				readingProgress(mediaId: $mediaId) {
					id mediaId chapterId progress completed positionSeconds durationSeconds updatedAt
				}
			}`,
			{ mediaId: libraryEntryId },
			baseUrl()
		)
		return data.readingProgress
	},

	async updateReadingProgress(input: {
		libraryEntryId: string
		chapterId: string
		progress: number
		completed?: boolean
		positionSeconds?: number
		durationSeconds?: number
		/** The page reached, so a resume lands on it on any device. */
		page?: number
	}): Promise<ReadingProgress> {
		const { libraryEntryId, page, ...rest } = input
		const send = (withPage: boolean) => gql<{ updateReadingProgress: ReadingProgress }>(
			`mutation UpdateReadingProgress($mediaId: ID!, $chapterId: ID!, $progress: Float!, $completed: Boolean, $positionSeconds: Float, $durationSeconds: Float${withPage ? ", $page: Int" : ""}) {
				updateReadingProgress(mediaId: $mediaId, chapterId: $chapterId, progress: $progress, completed: $completed, positionSeconds: $positionSeconds, durationSeconds: $durationSeconds${withPage ? ", page: $page" : ""}) {
					id mediaId chapterId progress completed positionSeconds durationSeconds updatedAt
				}
			}`,
			withPage ? { mediaId: libraryEntryId, ...rest, page: Math.round(page!) } : { mediaId: libraryEntryId, ...rest },
			baseUrl()
		)
		const withPage = page != null && page > 0
		// Servers from before resume pages reject the argument; progress still matters there.
		const data = await send(withPage).catch((e: unknown) => {
			if (withPage && /page|Unknown argument|HTTP 422/i.test(String(e))) return send(false)
			throw e
		})
		return data.updateReadingProgress
	},

	async markChapterRead(libraryEntryId: string, chapterId: string): Promise<ReadingProgress> {
		const data = await gql<{ markChapterRead: ReadingProgress }>(
			`mutation MarkChapterRead($mediaId: ID!, $chapterId: ID!) {
				markChapterRead(mediaId: $mediaId, chapterId: $chapterId) {
					id mediaId chapterId progress completed positionSeconds durationSeconds updatedAt
				}
			}`,
			{ mediaId: libraryEntryId, chapterId },
			baseUrl()
		)
		return data.markChapterRead
	},

	async markChaptersRead(
		libraryEntryId: string,
		chapterIds: string[],
		read: boolean
	): Promise<ReadingProgress[]> {
		const data = await gql<{ markChaptersRead: ReadingProgress[] }>(
			`mutation MarkChaptersRead($mediaId: ID!, $chapterIds: [ID!]!, $read: Boolean!) {
				markChaptersRead(mediaId: $mediaId, chapterIds: $chapterIds, read: $read) {
					id mediaId chapterId progress completed positionSeconds durationSeconds updatedAt
				}
			}`,
			{ mediaId: libraryEntryId, chapterIds, read },
			baseUrl()
		)
		return data.markChaptersRead
	},
}
