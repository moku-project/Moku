<script lang="ts">
  import { Trash, ClockCounterClockwise, ArrowsClockwise } from 'phosphor-svelte'
  import { untrack } from 'svelte'
  import { platformService } from '$lib/platform-service'
  import { addToast as toast } from '$lib/state/notifications.svelte'
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'
  import { exportAppData, importAppData } from '$lib/core/backup'
  import { loadBackups, saveBackups, saveSettings, saveLibrary } from '$lib/core/persistence/persist'
  import { DEFAULT_SETTINGS } from '$lib/types/settings'
  import { DEFAULT_READING_STATS } from '$lib/types/history'
  import { clearBlobCache } from '$lib/core/cache/imageCache'
  import { cache as queryCache } from '$lib/core/cache/queryCache'
  import { tsunagu } from '$lib/server-adapters/tsunagu'
  import { canOpenFolder, openCustomFolder, isLocalServer } from '$lib/core/filesystem'
  import { authHeaders } from '$lib/state/auth.svelte'

  const supportsFilesystem = platformService.isSupported('filesystem')

  type ResetState = 'idle' | 'busy' | 'done' | 'error'
  interface ResetItem { key: string; label: string; desc: string; state: ResetState; error: string | null; confirm: boolean }

  let resetItems = $state<ResetItem[]>([
    { key: 'all-cache',       label: 'Clear all caches',      desc: 'Flushes the image blob cache, page cache, query cache, Moku disk cache, and server image/thumbnail cache in one pass.', state: 'idle', error: null, confirm: false },
    { key: 'reading-history', label: 'Clear reading history', desc: 'Erases chapter history, read log, reading stats, and daily read counts.',                                                        state: 'idle', error: null, confirm: true  },
    { key: 'moku-settings',   label: 'Reset Moku settings',   desc: 'Restores all app settings to their defaults. Does not affect library data.',                                                       state: 'idle', error: null, confirm: true  },
  ])

  let confirming = $state<string | null>(null)

  function patchReset(key: string, update: Partial<ResetItem>) {
    resetItems = resetItems.map(i => i.key === key ? { ...i, ...update } : i)
  }

  function showExitCountdown(): Promise<void> {
    return new Promise(resolve => {
      const backdrop = document.createElement('div')
      backdrop.className = 's-backdrop'
      backdrop.style.cssText = 'z-index:99999'
      const modal = document.createElement('div')
      modal.style.cssText = 'background:var(--bg-surface);border:1px solid var(--border-base);border-radius:var(--radius-2xl);box-shadow:0 0 0 1px rgba(255,255,255,0.04) inset,0 24px 80px rgba(0,0,0,0.7);width:min(400px,calc(100vw - 40px));display:flex;flex-direction:column;overflow:hidden;animation:s-scale-in 0.2s cubic-bezier(0.16,1,0.3,1) both'
      const header = document.createElement('div')
      header.style.cssText = 'padding:var(--sp-4) var(--sp-5) var(--sp-3);border-bottom:1px solid var(--border-dim)'
      const title = document.createElement('p')
      title.style.cssText = 'margin:0;font-size:var(--text-sm);font-weight:var(--weight-medium);color:var(--text-primary);letter-spacing:0.01em'
      title.textContent = 'Reset complete'
      header.appendChild(title)
      const body = document.createElement('div')
      body.style.cssText = 'padding:var(--sp-4) var(--sp-5);display:flex;flex-direction:column;gap:var(--sp-2)'
      const sub = document.createElement('p')
      sub.style.cssText = 'margin:0;font-family:var(--font-ui);font-size:var(--text-xs);color:var(--text-faint);letter-spacing:var(--tracking-wide);line-height:var(--leading-snug)'
      sub.textContent = 'Moku will close so you can relaunch with the reset applied.'
      const counter = document.createElement('p')
      counter.style.cssText = 'margin:0;font-family:var(--font-ui);font-size:var(--text-xs);color:var(--text-faint);letter-spacing:var(--tracking-wide)'
      counter.textContent = 'Closing in 3…'
      body.append(sub, counter)
      const footer = document.createElement('div')
      footer.style.cssText = 'padding:var(--sp-3) var(--sp-5);border-top:1px solid var(--border-dim);display:flex;justify-content:flex-end'
      const btn = document.createElement('button')
      btn.className = 's-btn s-btn-danger'
      btn.textContent = 'Close now'
      footer.appendChild(btn)
      modal.append(header, body, footer)
      backdrop.appendChild(modal)
      document.body.appendChild(backdrop)
      let secs = 3
      const tick = setInterval(() => {
        secs--
        counter.textContent = secs > 0 ? `Closing in ${secs}…` : 'Closing…'
        if (secs <= 0) { clearInterval(tick); backdrop.remove(); resolve() }
      }, 1000)
      btn.addEventListener('click', () => { clearInterval(tick); backdrop.remove(); resolve() })
    })
  }

  async function clearAllCaches(): Promise<void> {
    clearBlobCache()
    queryCache.clearAll()
    await Promise.all([
      platformService.clearMokuCache(),
      tsunagu.clearImageCache(),
    ])
  }

  async function runReset(key: string) {
    confirming = null
    patchReset(key, { state: 'busy', error: null })
    try {
      switch (key) {
        case 'all-cache':
          await clearAllCaches()
          break
        case 'reading-history':
          await saveLibrary({ sessions: [], bookmarks: [], dailyReadCounts: {} })
          break
        case 'moku-settings':
          localStorage.clear()
          await saveSettings({ settings: DEFAULT_SETTINGS, storeVersion: 2 })
          patchReset(key, { state: 'done' })
          await showExitCountdown()
          platformService.exitApp()
          return
      }
      patchReset(key, { state: 'done' })
      setTimeout(() => patchReset(key, { state: 'idle' }), 3000)
    } catch (e: any) {
      patchReset(key, { state: 'error', error: e?.message ?? String(e) })
    }
  }

  interface StorageInfo { manga_bytes: number; total_bytes: number; free_bytes: number; path: string }

  const isExternalServer = $derived(!isLocalServer())

  let storageInfo    = $state<StorageInfo | null>(null)
  let storageLoading = $state(false)
  let storageError   = $state<string | null>(null)

  let downloadsPathInput   = $state(settingsState.settings.serverDownloadsPath ?? '')
  let localSourcePathInput = $state(settingsState.settings.serverLocalSourcePath ?? '')
  let rescanning           = $state(false)

  async function rescanLocal() {
    if (rescanning) return
    rescanning = true
    try {
      const found = await tsunagu.rescanLocalMedia()
      const { loadLibrary } = await import('$lib/state/library.svelte')
      await loadLibrary(true)
      toast({ kind: 'success', title: 'Local library rescanned', body: `${found.length} local ${found.length === 1 ? 'title' : 'titles'}` })
    } catch (e) {
      toast({ kind: 'error', title: 'Rescan failed', body: String(e) })
    } finally { rescanning = false }
  }
  let pathsSaving          = $state(false)
  let pathsError           = $state<string | null>(null)
  let pathsFieldError      = $state<{ dl?: string; loc?: string }>({})
  let pathsSaved           = $state(false)

  // The server falls back to its media dir when no downloads path is set,
  // so that (not the OS "Downloads" folder) is the real default to show.
  const defaultDownloadsPath = $derived(srvStorage?.mediaDir ?? '')

  let confirmedDownloadsPath   = $state(settingsState.settings.serverDownloadsPath ?? '')
  let confirmedLocalSourcePath = $state(settingsState.settings.serverLocalSourcePath ?? '')

  let migrateKind     = $state<'downloads' | 'local'>('downloads')
  let migrateFrom     = $state<string | null>(null)
  let migrateTo       = $state<string | null>(null)
  let migrating       = $state(false)
  let migrateProgress = $state<{ done: number; total: number; current: string } | null>(null)
  let migrateError    = $state<string | null>(null)

  let extraScanDirs     = $state<string[]>([...(settingsState.settings.extraScanDirs ?? [])])
  let newScanDir        = $state('')
  let multiStorageInfos = $state<(StorageInfo & { label: string })[]>([])
  let advStorageOpen    = $state(false)
  let backupSectionOpen = $state(false)
  let resetSectionOpen  = $state(false)

  async function fetchStorage() {
    if (!supportsFilesystem) return
    storageLoading = true; storageError = null
    try {
      if (isExternalServer) { multiStorageInfos = []; storageInfo = null; return }
      const dl  = settingsState.settings.serverDownloadsPath ?? ''
      const loc = settingsState.settings.serverLocalSourcePath ?? ''
      const effectiveDl = dl || defaultDownloadsPath
      const dirsToScan: { path: string; label: string }[] = []
      if (effectiveDl) dirsToScan.push({ path: effectiveDl, label: dl ? 'Downloads' : 'Downloads (default)' })
      if (loc && loc !== effectiveDl) dirsToScan.push({ path: loc, label: 'Local source' })
      for (const p of extraScanDirs) {
        if (p && !dirsToScan.find(d => d.path === p)) dirsToScan.push({ path: p, label: p })
      }
      if (dirsToScan.length === 0) { multiStorageInfos = []; storageInfo = null; return }
      const results = await Promise.allSettled(
        dirsToScan.map(d => platformService.getStorageInfo(d.path).then(info => ({ ...info, label: d.label })))
      )
      multiStorageInfos = results
        .filter((r): r is PromiseFulfilledResult<StorageInfo & { label: string }> => r.status === 'fulfilled')
        .map(r => r.value)
      storageInfo = multiStorageInfos[0] ?? null
    } catch (e: any) {
      storageError = e instanceof Error ? e.message : String(e)
    } finally { storageLoading = false }
  }

  async function validatePath(path: string): Promise<string | null> {
    if (!path.trim() || isExternalServer || !supportsFilesystem) return null
    try {
      const exists = await platformService.checkPathExists(path.trim())
      return exists ? null : 'Directory does not exist'
    } catch { return 'Could not check path' }
  }

  async function createDirectory(path: string): Promise<void> {
    if (isExternalServer) throw new Error('Cannot create directories on an external server')
    await platformService.createDirectory(path)
  }

  async function savePaths() {
    const dl  = downloadsPathInput.trim()
    const loc = localSourcePathInput.trim()
    pathsError = null; pathsFieldError = {}
    const [dlErr, locErr] = await Promise.all([validatePath(dl), validatePath(loc)])
    if (dlErr || locErr) { pathsFieldError = { ...(dlErr ? { dl: dlErr } : {}), ...(locErr ? { loc: locErr } : {}) }; return }

    // A local-source-path change is applied server-side too (it decides
    // where the scanner looks), so it goes through the same migrate prompt
    // as downloads instead of being saved as a purely client-side setting.
    if (loc !== confirmedLocalSourcePath) {
      migrateKind = 'local'; migrateFrom = confirmedLocalSourcePath; migrateTo = loc
      migrateError = null
      return
    }

    const newDl = dl || defaultDownloadsPath
    const oldDl = confirmedDownloadsPath || defaultDownloadsPath
    if (dl === confirmedDownloadsPath || (newDl && oldDl && newDl === oldDl)) {
      pathsSaved = true; setTimeout(() => pathsSaved = false, 2000)
      return
    }
    // A downloads-path change is applied server-side: prompt for migration.
    migrateKind = 'downloads'; migrateFrom = oldDl; migrateTo = dl
    migrateError = null
  }

  async function applyRelocation(migrate: boolean) {
    if (migrateTo === null) return
    migrating = true; migrateError = null
    migrateProgress = migrate ? { done: 0, total: 0, current: 'Moving files…' } : null
    try {
      if (migrateKind === 'local') {
        const res = await tsunagu.relocateLocalSource(migrateTo, migrate)
        updateSettings({ serverLocalSourcePath: migrateTo })
        confirmedLocalSourcePath = migrateTo
        localSourcePathInput = migrateTo
        migrateFrom = null; migrateTo = null; migrateProgress = null
        pathsSaved = true; setTimeout(() => pathsSaved = false, 2000)
        toast({
          kind: 'success',
          title: migrate ? 'Local source migrated' : 'Local source path changed',
          body: migrate
            ? `Moved ${res.movedFiles} ${res.movedFiles === 1 ? 'file' : 'files'} (${fmtBytes(res.movedBytes)}) to ${res.newPath}`
            : `Local source now reads from ${res.newPath}. Existing files stay where they are.`,
        })
        const { loadLibrary } = await import('$lib/state/library.svelte')
        await Promise.all([loadLibrary(true), fetchStorage(), loadServerStorage()])
      } else {
        const res = await tsunagu.relocateDownloads(migrateTo, migrate)
        updateSettings({ serverDownloadsPath: migrateTo })
        confirmedDownloadsPath = migrateTo
        downloadsPathInput = migrateTo
        migrateFrom = null; migrateTo = null; migrateProgress = null
        pathsSaved = true; setTimeout(() => pathsSaved = false, 2000)
        toast({
          kind: 'success',
          title: migrate ? 'Downloads migrated' : 'Downloads path changed',
          body: migrate
            ? `Moved ${res.movedFiles} ${res.movedFiles === 1 ? 'file' : 'files'} (${fmtBytes(res.movedBytes)}) to ${res.newPath}`
            : `New downloads go to ${res.newPath}. Existing files stay where they are.`,
        })
        await Promise.all([fetchStorage(), loadServerStorage()])
      }
    } catch (e: any) {
      migrateError = e?.message ?? `Failed to change ${migrateKind === 'local' ? 'local source' : 'downloads'} path`
    } finally { migrating = false }
  }

  const startMigration = () => applyRelocation(true)
  const switchWithoutMigration = () => applyRelocation(false)

  function dismissMigration() {
    if (migrateKind === 'local') localSourcePathInput = confirmedLocalSourcePath
    else downloadsPathInput = confirmedDownloadsPath
    migrateFrom = null; migrateTo = null; migrateError = null; migrateProgress = null
  }

  async function browseDownloadsFolder() {
    const picked = await platformService.pickFolder()
    if (picked) { downloadsPathInput = picked; pathsFieldError = { ...pathsFieldError, dl: undefined }; await savePaths() }
  }

  async function browseLocalSourceFolder() {
    const picked = await platformService.pickFolder()
    if (picked) { localSourcePathInput = picked; pathsFieldError = { ...pathsFieldError, loc: undefined }; await savePaths() }
  }

  async function browseExtraScanDir() {
    const picked = await platformService.pickFolder()
    if (picked) { newScanDir = picked; addExtraScanDir() }
  }

  function addExtraScanDir() {
    const dir = newScanDir.trim()
    if (!dir || extraScanDirs.includes(dir)) return
    extraScanDirs = [...extraScanDirs, dir]
    updateSettings({ extraScanDirs }); newScanDir = ''; fetchStorage()
  }

  function removeExtraScanDir(path: string) {
    extraScanDirs = extraScanDirs.filter(d => d !== path)
    updateSettings({ extraScanDirs }); fetchStorage()
  }

  function fmtBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0)} ${units[i]}`
  }

  let backupLoading = $state(false)
  let backupError   = $state<string | null>(null)
  let backupList    = $state<{ url: string; name: string; deleting?: boolean }[]>([])

  let srvStorage    = $state<import('$lib/server-adapters/types').StorageInfo | null>(null)
  let srvLoading    = $state(false)
  let srvError      = $state<string | null>(null)
  let srvClearing   = $state<string | null>(null)

  let dbBackups        = $state<import('$lib/server-adapters/types').DatabaseBackup[]>([])
  let dbBackupsErr     = $state<string | null>(null)
  let backingUp        = $state(false)
  let deletingBk       = $state<string | null>(null)
  let exportingMihon   = $state(false)
  let importingMihon   = $state<string | null>(null)
  let importingFile    = $state(false)

  async function loadServerStorage() {
    srvLoading = true; srvError = null
    try { srvStorage = await tsunagu.storageInfo() }
    catch (e) { srvError = e instanceof Error ? e.message : String(e); srvStorage = null }
    finally { srvLoading = false }
  }

  async function clearCategory(key: string) {
    if (srvClearing) return
    srvClearing = key
    try {
      srvStorage = await tsunagu.clearStorageCategory(key)
      toast({ kind: 'success', title: 'Cleared', body: key })
    } catch (e) {
      toast({ kind: 'error', title: 'Clear failed', body: e instanceof Error ? e.message : String(e) })
    } finally { srvClearing = null }
  }

  async function loadDbBackups() {
    dbBackupsErr = null
    try { dbBackups = await tsunagu.databaseBackups() }
    catch (e) { dbBackupsErr = e instanceof Error ? e.message : String(e); dbBackups = [] }
  }

  async function makeDbBackup() {
    if (backingUp) return
    backingUp = true
    try {
      await tsunagu.createDatabaseBackup()
      await loadDbBackups()
      toast({ kind: 'success', title: 'Database backed up' })
    } catch (e) {
      toast({ kind: 'error', title: 'Backup failed', body: e instanceof Error ? e.message : String(e) })
    } finally { backingUp = false }
  }

  async function deleteDbBackup(name: string) {
    if (deletingBk) return
    deletingBk = name
    try {
      await tsunagu.deleteDatabaseBackup(name)
      dbBackups = dbBackups.filter(b => b.name !== name)
    } catch (e) {
      toast({ kind: 'error', title: 'Delete failed', body: e instanceof Error ? e.message : String(e) })
    } finally { deletingBk = null }
  }

  async function exportMihon() {
    if (exportingMihon) return
    exportingMihon = true
    try {
      await tsunagu.exportMihonBackup()
      await loadDbBackups()
      toast({ kind: 'success', title: 'Library exported', body: 'Manga and light novels only — anime titles are not included.' })
    } catch (e) {
      toast({ kind: 'error', title: 'Export failed', body: e instanceof Error ? e.message : String(e) })
    } finally { exportingMihon = false }
  }

  async function importMihon(name: string) {
    if (importingMihon) return
    importingMihon = name
    try {
      const res = await tsunagu.importMihonBackup(name)
      const parts = [`${res.mangaImported} imported`]
      if (res.mangaSkipped) parts.push(`${res.mangaSkipped} skipped (source not installed)`)
      if (res.trackingImported) parts.push(`${res.trackingImported} tracking links`)
      toast({ kind: res.mangaSkipped ? 'error' : 'success', title: 'Library imported', body: parts.join(' · ') })
      if (res.warnings.length) {
        for (const w of res.warnings.slice(0, 5)) toast({ kind: 'error', title: 'Import warning', body: w })
      }
      const { loadLibrary } = await import('$lib/state/library.svelte')
      await loadLibrary(true)
    } catch (e) {
      toast({ kind: 'error', title: 'Import failed', body: e instanceof Error ? e.message : String(e) })
    } finally { importingMihon = null }
  }

  function getServerUrl(): string {
    const url = settingsState.settings.serverUrl
    return typeof url === 'string' && url.trim() ? url.replace(/\/$/, '') : 'http://localhost:6007'
  }

  async function importBackupFile() {
    if (importingFile) return
    const path = await platformService.pickFile(['tachibk'])
    if (!path) return
    importingFile = true
    try {
      const bytes    = await platformService.readFile(path)
      const filename = path.split(/[\\/]/).pop() || 'backup.tachibk'
      const form = new FormData()
      form.append('file', new Blob([bytes]), filename)
      const res = await fetch(`${getServerUrl()}/api/backups/import-file`, {
        method:  'POST',
        headers: authHeaders(),
        body:    form,
      })
      if (!res.ok) throw new Error(await res.text())
      const result = await res.json()
      const parts = [`${result.mangaImported} imported`]
      if (result.mangaSkipped) parts.push(`${result.mangaSkipped} skipped (source not installed)`)
      if (result.trackingImported) parts.push(`${result.trackingImported} tracking links`)
      toast({ kind: result.mangaSkipped ? 'error' : 'success', title: 'Library imported', body: parts.join(' · ') })
      if (result.warnings?.length) {
        for (const w of result.warnings.slice(0, 5)) toast({ kind: 'error', title: 'Import warning', body: w })
      }
      await loadDbBackups()
      const { loadLibrary } = await import('$lib/state/library.svelte')
      await loadLibrary(true)
    } catch (e) {
      toast({ kind: 'error', title: 'Import failed', body: e instanceof Error ? e.message : String(e) })
    } finally { importingFile = false }
  }

  async function loadBackupList() {
    backupList = (await loadBackups()).map(b => ({ ...b }))
  }

  async function saveBackupList() {
    await saveBackups(backupList.map(({ url, name }) => ({ url, name })))
  }

  let appDataExporting = $state(false)
  let appDataImporting = $state(false)
  let appDataError     = $state<string | null>(null)
  let appDataMsg       = $state<string | null>(null)
  let appDataBackupDir = $state<string | null>(null)

  $effect(() => {
    if (!supportsFilesystem) return
    platformService.getAutoBackupDir().then(d => { appDataBackupDir = d }).catch(() => {})
  })

  async function handleExportAppData() {
    appDataExporting = true; appDataError = null; appDataMsg = null
    try {
      await exportAppData()
      appDataMsg = 'Backup saved.'
      setTimeout(() => appDataMsg = null, 3000)
    } catch (e: any) {
      if (String(e).includes('Cancelled')) return
      appDataError = e?.message ?? String(e)
    } finally { appDataExporting = false }
  }

  async function handleImportAppData() {
    appDataImporting = true; appDataError = null; appDataMsg = null
    try {
      await importAppData()
    } catch (e: any) {
      if (String(e).includes('Cancelled')) { appDataImporting = false; return }
      appDataError = e?.message ?? String(e)
      appDataImporting = false
    }
  }

  let mangaFormat     = $state<'loose' | 'cbz'>('loose')
  let formatBusy      = $state(false)
  let formatMigrating = $state(false)

  async function loadMangaFormat() {
    try {
      const all = await tsunagu.serverSettings()
      const v = all.find(s => s.key === 'manga_download_format')?.value
      if (v === 'cbz' || v === 'loose') mangaFormat = v
    } catch { /* keep default */ }
  }

  async function setMangaFormat(v: 'loose' | 'cbz') {
    if (formatBusy || v === mangaFormat) return
    formatBusy = true
    try {
      const r = await tsunagu.updateServerSetting('manga_download_format', v)
      mangaFormat = r.setting.value === 'cbz' ? 'cbz' : 'loose'
    } catch (e: any) {
      toast({ kind: 'error', title: 'Manga download format', body: e?.message ?? String(e) })
    } finally { formatBusy = false }
  }

  async function migrateMangaFormat() {
    if (formatMigrating) return
    formatMigrating = true
    try {
      const res = await tsunagu.migrateMangaDownloadFormat(mangaFormat)
      const parts: string[] = []
      if (res.chaptersMigrated > 0) parts.push(`Converted ${res.chaptersMigrated} ${res.chaptersMigrated === 1 ? 'chapter' : 'chapters'} (${res.pagesMigrated} pages).`)
      if (res.chaptersFailed > 0) parts.push(`${res.chaptersFailed} failed, check the server log.`)
      toast({
        kind: res.chaptersFailed > 0 ? 'error' : 'success',
        title: res.chaptersMigrated > 0 ? 'Downloads converted' : 'Nothing to convert',
        body: parts.length > 0 ? parts.join(' ') : `All downloaded chapters are already ${mangaFormat === 'cbz' ? 'CBZ' : 'loose images'}.`,
      })
    } catch (e: any) {
      toast({ kind: 'error', title: 'Migration failed', body: e?.message ?? String(e) })
    } finally { formatMigrating = false }
  }

  $effect(() => { untrack(() => { loadBackupList(); fetchStorage(); loadServerStorage(); loadDbBackups(); loadMangaFormat() }) })
</script>

<div class="s-panel">

  {#if migrateTo !== null}
    <div class="s-migrate-banner">
      <div class="s-migrate-body">
        <span class="s-migrate-title">
          {migrateKind === 'local' ? 'Move existing local media to the new path?' : 'Move existing downloads to the new path?'}
        </span>
        <span class="s-migrate-paths">{migrateFrom || 'current path'} → {migrateTo || (migrateKind === 'local' ? 'media_dir/local' : 'server default')}</span>
        <span class="s-desc">
          {migrateKind === 'local'
            ? "Migrate moves your local files over; switching without moving just points the scanner at the new folder."
            : "Migrate moves your downloaded files over; switching without moving only sends new downloads to the new folder."}
        </span>
        {#if migrating && !migrateProgress}<span class="s-desc">Working…</span>{/if}
        {#if migrateError}<span class="s-desc" style="color:var(--color-error)">{migrateError}</span>{/if}
      </div>
      <div class="s-migrate-actions">
        <button class="s-btn s-btn-accent" onclick={startMigration} disabled={migrating}>
          {migrating ? 'Migrating…' : 'Migrate'}
        </button>
        <button class="s-btn" onclick={switchWithoutMigration} disabled={migrating}>Switch without moving</button>
        <button class="s-btn" onclick={dismissMigration} disabled={migrating}>Cancel</button>
      </div>
    </div>
  {/if}

  <div class="s-section">
    <p class="s-section-title">
      Disk Usage
      <button class="s-btn" onclick={() => { loadServerStorage(); fetchStorage() }} disabled={srvLoading || storageLoading}>{srvLoading || storageLoading ? '…' : '↻'}</button>
    </p>
    <div class="s-section-body">
      {#if srvStorage}
        {@const limitGb    = settingsState.settings.storageLimitGb ?? null}
        {@const limitBytes = limitGb !== null ? limitGb * 1024 ** 3 : null}
        {@const cap        = limitBytes !== null ? Math.min(limitBytes, srvStorage.totalBytes) : srvStorage.totalBytes}
        {@const pct        = cap > 0 ? Math.min(100, (srvStorage.usedBytes / cap) * 100) : 0}
        <div class="s-storage-wrap">
          <div class="s-storage-header">
            <span class="s-storage-label">Server data</span>
            <span class="s-storage-used">{fmtBytes(srvStorage.usedBytes)} of {fmtBytes(cap)}</span>
          </div>
          <div class="s-storage-bar">
            <div class="s-storage-fill" class:critical={pct > 90} class:warn={pct > 75 && pct <= 90} style="width:{pct}%"></div>
          </div>
          <div class="s-storage-footer">
            <span>{srvStorage.mediaDir ?? srvStorage.dataDir ?? ''}</span>
            <span>{fmtBytes(srvStorage.freeBytes)} free</span>
          </div>
        </div>
        {#each srvStorage.categories ?? [] as c (c.key)}
          <div class="s-row">
            <div class="s-row-info"><span class="s-label">{c.label}</span></div>
            <span class="s-desc" style="flex-shrink:0;white-space:nowrap">{fmtBytes(c.bytes)} · {c.fileCount} {c.fileCount === 1 ? 'file' : 'files'}</span>
          </div>
        {/each}
      {:else if multiStorageInfos.length > 0}
        {#each multiStorageInfos as info}
          {@const limitGb    = settingsState.settings.storageLimitGb ?? null}
          {@const limitBytes = limitGb !== null ? limitGb * 1024 ** 3 : null}
          {@const available  = info.manga_bytes + info.free_bytes}
          {@const cap        = limitBytes !== null ? Math.min(limitBytes, available) : available}
          {@const pct        = cap > 0 ? Math.min(100, (info.manga_bytes / cap) * 100) : 0}
          <div class="s-storage-wrap">
            <div class="s-storage-header">
              <span class="s-storage-label">{info.label}</span>
              <span class="s-storage-used">{fmtBytes(info.manga_bytes)} of {fmtBytes(cap)}</span>
            </div>
            <div class="s-storage-bar">
              <div class="s-storage-fill" class:critical={pct > 90} class:warn={pct > 75 && pct <= 90} style="width:{pct}%"></div>
            </div>
            <div class="s-storage-footer">
              <span>{info.path}</span>
              <span>{fmtBytes(info.free_bytes)} free</span>
            </div>
          </div>
        {/each}
      {:else if srvLoading || storageLoading}
        <p class="s-empty">Reading storage…</p>
      {:else if srvError || storageError}
        <p class="s-empty" style="color:var(--color-error)">{srvError ?? storageError}</p>
      {:else if !supportsFilesystem}
        <p class="s-empty">Disk usage is unavailable in web mode.</p>
      {:else}
        <p class="s-empty">No storage data available.</p>
      {/if}
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Downloads Path</p>
    <div class="s-section-body">
      {#if isExternalServer}
        <div class="s-row">
          <span class="s-desc">Read from the external server. Edits update its config directly.</span>
        </div>
      {/if}
      <div class="s-row" style="gap:var(--sp-2)">
        <input class="s-input full" class:error={!!pathsFieldError.dl}
          bind:value={downloadsPathInput}
          placeholder={defaultDownloadsPath || 'Default location'}
          spellcheck="false"
          onkeydown={(e) => e.key === 'Enter' && savePaths()}
          oninput={() => { pathsFieldError = { ...pathsFieldError, dl: undefined } }} />
        {#if !isExternalServer && supportsFilesystem}
          <button class="s-btn" onclick={browseDownloadsFolder}>Browse</button>
        {/if}
        {#if canOpenFolder()}
          <button class="s-btn" onclick={() => openCustomFolder(confirmedDownloadsPath.trim() || defaultDownloadsPath)}>Open folder</button>
        {/if}
      </div>
      <div class="s-row">
        <div class="s-row-info">
          {#if pathsFieldError.dl}
            <span class="s-desc" style="color:var(--color-error)">{pathsFieldError.dl}</span>
          {/if}
          {#if pathsError}
            <span class="s-desc" style="color:var(--color-error)">{pathsError}</span>
          {/if}
        </div>
        <div class="s-btn-row">
          {#if pathsFieldError.dl && !isExternalServer && supportsFilesystem}
            <button class="s-btn" onclick={async () => {
              try { await createDirectory(downloadsPathInput.trim()); pathsFieldError = { ...pathsFieldError, dl: undefined } }
              catch (e: any) { pathsFieldError = { ...pathsFieldError, dl: e?.message ?? 'Failed' } }
            }}>Create</button>
          {/if}
          {#if downloadsPathInput.trim() !== confirmedDownloadsPath}
            <button class="s-btn s-btn-accent" onclick={savePaths} disabled={pathsSaving}>
              {pathsSaved ? 'Saved ✓' : pathsSaving ? 'Saving…' : 'Save'}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Manga Download Format</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">Store new chapters as</span>
          <span class="s-desc">CBZ packs each chapter into one archive file.</span>
        </div>
        <div class="s-btn-row">
          <button class="s-btn" class:s-btn-accent={mangaFormat === 'loose'} disabled={formatBusy} onclick={() => setMangaFormat('loose')}>Loose images</button>
          <button class="s-btn" class:s-btn-accent={mangaFormat === 'cbz'} disabled={formatBusy} onclick={() => setMangaFormat('cbz')}>CBZ archive</button>
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">Convert existing downloads</span>
          <span class="s-desc">Repacks everything already downloaded into the format above.</span>
        </div>
        <button class="s-btn s-btn-accent" disabled={formatMigrating} onclick={migrateMangaFormat}>
          <ArrowsClockwise size={13} />
          {formatMigrating ? 'Converting…' : 'Convert'}
        </button>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Storage Limit</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">Warn when limit is reached</span>
          <span class="s-desc">{settingsState.settings.storageLimitGb === null ? 'No limit set' : `Warn above ${settingsState.settings.storageLimitGb} GB`}</span>
        </div>
        {#if settingsState.settings.storageLimitGb === null}
          <button class="s-btn" onclick={() => updateSettings({ storageLimitGb: 10 })}>Set limit</button>
        {:else}
          <div class="s-stepper">
            <button class="s-step-btn" onclick={() => updateSettings({ storageLimitGb: Math.max(1, (settingsState.settings.storageLimitGb ?? 10) - 1) })} disabled={(settingsState.settings.storageLimitGb ?? 10) <= 1}>−</button>
            <input type="number" min="1" step="1" class="s-slider-val" style="width:52px"
              value={settingsState.settings.storageLimitGb}
              oninput={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n) && n > 0) updateSettings({ storageLimitGb: n }) }} />
            <span class="s-slider-unit">GB</span>
            <button class="s-step-btn" onclick={() => updateSettings({ storageLimitGb: (settingsState.settings.storageLimitGb ?? 10) + 1 })}>+</button>
            <button class="s-btn-icon" title="Remove limit" onclick={() => updateSettings({ storageLimitGb: null })}>↺</button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="s-section">
    <button class="s-collapsible-trigger" onclick={() => advStorageOpen = !advStorageOpen}>
      <span class="s-label">Advanced</span>
      <svg class="s-collapsible-caret" class:open={advStorageOpen} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
    </button>
    {#if advStorageOpen}
      <div class="s-collapsible-body">
        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Local source path</span>
            <span class="s-desc">Read manga, anime, or novels already on disk without an extension.</span>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <div class="s-btn-row">
              <input class="s-input mono" class:error={!!pathsFieldError.loc}
                bind:value={localSourcePathInput} placeholder="Optional" spellcheck="false"
                onkeydown={(e) => e.key === 'Enter' && savePaths()}
                oninput={() => { pathsFieldError = { ...pathsFieldError, loc: undefined } }} />
              {#if !isExternalServer && supportsFilesystem}
                <button class="s-btn" onclick={browseLocalSourceFolder}>Browse</button>
              {/if}
              {#if pathsFieldError.loc && !isExternalServer && supportsFilesystem}
                <button class="s-btn" onclick={async () => {
                  try { await createDirectory(localSourcePathInput.trim()); pathsFieldError = { ...pathsFieldError, loc: undefined } }
                  catch (e: any) { pathsFieldError = { ...pathsFieldError, loc: e?.message ?? 'Failed' } }
                }}>Create</button>
              {/if}
              <button class="s-btn" onclick={rescanLocal} disabled={rescanning}>{rescanning ? 'Scanning…' : 'Rescan'}</button>
            </div>
            {#if pathsFieldError.loc}<span class="s-desc" style="color:var(--color-error)">{pathsFieldError.loc}</span>{/if}
          </div>
        </div>

        {#each extraScanDirs as dir}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label mono" style="font-family:monospace;font-size:var(--text-xs)">{dir}</span>
              <span class="s-desc">Extra scan directory</span>
            </div>
            <button class="s-btn s-btn-danger" onclick={() => removeExtraScanDir(dir)}>Remove</button>
          </div>
        {/each}

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Additional scan path</span>
            <span class="s-desc">Include an extra directory in disk usage readings</span>
          </div>
          <div class="s-btn-row">
            <input class="s-input mono" bind:value={newScanDir} placeholder="/path/to/dir" spellcheck="false"
              onkeydown={(e) => e.key === 'Enter' && addExtraScanDir()} />
            {#if !isExternalServer && supportsFilesystem}
              <button class="s-btn" onclick={browseExtraScanDir}>Browse</button>
            {/if}
          </div>
        </div>

        {#if (srvStorage?.categories ?? []).some(c => c.clearable)}
          <p class="s-subsection-title">Clear caches</p>
          {#if srvError}<div class="s-banner s-banner-error">{srvError}</div>{/if}
          {#each (srvStorage?.categories ?? []).filter(c => c.clearable) as c (c.key)}
            <div class="s-row">
              <div class="s-row-info">
                <span class="s-label">{c.label}</span>
                <span class="s-desc">{fmtBytes(c.bytes)} · {c.fileCount} {c.fileCount === 1 ? 'file' : 'files'}</span>
              </div>
              <button class="s-btn s-btn-danger" disabled={srvClearing === c.key || c.bytes === 0} onclick={() => clearCategory(c.key)}>
                {srvClearing === c.key ? '…' : 'Clear'}
              </button>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  </div>

  <div class="s-section">
    <button class="s-collapsible-trigger" onclick={() => backupSectionOpen = !backupSectionOpen}>
      <span class="s-label">Backup</span>
      <svg class="s-collapsible-caret" class:open={backupSectionOpen} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
    </button>
    {#if backupSectionOpen}
      <div class="s-collapsible-body">

        <p class="s-subsection-title">Database backup</p>

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Server database</span>
            <span class="s-desc">Full SQLite snapshot.</span>
          </div>
          <button class="s-btn s-btn-accent" onclick={makeDbBackup} disabled={backingUp}>{backingUp ? 'Backing up…' : 'Back up now'}</button>
        </div>

        {#if dbBackupsErr}<div class="s-banner s-banner-error">{dbBackupsErr}</div>{/if}

        {#each dbBackups.filter(b => b.kind === 'sqlite') as b (b.name)}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label mono" style="font-family:monospace;font-size:var(--text-xs)">{b.name}</span>
              <span class="s-desc">{fmtBytes(b.bytes)} · {new Date(b.createdAt).toLocaleString()}</span>
            </div>
            <div class="s-btn-row">
              <button class="s-btn" onclick={() => platformService.openPath(b.path)}>Reveal</button>
              <button class="s-btn s-btn-danger" disabled={deletingBk === b.name} onclick={() => deleteDbBackup(b.name)}>
                {deletingBk === b.name ? '…' : 'Delete'}
              </button>
            </div>
          </div>
        {/each}

        <p class="s-subsection-title">Library backup (Tachiyomi format)</p>

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Export library</span>
            <span class="s-desc">Manga and novels only, no anime.</span>
          </div>
          <button class="s-btn s-btn-accent" onclick={exportMihon} disabled={exportingMihon}>{exportingMihon ? 'Exporting…' : 'Export'}</button>
        </div>

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Import a backup</span>
            <span class="s-desc">Pick a <span style="font-family:monospace">.tachibk</span> file.</span>
          </div>
          {#if supportsFilesystem}
            <button class="s-btn s-btn-accent" disabled={importingFile} onclick={importBackupFile}>
              {importingFile ? 'Importing…' : 'Import file'}
            </button>
          {/if}
        </div>

        {#each dbBackups.filter(b => b.kind === 'mihon') as b (b.name)}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label mono" style="font-family:monospace;font-size:var(--text-xs)">{b.name}</span>
              <span class="s-desc">{fmtBytes(b.bytes)} · {new Date(b.createdAt).toLocaleString()}</span>
            </div>
            <div class="s-btn-row">
              <button class="s-btn" onclick={() => platformService.openPath(b.path)}>Reveal</button>
              <button class="s-btn s-btn-accent" disabled={importingMihon === b.name} onclick={() => importMihon(b.name)}>
                {importingMihon === b.name ? 'Importing…' : 'Import'}
              </button>
              <button class="s-btn s-btn-danger" disabled={deletingBk === b.name} onclick={() => deleteDbBackup(b.name)}>
                {deletingBk === b.name ? '…' : 'Delete'}
              </button>
            </div>
          </div>
        {/each}

        <p class="s-subsection-title">App data backup</p>

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Export settings</span>
            <span class="s-desc">Save all Moku app settings to a .zip via a native save dialog.</span>
          </div>
          <button class="s-btn s-btn-accent" onclick={handleExportAppData} disabled={appDataExporting || !supportsFilesystem}>
            {appDataExporting ? 'Saving…' : 'Export'}
          </button>
        </div>

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Import settings</span>
            <span class="s-desc">Restore from a .zip file.</span>
          </div>
          <button class="s-btn" onclick={handleImportAppData} disabled={appDataImporting || !supportsFilesystem}>
            {appDataImporting ? 'Importing…' : 'Import'}
          </button>
        </div>

        {#if appDataError}
          <div class="s-banner s-banner-error">{appDataError}</div>
        {/if}

        {#if appDataMsg}
          <div class="s-row">
            <span class="s-desc" style="color:var(--color-success,#4caf50)">{appDataMsg}</span>
          </div>
        {/if}

        {#if appDataBackupDir}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label">Auto-backup location</span>
              <span class="s-desc">Pre-update snapshots are kept here (last 5).</span>
            </div>
            <button class="s-btn" onclick={() => platformService.openPath(appDataBackupDir!)}>Open folder</button>
          </div>
        {/if}

      </div>
    {/if}
  </div>

  <div class="s-section">
    <button class="s-collapsible-trigger" onclick={() => resetSectionOpen = !resetSectionOpen}>
      <span class="s-label">Reset</span>
      <svg class="s-collapsible-caret" class:open={resetSectionOpen} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
    </button>
    {#if resetSectionOpen}
      <div class="s-collapsible-body">
        {#each resetItems as item}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label">{item.label}</span>
              <span class="s-desc">{item.desc}</span>
              {#if item.error}<span class="s-desc" style="color:var(--color-error)">{item.error}</span>{/if}
            </div>
            <div class="s-btn-row">
              {#if item.state === 'done'}
                <span class="s-pill on">Done</span>
              {:else if item.state === 'busy'}
                <button class="s-btn" disabled>Working…</button>
              {:else if confirming === item.key}
                <span class="s-desc" style="color:var(--text-muted)">Sure?</span>
                <button class="s-btn s-btn-danger" onclick={() => runReset(item.key)}>Confirm</button>
                <button class="s-btn" onclick={() => confirming = null}>Cancel</button>
              {:else}
                <button
                  class="s-btn"
                  class:s-btn-danger={item.confirm}
                  onclick={() => item.confirm ? (confirming = item.key) : runReset(item.key)}
                >Reset</button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

</div>