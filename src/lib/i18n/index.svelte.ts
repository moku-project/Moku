import en from './locales/en.json'

/*
 * Moku i18n runtime. Locale files use the i18next JSON v4 format (as used by
 * Weblate): nested keys, `{{name}}` placeholders, `_one`/`_other` plural keys.
 *
 * `en.json` is the source of truth: every key used with `t()` must exist there,
 * and TypeScript checks it. Other locales are loaded on demand and fall back to
 * English key by key, so a partial translation is safe to ship.
 *
 *   t('nav.home')                          -> "Home"
 *   t('settings.general.zoomReset', { value: 100 })
 *   t('common.minutes', { count: 5 })      -> picks "minutes_one" / "minutes_other"
 */

type Dict = { [key: string]: string | Dict }

type Leaves<T, P extends string = ''> = {
	[K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>
}[keyof T & string]

type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'
type StripPlural<K> = K extends `${infer Base}_${PluralSuffix}` ? Base : K

type RawKey = Leaves<typeof en>
export type MessageKey = RawKey | StripPlural<RawKey>
export type MessageParams = Record<string, string | number>

export const SOURCE_LOCALE = 'en'
export const SYSTEM_LOCALE = 'system'

const loaders = import.meta.glob<{ default: Dict }>(['./locales/*.json', '!./locales/en.json'])

/** Every locale with a file in ./locales, source locale first. */
export const LOCALES: string[] = [
	SOURCE_LOCALE,
	...Object.keys(loaders).map(p => p.slice(p.lastIndexOf('/') + 1, -'.json'.length)).sort(),
]

let locale   = $state(SOURCE_LOCALE)
let messages = $state.raw<Dict | null>(null)
let plurals  = new Intl.PluralRules(SOURCE_LOCALE)

export function currentLocale(): string {
	return locale
}

/** Map a stored preference ("system" or a locale code) to a locale Moku ships. */
export function resolveLocale(pref: string | null | undefined): string {
	const wanted = !pref || pref === SYSTEM_LOCALE
		? (typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [])
		: [pref]

	for (const tag of wanted) {
		const exact = LOCALES.find(l => l.toLowerCase() === tag.toLowerCase())
		if (exact) return exact
		const base = tag.split('-')[0].toLowerCase()
		const partial = LOCALES.find(l => l.toLowerCase() === base)
		if (partial) return partial
	}
	return SOURCE_LOCALE
}

export async function setLocale(pref: string | null | undefined): Promise<void> {
	const next = resolveLocale(pref)
	let dict: Dict | null = null

	if (next !== SOURCE_LOCALE) {
		const load = loaders[`./locales/${next}.json`]
		try {
			dict = load ? (await load()).default : null
		} catch (err) {
			console.warn(`[i18n] failed to load locale "${next}"`, err)
		}
	}

	const applied = dict || next === SOURCE_LOCALE ? next : SOURCE_LOCALE
	messages = dict
	plurals  = new Intl.PluralRules(applied)
	locale   = applied
	if (typeof document !== 'undefined') document.documentElement.lang = applied
}

/** A locale's own name for itself, e.g. "Español" for "es". */
export function localeName(code: string): string {
	try {
		const name = new Intl.DisplayNames([code], { type: 'language' }).of(code)
		return name ? name.charAt(0).toLocaleUpperCase(code) + name.slice(1) : code
	} catch {
		return code
	}
}

function lookup(dict: Dict | null, key: string): string | undefined {
	let node: string | Dict | undefined = dict ?? undefined
	for (const part of key.split('.')) {
		if (node === undefined || typeof node === 'string') return undefined
		node = node[part]
	}
	return typeof node === 'string' ? node : undefined
}

function find(key: string): string | undefined {
	return lookup(messages, key) ?? lookup(en as Dict, key)
}

export function t(key: MessageKey, params?: MessageParams): string {
	return format(key, params)
}

const SLOT = '\u0000'

/**
 * Splits a translation around one placeholder, so the template can wrap that value in markup:
 *   {@const [before, after] = tSplit('x.removeConfirm', 'title')} {before}<b>{title}</b>{after}
 */
export function tSplit(key: MessageKey, slot: string, params?: MessageParams): [string, string] {
	const text = format(key, params, slot)
	const i = text.indexOf(SLOT)
	return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i + SLOT.length)]
}

function format(key: MessageKey, params?: MessageParams, slot?: string): string {
	// Reading `locale` subscribes the caller, so templates update on switch.
	void locale

	let template: string | undefined
	const count = params?.count
	if (typeof count === 'number') {
		template = find(`${key}_${plurals.select(count)}`) ?? find(`${key}_other`)
	}
	template ??= find(key)

	if (template === undefined) {
		if (import.meta.env.DEV) console.warn(`[i18n] missing key "${key}"`)
		return key
	}
	if (!params && !slot) return template
	return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
		name === slot ? SLOT : params && name in params ? String(params[name]) : match)
}
