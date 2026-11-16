<script lang="ts">
  import { onMount } from 'svelte'
  import { ArrowCounterClockwise, LockSimple, Warning } from 'phosphor-svelte'
  import { automationState, loadAutomation, saveAutomation, resetMediaAutomation, hasOverrides } from '$lib/state/automation.svelte'
  import type { AutomationSettingsInput, RefreshInterval } from '$lib/server-adapters/types'
  import { t, type MessageKey } from '$lib/i18n/index.svelte'

  const DOWNLOAD_AHEAD_OPTIONS: { value: number; label?: MessageKey }[] = [{ value: 0, label: 'common.off' },{ value: 2 },{ value: 5 },{ value: 10 }]
  const MAX_KEEP_OPTIONS:       { value: number; label?: MessageKey }[] = [{ value: 0, label: 'common.off' },{ value: 5 },{ value: 10 },{ value: 25 }]
  const DELETE_DELAY_OPTIONS:   { value: number; label: MessageKey }[] = [{ value: 0, label: 'settings.automation.delayNow' },{ value: 24, label: 'settings.automation.delayDay' },{ value: 168, label: 'settings.automation.delayWeek' }]
  const REFRESH_INTERVAL_OPTIONS: { value: RefreshInterval; label: MessageKey }[] = [{ value: 'DAILY', label: 'settings.automation.intervalDaily' },{ value: 'WEEKLY', label: 'settings.automation.intervalWeekly' },{ value: 'MANUAL', label: 'settings.automation.intervalManual' }]

  const s = $derived(automationState.settings)

  function set(patch: AutomationSettingsInput) { void saveAutomation(patch) }

  const customCount = $derived(Object.keys(automationState.overrides).filter(hasOverrides).length)

  const lastUpdated = $derived(
    s?.lastLibraryUpdateAt ? new Date(s.lastLibraryUpdateAt).toLocaleString() : t('common.never'),
  )

  let confirmReset = $state(false)

  async function resetAllCustoms() {
    if (!confirmReset) { confirmReset = true; return }
    confirmReset = false
    await resetMediaAutomation()
  }

  onMount(() => { void loadAutomation() })
</script>

