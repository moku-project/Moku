<script lang="ts">
  import { Check, Funnel } from 'phosphor-svelte'
  import type { LibraryContentFilter, LibraryStatusFilter } from '$lib/state/library.svelte'
  import { t, type MessageKey } from '$lib/i18n/index.svelte'

  interface Props {
    status:        LibraryStatusFilter
    filters:       Partial<Record<LibraryContentFilter, boolean>>
    hasActive:     boolean
    open:          boolean
    onToggle:      () => void
    onStatusChange: (s: LibraryStatusFilter) => void
    onFilterToggle: (f: LibraryContentFilter) => void
    onClear:       () => void
  }

  let {
    status, filters, hasActive, open,
    onToggle, onStatusChange, onFilterToggle, onClear,
  }: Props = $props()

  const CONTENT_FILTERS: [LibraryContentFilter, MessageKey][] = [
    ['unread',     'library.filters.unread'],
    ['started',    'library.filters.started'],
    ['downloaded', 'library.filters.downloaded'],
    ['bookmarked', 'library.filters.bookmarked'],
  ]

  const STATUSES: [LibraryStatusFilter, MessageKey][] = [
    ['ONGOING',             'library.filters.statusOngoing'],
    ['COMPLETED',           'library.filters.statusCompleted'],
    ['ON_HIATUS',           'library.filters.statusHiatus'],
    ['CANCELLED',           'library.filters.statusCancelled'],
    ['PUBLISHING_FINISHED', 'library.filters.statusPublishingFinished'],
  ]
</script>

<div class="wrap">
  <button
    class="icon-btn"
    class:active={hasActive}
    title={t('library.filters.filter')}
    onclick={onToggle}
  >
    <Funnel size={15} weight={hasActive ? 'fill' : 'bold'} />
  </button>

  {#if open}
    <div class="panel" role="menu">
      <div class="panel-head">
        <span class="panel-title">{t('library.filters.filter')}</span>
        {#if hasActive}
          <button class="clear-btn" onclick={onClear}>{t('library.filters.clearAll')}</button>
        {/if}
      </div>

      <div class="divider"></div>
      <p class="section-label">{t('library.filters.content')}</p>

      {#each CONTENT_FILTERS as [key, label]}
        <button
          class="item"
          class:item-active={!!filters[key]}
          role="menuitem"
          onclick={() => onFilterToggle(key)}
        >
          <span class="check" class:check-on={!!filters[key]}>
            {#if filters[key]}<Check size={9} weight="bold" />{/if}
          </span>
          {t(label)}
        </button>
      {/each}

      <div class="divider"></div>
      <p class="section-label">{t('library.filters.status')}</p>

      {#each STATUSES as [s, label]}
        <button
          class="item"
          class:item-active={status === s}
          role="menuitem"
          onclick={() => onStatusChange(status === s ? 'ALL' : s)}
        >
          <span class="check" class:check-on={status === s}>
            {#if status === s}<Check size={9} weight="bold" />{/if}
          </span>
          {t(label)}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .wrap { position: relative; }

  .icon-btn {
    display: flex; align-items: center; justify-content: center;
    width: 30px; height: 30px;
    border-radius: var(--radius-md); border: 1px solid var(--border-dim);
    background: var(--bg-raised); color: var(--text-faint);
    cursor: pointer;
    transition: color var(--t-base), border-color var(--t-base), background var(--t-base);
  }
  .icon-btn:hover  { color: var(--text-primary); border-color: var(--border-strong); }
  .icon-btn.active { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }

  .panel {
    position: absolute; top: calc(100% + 6px); right: 0; z-index: 9999;
    min-width: 220px; background: var(--bg-raised);
    border: 1px solid var(--border-base); border-radius: var(--radius-lg);
    padding: var(--sp-1); box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    animation: fadeIn 0.1s ease both;
  }

  .panel-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 10px 4px;
  }
  .panel-title {
    font-family: var(--font-ui); font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide); color: var(--text-secondary);
    font-weight: var(--weight-medium, 500);
  }
  .clear-btn {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide); color: var(--text-faint);
    background: none; border: none; cursor: pointer; padding: 0;
    transition: color var(--t-base);
  }
  .clear-btn:hover { color: var(--color-error); }

  .divider { height: 1px; background: var(--border-dim); margin: 4px 2px; }

  .section-label {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider); text-transform: uppercase;
    color: var(--text-faint); padding: 4px 8px 8px;
  }

  .item {
    display: flex; align-items: center; gap: var(--sp-2);
    width: 100%; padding: 7px 10px;
    border-radius: var(--radius-sm); border: none;
    background: transparent; color: var(--text-muted);
    font-family: var(--font-ui); font-size: var(--text-xs);
    cursor: pointer; text-align: left;
    transition: background var(--t-base), color var(--t-base);
  }
  .item:hover        { background: var(--bg-overlay); color: var(--text-primary); }
  .item-active       { color: var(--accent-fg); background: var(--accent-muted); font-weight: var(--weight-medium, 500); }
  .item-active:hover { background: var(--accent-dim); }

  .check {
    width: 13px; height: 13px; border-radius: 2px;
    border: 1px solid var(--border-strong); background: transparent;
    flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    color: var(--bg-base);
    transition: background var(--t-base), border-color var(--t-base);
  }
  .check-on { background: var(--accent); border-color: var(--accent); }

  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
</style>