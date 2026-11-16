import { GraphQLError } from '$lib/graphql/client'
import { t, type MessageKey } from '$lib/i18n/index.svelte'

export type SourceErrorCode =
	| 'SOURCE_CLOUDFLARE'
	| 'SOURCE_NOT_FOUND'
	| 'SOURCE_UNAVAILABLE'
	| 'SOURCE_RATE_LIMITED'
	| 'SOURCE_NETWORK'
	| 'SOURCE_PARSE'
	| 'INTERNAL'

export interface SourceErrorInfo {
	code: SourceErrorCode
	label: string
	message: string
	retriable: boolean
	cloudflare: boolean
	expected: boolean
}

const LABELS: Record<SourceErrorCode, { label: MessageKey; retriable: boolean; expected: boolean }> = {
	SOURCE_CLOUDFLARE:   { label: 'notices.sourceError.cloudflare', retriable: false, expected: true },
	SOURCE_NOT_FOUND:    { label: 'notices.sourceError.notFound', retriable: false, expected: true },
	SOURCE_UNAVAILABLE:  { label: 'notices.sourceError.unreachable', retriable: true,  expected: true },
	SOURCE_NETWORK:      { label: 'notices.sourceError.unreachable', retriable: true,  expected: true },
	SOURCE_RATE_LIMITED: { label: 'notices.sourceError.rateLimited', retriable: true,  expected: true },
	SOURCE_PARSE:        { label: 'notices.sourceError.parse', retriable: false, expected: false },
	INTERNAL:            { label: 'notices.sourceError.internal', retriable: true,  expected: false },
}

function errorText(e: unknown): string {
	if (typeof e === 'string') return e
	if (e instanceof Error) return e.message
	return ''
}

function isTimeout(e: unknown): boolean {
	const grpc = e instanceof GraphQLError ? e.grpc : ''
	if (grpc === 'DeadlineExceeded' || grpc === 'Canceled') return true
	return /DeadlineExceeded|deadline exceeded/i.test(errorText(e))
}

export function sourceErrorCode(e: unknown): SourceErrorCode | null {
	if (e instanceof GraphQLError) {
		const raw = e.code
		if (raw && raw in LABELS) return raw as SourceErrorCode
		if (e.grpc === 'DeadlineExceeded' || e.grpc === 'Canceled') return 'SOURCE_NETWORK'
		if (e.grpc === 'Unavailable') return 'SOURCE_UNAVAILABLE'
		if (e.grpc === 'NotFound') return 'SOURCE_NOT_FOUND'
		if (e.grpc === 'ResourceExhausted') return 'SOURCE_RATE_LIMITED'
		if (e.grpc === 'FailedPrecondition') return 'SOURCE_CLOUDFLARE'
		if (e.grpc === 'DataLoss') return 'SOURCE_PARSE'
	}
	const msg = errorText(e)
	if (!msg) return null
	if (isTimeout(e)) return 'SOURCE_NETWORK'
	if (/SOURCE_CLOUDFLARE|cloudflare/i.test(msg)) return 'SOURCE_CLOUDFLARE'
	if (/SOURCE_RATE_LIMITED|ResourceExhausted|rate.?limit/i.test(msg)) return 'SOURCE_RATE_LIMITED'
	if (/SOURCE_NOT_FOUND/i.test(msg)) return 'SOURCE_NOT_FOUND'
	if (/SOURCE_UNAVAILABLE|code = Unavailable/i.test(msg)) return 'SOURCE_UNAVAILABLE'
	if (/SOURCE_PARSE|DataLoss/i.test(msg)) return 'SOURCE_PARSE'
	if (/rpc error|resolveMedia|get details for|input:\d+:/i.test(msg)) return 'INTERNAL'
	return null
}

export function sourceErrorInfo(e: unknown): SourceErrorInfo | null {
	const code = sourceErrorCode(e)
	if (!code) return null
	const meta = LABELS[code]
	const metaLabel = t(meta.label)
	return {
		code,
		label: isTimeout(e) ? t('notices.sourceError.timedOut') : metaLabel,
		message: errorText(e) || metaLabel,
		retriable: meta.retriable,
		cloudflare: code === 'SOURCE_CLOUDFLARE',
		expected: meta.expected,
	}
}

export function sourceErrorLabel(e: unknown): string {
	return sourceErrorInfo(e)?.label ?? (errorText(e) || t('notices.sourceError.internal'))
}

export function isExpectedSourceNoise(e: unknown): boolean {
	const code = sourceErrorCode(e)
	return code != null && code !== 'INTERNAL' && code !== 'SOURCE_PARSE'
}