<div class="s-panel">
  {#if automationState.error && !s}
    <div class="s-banner s-banner-error">{t('settings.automation.loadError', { error: automationState.error })}</div>
  {:else if !s}
    <p class="s-empty">{t('common.loading')}</p>
  {:else}

  <div class="s-section">
    <p class="s-section-title">{t('settings.automation.libraryUpdatesTitle')}</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.automation.updateOnOpen')}</span><span class="s-desc">{t('settings.automation.updateOnOpenDesc', { date: lastUpdated })}</span></div>
        <button role="switch" aria-checked={s.updateOnOpen} aria-label={t('settings.automation.updateOnOpen')} class="s-toggle" class:on={s.updateOnOpen} onclick={() => set({ updateOnOpen: !s.updateOnOpen })}><span class="s-toggle-thumb"></span></button>
      </div>
      <div class="s-row chip-row">
        <div class="s-row-info"><span class="s-label">{t('settings.automation.refreshInterval')}</span><span class="s-desc">{t('settings.automation.refreshIntervalDesc')}</span></div>
        <div class="chip-group">
          {#each REFRESH_INTERVAL_OPTIONS as opt}
            <button class="s-preset" class:active={s.refreshInterval === opt.value} onclick={() => set({ refreshInterval: opt.value })}>{t(opt.label)}</button>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.automation.behaviourTitle')}</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.automation.enable')}</span><span class="s-desc">{t('settings.automation.enableDesc')}</span></div>
        <button role="switch" aria-checked={s.enabled} aria-label={t('settings.automation.enable')} class="s-toggle" class:on={s.enabled} onclick={() => set({ enabled: !s.enabled })}><span class="s-toggle-thumb"></span></button>
      </div>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.automation.enforceGlobal')}</span><span class="s-desc">{t('settings.automation.enforceGlobalDesc')}</span></div>
        <button role="switch" aria-checked={s.enforceGlobal} aria-label={t('settings.automation.enforceGlobal')} class="s-toggle" class:on={s.enforceGlobal} onclick={() => set({ enforceGlobal: !s.enforceGlobal })}><span class="s-toggle-thumb"></span></button>
      </div>
      {#if s.enforceGlobal}
        <div class="s-banner s-banner-info enforce-banner"><LockSimple size={12} weight="fill" /><span>{t('settings.automation.overridesPaused')}</span></div>
      {/if}
    </div>
  </div>

  <div class="s-section" class:disabled={!s.enabled}>
    <p class="s-section-title">{t('settings.automation.globalTitle')}</p>
    <div class="s-section-body">
      <p class="sub-head">{t('settings.automation.downloadsHead')}</p>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.automation.autoDownload')}</span><span class="s-desc">{t('settings.automation.autoDownloadDesc')}</span></div>
        <button role="switch" aria-checked={s.autoDownload} aria-label={t('settings.automation.autoDownload')} class="s-toggle" class:on={s.autoDownload} onclick={() => set({ autoDownload: !s.autoDownload })}><span class="s-toggle-thumb"></span></button>
      </div>
      <div class="s-row chip-row">
        <div class="s-row-info"><span class="s-label">{t('settings.automation.downloadAhead')}</span><span class="s-desc">{t('settings.automation.downloadAheadDesc')}</span></div>
        <div class="chip-group">
          {#each DOWNLOAD_AHEAD_OPTIONS as opt}
            <button class="s-preset" class:active={s.downloadAhead === opt.value} onclick={() => set({ downloadAhead: opt.value })}>{opt.label ? t(opt.label) : String(opt.value)}</button>
          {/each}
        </div>
      </div>
      <div class="s-row chip-row">
        <div class="s-row-info"><span class="s-label">{t('settings.automation.maxKeep')}</span><span class="s-desc">{t('settings.automation.maxKeepDesc')}</span></div>
        <div class="chip-group">
          {#each MAX_KEEP_OPTIONS as opt}
            <button class="s-preset" class:active={s.maxKeepChapters === opt.value} onclick={() => set({ maxKeepChapters: opt.value })}>{opt.label ? t(opt.label) : String(opt.value)}</button>
          {/each}
        </div>
      </div>
      <p class="sub-head sub-head-rule">{t('settings.automation.onReadHead')}</p>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.automation.deleteOnRead')}</span><span class="s-desc">{t('settings.automation.deleteOnReadDesc')}</span></div>
        <button role="switch" aria-checked={s.deleteOnRead} aria-label={t('settings.automation.deleteOnRead')} class="s-toggle" class:on={s.deleteOnRead} onclick={() => set({ deleteOnRead: !s.deleteOnRead })}><span class="s-toggle-thumb"></span></button>
      </div>
      {#if s.deleteOnRead}
        <div class="s-row chip-row sub-row">
          <span class="s-label">{t('settings.automation.deleteDelay')}</span>
          <div class="chip-group">
            {#each DELETE_DELAY_OPTIONS as opt}
              <button class="s-preset" class:active={s.deleteDelayHours === opt.value} onclick={() => set({ deleteDelayHours: opt.value })}>{t(opt.label)}</button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.automation.overridesTitle')}</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.automation.customSeries')}</span><span class="s-desc">{t('settings.automation.customSeriesDesc')}</span></div>
        <span class="s-pill" class:on={customCount > 0}>{customCount}</span>
      </div>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.automation.resetAll')}</span><span class="s-desc">{t('settings.automation.resetAllDesc')}</span></div>
        {#if confirmReset}
          <div class="s-btn-row">
            <button class="s-btn s-btn-danger" onclick={resetAllCustoms}><Warning size={11} weight="fill" /> {t('settings.automation.confirmReset')}</button>
            <button class="s-btn" onclick={() => confirmReset = false}>{t('common.cancel')}</button>
          </div>
        {:else}
          <button class="s-btn" disabled={customCount === 0} onclick={resetAllCustoms}><ArrowCounterClockwise size={11} /> {t('common.reset')}</button>
        {/if}
      </div>
    </div>
  </div>

  {/if}
</div>

<style>
  .enforce-banner { display: flex; align-items: center; gap: var(--sp-2); }
  .sub-head { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-widest); text-transform: uppercase; color: var(--text-faint); margin: 0; padding: var(--sp-2) var(--sp-4) 0; }
  .sub-head-rule { border-top: 1px solid var(--border-dim); padding-top: var(--sp-3); margin-top: var(--sp-1); }
  .chip-row { align-items: flex-start; padding-top: 8px; padding-bottom: 8px; }
  .chip-group { display: flex; flex-direction: row; gap: 4px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
  .s-section.disabled .s-section-body { opacity: 0.55; }
  .sub-row { padding-left: calc(var(--sp-4) + var(--sp-2)); border-left: 2px solid var(--border-dim); }
</style>