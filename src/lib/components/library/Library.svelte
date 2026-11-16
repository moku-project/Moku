<script lang="ts">
  import { tsunagu }      from '$lib/server-adapters/tsunagu'
  import { libraryState, loadLibrary, loadFolders } from '$lib/state/library.svelte'
  import { trackerState } from '$lib/state/trackers.svelte'
  import type { LibrarySortOption, LibraryContentFilter, LibraryStatusFilter } from '$lib/state/library.svelte'
  import { addToast }           from '$lib/state/notifications.svelte'
  import { updateSettings, settingsState } from '$lib/state/settings.svelte'
  import { readerState } from '$lib/state/mangaReader.svelte'
  import { goto }               from '$app/navigation'
  import { seriesHref, seriesState } from '$lib/state/series.svelte'
  import LibraryToolbar  from '$lib/components/library/LibraryToolbar.svelte'
  import LibraryGrid     from '$lib/components/library/LibraryGrid.svelte'
  import ContextMenu, { type MenuEntry } from '$lib/components/shared/ui/ContextMenu.svelte'

  import type { Manga } from '$lib/types'
  import type { Folder, LibraryEntry } from '$lib/server-adapters/types'
  import {
    Books, Folder as FolderIcon, FolderSimple, FolderSimplePlus,
    Trash, CheckSquare, ArrowSquareOut, ArrowsClockwise,
    PencilSimple, Star, Eye, EyeSlash,
  } from 'phosphor-svelte'
  import { openMangaFolder } from '$lib/core/filesystem'
  import { t } from '$lib/i18n/index.svelte'

  const SIDEBAR_W      = 52
  const TITLEBAR_H     = 36
  const CTX_FOLDER_CAP = 4
  const COMPLETED_NAME = 'Completed'

  let tabsEl: HTMLDivElement = $state() as HTMLDivElement
  let ctx:      { x: number; y: number; manga: Manga } | null = $state(null)
  let emptyCtx: { x: number; y: number } | null              = $state(null)
  let tabCtx:   { x: number; y: number; id: string } | null  = $state(null)

  let bulkWorking:     boolean      = $state(false)
  let sortPanelOpen:   boolean      = $state(false)
  let filterPanelOpen: boolean      = $state(false)
  let activeDragKind: 'tab' | null = $state(null)
  let dragInsertIdx                = $state(-1)
  let dragTabId:      string|null  = $state(null)
  let dragOverTabId:  string|null  = $state(null)

  $effect(() => {
    libraryState.syncFromSettings(settingsState.settings)
    loadLibrary()
    trackerState.load()
  })
  $effect(() => { libraryState.tab; libraryState.exitSelect() })
  $effect(() => { libraryState.guardTab() })
  $effect(() => {
    if (readerState.activeManga === null) loadLibrary()
  })


  function onCardClick(e: MouseEvent, m: Manga) {
    if (libraryState.selectMode) { libraryState.toggleSelect(m.id); return }
    if (e.metaKey || e.ctrlKey || e.shiftKey) { e.preventDefault(); libraryState.enterSelect(m.id); return }
    goto(seriesHref(m))
  }

  function openCtx(e: MouseEvent, m: Manga) {
    if (libraryState.selectMode) { libraryState.toggleSelect(m.id); return }
    e.preventDefault()
    ctx = { x: e.clientX - SIDEBAR_W, y: e.clientY - TITLEBAR_H, manga: m }
  }

  async function doRemove(m: Manga) {
    const inFolders = libraryState.folders
      .filter(f => (libraryState.folderMangaMap.get(f.id) ?? []).some(x => x.id === m.id))
      .map(f => f.name)
    if (inFolders.length && !confirm(
      inFolders.length === 1
        ? t('library.confirm.removeInFolder', { title: m.title, folder: inFolders[0] })
        : t('library.confirm.removeInFolders', { title: m.title, count: inFolders.length })
    )) return
    try {
      await tsunagu.removeFromLibrary(m.id)
      await loadLibrary(true)
      addToast({ kind: 'success', title: t('library.toast.removedFromLibrary'), body: m.title })
    } catch (e) {
      addToast({ kind: 'error', title: t('library.toast.removeFailed'), body: String(e) })
    }
  }

  async function doDeleteDownloads(m: Manga) {
    try {
      const entry       = await tsunagu.libraryEntry(m.id)
      const downloaded  = (entry?.chapters ?? []).filter(c => c.downloaded).map(c => c.id)
      if (!downloaded.length) return
      await Promise.all(downloaded.map(id => tsunagu.deleteDownload(m.id, id)))
      libraryState.items = libraryState.items.map(x =>
        x.id === m.id ? { ...x, downloadCount: 0 } : x
      )
      seriesState.markChaptersDeleted(m.id, downloaded)
    } catch (e) { console.error(e) }
  }

  async function refreshSingleManga(m: Manga) {
    if (libraryState.refreshingMangaId !== null) return
    libraryState.refreshingMangaId = m.id
    try {
      await tsunagu.refreshMetadata(m.id)
      await tsunagu.syncChapters(m.id)
      await loadLibrary(true)
      addToast({ kind: 'success', title: t('library.toast.refreshed'), body: m.title })
    } catch (e) {
      addToast({ kind: 'error', title: t('library.toast.refreshFailed'), body: String(e) })
    } finally {
      libraryState.refreshingMangaId = null
    }
  }

  export async function checkAndMarkCompleted(_mangaId: string) {}

  async function toggleMangaFolder(manga: Manga, folder: Folder) {
    const inFolder = (libraryState.folderMangaMap.get(folder.id) ?? []).some(m => m.id === manga.id)
    try {
      if (inFolder) await tsunagu.removeEntryFromFolder(manga.id, folder.id)
      else          await tsunagu.addEntryToFolder(manga.id, folder.id)
      if (!inFolder) libraryState.bumpFolderFrecency(folder.id)
      await loadFolders()
    } catch (e) { console.error(e) }
  }

  async function createAndAssign(manga: Manga) {
    const name = prompt(t('library.prompt.folderName'))
    if (!name?.trim()) return
    try {
      const folder = await tsunagu.createFolder(name.trim())
      libraryState.addFolder(folder)
      await tsunagu.addEntryToFolder(manga.id, folder.id)
      libraryState.bumpFolderFrecency(folder.id)
      await loadFolders()
    } catch (e) { console.error(e) }
  }

  async function bulkMove(folder: Folder) {
    bulkWorking = true
    try {
      await Promise.all([...libraryState.selected].map(id => tsunagu.addEntryToFolder(id, folder.id)))
      await loadFolders()
    } catch (e) { console.error(e) }
    finally { bulkWorking = false; libraryState.exitSelect() }
  }

  async function bulkRemoveFromFolder() {
    const folderId = libraryState.tab
    if (folderId === 'library' || folderId === 'downloaded') return
    bulkWorking = true
    try {
      await Promise.all([...libraryState.selected].map(id => tsunagu.removeEntryFromFolder(id, folderId)))
      await loadFolders()
    } catch (e) { console.error(e) }
    finally { bulkWorking = false; libraryState.exitSelect() }
  }

  async function onBulkRemove() {
    const ids = [...libraryState.selected]
    const foldered = ids.filter(id =>
      libraryState.folders.some(f => (libraryState.folderMangaMap.get(f.id) ?? []).some(x => x.id === id))
    ).length
    if (foldered && !confirm(
      t('library.confirm.bulkRemoveInFolders', { count: foldered, total: ids.length })
    )) return
    bulkWorking = true
    try {
      await Promise.allSettled(
        ids.map(id => tsunagu.removeFromLibrary(id))
      )
      await loadLibrary(true)
      libraryState.exitSelect()
    } finally { bulkWorking = false }
  }

  async function runLibraryRefresh() {
    if (libraryState.refreshing || libraryState.refreshingFolderId !== null) return
    libraryState.refreshing = true
    try {
      const started = await tsunagu.startLibraryUpdate()
      let status = await tsunagu.libraryUpdateStatus()
      if (!started && !status.running) {
        addToast({ kind: 'info', title: t('library.toast.nothingToUpdate'), body: t('library.toast.nothingToUpdateBody') })
        return
      }
      while (status.running) {
        await new Promise(r => setTimeout(r, 1500))
        status = await tsunagu.libraryUpdateStatus()
      }
      await loadLibrary(true)
      const n = status.newChapterCount
      addToast({
        kind:  n > 0 ? 'success' : 'info',
        title: t('library.toast.updateComplete'),
        body:  n > 0 ? t('library.toast.newChapters', { count: n }) : t('library.toast.noNewChapters'),
      })
      if (status.failedTitles.length) {
        addToast({ kind: 'error', title: t('library.toast.seriesFailedToUpdate', { count: status.failedTitles.length }), body: status.failedTitles.slice(0, 3).join(', ') })
      }
    } catch (e: any) {
      addToast({ kind: 'error', title: t('library.toast.updateFailed'), body: e?.message ?? String(e) })
    } finally {
      libraryState.refreshing = false
    }
  }

  async function refreshFolder(folderId: string) {
    if (libraryState.refreshingFolderId !== null || libraryState.refreshing) return
    libraryState.refreshingFolderId = folderId
    const folder = libraryState.folders.find(f => f.id === folderId)
    try {
      const refreshed = await tsunagu.refreshFolder(folderId)
      await loadFolders()
      addToast({ kind: 'success', title: t('library.toast.folderRefreshed'), body: t('library.toast.folderRefreshedBody', { name: folder?.name ?? '', count: refreshed.length }) })
    } catch (e) {
      addToast({ kind: 'error', title: t('library.toast.refreshFailed'), body: String(e) })
    } finally { libraryState.refreshingFolderId = null }
  }

  function buildCtxItems(m: Manga): MenuEntry[] {
    const sorted   = [...libraryState.visibleFolders].sort(
      (a, b) => (libraryState.folderFrecency[b.id] ?? 0) - (libraryState.folderFrecency[a.id] ?? 0)
    )
    const pinned   = sorted.slice(0, CTX_FOLDER_CAP)
    const overflow = sorted.slice(CTX_FOLDER_CAP)

    const makeFolderEntry = (folder: Folder): MenuEntry => {
      const inFolder = (libraryState.folderMangaMap.get(folder.id) ?? []).some(x => x.id === m.id)
      return { label: inFolder ? t('library.menu.removeFromFolder', { folder: folder.name }) : folder.name, icon: FolderIcon, onClick: () => toggleMangaFolder(m, folder) }
    }

    return [
      { label: m.inLibrary ? t('library.menu.removeFromLibrary') : t('library.menu.addToLibrary'), icon: Books,
        onClick: () => m.inLibrary
          ? doRemove(m)
          : (() => {
              console.warn('Add to library: extensionId/sourceEntryId not yet threaded onto Manga')
            })() },
      { label: libraryState.refreshingMangaId === m.id ? t('library.menu.refreshing') : t('library.menu.refreshManga'), icon: ArrowsClockwise,
        disabled: libraryState.refreshingMangaId !== null, onClick: () => refreshSingleManga(m) },
      { label: t('library.menu.openInFileManager'), icon: ArrowSquareOut,
        disabled: !(m.downloadCount && m.downloadCount > 0), onClick: () => openMangaFolder(m) },
      { label: t('library.menu.deleteAllDownloads'), icon: Trash, danger: true,
        disabled: !(m.downloadCount && m.downloadCount > 0), onClick: () => doDeleteDownloads(m) },
      { separator: true },
      { label: t('library.menu.select'), icon: CheckSquare, onClick: () => libraryState.enterSelect(m.id) },
      ...(pinned.length ? [{ separator: true } as MenuEntry, ...pinned.map(makeFolderEntry)] : []),
      ...(overflow.length ? [{ label: t('library.menu.moreFolders', { count: overflow.length }), icon: FolderSimple, onClick: () => {}, children: overflow.map(makeFolderEntry) } as MenuEntry] : []),
      { separator: true },
      { label: t('library.menu.newFolder'), icon: FolderSimplePlus, onClick: () => createAndAssign(m) },
    ]
  }

  function buildEmptyCtx(): MenuEntry[] {
    return [{
      label: t('library.menu.newFolder'), icon: FolderSimplePlus,
      onClick: async () => {
        const name = prompt(t('library.prompt.folderName'))
        if (!name?.trim()) return
        try {
          const folder = await tsunagu.createFolder(name.trim())
          libraryState.addFolder(folder)
        } catch (e) { console.error(e) }
      },
    }]
  }

  function openTabCtx(e: MouseEvent, id: string) {
    e.preventDefault()
    tabCtx = { x: e.clientX - SIDEBAR_W, y: e.clientY - TITLEBAR_H + 8, id }
  }

  function toggleTabHidden(id: string) {
    const current = settingsState.settings.hiddenLibraryTabs ?? []
    updateSettings({ hiddenLibraryTabs: current.includes(id) ? current.filter(x => x !== id) : [...current, id] })
  }

  async function toggleFolderFlag(folder: Folder, flag: 'includeInUpdate' | 'includeInDownload') {
    try {
      await tsunagu.updateFolderFlags(folder.id, { [flag]: !folder[flag] })
      await loadFolders()
    } catch (e) { console.error(e) }
  }

  function toggleDefaultFolder(folder: Folder) {
    const current = settingsState.settings.defaultLibraryCategoryId ?? null
    const next    = current === folder.id ? null : folder.id
    updateSettings({ defaultLibraryCategoryId: next })
    if (next !== null) libraryState.tab = next
  }

  async function renameFolderTab(folder: Folder) {
    const name = prompt(t('library.prompt.renameFolder'), folder.name)
    if (!name?.trim() || name.trim() === folder.name) return
    try {
      await tsunagu.renameFolder(folder.id, name.trim())
      await loadFolders()
    } catch (e) { console.error(e) }
  }

  async function deleteFolderTab(folder: Folder) {
    if (!confirm(t('library.confirm.deleteFolder', { name: folder.name }))) return
    try {
      await tsunagu.deleteFolder(folder.id)
      if (libraryState.tab === folder.id) libraryState.tab = 'library'
      await loadFolders()
    } catch (e) { console.error(e) }
  }

  function buildTabCtxItems(id: string): MenuEntry[] {
    const isBuiltin   = id === 'library' || id === 'downloaded'
    const folder       = libraryState.folders.find(f => f.id === id)
    const isCompleted = !!folder && id === libraryState.completedFolderId
    const hidden      = (settingsState.settings.hiddenLibraryTabs ?? []).includes(id)

    const hideItem: MenuEntry = {
      label:   hidden ? t('library.menu.showTab') : t('library.menu.hideTab'),
      icon:    hidden ? Eye : EyeSlash,
      onClick: () => toggleTabHidden(id),
    }

    if (isBuiltin || isCompleted || !folder) return [hideItem]

    const isDefault = (settingsState.settings.defaultLibraryCategoryId ?? null) === folder.id

    return [
      { label: t('library.menu.renameFolder'), icon: PencilSimple, onClick: () => renameFolderTab(folder) },
      { separator: true },
      { label: isDefault ? t('library.menu.removeDefaultFolder') : t('library.menu.setDefaultFolder'), icon: Star,
        onClick: () => toggleDefaultFolder(folder) },
      hideItem,
      { separator: true },
      { label: folder.includeInUpdate ? t('library.menu.excludeFromUpdates') : t('library.menu.includeInUpdates'), icon: ArrowsClockwise,
        onClick: () => toggleFolderFlag(folder, 'includeInUpdate') },
      { label: folder.includeInDownload ? t('library.menu.excludeFromAutoDownload') : t('library.menu.includeInAutoDownload'), icon: ArrowsClockwise,
        onClick: () => toggleFolderFlag(folder, 'includeInDownload') },
      { separator: true },
      { label: t('library.menu.deleteFolder'), icon: Trash, danger: true, onClick: () => deleteFolderTab(folder) },
    ]
  }

  // Pointer-based reordering, not HTML5 drag-and-drop: Tauri's window-level
  // native file-drop handling (needed for dragging folders in from the OS to
  // import) intercepts HTML5 drag gestures webview-wide, which showed a
  // "not allowed" cursor for this in-app reorder instead of actually dragging.
  const TAB_DRAG_THRESHOLD = 4

  async function commitTabDrop(dragStrId: string, insertAt: number) {
    const tabs    = [...libraryState.allTabIds]
    const fromIdx = tabs.indexOf(dragStrId)
    if (fromIdx < 0) return

    const visibleDrop = libraryState.visibleTabIds[insertAt] ?? null
    const destIdx     = visibleDrop ? tabs.indexOf(visibleDrop) : tabs.length
    tabs.splice(fromIdx, 1)
    const adjusted = Math.max(0, Math.min(destIdx > fromIdx ? destIdx - 1 : destIdx, tabs.length))
    tabs.splice(adjusted, 0, dragStrId)

    libraryState.pinnedTabOrder = tabs
    updateSettings({ libraryPinnedTabOrder: tabs })

    const folderTabs = tabs.filter(id => id !== 'library' && id !== 'downloaded')
    try {
      await Promise.all(folderTabs.map((id, idx) => tsunagu.reorderFolder(id, idx)))
      await loadFolders()
    } catch (e) { console.error(e) }
  }

  function onTabPointerDown(e: PointerEvent, id: string, idx: number) {
    if (e.button !== 0) return
    const startX = e.clientX, startY = e.clientY
    let engaged = false

    function move(ev: PointerEvent) {
      if (!engaged) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < TAB_DRAG_THRESHOLD) return
        engaged = true
        activeDragKind = 'tab'; dragTabId = id
      }
      const el = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-tab-id]')
      if (!el || el.dataset.tabId === id) { dragOverTabId = null; dragInsertIdx = -1; return }
      const overIdx = Number(el.dataset.tabIdx)
      dragOverTabId = el.dataset.tabId!
      const rect = el.getBoundingClientRect()
      dragInsertIdx = ev.clientX < rect.left + rect.width / 2 ? overIdx : overIdx + 1
    }

    function up() {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (engaged && dragInsertIdx >= 0) commitTabDrop(id, dragInsertIdx)
      activeDragKind = null; dragTabId = null; dragOverTabId = null; dragInsertIdx = -1
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
</script>

<div
  class="root"
  role="presentation"
  oncontextmenu={(e) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    emptyCtx = { x: e.clientX - SIDEBAR_W, y: e.clientY - TITLEBAR_H }
  }}
