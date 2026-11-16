<script lang="ts">
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'
  import { platformService } from '$lib/platform-service'

  import { selectPortal as _defaultPortal } from '$lib/core/ui/selectPortal'
  import type { Action } from 'svelte/action'
  import { canonicalLang, displayLang, langBadge, closestLang, KNOWN_LANGS, LANG_ALL } from '$lib/core/lang'
  import { t, setLocale, resolveLocale, localeName, LOCALES, SYSTEM_LOCALE, type MessageKey } from '$lib/i18n/index.svelte'

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

  let triggerIdleTimeout = $state<HTMLButtonElement>(null!)
  $effect(() => { if (triggerIdleTimeout) registerTrigger('idle-timeout', triggerIdleTimeout) })

  let triggerDefaultView = $state<HTMLButtonElement>(null!)
  $effect(() => { if (triggerDefaultView) registerTrigger('default-view', triggerDefaultView) })

  let triggerUiLocale = $state<HTMLButtonElement>(null!)
  $effect(() => { if (triggerUiLocale) registerTrigger('ui-locale', triggerUiLocale) })

  const DEFAULT_VIEW_OPTIONS: [string, MessageKey][] = [
    ['home',       'nav.home'],
    ['library',    'nav.library'],
    ['browse',     'nav.browse'],
    ['downloads',  'nav.downloads'],
    ['recent',     'nav.recent'],
    ['extensions', 'nav.extensions'],
  ]

  const CLOSE_OPTIONS: ['ask' | 'tray' | 'quit', MessageKey][] = [
    ['ask',  'settings.general.closeAsk'],
    ['tray', 'settings.general.closeTray'],
    ['quit', 'settings.general.closeQuit'],
  ]

  const IDLE_OPTIONS = [0, 1, 2, 5, 10, 15, 30]

  function idleLabel(min: number): string {
    return min === 0 ? t('common.never') : t('common.minutes', { count: min })
  }

  const uiLocalePref = $derived(settingsState.settings.uiLocale ?? SYSTEM_LOCALE)

  function uiLocaleLabel(pref: string): string {
    return pref === SYSTEM_LOCALE
      ? t('settings.general.appLanguageSystem', { language: localeName(resolveLocale(SYSTEM_LOCALE)) })
      : localeName(pref)
  }

  function pickUiLocale(pref: string) {
    updateSettings({ uiLocale: pref })
    void setLocale(pref)
    toggleSelect('ui-locale')
  }

  const currentLang = $derived(canonicalLang(settingsState.settings.preferredExtensionLang ?? LANG_ALL))

  let langDraft = $state(langBadge(settingsState.settings.preferredExtensionLang ?? LANG_ALL))
  let langHint  = $state<string | null>(null)

  $effect(() => { langDraft = langBadge(currentLang) })

  function commitLangDraft() {
    const canon = canonicalLang(langDraft)
    langHint = null

    if (canon === currentLang) { langDraft = langBadge(canon); return }

    updateSettings({ preferredExtensionLang: canon })
    langDraft = langBadge(canon)

    if (canon !== LANG_ALL && !KNOWN_LANGS.includes(canon)) {
      const suggestion = closestLang(canon)
      langHint = suggestion
        ? t('settings.general.langHintSuggest', { code: langBadge(suggestion) })
        : t('settings.general.langHintKept')
    }
  }

