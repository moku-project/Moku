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
  return platformService.isSupported('filesystem') && isLocalServer()
}

function checkCanOpenFolder(): boolean {
  if (!platformService.isSupported('filesystem')) {
    addToast({ kind: 'info', title: 'Desktop only', body: 'Opening folders requires the desktop app.' })
    return false
  }
  if (!isLocalServer()) {
    addToast({ kind: 'info', title: 'Remote server', body: 'Folder access is unavailable when connected to a remote server.' })
    return false
  }
  return true
}

export async function openMangaFolder(manga: Manga): Promise<void> {
  if (!checkCanOpenFolder()) return
  if (!manga.downloadFolderPath) {
    const hasDownloads = (manga.downloadCount ?? 0) > 0
    addToast(hasDownloads
      ? { kind: 'error', title: 'Could not locate downloads', body: 'The server could not find a folder for this series. Try refreshing the page.' }
      : { kind: 'info', title: 'Nothing downloaded', body: 'No chapters have been downloaded for this series yet.' })
    return
  }
  await platformService.openPath(manga.downloadFolderPath).catch(console.error)
}

export async function openCustomFolder(path: string): Promise<void> {
  if (!checkCanOpenFolder()) return
  if (!path?.trim()) return
  await platformService.openPath(path).catch(console.error)
}