<script lang="ts">
  import { X, CaretLeft, CaretRight, CaretDown, GearSix, ArrowsOut, ArrowsIn, DotsThree } from "phosphor-svelte";
  import { fly } from "svelte/transition";
  import { cubicIn, cubicOut } from "svelte/easing";
  import { mediaViewState } from "$lib/state/mediaView.svelte";
  import { app } from "$lib/state/app.svelte";
  import { onDestroy } from "svelte";
  import type { Snippet } from "svelte";
  import type { Chapter } from "$lib/types";
  import ChapterPicker from "$lib/components/media/shared/ChapterPicker.svelte";

  interface Props {
    title:         string;
    chapterLabel:  string;
    readout?:      string | null;
    hasPrev:       boolean;
    hasNext:       boolean;
    onPrev:        () => void;
    onNext:        () => void;
    onClose:       () => void;
    onOpenPreview?: () => void;
    chapters?:      Chapter[];
    currentChapterId?: string | null;
    onSelectChapter?: (ch: Chapter) => void;
    endControls?:   Snippet;
    slider?:        Snippet;
    bottomStart?:   Snippet;
    bottomEnd?:     Snippet;
    showBottomBar?: boolean;
  }

  let {
    title, chapterLabel, readout = null,
    hasPrev, hasNext, onPrev, onNext, onClose, onOpenPreview,
    chapters = [], currentChapterId = null, onSelectChapter,
    endControls, slider, bottomStart, bottomEnd, showBottomBar = true,
  }: Props = $props();

  const hidden  = $derived(!mediaViewState.uiVisible);

  let menuOpen   = $state(false);
  let pickerOpen = $state(false);

  const canPickChapter = $derived(!!onSelectChapter && chapters.length > 0);

  function closeMenu() { menuOpen = false; }
  function closePicker() { pickerOpen = false; }

  function togglePicker() {
    if (!canPickChapter) return;
    pickerOpen = !pickerOpen;
    if (pickerOpen) menuOpen = false;
  }

  function pickChapter(ch: Chapter) {
    pickerOpen = false;
    if (ch.id === currentChapterId) return;
    onSelectChapter?.(ch);
  }

  $effect(() => {
    mediaViewState.holdUi = pickerOpen || menuOpen;
    if (pickerOpen || menuOpen) mediaViewState.uiVisible = true;
  });

  onDestroy(() => { mediaViewState.holdUi = false; });

  $effect(() => {
    if (!menuOpen && !pickerOpen) return;
    const off = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (menuOpen && !t.closest(".actions-wrap")) menuOpen = false;
      if (pickerOpen && !t.closest(".ch-pick-wrap")) pickerOpen = false;
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (pickerOpen) { pickerOpen = false; return; }
      if (menuOpen) menuOpen = false;
    };
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", off);
      document.removeEventListener("keydown", esc, true);
    };
  });
</script>

