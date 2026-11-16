<script lang="ts">
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'
  import { tsunagu } from '$lib/server-adapters/tsunagu'
  import { loadLibrary } from '$lib/state/library.svelte'
  import { addToast } from '$lib/state/notifications.svelte'
  import type { ContentLevel } from '$lib/types/settings'
  import type { Extension, ContentFilterRule, FilterField, ContentBlockLevel } from '$lib/server-adapters/types'
  import { t, type MessageKey } from '$lib/i18n/index.svelte'

  let contentSources        = $state<Extension[]>([])
  let contentSourcesLoading = $state(false)
  let sourceSearch          = $state('')

  $effect(() => {
    if (settingsState.settings.sourceOverridesEnabled && contentSources.length === 0 && !contentSourcesLoading)
      loadContentSources()
  })

  async function loadContentSources() {
    contentSourcesLoading = true
    try {
      const d = await tsunagu.installedExtensions()
      contentSources = d.filter(s => s.id !== '0')
    } catch (e) { console.error(e) }
    finally { contentSourcesLoading = false }
  }

  function toggleSourceAllowed(ids: string[]) {
    const allowed = settingsState.settings.nsfwAllowedSourceIds ?? []
    const blocked = settingsState.settings.nsfwBlockedSourceIds ?? []
    const allAllowed = ids.every(id => allowed.includes(id))
    if (allAllowed) {
      updateSettings({ nsfwAllowedSourceIds: allowed.filter(x => !ids.includes(x)) })
    } else {
      updateSettings({
        nsfwAllowedSourceIds: [...allowed.filter(x => !ids.includes(x)), ...ids],
        nsfwBlockedSourceIds: blocked.filter(x => !ids.includes(x)),
      })
    }
  }

  function toggleSourceBlocked(ids: string[]) {
    const allowed = settingsState.settings.nsfwAllowedSourceIds ?? []
    const blocked = settingsState.settings.nsfwBlockedSourceIds ?? []
    const allBlocked = ids.every(id => blocked.includes(id))
    if (allBlocked) {
      updateSettings({ nsfwBlockedSourceIds: blocked.filter(x => !ids.includes(x)) })
    } else {
      updateSettings({
        nsfwBlockedSourceIds: [...blocked.filter(x => !ids.includes(x)), ...ids],
        nsfwAllowedSourceIds: allowed.filter(x => !ids.includes(x)),
      })
    }
  }

  interface ContentSourceGroup { name: string; iconUrl: string | null; sources: Extension[] }

  const contentSourcesFiltered = $derived.by(() => {
    const q = sourceSearch.trim().toLowerCase()
    const filtered = q
      ? contentSources.filter(s => s.name.toLowerCase().includes(q) || s.lang.toLowerCase().includes(q))
      : contentSources
    const map = new Map<string, ContentSourceGroup>()
    for (const s of filtered) {
      if (!map.has(s.name)) map.set(s.name, { name: s.name, iconUrl: s.iconUrl, sources: [] })
      map.get(s.name)!.sources.push(s)
    }
    return Array.from(map.values())
  })

  const LEVELS: { value: ContentLevel; label: MessageKey; desc: MessageKey }[] = [
    { value: 'strict',       label: 'settings.content.levelStrict',       desc: 'settings.content.levelStrictDesc' },
    { value: 'moderate',     label: 'settings.content.levelModerate',     desc: 'settings.content.levelModerateDesc' },
    { value: 'unrestricted', label: 'settings.content.levelUnrestricted', desc: 'settings.content.levelUnrestrictedDesc' },
  ]

  let serverLevel = $state<string | null>(null)
  let levelBusy   = $state(false)
  const activeLevel = $derived(serverLevel ?? settingsState.settings.contentLevel ?? 'moderate')

  async function loadServerLevel() {
    try {
      const all = await tsunagu.serverSettings()
      serverLevel = all.find(s => s.key === 'content_filter_level')?.value ?? null
    } catch { serverLevel = null }
  }

  async function setLevel(v: ContentLevel) {
    if (levelBusy || v === activeLevel) return
    updateSettings({ contentLevel: v })
    if (serverLevel === null) return
    levelBusy = true
    try {
      const r = await tsunagu.updateServerSetting('content_filter_level', v)
      serverLevel = r.setting.value
      loadLibrary(true)
    } catch (e) {
      addToast({ kind: 'error', title: t('settings.content.levelToast'), body: e instanceof Error ? e.message : String(e) })
    } finally {
      levelBusy = false
    }
  }

  const FIELDS: [FilterField, MessageKey][] = [['GENRE', 'settings.content.fieldGenre'], ['TAG', 'settings.content.fieldTag'], ['TITLE', 'settings.content.fieldTitle'], ['DESCRIPTION', 'settings.content.fieldDescription']]

  function fieldLabel(field: FilterField): string {
    const key = FIELDS.find(([v]) => v === field)?.[1]
    return key ? t(key) : field
  }

  let rules        = $state<ContentFilterRule[]>([])
  let rulesOpen    = $state(false)
  let rulesBusy    = $state(false)
  let confirmReset = $state(false)
  let nf = $state<{ category: string; field: FilterField; keyword: string; blockLevel: ContentBlockLevel; minWeight: number }>({
    category: '', field: 'GENRE', keyword: '', blockLevel: 'MODERATE', minWeight: 0,
  })

  const groupedRules = $derived.by(() => {
    const m: Record<string, ContentFilterRule[]> = {}
    for (const r of rules) (m[r.category] ??= []).push(r)
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]))
  })

  $effect(() => { loadServerLevel(); loadRules() })

  async function loadRules() {
    try { rules = await tsunagu.contentFilterRules() } catch { rules = [] }
  }

  async function afterRuleChange() {
    await loadRules()
    setTimeout(() => loadLibrary(true), 1200)
  }

  async function addRule() {
    const keyword = nf.keyword.trim()
    if (!keyword || rulesBusy) return
    const category = nf.category.trim() || nf.field.toLowerCase()
    rulesBusy = true
    try {
      await tsunagu.addContentFilterRule({
        category, field: nf.field, keyword, blockLevel: nf.blockLevel,
        minWeight: nf.field === 'TAG' ? nf.minWeight : 0,
      })
      nf = { ...nf, keyword: '' }
      await afterRuleChange()
    } catch (e) {
      addToast({ kind: 'error', title: t('settings.content.addRuleToast'), body: e instanceof Error ? e.message : String(e) })
    } finally {
      rulesBusy = false
    }
  }

  async function removeRule(id: string) {
    if (rulesBusy) return
    rulesBusy = true
    try { await tsunagu.removeContentFilterRule(id); await afterRuleChange() }
    catch (e) { addToast({ kind: 'error', title: t('settings.content.removeRule'), body: e instanceof Error ? e.message : String(e) }) }
    finally { rulesBusy = false }
  }

  async function resetRules() {
    confirmReset = false
    rulesBusy = true
    try { await tsunagu.resetContentFilterRules(); await afterRuleChange() }
    catch (e) { addToast({ kind: 'error', title: t('settings.content.resetRulesToast'), body: e instanceof Error ? e.message : String(e) }) }
    finally { rulesBusy = false }
  }

  async function rescan() {
    if (rulesBusy) return
    rulesBusy = true
    try {
      await tsunagu.recomputeContentFilter()
      addToast({ kind: 'info', title: t('settings.content.rescanningToast') })
      setTimeout(() => loadLibrary(true), 1500)
    } catch (e) {
      addToast({ kind: 'error', title: t('settings.content.rescanToast'), body: e instanceof Error ? e.message : String(e) })
    } finally {
      rulesBusy = false
    }
  }
