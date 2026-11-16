import { platformService } from '$lib/platform-service'
import { settingsState }   from '$lib/state/settings.svelte'
import { addToast }        from '$lib/state/notifications.svelte'
import { t }               from '$lib/i18n/index.svelte'
import type { Manga }      from '$lib/types'

export function isLocalServer(): boolean {
  const url = (settingsState.settings.serverUrl ?? 'http://localhost:6007').trim()
  try {
    const host = new URL(url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return false
  }
}

export function canOpenFolder(): boolean {
  return platformService.isSupported('filesystem')
}

// Paths always come from the server, which may not share a filesystem with
// this client (remote server, container, etc.) — rather than pre-guessing
// that from the server URL, just try, and if it fails hand back the path so
// the user can find it themselves.
async function tryOpenPath(path: string): Promise<void> {
  if (!platformService.isSupported('filesystem')) {
    addToast({ kind: 'info', title: t('notices.files.desktopOnlyTitle'), body: t('notices.files.desktopOnlyBody') })
    return
  }
  try {
    await platformService.openPath(path)
  } catch {
    addToast({ kind: 'error', title: t('notices.files.openFailed'), body: path })
  }
}

export async function openMangaFolder(manga: Manga): Promise<void> {
  if (!manga.downloadFolderPath) {
    const hasDownloads = (manga.downloadCount ?? 0) > 0
    addToast(hasDownloads
      ? { kind: 'error', title: t('notices.files.locateFailedTitle'), body: t('notices.files.locateFailedBody') }
      : { kind: 'info', title: t('notices.files.nothingDownloadedTitle'), body: t('notices.files.nothingDownloadedBody') })
    return
  }
  await tryOpenPath(manga.downloadFolderPath)
}

export async function openCustomFolder(path: string): Promise<void> {
  if (!path?.trim()) return
  await tryOpenPath(path)
}

// Opening a file hands it to whatever app claims its extension, which is often none.
export async function revealFile(path: string): Promise<void> {
  const dir = path.replace(/[\\/][^\\/]*$/, '')
  await openCustomFolder(dir || path)
}