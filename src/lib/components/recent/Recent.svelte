<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { goto }               from '$app/navigation'
  import { tsunagu }            from '$lib/server-adapters/tsunagu'
  import { cache, CACHE_KEYS, CACHE_GROUPS } from '$lib/core/cache/queryCache'
  import { clearHistory }             from '$lib/state/home.svelte'
  import { historyState }            from '$lib/state/history.svelte'
  import { libraryState, loadLibrary } from '$lib/state/library.svelte'
  import { settingsState }             from '$lib/state/settings.svelte'
  import { setActiveManga, openReaderForChapter, setPreviewManga, seriesState } from '$lib/state/series.svelte'
  import { addToast }           from '$lib/state/notifications.svelte'
  import { downloadStore }      from '$lib/state/downloads.svelte'
  import { collapseAndGroupByDay }                     from './lib/recentHistory'
  import { groupUpdatesByDay, mapRecentChapterToUpdate } from './lib/recentUpdates'
  import RecentToolbar  from './RecentToolbar.svelte'
  import UpdatesTab     from './UpdatesTab.svelte'
  import HistoryTab     from './HistoryTab.svelte'
  import type { Manga } from '$lib/types'
  import type { RecentUpdate, UpdateGroup } from './lib/recentUpdates'
  import type { HistoryGroup }              from './lib/recentHistory'
  import type { LibraryUpdateStatus }       from '$lib/server-adapters/types'
  import { t } from '$lib/i18n/index.svelte'

  const RECENT_UPDATES_TTL_MS = 60 * 1_000

  let tab:                 'updates' | 'history' = $state('history')
  let historySearch:       string  = $state('')
  let updatesSearch:       string  = $state('')
  let historyConfirmClear: boolean = $state(false)

  let updates:             RecentUpdate[] = $state([])
  let updatesLoading:      boolean        = $state(true)
  let updatesError:        string | null  = $state(null)
  let openingId:           string | null  = $state(null)
  let enqueueing:          Set<string>    = $state(new Set())

  let ctrl: AbortController | null = null

  let updateStatus = $state<LibraryUpdateStatus | null>(null)
  let updatePollTimer: ReturnType<typeof setInterval> | null = null
  let destroyed = false

  function startUpdatePoll() {
    if (!destroyed && !updatePollTimer) updatePollTimer = setInterval(pollUpdateStatus, 1500)
  }

  const updaterRunning = $derived(updateStatus?.running ?? false)
  const updaterProgressLabel = $derived(
    updateStatus?.running && updateStatus.total > 0 ? `${updateStatus.done}/${updateStatus.total}` : null,
  )

  onMount(() => {
    void loadUpdates()
    if (!libraryState.items.length) loadLibrary()
    tsunagu.libraryUpdateStatus().then(s => {
      updateStatus = s
      if (s.running) startUpdatePoll()
    }).catch(() => {})
  })

  onDestroy(() => {
    destroyed = true
    ctrl?.abort()
    if (updatePollTimer) clearInterval(updatePollTimer)
  })

  async function pollUpdateStatus() {
    try {
      updateStatus = await tsunagu.libraryUpdateStatus()
    } catch {
      return
    }
    if (!updateStatus.running) {
      if (updatePollTimer) { clearInterval(updatePollTimer); updatePollTimer = null }
      const n = updateStatus.newChapterCount
      addToast({
        kind:  n > 0 ? 'success' : 'info',
        title: t('library.toast.updateComplete'),
        body:  n > 0 ? t('library.toast.newChapters', { count: n }) : t('library.toast.noNewChapters'),
      })
      if (updateStatus.failedTitles.length) {
        addToast({ kind: 'error', title: t('library.toast.seriesFailedToUpdate', { count: updateStatus.failedTitles.length }), body: updateStatus.failedTitles.slice(0, 3).join(', ') })
      }
      if (n > 0) loadUpdates(true)
    }
  }

  async function runLibraryUpdate() {
    if (updaterRunning) return
    try {
      const started = await tsunagu.startLibraryUpdate()
      updateStatus = await tsunagu.libraryUpdateStatus()
      if (!started && !updateStatus.running) {
        addToast({ kind: 'info', title: t('library.toast.nothingToUpdate'), body: t('library.toast.nothingToUpdateBody') })
        return
      }
      if (updateStatus.running) startUpdatePoll()
    } catch (e: any) {
      addToast({ kind: 'error', title: t('library.toast.updateFailed'), body: e?.message ?? t('recent.toast.updateStartFailed') })
    }
  }

  const ctFilter = $derived(settingsState.settings.contentTypeFilter)
  function matchesContentType(mangaId: string): boolean {
    if (!ctFilter || ctFilter === 'all') return true
    return libraryState.items.find(m => m.id === mangaId)?.contentType === ctFilter
  }

  const visibleUpdates  = $derived(updates.filter(u => matchesContentType(u.mangaId)))
  const updateGroups     = $derived(groupUpdatesByDay(visibleUpdates))

  const filteredHistory = $derived(
    (historySearch.trim()
      ? historyState.sessions.filter(s =>
          s.mangaTitle.toLowerCase().includes(historySearch.toLowerCase()) ||
          s.endChapterName.toLowerCase().includes(historySearch.toLowerCase())
        )
      : historyState.sessions
    ).filter(s => matchesContentType(s.mangaId)))

  const historyGroups = $derived(collapseAndGroupByDay(filteredHistory))

  async function loadUpdates(force = false) {
    ctrl?.abort()
    const nextCtrl = new AbortController()
    ctrl           = nextCtrl
    updatesLoading = true
    updatesError   = null

    try {
      const key = CACHE_KEYS.RECENT_UPDATES
      if (force) cache.clear(key)

      const updatesRes = await cache.get<RecentUpdate[]>(
        key,
        () => tsunagu.chapterUpdates(undefined, 100).then(items => items.map(mapRecentChapterToUpdate)),
        RECENT_UPDATES_TTL_MS,
        CACHE_GROUPS.LIBRARY,
      )

      if (nextCtrl.signal.aborted) return

      updates = updatesRes ?? []
    } catch (e: any) {
      if (nextCtrl.signal.aborted) return
      updatesError = e?.message ?? t('recent.updatesLoadFailed')
      updates      = []
    } finally {
      if (!nextCtrl.signal.aborted) updatesLoading = false
    }
  }

  function mangaStub(item: RecentUpdate): Manga {
    return {
      id:           item.manga?.id ?? item.mangaId,
      title:        item.manga?.title ?? t('recent.unknownSeries'),
      thumbnailUrl: item.manga?.thumbnailUrl ?? '',
      inLibrary:    item.manga?.inLibrary ?? true,
    } as Manga
  }

  async function openUpdate(item: RecentUpdate) {
    if (openingId !== null) return
    openingId = item.id
    const manga = mangaStub(item)
    try {
      const entry  = await tsunagu.libraryEntry(String(item.mangaId))
      const target = entry?.chapters.find((ch) => ch.id === item.id)
      if (target) {
        openReaderForChapter({
          id: target.id,
          name: target.title ?? '',
          chapterNumber: target.number ?? 0,
          sourceOrder: target.sourceOrder ?? 0,
          read: target.completed ?? false,
          downloaded: target.downloaded ?? false,
          bookmarked: false,
          pageCount: target.pageCount ?? 0,
          mangaId: String(item.mangaId),
          uploadDate: target.uploadedAt,
          scanlator: null,
        }, manga)
      } else {
        setPreviewManga(manga)
      }
    } catch {
      setPreviewManga(manga)
      addToast({ kind: 'error', title: t('recent.toast.openChapterFailed'), body: t('recent.toast.openedSeriesInstead') })
    } finally {
      openingId = null
    }
  }

  function thumbFor(mangaId: string, fallback: string): string {
    return libraryState.items.find(m => m.id === mangaId)?.thumbnailUrl ?? fallback ?? ''
  }

  function handleHistoryClear() {
    if (!historyConfirmClear) {
      historyConfirmClear = true
      setTimeout(() => { historyConfirmClear = false }, 3_000)
      return
    }
    clearHistory()
    historyConfirmClear = false
  }

  async function enqueueUpdate(item: RecentUpdate) {
    if (enqueueing.has(item.id)) return
    enqueueing = new Set(enqueueing).add(item.id)
    try {
      await tsunagu.enqueueDownload(item.mangaId, item.id)
      addToast({ kind: 'download', title: t('recent.toast.downloadQueued'), body: item.name ?? t('recent.chapter') })
    } catch {
      addToast({ kind: 'error', title: t('recent.toast.downloadFailed'), body: t('recent.toast.queueFailed') })
    } finally {
      enqueueing.delete(item.id)
      enqueueing = new Set(enqueueing)
    }
  }

  async function deleteDownloaded(item: RecentUpdate) {
    try {
      await tsunagu.deleteDownload(item.mangaId, item.id)
      updates = updates.map(u => u.id === item.id ? { ...u, downloaded: false } : u)
      seriesState.markChaptersDeleted(item.mangaId, [item.id])
      libraryState.patchDownloadCount(item.mangaId, -1)
    } catch {
      addToast({ kind: 'error', title: t('recent.toast.deleteFailed'), body: t('recent.toast.deleteDownloadFailed') })
    }
  }