</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">{t('settings.content.levelTitle')}</p>
    <div class="s-section-body">
      <div class="s-row" style="border-bottom: none; padding-bottom: 0;">
        <span class="s-desc">{t('settings.content.levelDesc')}</span>
      </div>
      <div class="s-level-group">
        {#each LEVELS as lvl}
          {@const active = activeLevel === lvl.value}
          <button class="s-level-btn" class:active disabled={levelBusy} onclick={() => setLevel(lvl.value)}>
            <span class="s-level-dot" class:active></span>
            <div class="s-level-text">
              <span class="s-level-label">{t(lvl.label)}</span>
              <span class="s-level-desc">{t(lvl.desc)}</span>
            </div>
          </button>
        {/each}
      </div>
    </div>
  </div>

  {#if serverLevel !== null}
    <div class="s-section">
      <button class="s-section-title cf-head" onclick={() => rulesOpen = !rulesOpen}>
        <span>{t('settings.content.rulesTitle')}</span>
        <span class="cf-caret" class:open={rulesOpen}>▾</span>
      </button>
      {#if rulesOpen}
        <div class="s-section-body">
          {#if rules.length === 0}
            <div class="s-row"><span class="s-desc">{t('settings.content.noRules')}</span></div>
          {:else}
            {#each groupedRules as [category, list] (category)}
              <div class="cf-group">
                <span class="cf-cat">{category}</span>
                {#each list as r (r.id)}
                  <div class="cf-rule">
                    <span class="cf-kw">{r.keyword}</span>
                    <span class="cf-meta">{fieldLabel(r.field)}{r.field === 'TAG' && r.minWeight > 0 ? ` ≥${r.minWeight}` : ''}</span>
                    <span class="cf-lvl">{r.blockLevel === 'STRICT' ? t('settings.content.levelStrict') : t('settings.content.levelModerate')}</span>
                    {#if r.isDefault}<span class="cf-default">{t('settings.content.defaultBadge')}</span>{/if}
                    <button class="cf-x" title={t('settings.content.removeRule')} disabled={rulesBusy} onclick={() => removeRule(r.id)}>✕</button>
                  </div>
                {/each}
              </div>
            {/each}
          {/if}

          <div class="cf-add">
            <input class="s-input cf-in" placeholder={t('settings.content.categoryPlaceholder')} bind:value={nf.category} />
            <select class="s-input cf-in" bind:value={nf.field}>
              {#each FIELDS as [v, l]}<option value={v}>{t(l)}</option>{/each}
            </select>
            <input class="s-input cf-in cf-kw-in" placeholder={t('settings.content.keywordPlaceholder')} bind:value={nf.keyword}
              onkeydown={(e) => { if (e.key === 'Enter') addRule() }} />
            <select class="s-input cf-in" bind:value={nf.blockLevel}>
              <option value="MODERATE">{t('settings.content.levelModerate')}</option>
              <option value="STRICT">{t('settings.content.levelStrict')}</option>
            </select>
            {#if nf.field === 'TAG'}
              <label class="cf-weight" title={t('settings.content.minTagWeight')}>
                <input type="range" min="0" max="100" bind:value={nf.minWeight} />
                <span>{nf.minWeight}</span>
              </label>
            {/if}
            <button class="s-btn s-btn-accent" disabled={rulesBusy || !nf.keyword.trim()} onclick={addRule}>{t('common.add')}</button>
          </div>

          <div class="cf-actions">
            <button class="s-btn" disabled={rulesBusy} onclick={rescan}>{t('settings.content.rescanLibrary')}</button>
            <button class="s-btn s-btn-danger" disabled={rulesBusy} onclick={() => confirmReset = true}>{t('settings.content.resetToDefaults')}</button>
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <div class="s-section">
    <p class="s-section-title">{t('settings.content.overridesTitle')}</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info">
          <span class="s-label">{t('settings.content.perSourceOverrides')}</span>
          <span class="s-desc">{t('settings.content.perSourceOverridesDesc')}</span>
        </div>
        <button
          role="switch"
          aria-checked={settingsState.settings.sourceOverridesEnabled}
          aria-label={t('settings.content.enableOverrides')}
          class="s-toggle"
          class:on={settingsState.settings.sourceOverridesEnabled}
          onclick={() => updateSettings({ sourceOverridesEnabled: !settingsState.settings.sourceOverridesEnabled })}
        ><span class="s-toggle-thumb"></span></button>
      </label>

      {#if settingsState.settings.sourceOverridesEnabled}
        <div class="s-search-wrap">
          <input class="s-input full" placeholder={t('settings.content.filterSources')} bind:value={sourceSearch} />
        </div>
        {#if contentSourcesLoading}
          <p class="s-empty">{t('settings.content.loadingSources')}</p>
        {:else if contentSources.length === 0}
          <p class="s-empty">{t('settings.content.noSources')}</p>
        {:else}
          <div class="s-source-list">
            {#each contentSourcesFiltered as group (group.name)}
              {@const ids       = group.sources.map(s => s.id)}
              {@const allowed   = settingsState.settings.nsfwAllowedSourceIds ?? []}
              {@const blocked   = settingsState.settings.nsfwBlockedSourceIds ?? []}
              {@const isAllowed = ids.every(id => allowed.includes(id))}
              {@const isBlocked = ids.every(id => blocked.includes(id))}
              <div class="s-source-row" class:allowed={isAllowed} class:blocked={isBlocked}>
                {#if group.iconUrl}
                  <img src={group.iconUrl} alt="" class="s-source-icon" loading="lazy" decoding="async" />
                {/if}
                <div class="s-source-info">
                  <span class="s-source-name">{group.name}</span>
                  <span class="s-source-meta">
                    {group.sources.length > 1 ? t('settings.content.languageCount', { count: group.sources.length }) : group.sources[0].lang.toUpperCase()}
                  </span>
                </div>
                <div class="s-source-actions">
                  <button class="s-source-action-btn" class:allow={isAllowed} onclick={() => toggleSourceAllowed(ids)}>{t('settings.content.allow')}</button>
                  <button class="s-source-action-btn" class:block={isBlocked} onclick={() => toggleSourceBlocked(ids)}>{t('settings.content.block')}</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      {/if}
    </div>
  </div>

</div>

{#if confirmReset}
  <div class="cf-modal" role="presentation" onclick={() => confirmReset = false}>
    <div class="cf-modal-card" role="presentation" onclick={(e) => e.stopPropagation()}>
      <p class="cf-modal-title">{t('settings.content.resetConfirmTitle')}</p>
      <p class="s-desc">{t('settings.content.resetConfirmBody')}</p>
      <div class="cf-modal-actions">
        <button class="s-btn" onclick={() => confirmReset = false}>{t('common.cancel')}</button>
        <button class="s-btn s-btn-danger" onclick={resetRules}>{t('common.reset')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .s-level-group { display: flex; flex-direction: column; padding: var(--sp-2) var(--sp-4) var(--sp-3); gap: var(--sp-1); }
  .s-level-btn { display: flex; align-items: center; gap: var(--sp-3); padding: 10px var(--sp-3); border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: var(--bg-surface); cursor: pointer; text-align: left; transition: border-color var(--t-base), background var(--t-base); width: 100%; }
  .s-level-btn:hover  { background: var(--bg-overlay); border-color: var(--border-strong); }
  .s-level-btn.active { background: var(--accent-muted); border-color: var(--accent-dim); }
  .s-level-btn:disabled { opacity: 0.6; cursor: default; }
  .s-level-dot { width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--border-strong); background: none; flex-shrink: 0; transition: border-color var(--t-base), background var(--t-base); }
  .s-level-dot.active { border-color: var(--accent); background: var(--accent); }
  .s-level-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .s-level-label { font-size: var(--text-sm); color: var(--text-secondary); line-height: 1.3; }
  .s-level-btn.active .s-level-label { color: var(--accent-fg); }
  .s-level-desc { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); line-height: var(--leading-snug); }
  .s-level-btn.active .s-level-desc { color: var(--accent-fg); opacity: 0.7; }

  .cf-head { width: 100%; background: none; border: none; cursor: pointer; }
  .cf-caret { transition: transform var(--t-fast); display: inline-block; }
  .cf-caret.open { transform: rotate(180deg); }

  .cf-group { display: flex; flex-direction: column; gap: 2px; padding: var(--sp-2) var(--sp-4); border-bottom: 1px solid var(--border-dim); }
  .cf-cat { font-family: var(--font-ui); font-size: var(--text-2xs); text-transform: uppercase; letter-spacing: var(--tracking-wider); color: var(--text-faint); }
  .cf-rule { display: flex; align-items: center; gap: var(--sp-2); font-size: var(--text-sm); color: var(--text-secondary); }
  .cf-kw { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cf-meta, .cf-lvl { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); }
  .cf-default { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); border: 1px solid var(--border-dim); border-radius: var(--radius-sm); padding: 0 5px; }
  .cf-x { border: none; background: none; color: var(--text-faint); cursor: pointer; padding: 2px 4px; }
  .cf-x:hover { color: var(--color-error); }

  .cf-add { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4); }
  .cf-in { width: auto; min-width: 92px; flex: 0 0 auto; padding: 5px 8px; }
  .cf-kw-in { flex: 1; min-width: 120px; }
  .cf-weight { display: flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); }
  .cf-weight input { width: 90px; }

  .cf-actions { display: flex; gap: var(--sp-2); padding: 0 var(--sp-4) var(--sp-3); }

  .cf-modal { position: fixed; inset: 0; z-index: var(--z-settings); display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); }
  .cf-modal-card { width: min(360px, calc(100vw - 32px)); display: flex; flex-direction: column; gap: var(--sp-2); padding: var(--sp-4); background: var(--bg-surface); border: 1px solid var(--border-base); border-radius: var(--radius-lg); }
  .cf-modal-title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); }
  .cf-modal-actions { display: flex; justify-content: flex-end; gap: var(--sp-2); margin-top: var(--sp-2); }
</style>
