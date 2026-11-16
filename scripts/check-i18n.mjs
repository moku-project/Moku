#!/usr/bin/env node
// Flags interface text written straight into components instead of going through t(), and t() keys missing from en.json.
// A line opts out with an `i18n-ignore` comment, a block with `i18n-ignore-start` … `i18n-ignore-end`.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const en = JSON.parse(readFileSync(join(root, 'src/lib/i18n/locales/en.json'), 'utf8'))

// Names that stay the same in every language.
const KEEP = new Set(['Moku', 'Tsunagu', 'Discord', 'GitHub', 'AniList', 'MyAnimeList', 'Kitsu', 'MangaUpdates', 'Tailscale',
  'Cloudflare', 'FlareSolverr', 'Weblate', 'Windows', 'Hello', 'MAL'])

function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) files(p, out)
    else if (/\.(svelte|ts)$/.test(name) && !name.endsWith('.d.ts')) out.push(p)
  }
  return out
}

function has(key) {
  let node = en
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return false
    node = node[part]
  }
  if (typeof node === 'string') return true
  // Plural keys exist as key_one / key_other.
  const parent = key.split('.').slice(0, -1).reduce((n, p) => n?.[p], en)
  const leaf = key.split('.').pop()
  return !!parent && typeof parent === 'object' && Object.keys(parent).some(k => k.startsWith(`${leaf}_`))
}

// URLs, paths, file extensions, all-caps codes and stray script expressions aren't prose.
const wordy = s => {
  const text = s.trim()
  if (/^(https?:\/\/|\/|\.)/.test(text) || /&&|\|\||===?|=>|[()]/.test(text)) return false
  const words = text.replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, ' ').match(/[A-Za-z][A-Za-z'_]+/g) ?? []
  return words.some(w => !KEEP.has(w) && w !== w.toUpperCase())
}

const problems = []
for (const file of files(join(root, 'src'))) {
  const rel = relative(root, file)
  if (rel.startsWith('src/lib/i18n/')) continue
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')
  const ignored = new Set()
  let skipping = false
  lines.forEach((l, i) => {
    if (l.includes('i18n-ignore-start')) skipping = true
    if (skipping || l.includes('i18n-ignore')) ignored.add(i + 1)
    if (l.includes('i18n-ignore-end')) skipping = false
  })
  const at = index => src.slice(0, index).split('\n').length
  const report = (index, what) => {
    const line = at(index)
    if (!ignored.has(line)) problems.push(`${rel}:${line}: ${what}`)
  }

  for (const m of src.matchAll(/\bt\(\s*['"`]([\w.]+)['"`]/g)) {
    if (!m[1].includes('.')) continue
    if (!has(m[1])) report(m.index, `missing key ${m[1]}`)
  }

  if (!file.endsWith('.svelte')) continue
  // Blank out scripts and styles so offsets keep their line numbers.
  const markup = src.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, block => block.replace(/[^\n]/g, ' '))
  for (const m of markup.matchAll(/>([^<>{}]+)</g)) {
    if (wordy(m[1])) report(m.index, `text "${m[1].trim().slice(0, 50)}"`)
  }
  for (const m of markup.matchAll(/\b(title|aria-label|placeholder|alt|label)="([^"{]*)"/g)) {
    if (wordy(m[2])) report(m.index, `${m[1]}="${m[2].slice(0, 50)}"`)
  }
}

if (problems.length) {
  console.log(problems.join('\n'))
  console.log(`\n${problems.length} untranslated string(s). Move them into src/lib/i18n/locales/en.json and use t().`)
  process.exit(1)
}
console.log('No untranslated interface text found.')