</script>

<div class="root anim-fade-in">
  <RecentToolbar
    {tab}
    {historySearch}
    {updatesSearch}
    {historyConfirmClear}
    hasHistory={historyState.sessions.length > 0}
    {updatesLoading}
    {updaterRunning}
    onTabChange={(next) => tab = next}
    onHistorySearchChange={(v) => historySearch = v}
    onUpdatesSearchChange={(v) => updatesSearch = v}
    onHistoryClear={handleHistoryClear}
    onRefreshUpdates={runLibraryUpdate}
  />

  <div class="content">
    {#if tab === 'updates'}
      <UpdatesTab
        loading={updatesLoading}
        error={updatesError}
        groups={updateGroups}
        {updatesSearch}
        totalCount={visibleUpdates.filter(u => !u.isRead).length}
        {openingId}
        {enqueueing}
        {updaterRunning}
        lastUpdatedLabel={updateStatus?.finishedAt ? new Date(updateStatus.finishedAt).toLocaleString() : null}
        {updaterProgressLabel}
        onOpenUpdate={openUpdate}
        onOpenSeries={(item) => setActiveManga(mangaStub(item))}
        onEnqueue={enqueueUpdate}
        onDeleteDownload={deleteDownloaded}
      />
    {:else}
      <HistoryTab
        groups={historyGroups}
        hasHistory={historyState.sessions.length > 0}
        {historySearch}
        stats={historyState.stats}
        {thumbFor}
        onOpenChapter={(mangaId, chapterId) => goto(`/media/${encodeURIComponent(mangaId)}/${encodeURIComponent(chapterId)}`)}
        onDeleteMangaHistory={(mangaId) => historyState.clearMangaHistory(mangaId)}
      />
    {/if}
  </div>
</div>

<style>
  .root    { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .content { flex: 1; min-height: 0; overflow: hidden; }
</style>