</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">{t('settings.general.scaleTitle')}</p>
    <div class="s-section-body">
      <p class="s-desc" style="padding:var(--sp-2) var(--sp-4) 0">{t('settings.general.scaleDesc')}</p>
      <div class="s-slider-row">
        <input type="range" min={50} max={200} step={5}
          value={Math.round((settingsState.settings.uiZoom ?? 1.0) * 100)}
          oninput={(e) => updateSettings({ uiZoom: Number(e.currentTarget.value) / 100 })}
          class="s-slider" />
        <input type="number" min={50} max={200} step={1} class="s-slider-val"
          value={Math.round((settingsState.settings.uiZoom ?? 1.0) * 100)}
          oninput={(e) => { const n = parseInt(e.currentTarget.value, 10); if (!isNaN(n) && n >= 50 && n <= 200) updateSettings({ uiZoom: n / 100 }) }}
          onblur={(e) => { const n = parseInt(e.currentTarget.value, 10); if (isNaN(n) || n < 50) { updateSettings({ uiZoom: 0.5 }); e.currentTarget.value = '50' } else if (n > 200) { updateSettings({ uiZoom: 2.0 }); e.currentTarget.value = '200' } }}
        />
        <span class="s-slider-unit">%</span>
        <button class="s-btn-icon" onclick={() => updateSettings({ uiZoom: 1.0 })} disabled={(settingsState.settings.uiZoom ?? 1.0) === 1.0} title={t('settings.general.scaleReset')}>↺</button>
      </div>
      <div class="s-presets">
        {#each [50,60,70,80,90,100,110,125,150,175,200] as v}
          <button class="s-preset" class:active={Math.round((settingsState.settings.uiZoom ?? 1.0) * 100) === v} onclick={() => updateSettings({ uiZoom: v / 100 })}>{v}%</button>
        {/each}
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.general.serverTitle')}</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">{t('settings.general.serverUrl')}</span>
          <span class="s-desc">{t('settings.general.serverUrlDesc')}</span>
        </div>
        <input class="s-input" value={settingsState.settings.serverUrl ?? 'http://localhost:6007'}
          oninput={(e) => updateSettings({ serverUrl: e.currentTarget.value })}
          placeholder="http://localhost:6007" spellcheck="false" />
      </div>

      <label class="s-row">
        <div class="s-row-info">
          <span class="s-label">{t('settings.general.serverAutoStart')}</span>
          <span class="s-desc">{t('settings.general.serverAutoStartDesc')}</span>
        </div>
        <button role="switch" aria-checked={settingsState.settings.serverAutoStart ?? true} aria-label={t('settings.general.serverAutoStart')}
          class="s-toggle" class:on={settingsState.settings.serverAutoStart ?? true}
          onclick={() => updateSettings({ serverAutoStart: !(settingsState.settings.serverAutoStart ?? true) })}>
          <span class="s-toggle-thumb"></span>
        </button>
      </label>

    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.general.startupTitle')}</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.general.defaultView')}</span><span class="s-desc">{t('settings.general.defaultViewDesc')}</span></div>
        <div class="s-select">
          <button bind:this={triggerDefaultView} class="s-select-btn" onclick={() => toggleSelect('default-view')}>
            <span>{t(DEFAULT_VIEW_OPTIONS.find(([v]) => v === (settingsState.settings.defaultView ?? 'home'))?.[1] ?? 'nav.home')}</span>
            <svg class="s-select-caret" class:open={selectOpen === 'default-view'} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === 'default-view' || closingSelect === 'default-view'}
            <div use:selectPortal={getTrigger('default-view')} class="s-select-menu" class:anims class:closing={closingSelect === 'default-view'}>
              {#each DEFAULT_VIEW_OPTIONS as [v, l]}
                <button class="s-select-option" class:active={(settingsState.settings.defaultView ?? 'home') === v} onclick={() => { updateSettings({ defaultView: v as typeof settingsState.settings.defaultView }); toggleSelect('default-view') }}>{t(l)}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.general.windowTitle')}</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.general.closeAction')}</span><span class="s-desc">{t('settings.general.closeActionDesc')}</span></div>
        <div class="s-seg">
          {#each CLOSE_OPTIONS as [v, l]}
            <button class="s-seg-btn" class:active={(settingsState.settings.closeAction ?? 'ask') === v} onclick={() => updateSettings({ closeAction: v })}>{t(l)}</button>
          {/each}
        </div>
      </div>

      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.general.windowControls')}</span><span class="s-desc">{t('settings.general.windowControlsDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.windowControls ?? true} aria-label={t('settings.general.windowControls')}
          class="s-toggle" class:on={settingsState.settings.windowControls ?? true}
          onclick={() => updateSettings({ windowControls: !(settingsState.settings.windowControls ?? true) })}>
          <span class="s-toggle-thumb"></span>
        </button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.general.inactivityTitle')}</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.general.idleTimeout')}</span><span class="s-desc">{t('settings.general.idleTimeoutDesc')}</span></div>
        <div class="s-select">
          <button bind:this={triggerIdleTimeout} class="s-select-btn" onclick={() => toggleSelect('idle-timeout')}>
            <span>{IDLE_OPTIONS.includes(settingsState.settings.idleTimeoutMin ?? 5) ? idleLabel(settingsState.settings.idleTimeoutMin ?? 5) : t('common.minutesShort', { count: settingsState.settings.idleTimeoutMin ?? 5 })}</span>
            <svg class="s-select-caret" class:open={selectOpen === 'idle-timeout'} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === 'idle-timeout' || closingSelect === 'idle-timeout'}
            <div use:selectPortal={getTrigger('idle-timeout')} class="s-select-menu" class:anims class:closing={closingSelect === 'idle-timeout'}>
              {#each IDLE_OPTIONS as v}
                <button class="s-select-option" class:active={(settingsState.settings.idleTimeoutMin ?? 5) === v} onclick={() => { updateSettings({ idleTimeoutMin: v }); toggleSelect('idle-timeout') }}>{idleLabel(v)}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.general.integrationsTitle')}</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.general.discordRpc')}</span><span class="s-desc">{t('settings.general.discordRpcDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.discordRpc} aria-label={t('settings.general.discordRpc')} class="s-toggle" class:on={settingsState.settings.discordRpc} onclick={() => updateSettings({ discordRpc: !settingsState.settings.discordRpc })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.general.animationsTitle')}</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.general.qolAnimations')}</span><span class="s-desc">{t('settings.general.qolAnimationsDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.qolAnimations ?? true} aria-label={t('settings.general.qolAnimations')} class="s-toggle" class:on={settingsState.settings.qolAnimations ?? true} onclick={() => updateSettings({ qolAnimations: !(settingsState.settings.qolAnimations ?? true) })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.general.languageTitle')}</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.general.appLanguage')}</span><span class="s-desc">{t('settings.general.appLanguageDesc')}</span></div>
        <div class="s-select">
          <button bind:this={triggerUiLocale} class="s-select-btn" onclick={() => toggleSelect('ui-locale')}>
            <span>{uiLocaleLabel(uiLocalePref)}</span>
            <svg class="s-select-caret" class:open={selectOpen === 'ui-locale'} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === 'ui-locale' || closingSelect === 'ui-locale'}
            <div use:selectPortal={getTrigger('ui-locale')} class="s-select-menu" class:anims class:closing={closingSelect === 'ui-locale'}>
              {#each [SYSTEM_LOCALE, ...LOCALES] as code}
                <button class="s-select-option" class:active={uiLocalePref === code} onclick={() => pickUiLocale(code)}>{uiLocaleLabel(code)}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">{t('settings.general.sourceLanguage')}</span>
          <span class="s-desc">
            {t('settings.general.sourceLanguageDesc', { language: displayLang(currentLang) })}
            {#if langHint}<br><span style="color:var(--color-error)">{langHint}</span>{/if}
          </span>
        </div>
        <input class="s-input"
          style="width:88px;text-align:center;text-transform:uppercase"
          value={langDraft}
          oninput={(e) => { langDraft = e.currentTarget.value; langHint = null }}
          onblur={commitLangDraft}
          onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
          placeholder="ALL" spellcheck="false" />
      </div>
    </div>
  </div>

</div>

<style>
  .s-seg { display: flex; border: 1px solid var(--border-strong); border-radius: var(--radius-md); overflow: hidden; }
  .s-seg-btn { flex: 1; padding: var(--sp-1) var(--sp-3); font-family: var(--font-ui); font-size: var(--text-sm); color: var(--text-faint); background: transparent; cursor: pointer; transition: background var(--t-base), color var(--t-base); border: none; }
  .s-seg-btn:not(:last-child) { border-right: 1px solid var(--border-strong); }
  .s-seg-btn.active { background: var(--accent-muted); color: var(--accent-fg); }
  .s-seg-btn:not(.active):hover { background: var(--bg-raised); color: var(--text-secondary); }
</style>
