import { join, basename, dirname } from '@tauri-apps/api/path'
import { readDir, mkdir, copyFile, type DirEntry } from '@tauri-apps/plugin-fs'

const imageExts   = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp'])
const archiveExts = new Set(['.cbz', '.zip', '.cbr', '.rar', '.cb7', '.7z', '.cbt', '.tar', '.pdf'])
const videoExts   = new Set(['.mp4', '.mkv', '.webm', '.m4v', '.avi', '.mov'])
const textExts    = new Set(['.txt', '.html', '.htm', '.xhtml', '.md'])
const bookExts    = new Set(['.epub', '.docx'])

// Matches backend/internal/localsource/scan.go's dirKind map — "novel" maps
// to the same on-disk folder name as "novels".
type ContentKind = 'manga' | 'anime' | 'novel'
const kindDirName: Record<ContentKind, string> = { manga: 'manga', anime: 'anime', novel: 'novels' }

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? '' : name.slice(i).toLowerCase()
}

function stripExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i < 0 ? name : name.slice(0, i)
}

// Guesses whether a folder full of loose files is one manga chapter, one
// anime episode, or one novel chapter, based on the file types inside it.
// Returns null if it doesn't look like a single content unit at all (e.g.
// it's empty, or a mix that looks more like a series folder).
function detectUnitKind(entries: DirEntry[]): ContentKind | null {
  const files = entries.filter(e => !e.isDirectory)
  if (files.length === 0) return null
  if (files.some(e => videoExts.has(extOf(e.name)))) return 'anime'
  if (files.some(e => textExts.has(extOf(e.name)))) return 'novel'
  if (files.every(e => imageExts.has(extOf(e.name)))) return 'manga'
  return null
}

async function detectSeriesKind(path: string, entries: DirEntry[]): Promise<ContentKind> {
  for (const e of entries) {
    if (!e.isDirectory) {
      const ext = extOf(e.name)
      if (archiveExts.has(ext)) return 'manga'
      if (videoExts.has(ext)) return 'anime'
      if (textExts.has(ext) || bookExts.has(ext)) return 'novel'
      continue
    }
    const sub = await readDir(await join(path, e.name)).catch(() => null)
    if (!sub) continue
    const kind = detectUnitKind(sub)
    if (kind) return kind
  }
  return 'manga'
}

type Progress = (copied: number, total: number) => void

async function countFiles(path: string): Promise<number> {
  const entries = await readDir(path).catch(() => null)
  if (!entries) return 1 // a plain file, not a directory
  let n = 0
  for (const entry of entries) {
    n += entry.isDirectory ? await countFiles(await join(path, entry.name)) : 1
  }
  return n
}

async function copyDirRecursive(src: string, dest: string, tick: () => void): Promise<void> {
  await mkdir(dest, { recursive: true })
  for (const entry of await readDir(src)) {
    const s = await join(src, entry.name)
    const d = await join(dest, entry.name)
    if (entry.isDirectory) await copyDirRecursive(s, d, tick)
    else { await copyFile(s, d); tick() }
  }
}

export interface ImportResult {
  imported: string[]
  errors: { path: string; message: string }[]
}

// Copies one dropped filesystem path into {mediaDir}/local/{manga,anime,novels},
// inferring content type, series and chapter/episode boundaries so the user
// never has to get folder naming right by hand (matches the backend's
// local-source scan layout — see backend/internal/localsource/scan.go).
// A loose dropped file's parent folder only makes sense as the series title
// when it actually looks like a series folder - i.e. it holds other files of
// the same kind (sibling chapters). Otherwise the parent is just wherever the
// user happened to drag from (Downloads, Desktop, ...), so the file's own
// name is the better guess at a title.
async function seriesTitleFor(path: string, name: string, isSibling: (ext: string) => boolean): Promise<string> {
  const parent = await dirname(path)
  const siblings = await readDir(parent).catch(() => null)
  const hasSiblingChapters = siblings?.some(e => !e.isDirectory && e.name !== name && isSibling(extOf(e.name))) ?? false
  return hasSiblingChapters ? await basename(parent) : stripExt(name)
}

async function importOnePath(path: string, mediaDir: string, tick: () => void): Promise<string> {
  const name = await basename(path)
  const ext = extOf(name)

  if (archiveExts.has(ext)) {
    const title = await seriesTitleFor(path, name, e => archiveExts.has(e))
    const destDir = await join(mediaDir, 'local', 'manga', title)
    await mkdir(destDir, { recursive: true })
    await copyFile(path, await join(destDir, name))
    tick()
    return title
  }
  if (bookExts.has(ext)) {
    // A book file is a whole title by itself - its own name is the title.
    const title = stripExt(name)
    const destDir = await join(mediaDir, 'local', kindDirName.novel, title)
    await mkdir(destDir, { recursive: true })
    await copyFile(path, await join(destDir, name))
    tick()
    return title
  }
  if (videoExts.has(ext) || textExts.has(ext)) {
    const kind: ContentKind = videoExts.has(ext) ? 'anime' : 'novel'
    const isSibling = videoExts.has(ext) ? (e: string) => videoExts.has(e) : (e: string) => textExts.has(e)
    const title = await seriesTitleFor(path, name, isSibling)
    const destDir = await join(mediaDir, 'local', kindDirName[kind], title, stripExt(name))
    await mkdir(destDir, { recursive: true })
    await copyFile(path, await join(destDir, name))
    tick()
    return title
  }

  const entries = await readDir(path).catch(() => null)
  if (!entries) {
    throw new Error(`"${name}" isn't a supported folder or file`)
  }

  const unitKind = detectUnitKind(entries)
  if (unitKind) {
    // The dropped folder itself is one chapter/episode. Its parent only
    // makes sense as the series title if it holds sibling chapter folders -
    // otherwise it's just wherever the user dragged from, so fall back to
    // this folder's own name.
    const parent = await dirname(path)
    const siblingDirs = await readDir(parent).catch(() => null)
    const hasSiblingChapters = siblingDirs?.some(e => e.isDirectory && e.name !== name) ?? false
    const title = hasSiblingChapters ? await basename(parent) : name
    await copyDirRecursive(path, await join(mediaDir, 'local', kindDirName[unitKind], title, name), tick)
    return title
  }

  // Otherwise treat the dropped folder as the series itself: subfolders
  // become chapters/episodes, .cbz/.zip files inside become archive
  // chapters (manga only), and any cover.* is picked up on the next rescan.
  const seriesKind = await detectSeriesKind(path, entries)
  await copyDirRecursive(path, await join(mediaDir, 'local', kindDirName[seriesKind], name), tick)
  return name
}

export async function importLocalPaths(paths: string[], mediaDir: string, onProgress?: Progress): Promise<ImportResult> {
  const imported: string[] = []
  const errors: ImportResult['errors'] = []

  const counts = await Promise.all(paths.map(p => countFiles(p).catch(() => 1)))
  const total = counts.reduce((a, b) => a + b, 0)
  let copied = 0
  const tick = () => { copied++; onProgress?.(copied, total) }
  onProgress?.(0, total)

  for (const path of paths) {
    try {
      imported.push(await importOnePath(path, mediaDir, tick))
    } catch (e: any) {
      errors.push({ path, message: e?.message ?? String(e) })
    }
  }
  return { imported, errors }
}
