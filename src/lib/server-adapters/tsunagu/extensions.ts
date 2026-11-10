import { gql, baseUrl } from './gql'
import type { ContentType, Extension } from '$lib/server-adapters/types'
import { canonicalLang } from '$lib/core/lang'
import { authHeaders } from '$lib/state/auth.svelte'

const EXT_FIELDS = `
	id repositoryId packageName name displayName version contentType lang iconUrl
	isNsfw supportsLatest
	apkUrl jarUrl jarPath installed enabled discoveredAt installedAt installedVersion needsUpdate
`

const normExt = (e: Extension): Extension => ({ ...e, lang: canonicalLang(e.lang) })
const normExts = (list: Extension[] | null | undefined): Extension[] => (list ?? []).map(normExt)

export interface ExtensionPage {
	items: Extension[]
	total: number
	languages: string[]
}

export interface ExtensionQuery {
	repositoryId?: string
	query?: string
	contentType?: ContentType
	lang?: string
	installed?: boolean
	limit?: number
	offset?: number
}

export const extensions = {
	async extensions(opts: ExtensionQuery = {}): Promise<ExtensionPage> {
		const data = await gql<{ extensions: ExtensionPage }>(
			`query Extensions($repositoryId: ID, $query: String, $contentType: ContentType, $lang: String, $installed: Boolean, $limit: Int, $offset: Int) {
				extensions(repositoryId: $repositoryId, query: $query, contentType: $contentType, lang: $lang, installed: $installed, limit: $limit, offset: $offset) {
					items { ${EXT_FIELDS} }
					total
					languages
				}
			}`,
			opts as Record<string, unknown>,
			baseUrl()
		)
		return {
			...data.extensions,
			items: normExts(data.extensions.items),
			languages: Array.from(new Set((data.extensions.languages ?? []).map(canonicalLang))).sort(),
		}
	},

	async availableExtensions(repositoryId: string): Promise<Extension[]> {
		const data = await gql<{ availableExtensions: Extension[] }>(
			`query AvailableExtensions($repositoryId: ID!) {
				availableExtensions(repositoryId: $repositoryId) { ${EXT_FIELDS} }
			}`,
			{ repositoryId },
			baseUrl()
		)
		return normExts(data.availableExtensions)
	},

	async installedExtensions(): Promise<Extension[]> {
		const data = await gql<{ installedExtensions: Extension[] }>(
			`query InstalledExtensions { installedExtensions { ${EXT_FIELDS} } }`,
			undefined,
			baseUrl()
		)
		return normExts(data.installedExtensions)
	},

	async installExtension(packageName: string): Promise<Extension> {
		const data = await gql<{ installExtension: Extension }>(
			`mutation InstallExtension($packageName: String!) {
				installExtension(packageName: $packageName) { ${EXT_FIELDS} }
			}`,
			{ packageName },
			baseUrl()
		)
		return normExt(data.installExtension)
	},

	async uninstallExtension(packageName: string): Promise<Extension> {
		const data = await gql<{ uninstallExtension: Extension }>(
			`mutation UninstallExtension($packageName: String!) {
				uninstallExtension(packageName: $packageName) { ${EXT_FIELDS} }
			}`,
			{ packageName },
			baseUrl()
		)
		return normExt(data.uninstallExtension)
	},

	async updateExtension(packageName: string): Promise<Extension> {
		const data = await gql<{ updateExtension: Extension }>(
			`mutation UpdateExtension($packageName: String!) {
				updateExtension(packageName: $packageName) { ${EXT_FIELDS} }
			}`,
			{ packageName },
			baseUrl()
		)
		return normExt(data.updateExtension)
	},

	async installExternalExtension(url: string): Promise<Extension> {
		const data = await gql<{ installExternalExtension: Extension }>(
			`mutation InstallExternalExtension($url: String!) {
				installExternalExtension(url: $url) { ${EXT_FIELDS} }
			}`,
			{ url },
			baseUrl()
		)
		return normExt(data.installExternalExtension)
	},

	async installExtensionFile(name: string, bytes: Uint8Array): Promise<{ packageName: string; name: string }> {
		const form = new FormData()
		form.append('file', new Blob([bytes]), name)
		const res = await fetch(`${baseUrl().replace(/\/$/, '')}/api/extensions/install-file`, {
			method: 'POST',
			headers: authHeaders(),
			body: form,
		})
		if (!res.ok) throw new Error((await res.text()).trim() || `HTTP ${res.status}`)
		return res.json()
	},
}
