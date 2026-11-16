<script lang="ts">
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'
  import type { Settings, FitMode } from '$lib/types/settings'
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

  let triggerPageStyle  = $state<HTMLButtonElement>(null!)
  let triggerTransition = $state<HTMLButtonElement>(null!)
  let triggerReadingDir = $state<HTMLButtonElement>(null!)
  let triggerFitMode    = $state<HTMLButtonElement>(null!)
  let triggerBarPos     = $state<HTMLButtonElement>(null!)

  const PAGE_STYLE_OPTIONS: [string, MessageKey][] = [['single','settings.reader.pageSingle'],['double','settings.reader.pageDouble'],['auto','settings.reader.pageAuto'],['longstrip','settings.reader.pageLongstrip']]
  const TRANSITION_OPTIONS: [string, MessageKey][] = [['none','common.none'],['fade','settings.reader.transitionFade'],['slide','settings.reader.transitionSlide'],['flip','settings.reader.transitionTurn']]
  const READING_DIR_OPTIONS: [string, MessageKey][] = [['ltr','settings.reader.dirLtr'],['rtl','settings.reader.dirRtl']]
  const BAR_POS_OPTIONS: [string, MessageKey][] = [['top','settings.reader.barTop'],['left','settings.reader.barLeft'],['right','settings.reader.barRight']]
  const FIT_MODE_OPTIONS: [string, MessageKey][] = [['width','settings.reader.fitWidth'],['height','settings.reader.fitHeight'],['screen','settings.reader.fitScreen'],['original','settings.reader.fitOriginal']]

  function optionLabel(options: [string, MessageKey][], value: string): string {
    const key = options.find(([v]) => v === value)?.[1]
    return key ? t(key) : ''
  }

  $effect(() => { if (triggerPageStyle)  registerTrigger('page-style',  triggerPageStyle)  })
  $effect(() => { if (triggerTransition) registerTrigger('transition',  triggerTransition) })
  $effect(() => { if (triggerReadingDir) registerTrigger('reading-dir', triggerReadingDir) })
  $effect(() => { if (triggerFitMode)    registerTrigger('fit-mode',    triggerFitMode)    })
  $effect(() => { if (triggerBarPos)     registerTrigger('bar-pos',     triggerBarPos)     })
