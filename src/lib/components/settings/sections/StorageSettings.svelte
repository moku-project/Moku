<script lang="ts">
  import { Trash, ClockCounterClockwise, ArrowsClockwise } from 'phosphor-svelte'
  import { untrack } from 'svelte'
  import { platformService } from '$lib/platform-service'
  import { addToast as toast } from '$lib/state/notifications.svelte'
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'
  import { exportAppData, importAppData } from '$lib/core/backup'
  import { loadBackups, saveBackups, saveSettings } from '$lib/core/persistence/persist'
  import { DEFAULT_SETTINGS } from '$lib/types/settings'
  import { historyState } from '$lib/state/history.svelte'
  import { clearBlobCache } from '$lib/core/cache/imageCache'
  import { cache as queryCache } from '$lib/core/cache/queryCache'
  import { tsunagu } from '$lib/server-adapters/tsunagu'
  import { canOpenFolder, openCustomFolder, revealFile, isLocalServer } from '$lib/core/filesystem'
  import { authHeaders } from '$lib/state/auth.svelte'
  import { t, tSplit, type MessageKey } from '$lib/i18n/index.svelte'
  const importPick = $derived(tSplit('settings.storage.importBackupPick', 'file'))

  // The server names its storage categories in English; known ones are shown in the app's language.
  const CATEGORY_LABELS: Record<string, MessageKey> = {
    database:      'settings.storage.categories.database',
    covers:        'settings.storage.categories.covers',
    icons:         'settings.storage.categories.icons',
    localSource:   'settings.storage.categories.localSource',
    downloads:     'settings.storage.categories.downloads',
    jarCache:      'settings.storage.categories.jarCache',
    extensions:    'settings.storage.categories.extensions',
    pluginStorage: 'settings.storage.categories.pluginStorage',
    logs:          'settings.storage.categories.logs',
  }
  const categoryLabel = (c: { key: string; label: string }) => CATEGORY_LABELS[c.key] ? t(CATEGORY_LABELS[c.key]) : c.label

  const supportsFilesystem = platformService.isSupported('filesystem')

  type ResetState = 'idle' | 'busy' | 'done' | 'error'
  interface ResetItem { key: string; label: MessageKey; desc: MessageKey; state: ResetState; error: string | null; confirm: boolean }

  let resetItems = $state<ResetItem[]>([
    { key: 'all-cache',       label: 'settings.storage.resetAllCache',      desc: 'settings.storage.resetAllCacheDesc', state: 'idle', error: null, confirm: false },
    { key: 'reading-history', label: 'settings.storage.resetHistory', desc: 'settings.storage.resetHistoryDesc',                                                  state: 'idle', error: null, confirm: true  },
    { key: 'reading-stats',   label: 'settings.storage.resetStats',   desc: 'settings.storage.resetStatsDesc',                         state: 'idle', error: null, confirm: true  },
    { key: 'moku-settings',   label: 'settings.storage.resetSettings',   desc: 'settings.storage.resetSettingsDesc',                                                       state: 'idle', error: null, confirm: true  },
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
      title.textContent = t('settings.storage.exitTitle')
      header.appendChild(title)
      const body = document.createElement('div')
      body.style.cssText = 'padding:var(--sp-4) var(--sp-5);display:flex;flex-direction:column;gap:var(--sp-2)'
      const sub = document.createElement('p')
      sub.style.cssText = 'margin:0;font-family:var(--font-ui);font-size:var(--text-xs);color:var(--text-faint);letter-spacing:var(--tracking-wide);line-height:var(--leading-snug)'
      sub.textContent = t('settings.storage.exitBody')
      const counter = document.createElement('p')
      counter.style.cssText = 'margin:0;font-family:var(--font-ui);font-size:var(--text-xs);color:var(--text-faint);letter-spacing:var(--tracking-wide)'
      counter.textContent = t('settings.storage.closingIn', { count: 3 })
      body.append(sub, counter)
      const footer = document.createElement('div')
      footer.style.cssText = 'padding:var(--sp-3) var(--sp-5);border-top:1px solid var(--border-dim);display:flex;justify-content:flex-end'
      const btn = document.createElement('button')
      btn.className = 's-btn s-btn-danger'
      btn.textContent = t('settings.storage.closeNow')
      footer.appendChild(btn)
      modal.append(header, body, footer)
      backdrop.appendChild(modal)
      document.body.appendChild(backdrop)
      let secs = 3
      const tick = setInterval(() => {
        secs--
        counter.textContent = secs > 0 ? t('settings.storage.closingIn', { count: secs }) : t('settings.storage.closing')
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
          await historyState.clearHistory()
          break
        case 'reading-stats':
          await historyState.resetStats()
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
      toast({ kind: 'success', title: t('settings.storage.rescannedToast'), body: t('settings.storage.localTitleCount', { count: found.length }) })
    } catch (e) {
      toast({ kind: 'error', title: t('settings.storage.rescanFailedToast'), body: String(e) })
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
  let multiStorageInfos = $state<(StorageInfo & { label: string; labelKey: MessageKey | undefined })[]>([])
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
      const dirsToScan: { path: string; label: string; labelKey: MessageKey | undefined }[] = []
      if (effectiveDl) dirsToScan.push({ path: effectiveDl, label: effectiveDl, labelKey: dl ? 'settings.storage.dirDownloads' : 'settings.storage.dirDownloadsDefault' })
      if (loc && loc !== effectiveDl) dirsToScan.push({ path: loc, label: loc, labelKey: 'settings.storage.dirLocalSource' })
      for (const p of extraScanDirs) {
        if (p && !dirsToScan.find(d => d.path === p)) dirsToScan.push({ path: p, label: p, labelKey: undefined })
      }
      if (dirsToScan.length === 0) { multiStorageInfos = []; storageInfo = null; return }
      const results = await Promise.allSettled(
        dirsToScan.map(d => platformService.getStorageInfo(d.path).then(info => ({ ...info, label: d.label, labelKey: d.labelKey })))
      )
      multiStorageInfos = results
        .filter((r): r is PromiseFulfilledResult<StorageInfo & { label: string; labelKey: MessageKey | undefined }> => r.status === 'fulfilled')
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
      return exists ? null : t('settings.storage.dirMissing')
    } catch { return t('settings.storage.pathCheckFailed') }
  }

  async function createDirectory(path: string): Promise<void> {
    if (isExternalServer) throw new Error(t('settings.storage.createDirExternal'))
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
          title: migrate ? t('settings.storage.localMigratedToast') : t('settings.storage.localChangedToast'),
          body: migrate
            ? t('settings.storage.movedFiles', { count: res.movedFiles, size: fmtBytes(res.movedBytes), path: res.newPath })
            : t('settings.storage.localChangedBody', { path: res.newPath }),
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
          title: migrate ? t('settings.storage.downloadsMigratedToast') : t('settings.storage.downloadsChangedToast'),
          body: migrate
            ? t('settings.storage.movedFiles', { count: res.movedFiles, size: fmtBytes(res.movedBytes), path: res.newPath })
            : t('settings.storage.downloadsChangedBody', { path: res.newPath }),
        })
        await Promise.all([fetchStorage(), loadServerStorage()])
      }
    } catch (e: any) {
      migrateError = e?.message ?? (migrateKind === 'local' ? t('settings.storage.changeLocalFailed') : t('settings.storage.changeDownloadsFailed'))
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

  let autoBackupIntervalHours = $state<number | null>(null)
  let autoBackupRetention     = $state<number | null>(null)
  let autoBackupBusy          = $state(false)
  let autoBackupRestartNote   = $state(false)

  async function loadAutoBackupSettings() {
    try {
      const all = await tsunagu.serverSettings()
      autoBackupIntervalHours = Number(all.find(s => s.key === 'backup_interval_hours')?.value ?? 24)
      autoBackupRetention     = Number(all.find(s => s.key === 'backup_retention_count')?.value ?? 7)
    } catch { autoBackupIntervalHours = null; autoBackupRetention = null }
  }

  async function setAutoBackupSetting(key: 'backup_interval_hours' | 'backup_retention_count', value: number) {
    if (autoBackupBusy) return
    autoBackupBusy = true
    try {
      const r = await tsunagu.updateServerSetting(key, String(value))
      if (key === 'backup_interval_hours') autoBackupIntervalHours = Number(r.setting.value)
      else autoBackupRetention = Number(r.setting.value)
      if (r.restartRequired) autoBackupRestartNote = true
    } catch (e) {
      toast({ kind: 'error', title: t('settings.storage.autoBackupToast'), body: e instanceof Error ? e.message : String(e) })
    } finally { autoBackupBusy = false }
  }

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
      toast({ kind: 'success', title: t('settings.storage.clearedToast'), body: key })
    } catch (e) {
      toast({ kind: 'error', title: t('settings.storage.clearFailedToast'), body: e instanceof Error ? e.message : String(e) })
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
      toast({ kind: 'success', title: t('settings.storage.dbBackedUpToast') })
    } catch (e) {
      toast({ kind: 'error', title: t('settings.storage.backupFailedToast'), body: e instanceof Error ? e.message : String(e) })
    } finally { backingUp = false }
  }

  async function deleteDbBackup(name: string) {
    if (deletingBk) return
    deletingBk = name
    try {
      await tsunagu.deleteDatabaseBackup(name)
      dbBackups = dbBackups.filter(b => b.name !== name)
    } catch (e) {
      toast({ kind: 'error', title: t('settings.storage.deleteFailedToast'), body: e instanceof Error ? e.message : String(e) })
    } finally { deletingBk = null }
  }

  async function exportMihon() {
    if (exportingMihon) return
    exportingMihon = true
    try {
      await tsunagu.exportMihonBackup()
      await loadDbBackups()
      toast({ kind: 'success', title: t('settings.storage.exportedToast'), body: t('settings.storage.exportedToastBody') })
    } catch (e) {
      toast({ kind: 'error', title: t('settings.storage.exportFailedToast'), body: e instanceof Error ? e.message : String(e) })
    } finally { exportingMihon = false }
  }

  async function importMihon(name: string) {
    if (importingMihon) return
    importingMihon = name
    try {
      const res = await tsunagu.importMihonBackup(name)
      const parts = [t('settings.storage.importedCount', { count: res.mangaImported })]
      if (res.mangaSkipped) parts.push(t('settings.storage.skippedCount', { count: res.mangaSkipped }))
      if (res.trackingImported) parts.push(t('settings.storage.trackingLinksCount', { count: res.trackingImported }))
      toast({ kind: res.mangaSkipped ? 'error' : 'success', title: t('settings.storage.importedToast'), body: parts.join(' · ') })
      if (res.warnings.length) {
        for (const w of res.warnings.slice(0, 5)) toast({ kind: 'error', title: t('settings.storage.importWarningToast'), body: w })
      }
      const { loadLibrary } = await import('$lib/state/library.svelte')
      await loadLibrary(true)
    } catch (e) {
      toast({ kind: 'error', title: t('settings.storage.importFailedToast'), body: e instanceof Error ? e.message : String(e) })
    } finally { importingMihon = null }
  }

  function getServerUrl(): string {
    const url = settingsState.settings.serverUrl
    return typeof url === 'string' && url.trim() ? url.replace(/\/$/, '') : 'http://localhost:6007'
  }

  async function importBackupFile() {
    if (importingFile) return
    try {
      const bytes = await platformService.importMihonBackupFile()
      if (!bytes) return
      importingFile = true
      const form = new FormData()
      form.append('file', new Blob([bytes]), 'backup.tachibk')
      const res = await fetch(`${getServerUrl()}/api/backups/import-file`, {
        method:  'POST',
        headers: authHeaders(),
        body:    form,
      })
      if (!res.ok) throw new Error(await res.text())
      const result = await res.json()
      const parts = [t('settings.storage.importedCount', { count: result.mangaImported })]
      if (result.mangaSkipped) parts.push(t('settings.storage.skippedCount', { count: result.mangaSkipped }))
      if (result.trackingImported) parts.push(t('settings.storage.trackingLinksCount', { count: result.trackingImported }))
      toast({ kind: result.mangaSkipped ? 'error' : 'success', title: t('settings.storage.importedToast'), body: parts.join(' · ') })
      if (result.warnings?.length) {
        for (const w of result.warnings.slice(0, 5)) toast({ kind: 'error', title: t('settings.storage.importWarningToast'), body: w })
      }
      await loadDbBackups()
      const { loadLibrary } = await import('$lib/state/library.svelte')
      await loadLibrary(true)
    } catch (e) {
      toast({ kind: 'error', title: t('settings.storage.importFailedToast'), body: e instanceof Error ? e.message : String(e) })
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
      appDataMsg = t('settings.storage.backupSaved')
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
      toast({ kind: 'error', title: t('settings.storage.formatToast'), body: e?.message ?? String(e) })
    } finally { formatBusy = false }
  }

  async function migrateMangaFormat() {
    if (formatMigrating) return
    formatMigrating = true
    try {
      const res = await tsunagu.migrateMangaDownloadFormat(mangaFormat)
      const parts: string[] = []
      if (res.chaptersMigrated > 0) parts.push(t('settings.storage.convertedChapters', { count: res.chaptersMigrated, pages: res.pagesMigrated }))
      if (res.chaptersFailed > 0) parts.push(t('settings.storage.convertFailedCount', { count: res.chaptersFailed }))
      toast({
        kind: res.chaptersFailed > 0 ? 'error' : 'success',
        title: res.chaptersMigrated > 0 ? t('settings.storage.convertedToast') : t('settings.storage.nothingToConvertToast'),
        body: parts.length > 0 ? parts.join(' ') : (mangaFormat === 'cbz' ? t('settings.storage.alreadyCbz') : t('settings.storage.alreadyLoose')),
      })
    } catch (e: any) {
      toast({ kind: 'error', title: t('settings.storage.migrationFailedToast'), body: e?.message ?? String(e) })
    } finally { formatMigrating = false }
  }

  $effect(() => { untrack(() => { loadBackupList(); fetchStorage(); loadServerStorage(); loadDbBackups(); loadMangaFormat(); loadAutoBackupSettings() }) })
