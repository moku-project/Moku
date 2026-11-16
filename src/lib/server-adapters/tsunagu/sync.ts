import { gql, baseUrl } from './gql'

export interface SyncPeer {
	node: string
	name: string
	address: string | null
	lastSeenAt: string | null
	online: boolean
}

export interface SyncMissingExtension {
	packageName: string
	name: string
	lang: string
	contentType: string
	repository: string
	available: boolean
	titles: number
	examples: string[]
}

export interface SyncStatus {
	node: string
	name: string | null
	peers: SyncPeer[]
	pendingTitles: number
	addresses: string[]
	missingExtensions: SyncMissingExtension[]
}

export interface SyncNearbyDevice {
	node: string
	name: string
	address: string
	paired: boolean
}

export interface SyncPairPreview {
	node: string
	name: string
	titles: number
	newTitles: number
	sentTitles: number
	folders: number
	readChapters: number
	mergingFolders: string[]
}

const STATUS = `node name pendingTitles addresses
	peers { node name address lastSeenAt online }
	missingExtensions { packageName name lang contentType repository available titles examples }`

export const sync = {
	async syncStatus(): Promise<SyncStatus> {
		const data = await gql<{ syncStatus: SyncStatus }>(`query SyncStatus { syncStatus { ${STATUS} } }`, undefined, baseUrl())
		return data.syncStatus
	},

	async syncNearby(): Promise<SyncNearbyDevice[]> {
		const data = await gql<{ syncNearby: SyncNearbyDevice[] }>(
			`query SyncNearby { syncNearby { node name address paired } }`,
			undefined,
			baseUrl(),
		)
		return data.syncNearby
	},

	async setSyncDeviceName(name: string): Promise<SyncStatus> {
		const data = await gql<{ setSyncDeviceName: SyncStatus }>(
			`mutation SetSyncDeviceName($name: String!) { setSyncDeviceName(name: $name) { ${STATUS} } }`,
			{ name },
			baseUrl(),
		)
		return data.setSyncDeviceName
	},

	async createSyncPairingCode(): Promise<{ code: string; expiresAt: string }> {
		const data = await gql<{ createSyncPairingCode: { code: string; expiresAt: string } }>(
			`mutation CreateSyncPairingCode { createSyncPairingCode { code expiresAt } }`,
			undefined,
			baseUrl(),
		)
		return data.createSyncPairingCode
	},

	async previewSyncPeer(address: string, code: string): Promise<SyncPairPreview> {
		const data = await gql<{ previewSyncPeer: SyncPairPreview }>(
			`mutation PreviewSyncPeer($address: String!, $code: String!) {
				previewSyncPeer(address: $address, code: $code) { node name titles newTitles sentTitles folders readChapters mergingFolders }
			}`,
			{ address, code },
			baseUrl(),
		)
		return data.previewSyncPeer
	},

	async connectSyncPeer(address: string, code: string, node: string): Promise<SyncPeer> {
		const data = await gql<{ connectSyncPeer: SyncPeer }>(
			`mutation ConnectSyncPeer($address: String!, $code: String!, $node: ID!) {
				connectSyncPeer(address: $address, code: $code, node: $node) { node name address lastSeenAt online }
			}`,
			{ address, code, node },
			baseUrl(),
		)
		return data.connectSyncPeer
	},

	async removeSyncPeer(node: string): Promise<SyncStatus> {
		const data = await gql<{ removeSyncPeer: SyncStatus }>(
			`mutation RemoveSyncPeer($node: ID!) { removeSyncPeer(node: $node) { ${STATUS} } }`,
			{ node },
			baseUrl(),
		)
		return data.removeSyncPeer
	},

	async syncNow(): Promise<SyncStatus> {
		const data = await gql<{ syncNow: SyncStatus }>(`mutation SyncNow { syncNow { ${STATUS} } }`, undefined, baseUrl())
		return data.syncNow
	},

	async installSyncExtension(packageName: string): Promise<void> {
		await gql(
			`mutation InstallSyncExtension($packageName: String!) { installSyncExtension(packageName: $packageName) { id } }`,
			{ packageName },
			baseUrl(),
		)
	},
}
