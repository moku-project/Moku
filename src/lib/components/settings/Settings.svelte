<script lang="ts">
  import { tick, untrack } from 'svelte'
  import { X, Book, FilmSlate, Image, Sliders, Info, Keyboard, Gear, HardDrives, PaintBrush, ShieldCheck, Robot, Bug, Broadcast, Database, LockKey, ArrowsClockwise } from 'phosphor-svelte'
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'
  import { app } from '$lib/state/app.svelte'
  import { eventToKeybind } from '$lib/core/keybinds/keybindEngine'
  import type { Keybinds } from '$lib/core/keybinds/defaultBinds'
  import { selectPortal } from '$lib/core/ui/selectPortal'
  import { trackerState } from '$lib/state/trackers.svelte'
  import { t, type MessageKey } from '$lib/i18n/index.svelte'

  import GeneralSettings     from './sections/GeneralSettings.svelte'
  import AppearanceSettings  from './sections/AppearanceSettings.svelte'
  import ReaderSettings      from './sections/ReaderSettings.svelte'
  import PlayerSettings      from './sections/PlayerSettings.svelte'
  import LibrarySettings     from './sections/LibrarySettings.svelte'
  import AutomationSettings  from './sections/AutomationSettings.svelte'
  import PerformanceSettings from './sections/PerformanceSettings.svelte'
  import KeybindsSettings    from './sections/KeybindsSettings.svelte'
  import StorageSettings     from './sections/StorageSettings.svelte'
  import FoldersSettings     from './sections/FoldersSettings.svelte'
  import ContentSettings     from './sections/ContentSettings.svelte'
  import AboutSettings       from './sections/AboutSettings.svelte'
  import DevtoolsSettings    from './sections/DevToolsSettings.svelte'
  import TrackingSettings    from './sections/TrackingSettings.svelte'
  import ServerSettings      from './sections/ServerSettings.svelte'
  import AuthSettings        from './sections/AuthSettings.svelte'
  import SyncSettings        from './sections/SyncSettings.svelte'
  import ModalBlur           from '$lib/components/shared/ui/ModalBlur.svelte'
  import BugReporter         from './BugReporter.svelte'
  import TrackerImportModal  from '$lib/components/tracking/TrackerImportModal.svelte'

  interface Props { onclose?: () => void; onOpenThemeEditor?: (id?: string | null) => void }
  let { onclose, onOpenThemeEditor }: Props = $props()

  type Tab = 'general'|'appearance'|'reader'|'player'|'library'|'automation'|'tracking'|'performance'|'keybinds'|'storage'|'content'|'sync'|'server'|'auth'|'about'
  const TABS: { id: Tab; label: MessageKey; icon: any }[] = [
    { id: 'general',     label: 'settings.shell.tabGeneral',     icon: Gear        },
    { id: 'appearance',  label: 'settings.shell.tabAppearance',  icon: PaintBrush  },
    { id: 'reader',      label: 'settings.shell.tabReader',      icon: Book        },
    { id: 'player',      label: 'settings.shell.tabPlayer',      icon: FilmSlate   },
    { id: 'library',     label: 'settings.shell.tabLibrary',     icon: Image       },
    { id: 'automation',  label: 'settings.shell.tabAutomation',  icon: Robot       },
    { id: 'tracking',    label: 'settings.shell.tabTracking',    icon: Broadcast   },
    { id: 'performance', label: 'settings.shell.tabPerformance', icon: Sliders     },
    { id: 'keybinds',    label: 'settings.shell.tabKeybinds',    icon: Keyboard    },
    { id: 'storage',     label: 'settings.shell.tabStorage',     icon: HardDrives  },
    { id: 'content',     label: 'settings.shell.tabContent',     icon: ShieldCheck },
    { id: 'sync',        label: 'settings.shell.tabSync',        icon: ArrowsClockwise },
    { id: 'server',      label: 'settings.shell.tabServer',      icon: Database    },
    { id: 'auth',        label: 'settings.shell.tabAuth',        icon: LockKey     },
    { id: 'about',       label: 'settings.shell.tabAbout',       icon: Info        },
  ]

  const anims = $derived(settingsState.settings.qolAnimations ?? true)
  let tab: Tab           = $state((TABS.some(x => x.id === app.settingsTab) ? app.settingsTab : 'general') as Tab)
  let prevTabIndex       = $state(0)
  let tabSlideDir        = $state<'up'|'down'>('down')
  let tabIconKey         = $state(0)
  let contentBodyEl: HTMLDivElement
  let modalEl: HTMLDivElement
  let bugReporterOpen    = $state(false)
  let importKey          = $state<string | null>(null)
  let syncPopupOpen      = $state(false)
  const activeTab        = $derived(TABS.find(x => x.id === tab))

  $effect(() => { tab; tick().then(() => contentBodyEl?.scrollTo({ top: 0 })) })

  function setTab(id: Tab) {
    if (anims) {
      const next = TABS.findIndex(x => x.id === id)
      tabSlideDir = next > prevTabIndex ? 'down' : 'up'
      prevTabIndex = next
      tabIconKey++
    }
    tab = id
  }

  $effect(() => {
    const want = app.settingsTab
    untrack(() => { if (want !== tab && TABS.some(x => x.id === want)) setTab(want as Tab) })
  })

  function close() { onclose?.() }

  let listeningKey: keyof Keybinds | null = $state(null)

  $effect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !listeningKey && !bugReporterOpen && !importKey && !syncPopupOpen) { e.stopPropagation(); close() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  $effect(() => {
    if (!listeningKey) return
    const capture = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation()
      const bind = eventToKeybind(e)
      if (!bind) return
      updateSettings({ keybinds: { ...settingsState.settings.keybinds, [listeningKey!]: bind } })
      listeningKey = null
    }
    window.addEventListener('keydown', capture, true)
    return () => window.removeEventListener('keydown', capture, true)
  })

  let selectOpen: string | null    = $state(null)
  let closingSelect: string | null = $state(null)
  const CLOSE_ANIM_MS = 120
  const selectTriggers = new Map<string, HTMLElement>()

  function closeSelect() {
    if (!selectOpen) return
    closingSelect = selectOpen
    selectOpen = null
    setTimeout(() => { closingSelect = null }, CLOSE_ANIM_MS)
  }

  function toggleSelect(id: string) {
    if (selectOpen === id) { closeSelect() }
    else { closingSelect = null; selectOpen = id }
  }

  function registerTrigger(id: string, el: HTMLElement) {
    selectTriggers.set(id, el)
  }

  function getTrigger(id: string): HTMLElement | undefined {
    return selectTriggers.get(id)
  }

  $effect(() => {
    const handler = (e: MouseEvent) => {
      if (!selectOpen) return
      const target = e.target as HTMLElement
      if (target.closest('.s-select') || target.closest('.s-select-menu')) return
      closeSelect()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  })
</script>

<ModalBlur />
<div class="s-backdrop" role="presentation" tabindex="-1"
  onclick={(e) => { if (e.target === e.currentTarget) close() }}
  onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }}>
  <div class="s-modal" role="dialog" aria-label={t('nav.settings')} bind:this={modalEl}>

    <div class="s-sidebar">
      <p class="s-sidebar-title">{t('nav.settings')}</p>
      <nav>
        {#each TABS as item}
          <button class="s-nav-item" class:active={tab === item.id} class:anims data-tour={`settings-tab-${item.id}`} onclick={() => setTab(item.id)}>
            <span class="s-nav-icon"
              class:slide-down={anims && tab === item.id && tabSlideDir === 'down'}
              class:slide-up={anims && tab === item.id && tabSlideDir === 'up'}>
              {#key anims && tab === item.id ? tabIconKey : 0}
                <item.icon size={14} weight={tab === item.id ? 'regular' : 'light'} />
              {/key}
            </span>
            <span>{t(item.label)}</span>
          </button>
        {/each}
      </nav>
      <div class="s-sidebar-spacer"></div>
      <button class="s-nav-item s-bug-btn" class:anims onclick={() => (bugReporterOpen = true)}>
        <Bug size={14} weight="light" />
        <span>{t('settings.shell.reportIssue')}</span>
      </button>
    </div>

    <div class="s-content">
      <div class="s-content-header">
        <div class="s-content-header-left">
          <span class="s-header-icon"
            class:slide-down={anims && tabSlideDir === 'down'}
            class:slide-up={anims && tabSlideDir === 'up'}>
            {#key tabIconKey}
              {#each TABS as item}
                {#if item.id === tab}
                  <item.icon size={13} weight="light" />
                {/if}
              {/each}
            {/key}
          </span>
          <p class="s-content-title">{activeTab ? t(activeTab.label) : ''}</p>
        </div>
        <button class="s-close-btn" aria-label={t('settings.shell.closeSettings')} onclick={close}><X size={15} weight="light" /></button>
      </div>

      <div class="s-content-body" bind:this={contentBodyEl}>
        {#if tab === 'general'}
          <GeneralSettings {selectOpen} {closingSelect} {toggleSelect} {registerTrigger} {getTrigger} {selectPortal} {anims} />
        {:else if tab === 'appearance'}
          <AppearanceSettings {selectOpen} {closingSelect} {toggleSelect} {anims} {onOpenThemeEditor} />
        {:else if tab === 'reader'}
          <ReaderSettings {selectOpen} {closingSelect} {toggleSelect} {registerTrigger} {getTrigger} {selectPortal} {anims} />
        {:else if tab === 'player'}
          <PlayerSettings />
        {:else if tab === 'library'}
          <LibrarySettings {selectOpen} {closingSelect} {toggleSelect} {registerTrigger} {getTrigger} {selectPortal} {anims} />
          <FoldersSettings />
        {:else if tab === 'automation'}
          <AutomationSettings />
        {:else if tab === 'tracking'}
          <TrackingSettings bind:importKey />
        {:else if tab === 'performance'}
          <PerformanceSettings />
        {:else if tab === 'keybinds'}
          <KeybindsSettings bind:listeningKey />
        {:else if tab === 'storage'}
          <StorageSettings />
        {:else if tab === 'content'}
          <ContentSettings />
        {:else if tab === 'sync'}
          <SyncSettings bind:popupOpen={syncPopupOpen} />
        {:else if tab === 'server'}
          <ServerSettings {selectOpen} {closingSelect} {toggleSelect} {registerTrigger} {getTrigger} {selectPortal} {anims} />
        {:else if tab === 'auth'}
          <AuthSettings />
        {:else if tab === 'about'}
          <AboutSettings />
          <DevtoolsSettings />
        {/if}
      </div>
    </div>

  </div>
</div>

{#if bugReporterOpen}
  <BugReporter onClose={() => (bugReporterOpen = false)} />
{/if}

{#if importKey}
  {@const tracker = trackerState.byKey(importKey)}
  <TrackerImportModal
    trackerKey={importKey}
    trackerName={tracker?.name ?? "AniList"}
    username={tracker?.username ?? null}
    onClose={() => (importKey = null)}
    onDone={() => (importKey = null)}
  />
{/if}

<style>
  .s-sidebar-spacer { flex: 1; }

  .s-bug-btn { color: var(--text-faint) !important; }
  .s-bug-btn:hover {
    color: var(--color-error) !important;
    background: var(--color-error-bg) !important;
  }
</style>