</script>

<div class="s-panel">

  {#if migrateTo !== null}
    <div class="s-migrate-banner">
      <div class="s-migrate-body">
        <span class="s-migrate-title">
          {migrateKind === 'local' ? t('settings.storage.migrateLocalTitle') : t('settings.storage.migrateDownloadsTitle')}
        </span>
        <span class="s-migrate-paths">{migrateFrom || t('settings.storage.currentPath')} → {migrateTo || (migrateKind === 'local' ? 'media_dir/local' : t('settings.storage.serverDefault'))}</span>
        <span class="s-desc">
          {migrateKind === 'local'
            ? t('settings.storage.migrateLocalDesc')
            : t('settings.storage.migrateDownloadsDesc')}
        </span>
        {#if migrating && !migrateProgress}<span class="s-desc">{t('settings.storage.working')}</span>{/if}
        {#if migrateError}<span class="s-desc" style="color:var(--color-error)">{migrateError}</span>{/if}
      </div>
      <div class="s-migrate-actions">
        <button class="s-btn s-btn-accent" onclick={startMigration} disabled={migrating}>
          {migrating ? t('settings.storage.migrating') : t('settings.storage.migrate')}
        </button>
        <button class="s-btn" onclick={switchWithoutMigration} disabled={migrating}>{t('settings.storage.switchWithoutMoving')}</button>
        <button class="s-btn" onclick={dismissMigration} disabled={migrating}>{t('common.cancel')}</button>
      </div>
    </div>
  {/if}

  <div class="s-section">
    <p class="s-section-title">
      {t('settings.storage.diskUsageTitle')}
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
            <span class="s-storage-label">{t('settings.storage.serverData')}</span>
            <span class="s-storage-used">{t('settings.storage.usedOf', { used: fmtBytes(srvStorage.usedBytes), total: fmtBytes(cap) })}</span>
          </div>
          <div class="s-storage-bar">
            <div class="s-storage-fill" class:critical={pct > 90} class:warn={pct > 75 && pct <= 90} style="width:{pct}%"></div>
          </div>
          <div class="s-storage-footer">
            <span>{srvStorage.mediaDir ?? srvStorage.dataDir ?? ''}</span>
            <span>{t('settings.storage.free', { size: fmtBytes(srvStorage.freeBytes) })}</span>
          </div>
        </div>
        {#each srvStorage.categories ?? [] as c (c.key)}
          <div class="s-row">
            <div class="s-row-info"><span class="s-label">{categoryLabel(c)}</span></div>
            <span class="s-desc" style="flex-shrink:0;white-space:nowrap">{t('settings.storage.sizeFiles', { size: fmtBytes(c.bytes), count: c.fileCount })}</span>
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
              <span class="s-storage-label">{info.labelKey ? t(info.labelKey) : info.label}</span>
              <span class="s-storage-used">{t('settings.storage.usedOf', { used: fmtBytes(info.manga_bytes), total: fmtBytes(cap) })}</span>
            </div>
            <div class="s-storage-bar">
              <div class="s-storage-fill" class:critical={pct > 90} class:warn={pct > 75 && pct <= 90} style="width:{pct}%"></div>
            </div>
            <div class="s-storage-footer">
              <span>{info.path}</span>
              <span>{t('settings.storage.free', { size: fmtBytes(info.free_bytes) })}</span>
            </div>
          </div>
        {/each}
      {:else if srvLoading || storageLoading}
        <p class="s-empty">{t('settings.storage.readingStorage')}</p>
      {:else if srvError || storageError}
        <p class="s-empty" style="color:var(--color-error)">{srvError ?? storageError}</p>
      {:else if !supportsFilesystem}
        <p class="s-empty">{t('settings.storage.webModeUnavailable')}</p>
      {:else}
        <p class="s-empty">{t('settings.storage.noStorageData')}</p>
      {/if}
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.storage.downloadsPathTitle')}</p>
    <div class="s-section-body">
      {#if isExternalServer}
        <div class="s-row">
          <span class="s-desc">{t('settings.storage.externalServerNote')}</span>
        </div>
      {/if}
      <div class="s-row" style="gap:var(--sp-2)">
        <input class="s-input full" class:error={!!pathsFieldError.dl}
          bind:value={downloadsPathInput}
          placeholder={defaultDownloadsPath || t('settings.storage.defaultLocation')}
          spellcheck="false"
          onkeydown={(e) => e.key === 'Enter' && savePaths()}
          oninput={() => { pathsFieldError = { ...pathsFieldError, dl: undefined } }} />
        {#if !isExternalServer && supportsFilesystem}
          <button class="s-btn" onclick={browseDownloadsFolder}>{t('settings.storage.browse')}</button>
        {/if}
        {#if canOpenFolder()}
          <button class="s-btn" onclick={() => openCustomFolder(confirmedDownloadsPath.trim() || defaultDownloadsPath)}>{t('settings.storage.openFolder')}</button>
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
              catch (e: any) { pathsFieldError = { ...pathsFieldError, dl: e?.message ?? t('settings.storage.failed') } }
            }}>{t('settings.storage.create')}</button>
          {/if}
          {#if downloadsPathInput.trim() !== confirmedDownloadsPath}
            <button class="s-btn s-btn-accent" onclick={savePaths} disabled={pathsSaving}>
              {pathsSaved ? t('settings.storage.savedCheck') : pathsSaving ? t('settings.storage.saving') : t('common.save')}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.storage.formatTitle')}</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">{t('settings.storage.storeAs')}</span>
          <span class="s-desc">{t('settings.storage.storeAsDesc')}</span>
        </div>
        <div class="s-btn-row">
          <button class="s-btn" class:s-btn-accent={mangaFormat === 'loose'} disabled={formatBusy} onclick={() => setMangaFormat('loose')}>{t('settings.storage.looseImages')}</button>
          <button class="s-btn" class:s-btn-accent={mangaFormat === 'cbz'} disabled={formatBusy} onclick={() => setMangaFormat('cbz')}>{t('settings.storage.cbzArchive')}</button>
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">{t('settings.storage.convertExisting')}</span>
          <span class="s-desc">{t('settings.storage.convertExistingDesc')}</span>
        </div>
        <button class="s-btn s-btn-accent" disabled={formatMigrating} onclick={migrateMangaFormat}>
          <ArrowsClockwise size={13} />
          {formatMigrating ? t('settings.storage.converting') : t('settings.storage.convert')}
        </button>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.storage.limitTitle')}</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">{t('settings.storage.limitWarn')}</span>
          <span class="s-desc">{settingsState.settings.storageLimitGb === null ? t('settings.storage.noLimit') : t('settings.storage.warnAbove', { gb: settingsState.settings.storageLimitGb })}</span>
        </div>
        {#if settingsState.settings.storageLimitGb === null}
          <button class="s-btn" onclick={() => updateSettings({ storageLimitGb: 10 })}>{t('settings.storage.setLimit')}</button>
        {:else}
          <div class="s-stepper">
            <button class="s-step-btn" onclick={() => updateSettings({ storageLimitGb: Math.max(1, (settingsState.settings.storageLimitGb ?? 10) - 1) })} disabled={(settingsState.settings.storageLimitGb ?? 10) <= 1}>−</button>
            <input type="number" min="1" step="1" class="s-slider-val" style="width:52px"
              value={settingsState.settings.storageLimitGb}
              oninput={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n) && n > 0) updateSettings({ storageLimitGb: n }) }} />
            <span class="s-slider-unit">GB</span>
            <button class="s-step-btn" onclick={() => updateSettings({ storageLimitGb: (settingsState.settings.storageLimitGb ?? 10) + 1 })}>+</button>
            <button class="s-btn-icon" title={t('settings.storage.removeLimit')} onclick={() => updateSettings({ storageLimitGb: null })}>↺</button>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="s-section">
    <button class="s-collapsible-trigger" onclick={() => advStorageOpen = !advStorageOpen}>
      <span class="s-label">{t('settings.storage.advancedTitle')}</span>
      <svg class="s-collapsible-caret" class:open={advStorageOpen} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
    </button>
    {#if advStorageOpen}
      <div class="s-collapsible-body">
        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">{t('settings.storage.localSourcePath')}</span>
            <span class="s-desc">{t('settings.storage.localSourcePathDesc')}</span>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <div class="s-btn-row">
              <input class="s-input mono" class:error={!!pathsFieldError.loc}
                bind:value={localSourcePathInput} placeholder={t('settings.storage.optional')} spellcheck="false"
                onkeydown={(e) => e.key === 'Enter' && savePaths()}
                oninput={() => { pathsFieldError = { ...pathsFieldError, loc: undefined } }} />
              {#if !isExternalServer && supportsFilesystem}
                <button class="s-btn" onclick={browseLocalSourceFolder}>{t('settings.storage.browse')}</button>
              {/if}
              {#if pathsFieldError.loc && !isExternalServer && supportsFilesystem}
                <button class="s-btn" onclick={async () => {
                  try { await createDirectory(localSourcePathInput.trim()); pathsFieldError = { ...pathsFieldError, loc: undefined } }
                  catch (e: any) { pathsFieldError = { ...pathsFieldError, loc: e?.message ?? t('settings.storage.failed') } }
                }}>{t('settings.storage.create')}</button>
              {/if}
              <button class="s-btn" onclick={rescanLocal} disabled={rescanning}>{rescanning ? t('settings.storage.scanning') : t('settings.storage.rescan')}</button>
            </div>
            {#if pathsFieldError.loc}<span class="s-desc" style="color:var(--color-error)">{pathsFieldError.loc}</span>{/if}
          </div>
        </div>

        {#each extraScanDirs as dir}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label mono" style="font-family:monospace;font-size:var(--text-xs)">{dir}</span>
              <span class="s-desc">{t('settings.storage.extraScanDir')}</span>
            </div>
            <button class="s-btn s-btn-danger" onclick={() => removeExtraScanDir(dir)}>{t('common.remove')}</button>
          </div>
        {/each}

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">{t('settings.storage.additionalScanPath')}</span>
            <span class="s-desc">{t('settings.storage.additionalScanPathDesc')}</span>
          </div>
          <div class="s-btn-row">
            <input class="s-input mono" bind:value={newScanDir} placeholder="/path/to/dir" spellcheck="false"
              onkeydown={(e) => e.key === 'Enter' && addExtraScanDir()} />
            {#if !isExternalServer && supportsFilesystem}
              <button class="s-btn" onclick={browseExtraScanDir}>{t('settings.storage.browse')}</button>
            {/if}
          </div>
        </div>

        {#if (srvStorage?.categories ?? []).some(c => c.clearable)}
          <p class="s-subsection-title">{t('settings.storage.clearCachesTitle')}</p>
          {#if srvError}<div class="s-banner s-banner-error">{srvError}</div>{/if}
          {#each (srvStorage?.categories ?? []).filter(c => c.clearable) as c (c.key)}
            <div class="s-row">
              <div class="s-row-info">
                <span class="s-label">{categoryLabel(c)}</span>
                <span class="s-desc">{t('settings.storage.sizeFiles', { size: fmtBytes(c.bytes), count: c.fileCount })}</span>
              </div>
              <button class="s-btn s-btn-danger" disabled={srvClearing === c.key || c.bytes === 0} onclick={() => clearCategory(c.key)}>
                {srvClearing === c.key ? '…' : t('common.clear')}
              </button>
            </div>
          {/each}
        {/if}
      </div>
    {/if}
  </div>

  <div class="s-section">
    <button class="s-collapsible-trigger" onclick={() => backupSectionOpen = !backupSectionOpen}>
      <span class="s-label">{t('settings.storage.backupTitle')}</span>
      <svg class="s-collapsible-caret" class:open={backupSectionOpen} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
    </button>
    {#if backupSectionOpen}
      <div class="s-collapsible-body">

        <p class="s-subsection-title">{t('settings.storage.dbBackupTitle')}</p>

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">{t('settings.storage.serverDb')}</span>
            <span class="s-desc">{t('settings.storage.serverDbDesc')}</span>
          </div>
          <button class="s-btn s-btn-accent" onclick={makeDbBackup} disabled={backingUp}>{backingUp ? t('settings.storage.backingUp') : t('settings.storage.backUpNow')}</button>
        </div>

        {#if autoBackupIntervalHours !== null}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label">{t('settings.storage.autoBackups')}</span>
              <span class="s-desc">{autoBackupIntervalHours === 0 ? t('settings.storage.autoBackupsDisabled') : t('settings.storage.autoBackupsEvery', { hours: autoBackupIntervalHours, count: autoBackupRetention ?? 0 })}</span>
            </div>
            <div class="s-stepper">
              <button class="s-step-btn" disabled={autoBackupBusy || autoBackupIntervalHours <= 0}
                onclick={() => setAutoBackupSetting('backup_interval_hours', Math.max(0, autoBackupIntervalHours! - 1))}>−</button>
              <input type="number" min="0" step="1" class="s-slider-val" style="width:52px"
                value={autoBackupIntervalHours}
                oninput={(e) => { const n = parseInt(e.currentTarget.value, 10); if (!isNaN(n) && n >= 0) setAutoBackupSetting('backup_interval_hours', n) }} />
              <span class="s-slider-unit">h</span>
              <button class="s-step-btn" disabled={autoBackupBusy}
                onclick={() => setAutoBackupSetting('backup_interval_hours', autoBackupIntervalHours! + 1)}>+</button>
            </div>
          </div>

          {#if autoBackupIntervalHours > 0}
            <div class="s-row">
              <div class="s-row-info">
                <span class="s-label">{t('settings.storage.keepLast')}</span>
                <span class="s-desc">{t('settings.storage.keepLastDesc')}</span>
              </div>
              <div class="s-stepper">
                <button class="s-step-btn" disabled={autoBackupBusy || (autoBackupRetention ?? 1) <= 1}
                  onclick={() => setAutoBackupSetting('backup_retention_count', Math.max(1, autoBackupRetention! - 1))}>−</button>
                <input type="number" min="1" step="1" class="s-slider-val" style="width:52px"
                  value={autoBackupRetention}
                  oninput={(e) => { const n = parseInt(e.currentTarget.value, 10); if (!isNaN(n) && n >= 1) setAutoBackupSetting('backup_retention_count', n) }} />
                <button class="s-step-btn" disabled={autoBackupBusy}
                  onclick={() => setAutoBackupSetting('backup_retention_count', (autoBackupRetention ?? 1) + 1)}>+</button>
              </div>
            </div>
          {/if}

          {#if autoBackupRestartNote}
            <div class="s-banner s-banner-info">{t('settings.storage.restartNote')}</div>
          {/if}
        {/if}

        {#if dbBackupsErr}<div class="s-banner s-banner-error">{dbBackupsErr}</div>{/if}

        {#each dbBackups.filter(b => b.kind === 'sqlite') as b (b.name)}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label mono" style="font-family:monospace;font-size:var(--text-xs)">{b.name}</span>
              <span class="s-desc">{fmtBytes(b.bytes)} · {new Date(b.createdAt).toLocaleString()}</span>
            </div>
            <div class="s-btn-row">
              <button class="s-btn" onclick={() => revealFile(b.path)}>{t('settings.storage.reveal')}</button>
              <button class="s-btn s-btn-danger" disabled={deletingBk === b.name} onclick={() => deleteDbBackup(b.name)}>
                {deletingBk === b.name ? '…' : t('common.delete')}
              </button>
            </div>
          </div>
        {/each}

        <p class="s-subsection-title">{t('settings.storage.libraryBackupTitle')}</p>

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">{t('settings.storage.exportLibrary')}</span>
            <span class="s-desc">{t('settings.storage.exportLibraryDesc')}</span>
          </div>
          <button class="s-btn s-btn-accent" onclick={exportMihon} disabled={exportingMihon}>{exportingMihon ? t('settings.storage.exporting') : t('settings.storage.export')}</button>
        </div>

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">{t('settings.storage.importBackup')}</span>
            <span class="s-desc">{importPick[0]}<span style="font-family:monospace">.tachibk</span>{importPick[1]}</span>
          </div>
          {#if supportsFilesystem}
            <button class="s-btn s-btn-accent" disabled={importingFile} onclick={importBackupFile}>
              {importingFile ? t('settings.storage.importing') : t('settings.storage.importFile')}
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
              <button class="s-btn" onclick={() => revealFile(b.path)}>{t('settings.storage.reveal')}</button>
              <button class="s-btn s-btn-accent" disabled={importingMihon === b.name} onclick={() => importMihon(b.name)}>
                {importingMihon === b.name ? t('settings.storage.importing') : t('settings.storage.import')}
              </button>
              <button class="s-btn s-btn-danger" disabled={deletingBk === b.name} onclick={() => deleteDbBackup(b.name)}>
                {deletingBk === b.name ? '…' : t('common.delete')}
              </button>
            </div>
          </div>
        {/each}

        <p class="s-subsection-title">{t('settings.storage.appDataTitle')}</p>

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">{t('settings.storage.exportSettings')}</span>
            <span class="s-desc">{t('settings.storage.exportSettingsDesc')}</span>
          </div>
          <button class="s-btn s-btn-accent" onclick={handleExportAppData} disabled={appDataExporting || !supportsFilesystem}>
            {appDataExporting ? t('settings.storage.saving') : t('settings.storage.export')}
          </button>
        </div>

        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">{t('settings.storage.importSettings')}</span>
            <span class="s-desc">{t('settings.storage.importSettingsDesc')}</span>
          </div>
          <button class="s-btn" onclick={handleImportAppData} disabled={appDataImporting || !supportsFilesystem}>
            {appDataImporting ? t('settings.storage.importing') : t('settings.storage.import')}
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
              <span class="s-label">{t('settings.storage.autoBackupLocation')}</span>
              <span class="s-desc">{t('settings.storage.autoBackupLocationDesc')}</span>
            </div>
            <button class="s-btn" onclick={() => openCustomFolder(appDataBackupDir!)}>{t('settings.storage.openFolder')}</button>
          </div>
        {/if}

      </div>
    {/if}
  </div>

  <div class="s-section">
    <button class="s-collapsible-trigger" onclick={() => resetSectionOpen = !resetSectionOpen}>
      <span class="s-label">{t('settings.storage.resetTitle')}</span>
      <svg class="s-collapsible-caret" class:open={resetSectionOpen} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
    </button>
    {#if resetSectionOpen}
      <div class="s-collapsible-body">
        {#each resetItems as item}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label">{t(item.label)}</span>
              <span class="s-desc">{t(item.desc)}</span>
              {#if item.error}<span class="s-desc" style="color:var(--color-error)">{item.error}</span>{/if}
            </div>
            <div class="s-btn-row">
              {#if item.state === 'done'}
                <span class="s-pill on">{t('common.done')}</span>
              {:else if item.state === 'busy'}
                <button class="s-btn" disabled>{t('settings.storage.working')}</button>
              {:else if confirming === item.key}
                <span class="s-desc" style="color:var(--text-muted)">{t('settings.storage.sure')}</span>
                <button class="s-btn s-btn-danger" onclick={() => runReset(item.key)}>{t('common.confirm')}</button>
                <button class="s-btn" onclick={() => confirming = null}>{t('common.cancel')}</button>
              {:else}
                <button
                  class="s-btn"
                  class:s-btn-danger={item.confirm}
                  onclick={() => item.confirm ? (confirming = item.key) : runReset(item.key)}
                >{t('common.reset')}</button>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

</div>