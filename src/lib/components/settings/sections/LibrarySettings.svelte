<script lang="ts">
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'
  import { historyState } from '$lib/state/history.svelte'
  import { homeState } from '$lib/state/home.svelte'
  import type { Settings } from '$lib/types/settings'
  import type { Action } from 'svelte/action'
  import { t, type MessageKey } from '$lib/i18n/index.svelte'

  interface Props {
    selectOpen:      string | null
    closingSelect?:  string | null
    toggleSelect:    (id: string) => void
    registerTrigger: (id: string, el: HTMLElement) => void
    getTrigger:      (id: string) => HTMLElement | undefined
    selectPortal:    Action<HTMLElement, HTMLElement | undefined>
    anims:           boolean
  }
  let { selectOpen, closingSelect, toggleSelect, registerTrigger, getTrigger, selectPortal, anims }: Props = $props()

  let triggerSortDir = $state<HTMLButtonElement>(null!)

  const SORT_DIR_OPTIONS: [string, MessageKey][] = [['desc','settings.library.sortNewest'],['asc','settings.library.sortOldest']]

  function sortDirLabel(value: string): string {
    const key = SORT_DIR_OPTIONS.find(([v]) => v === value)?.[1]
    return key ? t(key) : ''
  }

  $effect(() => { if (triggerSortDir) registerTrigger('sort-dir', triggerSortDir) })

  function clearHistory() {
    historyState.clearHistory()
  }
</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">{t('settings.library.displayTitle')}</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.library.statsAlways')}</span><span class="s-desc">{t('settings.library.statsAlwaysDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.libraryStatsAlways ?? false} aria-label={t('settings.library.statsAlways')} class="s-toggle" class:on={settingsState.settings.libraryStatsAlways ?? false} onclick={() => updateSettings({ libraryStatsAlways: !(settingsState.settings.libraryStatsAlways ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.library.cropCovers')}</span><span class="s-desc">{t('settings.library.cropCoversDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.libraryCropCovers} aria-label={t('settings.library.cropCovers')} class="s-toggle" class:on={settingsState.settings.libraryCropCovers} onclick={() => updateSettings({ libraryCropCovers: !settingsState.settings.libraryCropCovers })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.library.showAllSaved')}</span><span class="s-desc">{t('settings.library.showAllSavedDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.libraryShowAllInSaved ?? true} aria-label={t('settings.library.showAllSavedAria')} class="s-toggle" class:on={settingsState.settings.libraryShowAllInSaved ?? true} onclick={() => updateSettings({ libraryShowAllInSaved: !(settingsState.settings.libraryShowAllInSaved ?? true) })}><span class="s-toggle-thumb"></span></button>
      </label>
      {#if settingsState.settings.libraryShowAllInSaved ?? true}
        <label class="s-row">
          <div class="s-row-info"><span class="s-label">{t('settings.library.hideCompleted')}</span><span class="s-desc">{t('settings.library.hideCompletedDesc')}</span></div>
          <button role="switch" aria-checked={settingsState.settings.libraryHideCompletedInSaved ?? false} aria-label={t('settings.library.hideCompletedAria')} class="s-toggle" class:on={settingsState.settings.libraryHideCompletedInSaved ?? false} onclick={() => updateSettings({ libraryHideCompletedInSaved: !(settingsState.settings.libraryHideCompletedInSaved ?? false) })}><span class="s-toggle-thumb"></span></button>
        </label>
      {/if}
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.library.chaptersTitle')}</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.library.sortDir')}</span><span class="s-desc">{t('settings.library.sortDirDesc')}</span></div>
        <div class="s-select">
          <button bind:this={triggerSortDir} class="s-select-btn" onclick={() => toggleSelect('sort-dir')}>
            <span>{sortDirLabel(settingsState.settings.chapterSortDir)}</span>
            <svg class="s-select-caret" class:open={selectOpen === 'sort-dir'} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === 'sort-dir' || closingSelect === 'sort-dir'}
            <div use:selectPortal={getTrigger('sort-dir')} class="s-select-menu" class:anims class:closing={closingSelect === 'sort-dir'}>
              {#each SORT_DIR_OPTIONS as [v, l]}
                <button class="s-select-option" class:active={settingsState.settings.chapterSortDir === v} onclick={() => { updateSettings({ chapterSortDir: v as Settings['chapterSortDir'] }); toggleSelect('sort-dir') }}>{t(l)}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.library.seriesTitle')}</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.library.autoLink')}</span><span class="s-desc">{t('settings.library.autoLinkDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.autoLinkOnOpen ?? false} aria-label={t('settings.library.autoLink')} class="s-toggle" class:on={settingsState.settings.autoLinkOnOpen ?? false} onclick={() => updateSettings({ autoLinkOnOpen: !(settingsState.settings.autoLinkOnOpen ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.library.disableAutoComplete')}</span><span class="s-desc">{t('settings.library.disableAutoCompleteDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.disableAutoComplete} aria-label={t('settings.library.disableAutoComplete')} class="s-toggle" class:on={settingsState.settings.disableAutoComplete} onclick={() => updateSettings({ disableAutoComplete: !settingsState.settings.disableAutoComplete })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.library.history')}</span><span class="s-desc">{t('settings.library.historyDesc', { count: historyState.sessions.length })}</span></div>
        <button class="s-btn s-btn-danger" onclick={clearHistory} disabled={!historyState.sessions.length}>{t('common.clear')}</button>
      </div>
    </div>
  </div>

</div>