>
  {#if libraryState.error}
    <div class="center">
      <p class="error-msg">{t('library.loadError')}</p>
      <p class="error-detail">{libraryState.error}</p>
      <button class="retry-btn" onclick={() => loadLibrary(true)}>{t('common.retry')}</button>
    </div>
  {:else}
    <LibraryToolbar
      tab={libraryState.tab}
      tabSortMode={libraryState.tabSort[libraryState.tab]?.mode ?? 'az'}
      tabSortDir={libraryState.tabSort[libraryState.tab]?.dir ?? 'asc'}
      tabStatus={libraryState.tabStatus[libraryState.tab] ?? 'ALL'}
      tabFilters={libraryState.tabFilters[libraryState.tab] ?? {}}
      hasActiveFilters={libraryState.hasActiveFilters}
      visibleFolders={libraryState.visibleFolders}
      visibleTabIds={libraryState.visibleTabIds}
      completedFolderId={libraryState.completedFolderId}
      counts={libraryState.counts}
      search={libraryState.filter.query}
      viewMode={libraryState.viewMode}
      {activeDragKind}
      {dragInsertIdx}
      {dragTabId}
      {dragOverTabId}
      {sortPanelOpen}
      {filterPanelOpen}
      bind:tabsEl
      onTabChange={(id) => libraryState.tab = id}
      onSearchChange={(q) => libraryState.filter.query = q}
      onSortChange={(mode) => libraryState.setTabSort(libraryState.tab, mode)}
      onSortDirToggle={() => libraryState.toggleTabSortDir(libraryState.tab)}
      onSortPanelToggle={() => sortPanelOpen = !sortPanelOpen}
      onStatusChange={(s) => libraryState.setTabStatus(libraryState.tab, s)}
      onFilterToggle={(f) => libraryState.toggleTabFilter(libraryState.tab, f)}
      onFiltersClear={() => libraryState.clearTabFilters(libraryState.tab)}
      onFilterPanelToggle={() => filterPanelOpen = !filterPanelOpen}
      onViewModeChange={(mode) => libraryState.setViewMode(mode)}
      refreshingLibrary={libraryState.refreshing}
      onRefreshLibrary={runLibraryRefresh}
      onTabPointerDown={onTabPointerDown}
      onTabContextMenu={openTabCtx}
    />

    <LibraryGrid
      items={libraryState.filteredItems}
      loading={libraryState.loading}
      selectMode={libraryState.selectMode}
      selected={libraryState.selected}
      tab={libraryState.tab}
      visibleFolders={libraryState.visibleFolders}
      {bulkWorking}
      viewMode={libraryState.viewMode}
      onCardClick={onCardClick}
      onCardContextMenu={openCtx}
      onSelectAll={() => libraryState.selectAll(libraryState.filteredItems.map(m => m.id))}
      onExitSelect={() => libraryState.exitSelect()}
      onBulkRemove={onBulkRemove}
      onBulkRemoveFromFolder={bulkRemoveFromFolder}
      onBulkMove={bulkMove}
      onViewModeChange={(mode) => libraryState.setViewMode(mode)}
    />
  {/if}
</div>

{#if ctx}
  <ContextMenu x={ctx.x} y={ctx.y} items={buildCtxItems(ctx.manga)} onClose={() => ctx = null} />
{/if}
{#if emptyCtx}
  <ContextMenu x={emptyCtx.x} y={emptyCtx.y} items={buildEmptyCtx()} onClose={() => emptyCtx = null} />
{/if}
{#if tabCtx}
  <ContextMenu x={tabCtx.x} y={tabCtx.y} items={buildTabCtxItems(tabCtx.id)} onClose={() => tabCtx = null} />
{/if}

<style>
  .root {
    position: relative; display: flex; flex-direction: column;
    height: 100%; overflow: hidden;
    animation: fadeIn 0.14s ease both;
  }
  .center {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 60%; gap: var(--sp-2);
    color: var(--text-muted); text-align: center;
  }
  .error-msg    { color: var(--color-error); font-size: var(--text-base); }
  .error-detail { color: var(--text-faint);  font-size: var(--text-sm); }
  .retry-btn {
    margin-top: var(--sp-3); padding: 6px 16px;
    border-radius: var(--radius-md); border: 1px solid var(--border-dim);
    background: var(--bg-raised); color: var(--text-muted);
    cursor: pointer; font-family: var(--font-ui);
    font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
  }
  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
</style>
