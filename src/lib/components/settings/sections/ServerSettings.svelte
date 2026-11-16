<script lang="ts">
  import { tsunagu } from '$lib/server-adapters/tsunagu'
  import { addToast } from '$lib/state/notifications.svelte'
  import type { Action } from 'svelte/action'
  import type { ServerSetting, CloudflareSolver } from '$lib/server-adapters/types'
  import { t, type MessageKey } from '$lib/i18n/index.svelte'

  interface Props {
    selectOpen:      string | null
    closingSelect:   string | null
    toggleSelect:    (id: string) => void
    registerTrigger: (id: string, el: HTMLElement) => void
    getTrigger:      (id: string) => HTMLElement | undefined
    selectPortal:    Action<HTMLElement, HTMLElement | undefined>
    anims:           boolean
  }
  let { selectOpen, closingSelect, toggleSelect, registerTrigger, getTrigger, selectPortal, anims }: Props = $props()

  const LABELS: Record<string, MessageKey> = {
    cloudflare_solver_mode:  'settings.server.labels.cloudflareSolverMode',
    cloudflare_solver_url:   'settings.server.labels.cloudflareSolverUrl',
    novel_enabled:           'settings.server.labels.novelEnabled',
    metadata_backfill:       'settings.server.labels.metadataBackfill',
    idle_timeout_minutes:    'settings.server.labels.idleTimeoutMinutes',
    tracker_poll_hours:      'settings.server.labels.trackerPollHours',
    public_url:              'settings.server.labels.publicUrl',
    anilist_client_id:       'settings.server.labels.anilistClientId',
    mal_client_id:           'settings.server.labels.malClientId',
    mal_client_secret:       'settings.server.labels.malClientSecret',
    media_dir:               'settings.server.labels.mediaDir',
    jar_cache_dir:           'settings.server.labels.jarCacheDir',
    sandbox_heap_mb:         'settings.server.labels.sandboxHeapMb',
    sandbox_addr:            'settings.server.labels.sandboxAddr',
    sandbox_port:            'settings.server.labels.sandboxPort',
    sandbox_extensions_dir:  'settings.server.labels.sandboxExtensionsDir',
    sandbox_storage_dir:     'settings.server.labels.sandboxStorageDir',
    pprof_addr:              'settings.server.labels.pprofAddr',
    data_dir:                'settings.server.labels.dataDir',
    db_path:                 'settings.server.labels.dbPath',
    http_addr:               'settings.server.labels.httpAddr',
    api_token:               'settings.server.labels.apiToken',
    sandbox_jar_path:        'settings.server.labels.sandboxJarPath',
    sync_addr:               'settings.server.labels.syncAddr',
    allowed_origins:         'settings.server.labels.allowedOrigins',
    server_name:             'settings.server.labels.serverName',
    downloads_dir:           'settings.server.labels.downloadsDir',
    local_source_dir:        'settings.server.labels.localSourceDir',
    backup_interval_hours:   'settings.server.labels.backupIntervalHours',
    backup_retention_count:  'settings.server.labels.backupRetentionCount',
    content_filter_level:    'settings.server.labels.contentFilterLevel',
    manga_download_format:   'settings.server.labels.mangaDownloadFormat',
  }

  const GROUPS: { title: MessageKey; keys: string[] }[] = [
    { title: 'settings.server.groups.cloudflare',   keys: ['cloudflare_solver_mode', 'cloudflare_solver_url'] },
    { title: 'settings.server.groups.features',     keys: ['novel_enabled', 'metadata_backfill', 'idle_timeout_minutes', 'tracker_poll_hours'] },
    { title: 'settings.server.groups.integrations', keys: ['public_url', 'anilist_client_id', 'mal_client_id', 'mal_client_secret'] },
    { title: 'settings.server.groups.directories',  keys: ['media_dir', 'jar_cache_dir', 'sandbox_extensions_dir', 'sandbox_storage_dir'] },
    { title: 'settings.server.groups.sandbox',      keys: ['sandbox_heap_mb', 'sandbox_addr', 'sandbox_port'] },
    { title: 'settings.server.groups.diagnostics',  keys: ['pprof_addr'] },
  ]

  const SOLVER_MODES: [string, MessageKey][] = [['disabled', 'settings.server.solverModes.disabled'], ['external', 'settings.server.solverModes.external'], ['managed', 'settings.server.solverModes.managed']]

  const HINTS: Record<string, MessageKey> = {
    cloudflare_solver_mode: 'settings.server.hints.cloudflareSolverMode',
    cloudflare_solver_url:  'settings.server.hints.cloudflareSolverUrl',
    idle_timeout_minutes:   'settings.server.hints.idleTimeoutMinutes',
    tracker_poll_hours:     'settings.server.hints.trackerPollHours',
    metadata_backfill:      'settings.server.hints.metadataBackfill',
  }

  function modeLabel(value: string): string {
    const key = SOLVER_MODES.find(([v]) => v === value)?.[1]
    return key ? t(key) : value
  }

  const labelFor = (k: string) => LABELS[k] ? t(LABELS[k]) : k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  function tip(s: ServerSetting): string {
    const parts = [s.description]
    if (s.source === 'FILE') parts.push(t('settings.server.pinnedInToml'))
    if (s.scope === 'SANDBOX_RESTART') parts.push(t('settings.server.restartToApply'))
    if (s.scope === 'FULL_RESTART') parts.push(t('settings.server.fullRestartToApply'))
    return parts.filter(Boolean).join(' · ')
  }

  let settings  = $state<ServerSetting[]>([])
  let loading   = $state(true)
  let error     = $state<string | null>(null)
  let busy      = $state<string | null>(null)
  let drafts    = $state<Record<string, string>>({})
  let rowErrors = $state<Record<string, string>>({})

  const byKey    = $derived(new Map(settings.map(s => [s.key, s])))
  const known    = $derived(new Set(GROUPS.flatMap(g => g.keys)))
  const advanced = $derived(settings.filter(s => s.editable && !known.has(s.key)))
  const readOnly = $derived(settings.filter(s => !s.editable))
  const sections = $derived(
    GROUPS
      .map(g => ({ title: g.title, rows: g.keys.map(k => byKey.get(k)).filter((s): s is ServerSetting => !!s && s.editable) }))
      .filter(g => g.rows.length > 0),
  )

  let triggerSolverMode = $state<HTMLButtonElement>(null!)
  $effect(() => { if (triggerSolverMode) registerTrigger('cf-solver-mode', triggerSolverMode) })

  let cf     = $state<CloudflareSolver | null>(null)
  let cfBusy = $state(false)

  const modeOptions = $derived(
    cf && !cf.supportedOnPlatform ? SOLVER_MODES.filter(([v]) => v !== 'managed') : SOLVER_MODES,
  )

  async function loadCf() {
    try { cf = await tsunagu.cloudflareSolver() } catch { cf = null }
  }

  $effect(() => {
    if (cf?.state !== 'DOWNLOADING') return
    const timer = setTimeout(loadCf, 1500)
    return () => clearTimeout(timer)
  })

  async function cfAction(fn: () => Promise<CloudflareSolver>) {
    if (cfBusy) return
    cfBusy = true
    try {
      cf = await fn()
    } catch (e) {
      addToast({ kind: 'error', title: t('settings.server.solverToastTitle'), body: e instanceof Error ? e.message : String(e) })
    } finally {
      cfBusy = false
    }
  }

  async function load() {
    loading = true
    error = null
    try {
      settings = await tsunagu.serverSettings()
      drafts = Object.fromEntries(settings.map(s => [s.key, s.value]))
      if (settings.some(s => s.key === 'cloudflare_solver_mode')) loadCf()
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      loading = false
    }
  }

  $effect(() => { load() })

  async function commit(s: ServerSetting, value: string) {
    if (value === s.value || busy) return
    busy = s.key
    rowErrors = { ...rowErrors, [s.key]: '' }
    try {
      const res = await tsunagu.updateServerSetting(s.key, value)
      settings = settings.map(x => x.key === s.key ? res.setting : x)
      drafts = { ...drafts, [s.key]: res.setting.value }
      addToast({ kind: 'success', title: t('settings.server.savedToast'), body: labelFor(s.key) })
      if (s.key === 'cloudflare_solver_mode') loadCf()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      rowErrors = { ...rowErrors, [s.key]: msg }
      drafts = { ...drafts, [s.key]: s.value }
    } finally {
      busy = null
    }
  }
