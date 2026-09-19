<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { Chapter } from "$lib/types";

  interface Props {
    chapters:  Chapter[];
    currentId: string | null;
    onSelect:  (ch: Chapter) => void;
    onClose?:  () => void;
  }

  let { chapters, currentId, onSelect, onClose }: Props = $props();

  let query  = $state("");
  let listEl = $state<HTMLDivElement | null>(null);

  const showFilter = $derived(chapters.length > 12);

  const filtered = $derived.by(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chapters;
    return chapters.filter(ch =>
      ch.name.toLowerCase().includes(q) ||
      String(ch.chapterNumber).includes(q) ||
      (ch.scanlator?.toLowerCase().includes(q) ?? false)
    );
  });

  function chNum(n: number): string {
    if (n < 0) return "–";
    return n % 1 === 0 ? String(Math.floor(n)) : n.toFixed(1);
  }

  onMount(() => {
    tick().then(() => {
      if (!currentId || !listEl) return;
      const el = listEl.querySelector(`[data-ch="${CSS.escape(currentId)}"]`) as HTMLElement | null;
      el?.scrollIntoView({ block: "center" });
    });
  });

  function onFilterKey(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    onClose?.();
  }
</script>

<div class="picker">
  {#if showFilter}
    <div class="filter">
      <input
        type="text"
        placeholder="Filter chapters"
        bind:value={query}
        onkeydown={onFilterKey}
        spellcheck="false"
        autocomplete="off"
      />
    </div>
  {/if}

  <div class="list" bind:this={listEl} role="listbox" aria-label="Chapters">
    {#each filtered as ch (ch.id)}
      <button
        type="button"
        class="row"
        class:current={ch.id === currentId}
        class:read={ch.read && ch.id !== currentId}
        role="option"
        aria-selected={ch.id === currentId}
        data-ch={ch.id}
        onclick={() => onSelect(ch)}
      >
        <span class="num">{chNum(ch.chapterNumber)}</span>
        <span class="name">{ch.name}</span>
        {#if ch.scanlator}<span class="scan">{ch.scanlator}</span>{/if}
      </button>
    {:else}
      <p class="empty">No matching chapters</p>
    {/each}
  </div>
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    width: max-content;
    max-width: min(28rem, calc(100vw - 3rem));
    max-height: min(420px, 60vh);
  }

  .filter { padding: 6px 8px 4px; border-bottom: 1px solid var(--border-dim); }
  .filter input {
    width: 100%;
    padding: 5px 8px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim);
    background: var(--bg-overlay);
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    color: var(--text-secondary);
    outline: none;
  }
  .filter input:focus { border-color: var(--border-strong); color: var(--text-primary); }
  .filter input::placeholder { color: var(--text-faint); }

  .list {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    padding: 4px;
    scrollbar-width: thin;
    scrollbar-color: var(--border-strong) transparent;
  }
  .list::-webkit-scrollbar { width: 6px; }
  .list::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 99px; }

  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    width: 100%;
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    text-align: left;
    cursor: pointer;
    transition: background var(--t-fast), color var(--t-fast);
  }
  .row:hover { background: var(--bg-overlay); }
  .row.current { background: var(--bg-overlay); color: var(--text-primary); }
  .row.read { opacity: 0.45; }

  .num {
    flex-shrink: 0;
    min-width: 2.2em;
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums;
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
  }
  .row.current .num { color: var(--accent-fg); }
  .name {
    flex: 0 1 auto;
    min-width: 0;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row.current .name { color: var(--text-primary); }
  .scan {
    flex-shrink: 0;
    max-width: 7em;
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty {
    margin: 0;
    padding: 16px 8px;
    text-align: center;
    font-size: var(--text-xs);
    color: var(--text-faint);
  }
</style>
