import { gql, baseUrl } from './gql'
import type { AutomationSettings, AutomationSettingsInput, MediaAutomation, MediaAutomationInput } from '$lib/server-adapters/types'

const SETTINGS_FIELDS = `enabled enforceGlobal autoDownload downloadAhead deleteOnRead deleteDelayHours
	maxKeepChapters refreshInterval updateOnOpen configured lastLibraryUpdateAt`

const MEDIA_FIELDS = `mediaId autoDownload downloadAhead deleteOnRead deleteDelayHours maxKeepChapters
	pauseUpdates refreshInterval
	effective { autoDownload downloadAhead deleteOnRead deleteDelayHours maxKeepChapters pauseUpdates refreshInterval }`

export const automation = {
	async automationSettings(): Promise<AutomationSettings> {
		const data = await gql<{ automationSettings: AutomationSettings }>(
			`query AutomationSettings { automationSettings { ${SETTINGS_FIELDS} } }`,
			undefined,
			baseUrl()
		)
		return data.automationSettings
	},

	async updateAutomationSettings(input: AutomationSettingsInput): Promise<AutomationSettings> {
		const data = await gql<{ updateAutomationSettings: AutomationSettings }>(
			`mutation UpdateAutomationSettings($input: AutomationSettingsInput!) {
				updateAutomationSettings(input: $input) { ${SETTINGS_FIELDS} }
			}`,
			{ input },
			baseUrl()
		)
		return data.updateAutomationSettings
	},

	async mediaAutomation(mediaId: string): Promise<MediaAutomation> {
		const data = await gql<{ mediaAutomation: MediaAutomation }>(
			`query MediaAutomation($mediaId: ID!) { mediaAutomation(mediaId: $mediaId) { ${MEDIA_FIELDS} } }`,
			{ mediaId },
			baseUrl()
		)
		return data.mediaAutomation
	},

	async mediaAutomationOverrides(): Promise<MediaAutomation[]> {
		const data = await gql<{ mediaAutomationOverrides: MediaAutomation[] }>(
			`query MediaAutomationOverrides { mediaAutomationOverrides { ${MEDIA_FIELDS} } }`,
			undefined,
			baseUrl()
		)
		return data.mediaAutomationOverrides
	},

	async setMediaAutomation(mediaId: string, input: MediaAutomationInput): Promise<MediaAutomation> {
		const data = await gql<{ setMediaAutomation: MediaAutomation }>(
			`mutation SetMediaAutomation($mediaId: ID!, $input: MediaAutomationInput!) {
				setMediaAutomation(mediaId: $mediaId, input: $input) { ${MEDIA_FIELDS} }
			}`,
			{ mediaId, input },
			baseUrl()
		)
		return data.setMediaAutomation
	},

	async resetMediaAutomation(mediaId?: string): Promise<boolean> {
		const data = await gql<{ resetMediaAutomation: boolean }>(
			`mutation ResetMediaAutomation($mediaId: ID) { resetMediaAutomation(mediaId: $mediaId) }`,
			{ mediaId },
			baseUrl()
		)
		return data.resetMediaAutomation
	},
}