</script>

<div class="s-panel">
  {#if loading}
    <div class="s-section"><div class="s-section-body"><div class="s-row"><span class="s-desc">{t('common.loading')}</span></div></div></div>
  {:else if error}
    <div class="s-section"><div class="s-section-body">
      <div class="s-row"><span class="s-desc ss-err">{error}</span><button class="s-btn" onclick={load}>{t('common.retry')}</button></div>
    </div></div>
  {:else if settings.length === 0}
    <div class="s-section"><div class="s-section-body"><div class="s-row"><span class="s-desc">{t('settings.server.noSettings')}</span></div></div></div>
  {:else}
    {#snippet control(s: ServerSetting)}
      {#if s.type === 'BOOL'}
        <button role="switch" aria-checked={s.value === 'true'} aria-label={labelFor(s.key)}
          class="s-toggle" class:on={s.value === 'true'} disabled={busy === s.key}
          onclick={() => commit(s, s.value === 'true' ? 'false' : 'true')}>
          <span class="s-toggle-thumb"></span>
        </button>
      {:else if s.key === 'cloudflare_solver_mode'}
        <div class="s-select">
          <button bind:this={triggerSolverMode} class="s-select-btn" onclick={() => toggleSelect('cf-solver-mode')}>
            <span>{modeLabel(s.value)}</span>
            <svg class="s-select-caret" class:open={selectOpen === 'cf-solver-mode'} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === 'cf-solver-mode' || closingSelect === 'cf-solver-mode'}
            <div use:selectPortal={getTrigger('cf-solver-mode')} class="s-select-menu" class:anims class:closing={closingSelect === 'cf-solver-mode'}>
              {#each modeOptions as [v, l]}
                <button class="s-select-option" class:active={s.value === v} onclick={() => { commit(s, v); toggleSelect('cf-solver-mode') }}>{t(l)}</button>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <input class="s-input" type={s.type === 'INT' ? 'number' : 'text'} min={s.type === 'INT' ? 0 : undefined}
          value={drafts[s.key] ?? ''} placeholder={s.default || '—'} disabled={busy === s.key}
          oninput={(e) => drafts = { ...drafts, [s.key]: (e.currentTarget as HTMLInputElement).value }}
          onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }}
          onblur={() => commit(s, drafts[s.key] ?? '')} />
      {/if}
    {/snippet}

    {#snippet cfStatus()}
      {#if cf && cf.state !== 'NOT_INSTALLED'}
        <div class="s-row ss-cf">
          {#if cf.state === 'DOWNLOADING'}
            <div class="ss-bar"><span style="width:{Math.round((cf.downloadProgress ?? 0) * 100)}%"></span></div>
            <span class="s-step-val">{Math.round((cf.downloadProgress ?? 0) * 100)}%</span>
          {:else if cf.state === 'ERROR'}
            <span class="s-desc ss-err">{cf.error ?? t('settings.server.solverInstallFailed')}</span>
            <button class="s-btn" disabled={cfBusy} onclick={() => cfAction(tsunagu.installCloudflareSolver)}>{t('common.retry')}</button>
          {:else}
            <span class="s-desc">{cf.state === 'RUNNING' ? t('settings.server.solverRunning') : t('settings.server.solverInstalled')}</span>
            <button class="s-btn s-btn-danger" disabled={cfBusy} onclick={() => cfAction(tsunagu.uninstallCloudflareSolver)}>{t('common.remove')}</button>
          {/if}
        </div>
      {/if}
    {/snippet}

    {#snippet rows(list: ServerSetting[])}
      {#each list as s (s.key)}
        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label" title={tip(s)}>
              {labelFor(s.key)}{#if s.scope !== 'LIVE'}<span class="ss-r" title={s.scope === 'FULL_RESTART' ? t('settings.server.fullRestartToApply') : t('settings.server.restartToApply')}>⟳</span>{/if}
            </span>
            {#if HINTS[s.key]}<span class="s-desc">{t(HINTS[s.key])}</span>{/if}
            {#if rowErrors[s.key]}<span class="s-desc ss-err">{rowErrors[s.key]}</span>{/if}
          </div>
          {@render control(s)}
        </div>
        {#if s.key === 'cloudflare_solver_mode' && s.value === 'managed'}{@render cfStatus()}{/if}
      {/each}
    {/snippet}

    {#each sections as g (g.title)}
      <div class="s-section">
        <p class="s-section-title">{t(g.title)}</p>
        <div class="s-section-body">{@render rows(g.rows)}</div>
      </div>
    {/each}

    {#if advanced.length > 0}
      <div class="s-section">
        <p class="s-section-title">{t('settings.server.advancedTitle')}</p>
        <div class="s-section-body">{@render rows(advanced)}</div>
      </div>
    {/if}

    <div class="s-section">
      <p class="s-section-title">{t('settings.server.readOnlyTitle')}</p>
      <div class="s-section-body">
        {#each readOnly as s (s.key)}
          <div class="s-row">
            <div class="s-row-info"><span class="s-label" title={s.description}>{labelFor(s.key)}</span></div>
            <span class="s-step-val" title={s.value}>{s.value || '—'}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .ss-err { color: var(--color-error); }
  .ss-r { margin-left: 6px; color: var(--text-faint); cursor: help; }
  .ss-cf { gap: var(--sp-3); }
  .ss-cf .s-desc { flex: 1; }
  .ss-bar { flex: 1; height: 4px; border-radius: var(--radius-full); background: var(--bg-overlay); overflow: hidden; }
  .ss-bar span { display: block; height: 100%; background: var(--accent); transition: width var(--t-base); }
</style>
