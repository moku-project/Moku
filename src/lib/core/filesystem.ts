import { platformService } from '$lib/platform-service'
import { settingsState }   from '$lib/state/settings.svelte'
import { addToast }        from '$lib/state/notifications.svelte'
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
    addToast({ kind: 'info', title: 'Desktop only', body: 'Opening folders requires the desktop app.' })
    return
  }
  try {
    await platformService.openPath(path)
  } catch {
    addToast({ kind: 'error', title: 'Could not open path', body: path })
  }
}

export async function openMangaFolder(manga: Manga): Promise<void> {
  if (!manga.downloadFolderPath) {
    const hasDownloads = (manga.downloadCount ?? 0) > 0
    addToast(hasDownloads
      ? { kind: 'error', title: 'Could not locate downloads', body: 'The server could not find a folder for this series. Try refreshing the page.' }
      : { kind: 'info', title: 'Nothing downloaded', body: 'No chapters have been downloaded for this series yet.' })
    return
  }
  await tryOpenPath(manga.downloadFolderPath)
}

export async function openCustomFolder(path: string): Promise<void> {
  if (!path?.trim()) return
  await tryOpenPath(path)
}