<script lang="ts">
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'
  import { cache } from '$lib/core/cache/queryCache'
  import { t } from '$lib/i18n/index.svelte'

  interface PerfSnapshot {
    cacheEntries:  number
    cacheKeys:     string[]
    oldestEntryMs: number | null
    newestEntryMs: number | null
  }

  let perfSnapshot = $state<PerfSnapshot | null>(null)
  let clearing     = $state(false)
  let cleared      = $state(false)

  function refreshPerfMetrics() {
    let entries = 0, oldest: number | null = null, newest: number | null = null
    const foundKeys: string[] = []
    const checkKey = (k: string) => {
      const age = cache.ageOf(k)
      if (age !== undefined) {
        entries++
        foundKeys.push(k)
        const ts = Date.now() - age
        if (oldest === null || ts < oldest) oldest = ts
        if (newest === null || ts > newest) newest = ts
      }
    }
    ['library', 'sources', 'popular'].forEach(checkKey);
    ['Action','Romance','Fantasy','Comedy','Drama','Horror','Sci-Fi','Adventure','Thriller',
     'Isekai','Supernatural','Historical','Psychological','Sports','Mystery','Mecha',
     'Slice of Life','School Life','Martial Arts','Magic','Military'].forEach(g => checkKey(`genre:${g}`))
    perfSnapshot = { cacheEntries: entries, cacheKeys: foundKeys, oldestEntryMs: oldest, newestEntryMs: newest }
  }

  function fmtAge(ts: number | null): string {
    if (ts === null) return '-'
    const secs = Math.floor((Date.now() - ts) / 1000)
    if (secs < 60) return t('settings.performance.ageSeconds', { count: secs })
    const mins = Math.floor(secs / 60)
    if (mins < 60) return t('settings.performance.ageMinutes', { count: mins })
    return t('settings.performance.ageHours', { count: Math.floor(mins / 60) })
  }

  function handleClearCache() {
    clearing = true
    caches.keys()
      .then(names => Promise.all(names.map(n => caches.delete(n))))
      .catch(() => {})
      .finally(() => {
        clearing = false
        cleared = true
        setTimeout(() => cleared = false, 2500)
        refreshPerfMetrics()
      })
  }

  $effect(() => { refreshPerfMetrics() })
</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">{t('settings.performance.renderLimitTitle')}</p>
    <div class="s-section-body">
      <div class="s-slider-row">
        <div class="s-row-info">
          <span class="s-label">{t('settings.performance.itemsPerPage')}</span>
          <span class="s-desc">{t('settings.performance.itemsPerPageDesc')}</span>
        </div>
        <div class="s-stepper">
          <button class="s-step-btn"
            onclick={() => updateSettings({ renderLimit: Math.max(12, (settingsState.settings.renderLimit ?? 48) - 12) })}
            disabled={(settingsState.settings.renderLimit ?? 48) <= 12}>−</button>
          <span class="s-step-val">{settingsState.settings.renderLimit ?? 48}</span>
          <button class="s-step-btn"
            onclick={() => updateSettings({ renderLimit: Math.min(200, (settingsState.settings.renderLimit ?? 48) + 12) })}
            disabled={(settingsState.settings.renderLimit ?? 48) >= 200}>+</button>
        </div>
      </div>
      <div class="s-presets">
        {#each [12, 24, 48, 96, 200] as v}
          <button class="s-preset" class:active={(settingsState.settings.renderLimit ?? 48) === v} onclick={() => updateSettings({ renderLimit: v })}>{v}</button>
        {/each}
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.performance.renderingTitle')}</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.performance.gpu')}</span><span class="s-desc">{t('settings.performance.gpuDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.gpuAcceleration} aria-label={t('settings.performance.gpu')}
          class="s-toggle" class:on={settingsState.settings.gpuAcceleration}
          onclick={() => updateSettings({ gpuAcceleration: !settingsState.settings.gpuAcceleration })}>
          <span class="s-toggle-thumb"></span>
        </button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.performance.idleTitle')}</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.performance.splashCards')}</span><span class="s-desc">{t('settings.performance.splashCardsDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.splashCards ?? true} aria-label={t('settings.performance.splashCards')}
          class="s-toggle" class:on={settingsState.settings.splashCards ?? true}
          onclick={() => updateSettings({ splashCards: !(settingsState.settings.splashCards ?? true) })}>
          <span class="s-toggle-thumb"></span>
        </button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.performance.sessionCacheTitle')}</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">{t('settings.performance.cacheEntries')}</span>
          <span class="s-desc">{t('settings.performance.cacheEntriesDesc')}</span>
        </div>
        <div class="s-btn-row">
          <span class="s-step-val">{t('settings.performance.entryCount', { count: perfSnapshot?.cacheEntries ?? 0 })}</span>
          <button class="s-btn-icon" onclick={refreshPerfMetrics} title={t('common.refresh')}>↺</button>
        </div>
      </div>
      {#if perfSnapshot && perfSnapshot.cacheEntries > 0}
        <div class="s-row">
          <div class="s-row-info"><span class="s-label">{t('settings.performance.oldestEntry')}</span></div>
          <span class="s-step-val">{fmtAge(perfSnapshot.oldestEntryMs)}</span>
        </div>
        <div class="s-row">
          <div class="s-row-info"><span class="s-label">{t('settings.performance.newestEntry')}</span></div>
          <span class="s-step-val">{fmtAge(perfSnapshot.newestEntryMs)}</span>
        </div>
        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">{t('settings.performance.cachedKeys')}</span>
            <span class="s-desc">{perfSnapshot.cacheKeys.join(', ')}</span>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.performance.cacheTitle')}</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.performance.imageCache')}</span><span class="s-desc">{t('settings.performance.imageCacheDesc')}</span></div>
        <button class="s-btn s-btn-danger" onclick={handleClearCache} disabled={clearing}>
          {cleared ? t('settings.performance.cleared') : clearing ? t('settings.performance.clearing') : t('common.clear')}
        </button>
      </div>
    </div>
  </div>

</div>