<div class="bar bar-top" class:hidden>
  <div class="bar-start">
    <button class="icon-btn close-btn" data-tip="Close" aria-label="Close reader" onclick={onClose}>
      <X size={14} weight="regular" />
    </button>

    <div class="bar-divider"></div>

    <button class="icon-btn" data-tip="Previous" aria-label="Previous" onclick={onPrev} disabled={!hasPrev}>
      <CaretLeft size={13} weight="regular" />
    </button>

    <div class="ch-hover-wrap">
      {#if onOpenPreview}
        <button class="ch-title-btn" data-tip="Series details" onclick={onOpenPreview}>{title}</button>
      {:else}
        <span class="ch-title">{title}</span>
      {/if}
      <span class="ch-sep">/</span>
      {#if canPickChapter}
        <div class="ch-pick-wrap">
          <button
            class="ch-name-btn"
            class:active={pickerOpen}
            title="Select chapter"
            aria-expanded={pickerOpen}
            onclick={togglePicker}
          >
            <span class="ch-name">{chapterLabel}</span>
            <CaretDown size={10} weight="bold" />
          </button>
          {#if pickerOpen}
            <div class="ch-picker-pop" role="presentation" onclick={(e) => e.stopPropagation()}
              in:fly={{ y: -6, duration: 150, easing: cubicOut }}
              out:fly={{ y: -6, duration: 110, easing: cubicIn }}>
              <ChapterPicker
                {chapters}
                currentId={currentChapterId}
                onSelect={pickChapter}
                onClose={closePicker}
              />
            </div>
          {/if}
        </div>
      {:else}
        <span class="ch-name ch-name-static">{chapterLabel}</span>
      {/if}
      {#if readout}<span class="ch-page">{readout}</span>{/if}
    </div>

    <button class="icon-btn" data-tip="Next" aria-label="Next" onclick={onNext} disabled={!hasNext}>
      <CaretRight size={13} weight="regular" />
    </button>
  </div>

  <div class="bar-drag-gap" data-tauri-drag-region></div>

  <div class="bar-end">
    {#if endControls}{@render endControls()}{/if}

    <div class="bar-divider"></div>

    <div class="actions-wrap">
      <button class="icon-btn" class:active={menuOpen} data-tip="More" aria-label="More actions"
        onclick={() => (menuOpen = !menuOpen)}>
        <DotsThree size={16} weight="bold" />
      </button>

      {#if menuOpen}
        <div class="actions-popover" role="presentation" onclick={(e) => e.stopPropagation()}
          in:fly={{ y: -6, duration: 150, easing: cubicOut }}
          out:fly={{ y: -6, duration: 110, easing: cubicIn }}>
          <button class="action-row" onclick={() => { closeMenu(); app.setSettingsOpen(true); }}>
            <GearSix size={13} weight="regular" /><span>Settings</span>
          </button>
          <button class="action-row" onclick={() => { closeMenu(); mediaViewState.toggleFullscreen(); }}>
            {#if mediaViewState.isFullscreen}
              <ArrowsIn size={13} weight="regular" /><span>Exit fullscreen</span>
            {:else}
              <ArrowsOut size={13} weight="regular" /><span>Fullscreen</span>
            {/if}
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

{#if showBottomBar}
<div class="bottombar" class:hidden>
  {#if bottomStart}
    {@render bottomStart()}
  {:else}
    <button class="nav-btn" data-tip="Previous" aria-label="Previous" onclick={onPrev} disabled={!hasPrev}>
      <CaretLeft size={15} weight="regular" />
    </button>
  {/if}
  <div class="slider-wrap">
    {#if slider}{@render slider()}{/if}
  </div>
  {#if bottomEnd}
    {@render bottomEnd()}
  {:else}
    <button class="nav-btn" data-tip="Next" aria-label="Next" onclick={onNext} disabled={!hasNext}>
      <CaretRight size={15} weight="regular" />
    </button>
  {/if}
</div>
{/if}

<style>
  .bar, .bottombar {
    position: fixed; z-index: 40;
    display: flex; align-items: center;
    border-radius: var(--radius-lg);
    user-select: none;
    transition: opacity 0.2s ease, transform 0.2s ease;
  }
  .bar {
    isolation: isolate;
    overflow: visible;
    background: transparent;
    border: none;
    box-shadow: none;
  }
  .bar::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: inherit;
    background: var(--frost-bg);
    border: 1px solid var(--frost-border);
    box-shadow: var(--frost-shadow);
    backdrop-filter: var(--frost-blur);
    -webkit-backdrop-filter: var(--frost-blur);
    pointer-events: none;
  }
  .bottombar {
    background: var(--frost-bg);
    border: 1px solid var(--frost-border);
    backdrop-filter: var(--frost-blur); -webkit-backdrop-filter: var(--frost-blur);
    box-shadow: var(--frost-shadow);
  }
  .bar-top {
    top: calc(var(--sp-3) + var(--titlebar-slide)); left: var(--sp-3); right: var(--sp-3);
    flex-direction: row; gap: 2px; padding: 0 var(--sp-2); height: 44px;
    transition: opacity 0.2s ease, transform 0.2s ease, top 0.2s ease;
  }
  .bar.hidden { opacity: 0; pointer-events: none; transform: translateY(-8px); }

  .bar-start { display: flex; align-items: center; gap: 2px; flex-shrink: 1; overflow: visible; min-width: 0; }
  .bar-end   { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
  .bar-drag-gap { flex: 1; height: 100%; cursor: grab; }
  .bar-drag-gap:active { cursor: grabbing; }

  .bar-divider { flex-shrink: 0; background: var(--border-dim); border-radius: 1px; width: 1px; height: 18px; margin: 0 var(--sp-1); }

  .icon-btn {
    position: relative;
    display: flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: var(--radius-md);
    color: var(--text-muted); flex-shrink: 0; background: none; border: none; cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .icon-btn:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-raised); }
  .icon-btn:disabled { opacity: 0.2; cursor: default; }
  .icon-btn.active { color: var(--accent-fg); background: var(--bg-raised); }
  .close-btn:hover:not(:disabled) { color: var(--text-primary); background: color-mix(in srgb, #c0392b 15%, transparent); }

  :global(.bar [data-tip]), :global(.bottombar [data-tip]) { position: relative; }
  :global(.bar [data-tip]:hover)::after,
  :global(.bottombar [data-tip]:hover)::after {
    content: attr(data-tip);
    position: absolute; top: calc(100% + 6px); left: 50%; transform: translateX(-50%);
    background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-sm);
    padding: 3px 7px; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-secondary);
    letter-spacing: var(--tracking-wide); white-space: nowrap; pointer-events: none;
    z-index: 50; animation: tip-in 0.1s ease both;
  }
  :global(.bottombar [data-tip]:hover)::after { top: auto; bottom: calc(100% + 6px); }
  @keyframes tip-in { from { opacity: 0; transform: translate(-50%, 2px) } to { opacity: 1; transform: translate(-50%, 0) } }

  .ch-hover-wrap { position: relative; min-width: 0; display: flex; align-items: center; gap: var(--sp-2); overflow: visible; font-size: var(--text-sm); }
  .ch-title-btn, .ch-name-btn {
    background: none; border: none; cursor: pointer; padding: 3px 6px;
    font-size: inherit; font-family: inherit;
    border-radius: var(--radius-md); border: 1px solid transparent;
    min-width: 0;
    transition: border-color var(--t-fast), background var(--t-fast), color var(--t-fast), opacity var(--t-fast);
  }
  .ch-title-btn, .ch-title {
    color: var(--text-secondary); font-weight: var(--weight-medium);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 22ch; flex-shrink: 1;
  }
  .ch-name-btn {
    display: inline-flex; align-items: center; gap: 4px;
    color: var(--text-muted); flex-shrink: 1;
  }
  .ch-title-btn:hover, .ch-name-btn:hover, .ch-name-btn.active {
    border-color: var(--border-dim);
    background: var(--bg-raised);
    color: var(--text-primary);
  }
  .ch-name-btn :global(svg) { flex-shrink: 0; transition: transform var(--t-fast); }
  .ch-name-btn.active :global(svg) { transform: rotate(180deg); }
  .ch-sep   { color: var(--text-faint); flex-shrink: 0; }
  .ch-name  {
    color: inherit;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 28ch;
  }
  .ch-name-static { color: var(--text-muted); }
  .ch-page  { font-family: var(--font-ui); font-size: var(--text-xs); font-variant-numeric: tabular-nums; color: var(--text-faint); flex-shrink: 0; white-space: nowrap; }

  .ch-pick-wrap { position: relative; min-width: 0; display: flex; align-items: center; overflow: visible; }
  .ch-picker-pop {
    position: absolute; top: calc(100% + 6px); left: 0;
    background: var(--bg-surface); border: 1px solid var(--border-base);
    border-radius: var(--radius-md); box-shadow: 0 8px 32px rgba(0,0,0,0.45);
    overflow: hidden; z-index: 50;
  }

  .actions-wrap { position: relative; }
  .actions-popover {
    position: absolute; top: calc(100% + 6px); right: 0;
    min-width: 168px; padding: 4px;
    background: var(--bg-surface); border: 1px solid var(--border-base);
    border-radius: var(--radius-md); box-shadow: 0 8px 32px rgba(0,0,0,0.45);
    z-index: 50;
  }
  .action-row {
    display: flex; align-items: center; gap: var(--sp-2); width: 100%;
    padding: 7px 9px; border-radius: var(--radius-sm);
    background: none; border: none; cursor: pointer;
    font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-secondary);
    transition: background var(--t-fast), color var(--t-fast);
  }
  .action-row:hover { background: var(--bg-raised); color: var(--text-primary); }

  .bottombar {
    bottom: var(--sp-4); left: 50%; transform: translateX(-50%);
    width: min(1320px, calc(100vw - var(--sp-8)));
    gap: var(--sp-3); padding: var(--sp-2) var(--sp-3);
  }
  .bottombar.hidden { opacity: 0; pointer-events: none; transform: translateX(-50%) translateY(8px); }
  .nav-btn {
    position: relative;
    display: flex; align-items: center; justify-content: center;
    width: 34px; height: 34px; flex-shrink: 0;
    border-radius: var(--radius-md); border: none;
    color: var(--text-muted); background: none; cursor: pointer;
    transition: background var(--t-base), color var(--t-base);
  }
  .nav-btn:hover:not(:disabled) { background: var(--bg-raised); color: var(--text-primary); }
  .nav-btn:disabled { opacity: 0.25; cursor: default; }
  .slider-wrap { flex: 1; position: relative; display: flex; align-items: center; height: 34px; }
</style>
