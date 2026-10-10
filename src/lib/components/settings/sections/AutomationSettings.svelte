<script lang="ts">
  import { onMount } from 'svelte'
  import { ArrowCounterClockwise, LockSimple, Warning } from 'phosphor-svelte'
  import { automationState, loadAutomation, saveAutomation, resetMediaAutomation, hasOverrides } from '$lib/state/automation.svelte'
  import type { AutomationSettingsInput, RefreshInterval } from '$lib/server-adapters/types'

  const DOWNLOAD_AHEAD_OPTIONS = [{ value: 0, label: 'Off' },{ value: 2, label: '2' },{ value: 5, label: '5' },{ value: 10, label: '10' }]
  const MAX_KEEP_OPTIONS       = [{ value: 0, label: 'Off' },{ value: 5, label: '5' },{ value: 10, label: '10' },{ value: 25, label: '25' }]
  const DELETE_DELAY_OPTIONS   = [{ value: 0, label: 'Now' },{ value: 24, label: '1 day' },{ value: 168, label: '1 week' }]
  const REFRESH_INTERVAL_OPTIONS: { value: RefreshInterval; label: string }[] = [{ value: 'DAILY', label: 'Daily' },{ value: 'WEEKLY', label: 'Weekly' },{ value: 'MANUAL', label: 'Manual' }]

  const s = $derived(automationState.settings)

  function set(patch: AutomationSettingsInput) { void saveAutomation(patch) }

  const customCount = $derived(Object.keys(automationState.overrides).filter(hasOverrides).length)

  const lastUpdated = $derived(
    s?.lastLibraryUpdateAt ? new Date(s.lastLibraryUpdateAt).toLocaleString() : 'Never',
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
    <div class="s-banner s-banner-error">Couldn't load automation settings: {automationState.error}</div>
  {:else if !s}
    <p class="s-empty">Loading…</p>
  {:else}

  <div class="s-section">
    <p class="s-section-title">Library Updates</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Update library on app open</span><span class="s-desc">Check every series for new chapters when Moku starts. Last update: {lastUpdated}</span></div>
        <button role="switch" aria-checked={s.updateOnOpen} aria-label="Update library on app open" class="s-toggle" class:on={s.updateOnOpen} onclick={() => set({ updateOnOpen: !s.updateOnOpen })}><span class="s-toggle-thumb"></span></button>
      </div>
      <div class="s-row chip-row">
        <div class="s-row-info"><span class="s-label">Automatic refresh interval</span><span class="s-desc">How often the server checks series for new chapters on its own, even while Moku is closed</span></div>
        <div class="chip-group">
          {#each REFRESH_INTERVAL_OPTIONS as opt}
            <button class="s-preset" class:active={s.refreshInterval === opt.value} onclick={() => set({ refreshInterval: opt.value })}>{opt.label}</button>
          {/each}
        </div>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Behaviour</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Enable automation</span><span class="s-desc">Run the download and delete rules below, and the automatic refresh interval. Updating on app open works either way.</span></div>
        <button role="switch" aria-checked={s.enabled} aria-label="Enable automation" class="s-toggle" class:on={s.enabled} onclick={() => set({ enabled: !s.enabled })}><span class="s-toggle-thumb"></span></button>
      </div>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Enforce global defaults</span><span class="s-desc">Ignore per-series overrides.</span></div>
        <button role="switch" aria-checked={s.enforceGlobal} aria-label="Enforce global defaults" class="s-toggle" class:on={s.enforceGlobal} onclick={() => set({ enforceGlobal: !s.enforceGlobal })}><span class="s-toggle-thumb"></span></button>
      </div>
      {#if s.enforceGlobal}
        <div class="s-banner s-banner-info enforce-banner"><LockSimple size={12} weight="fill" /><span>Per-series overrides are paused.</span></div>
      {/if}
    </div>
  </div>

  <div class="s-section" class:disabled={!s.enabled}>
    <p class="s-section-title">Global Defaults</p>
    <div class="s-section-body">
      <p class="sub-head">Downloads</p>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Auto-download new chapters</span><span class="s-desc">Queue new chapters found by a library update. Folders marked for auto-download always do this.</span></div>
        <button role="switch" aria-checked={s.autoDownload} aria-label="Auto-download new chapters" class="s-toggle" class:on={s.autoDownload} onclick={() => set({ autoDownload: !s.autoDownload })}><span class="s-toggle-thumb"></span></button>
      </div>
      <div class="s-row chip-row">
        <div class="s-row-info"><span class="s-label">Download ahead</span><span class="s-desc">Queue the next chapters after one is marked read</span></div>
        <div class="chip-group">
          {#each DOWNLOAD_AHEAD_OPTIONS as opt}
            <button class="s-preset" class:active={s.downloadAhead === opt.value} onclick={() => set({ downloadAhead: opt.value })}>{opt.label}</button>
          {/each}
        </div>
      </div>
      <div class="s-row chip-row">
        <div class="s-row-info"><span class="s-label">Max chapters to keep</span><span class="s-desc">Delete the oldest downloads of a series past this limit</span></div>
        <div class="chip-group">
          {#each MAX_KEEP_OPTIONS as opt}
            <button class="s-preset" class:active={s.maxKeepChapters === opt.value} onclick={() => set({ maxKeepChapters: opt.value })}>{opt.label}</button>
          {/each}
        </div>
      </div>
      <p class="sub-head sub-head-rule">On Read</p>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Delete after reading</span><span class="s-desc">Remove a chapter's download once it's marked read</span></div>
        <button role="switch" aria-checked={s.deleteOnRead} aria-label="Delete after reading" class="s-toggle" class:on={s.deleteOnRead} onclick={() => set({ deleteOnRead: !s.deleteOnRead })}><span class="s-toggle-thumb"></span></button>
      </div>
      {#if s.deleteOnRead}
        <div class="s-row chip-row sub-row">
          <span class="s-label">Delete delay</span>
          <div class="chip-group">
            {#each DELETE_DELAY_OPTIONS as opt}
              <button class="s-preset" class:active={s.deleteDelayHours === opt.value} onclick={() => set({ deleteDelayHours: opt.value })}>{opt.label}</button>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">Custom Overrides</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Series with custom rules</span><span class="s-desc">Per-series settings set via the series automation panel</span></div>
        <span class="s-pill" class:on={customCount > 0}>{customCount}</span>
      </div>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">Reset all custom rules</span><span class="s-desc">Revert every series to the global defaults above</span></div>
        {#if confirmReset}
          <div class="s-btn-row">
            <button class="s-btn s-btn-danger" onclick={resetAllCustoms}><Warning size={11} weight="fill" /> Confirm reset</button>
            <button class="s-btn" onclick={() => confirmReset = false}>Cancel</button>
          </div>
        {:else}
          <button class="s-btn" disabled={customCount === 0} onclick={resetAllCustoms}><ArrowCounterClockwise size={11} /> Reset</button>
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