</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">{t('settings.reader.pageLayoutTitle')}</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.reader.defaultLayout')}</span><span class="s-desc">{t('settings.reader.defaultLayoutDesc')}</span></div>
        <div class="s-select">
          <button bind:this={triggerPageStyle} class="s-select-btn" onclick={() => toggleSelect('page-style')}>
            <span>{optionLabel(PAGE_STYLE_OPTIONS, settingsState.settings.pageStyle)}</span>
            <svg class="s-select-caret" class:open={selectOpen === 'page-style'} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === 'page-style' || closingSelect === 'page-style'}
            <div use:selectPortal={getTrigger('page-style')} class="s-select-menu" class:anims class:closing={closingSelect === 'page-style'}>
              {#each PAGE_STYLE_OPTIONS as [v, l]}
                <button class="s-select-option" class:active={settingsState.settings.pageStyle === v} onclick={() => { updateSettings({ pageStyle: v as Settings['pageStyle'] }); toggleSelect('page-style') }}>{t(l)}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.reader.transition')}</span><span class="s-desc">{t('settings.reader.transitionDesc')}</span></div>
        <div class="s-select">
          <button bind:this={triggerTransition} class="s-select-btn" onclick={() => toggleSelect('transition')}>
            <span>{optionLabel(TRANSITION_OPTIONS, settingsState.settings.transition ?? 'none')}</span>
            <svg class="s-select-caret" class:open={selectOpen === 'transition'} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === 'transition' || closingSelect === 'transition'}
            <div use:selectPortal={getTrigger('transition')} class="s-select-menu" class:anims class:closing={closingSelect === 'transition'}>
              {#each TRANSITION_OPTIONS as [v, l]}
                <button class="s-select-option" class:active={(settingsState.settings.transition ?? 'none') === v} onclick={() => { updateSettings({ transition: v as Settings['transition'] }); toggleSelect('transition') }}>{t(l)}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.reader.readingDir')}</span><span class="s-desc">{t('settings.reader.readingDirDesc')}</span></div>
        <div class="s-select">
          <button bind:this={triggerReadingDir} class="s-select-btn" onclick={() => toggleSelect('reading-dir')}>
            <span>{optionLabel(READING_DIR_OPTIONS, settingsState.settings.readingDirection)}</span>
            <svg class="s-select-caret" class:open={selectOpen === 'reading-dir'} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === 'reading-dir' || closingSelect === 'reading-dir'}
            <div use:selectPortal={getTrigger('reading-dir')} class="s-select-menu" class:anims class:closing={closingSelect === 'reading-dir'}>
              {#each READING_DIR_OPTIONS as [v, l]}
                <button class="s-select-option" class:active={settingsState.settings.readingDirection === v} onclick={() => { updateSettings({ readingDirection: v as Settings['readingDirection'] }); toggleSelect('reading-dir') }}>{t(l)}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.reader.pageGap')}</span><span class="s-desc">{t('settings.reader.pageGapDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.pageGap} aria-label={t('settings.reader.pageGap')} class="s-toggle" class:on={settingsState.settings.pageGap} onclick={() => updateSettings({ pageGap: !settingsState.settings.pageGap })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.reader.barsTitle')}</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.reader.barPos')}</span><span class="s-desc">{t('settings.reader.barPosDesc')}</span></div>
        <div class="s-select">
          <button bind:this={triggerBarPos} class="s-select-btn" onclick={() => toggleSelect('bar-pos')}>
            <span>{optionLabel(BAR_POS_OPTIONS, settingsState.settings.barPosition ?? 'top')}</span>
            <svg class="s-select-caret" class:open={selectOpen === 'bar-pos'} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === 'bar-pos' || closingSelect === 'bar-pos'}
            <div use:selectPortal={getTrigger('bar-pos')} class="s-select-menu" class:anims class:closing={closingSelect === 'bar-pos'}>
              {#each BAR_POS_OPTIONS as [v, l]}
                <button class="s-select-option" class:active={(settingsState.settings.barPosition ?? 'top') === v} onclick={() => { updateSettings({ barPosition: v as 'top' | 'left' | 'right' }); toggleSelect('bar-pos') }}>{t(l)}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.reader.tapToggle')}</span><span class="s-desc">{t('settings.reader.tapToggleDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.tapToToggleBar ?? false} aria-label={t('settings.reader.tapToggle')} class="s-toggle" class:on={settingsState.settings.tapToToggleBar ?? false} onclick={() => updateSettings({ tapToToggleBar: !(settingsState.settings.tapToToggleBar ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.reader.containerized')}</span><span class="s-desc">{t('settings.reader.containerizedDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.readerContainerized ?? false} aria-label={t('settings.reader.containerizedAria')} class="s-toggle" class:on={settingsState.settings.readerContainerized ?? false} onclick={() => updateSettings({ readerContainerized: !(settingsState.settings.readerContainerized ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.reader.fitTitle')}</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.reader.fitMode')}</span><span class="s-desc">{t('settings.reader.fitModeDesc')}</span></div>
        <div class="s-select">
          <button bind:this={triggerFitMode} class="s-select-btn" onclick={() => toggleSelect('fit-mode')}>
            <span>{optionLabel(FIT_MODE_OPTIONS, settingsState.settings.fitMode ?? 'width')}</span>
            <svg class="s-select-caret" class:open={selectOpen === 'fit-mode'} width="10" height="6" viewBox="0 0 10 6"><path d="M0 0l5 6 5-6" fill="currentColor"/></svg>
          </button>
          {#if selectOpen === 'fit-mode' || closingSelect === 'fit-mode'}
            <div use:selectPortal={getTrigger('fit-mode')} class="s-select-menu" class:anims class:closing={closingSelect === 'fit-mode'}>
              {#each FIT_MODE_OPTIONS as [v, l]}
                <button class="s-select-option" class:active={(settingsState.settings.fitMode ?? 'width') === v} onclick={() => { updateSettings({ fitMode: v as FitMode }); toggleSelect('fit-mode') }}>{t(l)}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.reader.contrast')}</span><span class="s-desc">{t('settings.reader.contrastDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.optimizeContrast} aria-label={t('settings.reader.contrast')} class="s-toggle" class:on={settingsState.settings.optimizeContrast} onclick={() => updateSettings({ optimizeContrast: !settingsState.settings.optimizeContrast })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.reader.behaviourTitle')}</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.reader.autoMarkRead')}</span><span class="s-desc">{t('settings.reader.autoMarkReadDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.autoMarkRead} aria-label={t('settings.reader.autoMarkReadAria')} class="s-toggle" class:on={settingsState.settings.autoMarkRead} onclick={() => updateSettings({ autoMarkRead: !settingsState.settings.autoMarkRead })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.reader.autoNext')}</span><span class="s-desc">{t('settings.reader.autoNextDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.autoNextChapter ?? false} aria-label={t('settings.reader.autoNext')} class="s-toggle" class:on={settingsState.settings.autoNextChapter} onclick={() => updateSettings({ autoNextChapter: !(settingsState.settings.autoNextChapter ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
      {#if !(settingsState.settings.autoNextChapter ?? false)}
        <label class="s-row">
          <div class="s-row-info"><span class="s-label">{t('settings.reader.markOnSkip')}</span><span class="s-desc">{t('settings.reader.markOnSkipDesc')}</span></div>
          <button role="switch" aria-checked={settingsState.settings.markReadOnNext ?? true} aria-label={t('settings.reader.markOnSkip')} class="s-toggle" class:on={settingsState.settings.markReadOnNext ?? true} onclick={() => updateSettings({ markReadOnNext: !(settingsState.settings.markReadOnNext ?? true) })}><span class="s-toggle-thumb"></span></button>
        </label>
      {/if}
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.reader.autoBookmark')}</span><span class="s-desc">{t('settings.reader.autoBookmarkDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.autoBookmark ?? true} aria-label={t('settings.reader.autoBookmarkAria')} class="s-toggle" class:on={settingsState.settings.autoBookmark ?? true} onclick={() => updateSettings({ autoBookmark: !(settingsState.settings.autoBookmark ?? true) })}><span class="s-toggle-thumb"></span></button>
      </label>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.reader.preload')}</span><span class="s-desc">{t('settings.reader.preloadDesc')}</span></div>
        <div class="s-stepper">
          <button class="s-step-btn" onclick={() => updateSettings({ preloadPages: Math.max(0, settingsState.settings.preloadPages - 1) })} disabled={settingsState.settings.preloadPages <= 0}>−</button>
          <span class="s-step-val">{settingsState.settings.preloadPages}</span>
          <button class="s-step-btn" onclick={() => updateSettings({ preloadPages: Math.min(10, settingsState.settings.preloadPages + 1) })} disabled={settingsState.settings.preloadPages >= 10}>+</button>
        </div>
      </div>
    </div>
  </div>

</div>