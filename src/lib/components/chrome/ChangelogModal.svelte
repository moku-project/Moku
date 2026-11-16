<script lang="ts">
  import { appState, dismissChangelog } from '$lib/state/app.svelte'
  import logoUrl from '$lib/assets/moku-icon-splash.svg'
  import { t } from '$lib/i18n/index.svelte'
  import {
    Bug,
    Sparkle,
    NotePencil,
    Rocket,
    WarningCircle,
    Star,
    Dot,
    ArrowSquareOut,
    X,
  } from 'phosphor-svelte'
  import type { ChangelogSection } from '$lib/core/changelog'

  function iconFor(heading: string) {
    const h = heading.toLowerCase()
    if (h.includes('bug') || h.includes('fix'))     return Bug
    if (h.includes('improve') || h.includes('perf')) return Sparkle
    if (h.includes('note') || h.includes('known'))   return NotePencil
    if (h.includes('feature') || h.includes('new'))  return Rocket
    if (h.includes('break'))                         return WarningCircle
    if (h.includes('highlight'))                     return Star
    return Dot
  }

  function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  function renderInline(raw: string): string {
    let s = escapeHtml(raw)
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    s = s.replace(/\(#(\d+)\)/g, '<span class="ref">#$1</span>')
    return s
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') dismissChangelog()
  }

  function distribute(sections: ChangelogSection[]) {
    const sorted = [...sections].sort((a, b) => b.items.length - a.items.length)
    const left: ChangelogSection[] = []
    const right: ChangelogSection[] = []
    let leftCount = 0
    let rightCount = 0
    for (const s of sorted) {
      if (leftCount <= rightCount) { left.push(s); leftCount += s.items.length }
      else { right.push(s); rightCount += s.items.length }
    }
    return { left, right }
  }

  const columns = $derived(appState.changelogEntry ? distribute(appState.changelogEntry.sections) : null)
</script>

<svelte:window onkeydown={appState.changelogVisible ? onKeydown : undefined} />

{#if appState.changelogVisible && appState.changelogEntry && columns}
  {@const entry = appState.changelogEntry}
  <div class="scrim" onclick={dismissChangelog}></div>
  <div class="card-wrap">
    <div class="card" role="dialog" aria-modal="true" aria-label={t('chrome.changelog.dialogLabel')}>
      <button class="close" onclick={dismissChangelog} aria-label={t('common.close')}>
        <X size={16} weight="bold" />
      </button>

      <div class="header">
        <img src={logoUrl} alt="Moku" class="logo" />
        <div class="header-text">
          <p class="eyebrow">{t('chrome.changelog.eyebrow')}</p>
          <h2 class="version">{t('chrome.changelog.version', { version: entry.version })}</h2>
          {#if entry.released}<p class="released">{entry.released}</p>{/if}
        </div>
      </div>

      <div class="bento">
        <div class="col-half">
          {#each columns.left as section (section.heading)}
            {@const Icon = iconFor(section.heading)}
            <div class="tile">
              <div class="tile-header">
                <Icon size={15} weight="bold" />
                <p class="tile-heading">{section.heading}</p>
              </div>
              <div class="chips">
                {#each section.items as item}
                  <div class="chip">{@html renderInline(item)}</div>
                {/each}
              </div>
            </div>
          {/each}
        </div>

        <div class="col-half">
          {#each columns.right as section (section.heading)}
            {@const Icon = iconFor(section.heading)}
            <div class="tile">
              <div class="tile-header">
                <Icon size={15} weight="bold" />
                <p class="tile-heading">{section.heading}</p>
              </div>
              <div class="chips">
                {#each section.items as item}
                  <div class="chip">{@html renderInline(item)}</div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>

      <div class="footer">
        {#if entry.compareUrl}
          <a class="compare" href={entry.compareUrl} target="_blank" rel="noreferrer">
            {t('chrome.changelog.fullChangelog')} <ArrowSquareOut size={13} weight="bold" />
          </a>
        {/if}
        <button class="btn" onclick={dismissChangelog}>{t('chrome.changelog.gotIt')}</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .scrim { position:fixed; inset:0; z-index:10599; background:rgba(0,0,0,0.7); backdrop-filter:blur(6px); animation:overlayIn 0.28s cubic-bezier(0,0,0.2,1) both; }
  .card-wrap { position:fixed; inset:0; z-index:10600; display:flex; align-items:center; justify-content:center; pointer-events:none; padding: var(--sp-5); }

  .card {
    pointer-events:auto;
    position:relative;
    width:min(760px, 100%);
    height:min(540px, calc(100vh - 64px));
    background:var(--bg-surface);
    border:1px solid var(--border-base);
    border-radius:var(--radius-xl);
    padding:var(--sp-5) var(--sp-6) var(--sp-6);
    display:flex; flex-direction:column; gap:var(--sp-4);
    box-shadow:0 32px 80px rgba(0,0,0,0.75);
    animation:cardIn 0.38s cubic-bezier(0.22,1,0.36,1) 0.06s both;
  }

  .close {
    position:absolute; top:14px; right:14px;
    width:26px; height:26px; display:flex; align-items:center; justify-content:center;
    border-radius:var(--radius-md); background:transparent; border:1px solid transparent;
    color:var(--text-faint); cursor:pointer; transition:background var(--t-base), color var(--t-base);
  }
  .close:hover { background:var(--bg-raised); color:var(--text-primary); }

  .header { display:flex; align-items:center; gap:var(--sp-3); flex-shrink:0; }
  .logo { width:44px; height:44px; border-radius:12px; flex-shrink:0; }
  .header-text { display:flex; flex-direction:column; gap:1px; }
  .eyebrow { font-family:var(--font-ui); font-size:10px; font-weight:600; letter-spacing:0.22em; text-transform:uppercase; color:var(--text-secondary); margin:0; user-select:none; }
  .version { font-family:var(--font-ui); font-size:var(--text-lg); font-weight:600; color:var(--text-primary); margin:0; }
  .released { font-family:var(--font-ui); font-size:var(--text-xs); color:var(--text-faint); margin:0; }

  .bento {
    flex:1;
    min-height:0;
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:var(--sp-3);
  }

  .col-half { display:flex; flex-direction:column; gap:var(--sp-3); min-height:0; }
  .col-half .tile { flex:1; }

  .tile {
    display:flex; flex-direction:column; gap:var(--sp-2);
    background:var(--bg-raised); border:1px solid var(--border-dim);
    border-radius:var(--radius-lg); padding:var(--sp-3);
    min-height:0; overflow:hidden;
  }

  .tile-header { display:flex; align-items:center; gap:6px; color:var(--text-primary); flex-shrink:0; }
  .tile-heading { font-family:var(--font-ui); font-size:var(--text-sm); font-weight:600; margin:0; }

  .chips {
    display:flex; flex-direction:column; gap:6px; overflow-y:auto; min-height:0; padding-right:2px;
    scrollbar-width:none;
    -ms-overflow-style:none;
  }
  .chips::-webkit-scrollbar { display:none; }

  .chip {
    font-family:var(--font-ui); font-size:var(--text-xs); line-height:1.45; color:var(--text-faint);
    background:var(--bg-surface); border:1px solid var(--border-dim);
    border-radius:var(--radius-md); padding:6px 9px;
  }

  .chip :global(strong) { color:var(--text-primary); font-weight:600; }
  .chip :global(code) {
    background:var(--bg-raised); border:1px solid var(--border-dim);
    border-radius:4px; padding:1px 5px; font-size:0.9em;
    font-family:ui-monospace, monospace; color:var(--text-secondary);
  }
  .chip :global(a) { color:var(--accent); text-decoration:underline; }
  .chip :global(.ref) {
    display:inline-block; margin-left:4px; font-size:0.85em;
    color:var(--text-secondary); opacity:0.8;
  }

  .footer { display:flex; align-items:center; justify-content:space-between; flex-shrink:0; }

  .compare {
    display:flex; align-items:center; gap:4px;
    font-family:var(--font-ui); font-size:var(--text-xs);
    color:var(--text-secondary); text-decoration:none;
    transition:color var(--t-base);
  }
  .compare:hover { color:var(--text-primary); }

  .btn {
    padding:8px 20px; border-radius:var(--radius-md);
    background:var(--accent-muted); border:1px solid var(--accent-dim); color:var(--accent-fg);
    font-size:var(--text-sm); font-family:var(--font-ui); letter-spacing:var(--tracking-wide);
    cursor:pointer; transition:filter var(--t-base);
  }
  .btn:hover { filter:brightness(1.12); }

  @keyframes overlayIn { from { opacity:0 } to { opacity:1 } }
  @keyframes cardIn    { from { opacity:0; transform:translateY(28px) scale(0.97) } to { opacity:1; transform:translateY(0) scale(1) } }
</style>