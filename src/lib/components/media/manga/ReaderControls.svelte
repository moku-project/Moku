<script lang="ts">
  import {
    X, CaretLeft, CaretRight, CaretUp, CaretDown,
    MagnifyingGlassMinus, MagnifyingGlassPlus,
    Bookmark, Download, GearSix, Sliders,
    ArrowsOut, ArrowsIn,
  } from "phosphor-svelte";
  import { readerState, ZOOM_STEP, ZOOM_MIN, ZOOM_MAX } from "$lib/state/mangaReader.svelte";
  import { tsunagu }           from "$lib/server-adapters/tsunagu";
  import { platformService }   from "$lib/platform-service";
  import { fly }               from "svelte/transition";
  import { cubicOut, cubicIn } from "svelte/easing";
  import { onDestroy }         from "svelte";
  import type { Chapter }      from "$lib/types";
  import type { Snippet }      from "svelte";
  import type { ReaderSettings } from "$lib/state/mangaReader.svelte";
  import ChapterPicker         from "$lib/components/media/shared/ChapterPicker.svelte";

  interface Props {
    displayChapter:       Chapter | null;
    adjacent:             { prev: Chapter | null; next: Chapter | null; remaining: Chapter[] };
    visibleChunkLastPage: number;
    zoom:                 number;
    zoomPct:              number;
    isFullscreen:         boolean;
    isBookmarked:         boolean;
    uiVisible:            boolean;
    rtl:                  boolean;
    barPosition:          "top" | "left" | "right";
    progressBar?:         Snippet;
    onCaptureZoomAnchor:  () => void;
    onRestoreZoomAnchor:  () => void;
    onMaybeMarkRead:      () => void;
    onToggleBookmark:     () => void;
    onClampZoom:          (z: number) => number;
    onApplySettings:      (patch: Partial<ReaderSettings>) => void;
    onSettingsOpen:       () => void;
    onOpenPreview:        () => void;
    onJumpToPage:         (page: number) => void;
    perMangaEnabled:      boolean;
  }

  const {
    displayChapter, adjacent, visibleChunkLastPage,
    zoom, zoomPct, isFullscreen,
    isBookmarked,
    uiVisible, rtl,
    barPosition, progressBar,
    onCaptureZoomAnchor, onRestoreZoomAnchor,
    onMaybeMarkRead, onToggleBookmark,
    onClampZoom, onApplySettings, onSettingsOpen, onOpenPreview, onJumpToPage,
    perMangaEnabled,
  }: Props = $props();

  const queueable = $derived(adjacent.remaining.filter(c => !c.downloaded));

  async function runDl(fn: () => Promise<void>) {
    readerState.dlBusy = true;
    try { await fn(); } catch (e) { console.error(e); }
    readerState.dlBusy = false;
    readerState.dlOpen = false;
  }

  const realMediaId = $derived(readerState.activeManga?.mediaId ?? readerState.activeManga?.libraryEntryId ?? "");

  async function enqueueOne(chapterId: string): Promise<void> {
    await tsunagu.enqueueDownload(realMediaId, chapterId);
  }

  async function enqueueMany(chapterIds: string[]): Promise<void> {
    await tsunagu.enqueueDownloads(realMediaId, chapterIds);
  }

  const isVertical  = $derived(barPosition === "left" || barPosition === "right");

  // In RTL manga, reading progresses right-to-left, so the horizontal bar's left/right
  // chapter buttons swap which chapter they jump to (vertical up/down bars are unaffected).
  const leftChapter  = $derived(rtl && !isVertical ? adjacent.next : adjacent.prev);
  const rightChapter = $derived(rtl && !isVertical ? adjacent.prev : adjacent.next);
  const leftTitle    = $derived(rtl && !isVertical ? "Next chapter" : "Previous chapter");
  const rightTitle   = $derived(rtl && !isVertical ? "Previous chapter" : "Next chapter");

  const popoverSide = $derived(
    barPosition === "left"  ? "right" :
    barPosition === "right" ? "left"  :
    "bottom"
  );

  function adjustZoom(delta: number) {
    onCaptureZoomAnchor();
    onApplySettings({ readerZoom: onClampZoom(zoom + delta) });
    onRestoreZoomAnchor();
  }

  function resetZoom() {
    onCaptureZoomAnchor();
    onApplySettings({ readerZoom: 1.0 });
    onRestoreZoomAnchor();
  }

  async function toggleFullscreen() {
    await platformService.toggleFullscreen();
  }

  function closeAllPopovers() {
    readerState.actionsOpen       = false;
    readerState.zoomOpen          = false;
    readerState.dlOpen            = false;
    readerState.chapterPickerOpen = false;
  }

  let pageDraft   = $state("");
  let pageInputEl = $state<HTMLInputElement | null>(null);

  const pageInputCh = $derived(Math.max(2, String(visibleChunkLastPage || 1).length + 1));

  $effect(() => {
    if (!readerState.pageInputFocused) pageDraft = String(readerState.pageNumber);
  });

  $effect(() => {
    if (!readerState.chapterPickerOpen) return;
    const off = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".ch-pick-wrap")) readerState.chapterPickerOpen = false;
    };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  });

  function toggleChapterPicker() {
    if (readerState.chapterPickerOpen) {
      readerState.chapterPickerOpen = false;
      return;
    }
    readerState.zoomOpen = false;
    readerState.actionsOpen = false;
    readerState.dlOpen = false;
    readerState.chapterPickerOpen = true;
  }

  function pickChapter(ch: Chapter) {
    readerState.chapterPickerOpen = false;
    if (ch.id === displayChapter?.id) return;
    readerState.openReader(ch);
  }

  function onPageFocus() {
    readerState.pageInputFocused = true;
    pageDraft = String(readerState.pageNumber);
    queueMicrotask(() => pageInputEl?.select());
  }

  function commitPage() {
    readerState.pageInputFocused = false;
    const n = parseInt(pageDraft.replace(/\D/g, ""), 10);
    if (!Number.isFinite(n) || n < 1) {
      pageDraft = String(readerState.pageNumber);
      return;
    }
    const page = Math.min(visibleChunkLastPage || n, n);
    if (page === readerState.pageNumber) return;
    onJumpToPage(page);
  }

  function onPageInput(e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value.replace(/\D/g, "");
    if (!raw) { pageDraft = ""; return; }
    const n = parseInt(raw, 10);
    const max = visibleChunkLastPage || n;
    pageDraft = String(Math.min(n, max));
  }

  function onPageKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commitPage();
      pageInputEl?.blur();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      pageDraft = String(readerState.pageNumber);
      readerState.pageInputFocused = false;
      pageInputEl?.blur();
    }
  }

  onDestroy(() => {
    readerState.chapterPickerOpen = false;
    readerState.pageInputFocused = false;
  });
</script>

<div
  class="bar"
  class:bar-top={barPosition === "top"}
  class:bar-left={barPosition === "left"}
  class:bar-right={barPosition === "right"}
  class:hidden={!uiVisible}
>
  <div class="bar-start">
    <button class="icon-btn close-btn" onclick={() => readerState.closeReader()} title="Close reader">
      <X size={14} weight="regular" />
    </button>

    <div class="bar-divider"></div>

    <button class="icon-btn"
      onclick={() => { if (leftChapter) { onMaybeMarkRead(); readerState.openReader(leftChapter); } }}
      disabled={!leftChapter}
      title={leftTitle}>
      {#if isVertical}<CaretUp size={13} weight="regular" />{:else}<CaretLeft size={13} weight="regular" />{/if}
    </button>

    <div class="ch-hover-wrap">
      {#if isVertical}
        <div class="ch-pick-wrap">
          <button
            class="icon-btn ch-info-btn"
            class:active={readerState.chapterPickerOpen}
            onclick={toggleChapterPicker}
            title="Select chapter"
            aria-label="Select chapter"
            aria-expanded={readerState.chapterPickerOpen}
          >&#xE2CE;</button>
          {#if readerState.chapterPickerOpen}
            <div class="popover ch-picker-pop popover-{popoverSide}" role="presentation" onclick={(e) => e.stopPropagation()}>
              <div class="ch-picker-page">
                <span>Page</span>
                <input
                  class="ch-page-input"
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  autocomplete="off"
                  spellcheck="false"
                  aria-label="Go to page"
                  bind:this={pageInputEl}
                  value={pageDraft}
                  disabled={!visibleChunkLastPage}
                  style="width:{pageInputCh}ch"
                  onfocus={onPageFocus}
                  onblur={commitPage}
                  oninput={onPageInput}
                  onkeydown={onPageKey}
                />
                <span class="ch-page-sep">/</span>
                <span>{visibleChunkLastPage}</span>
              </div>
              <ChapterPicker
                chapters={readerState.activeChapterList}
                currentId={displayChapter?.id ?? null}
                onSelect={pickChapter}
                onClose={() => { readerState.chapterPickerOpen = false; }}
              />
            </div>
          {/if}
        </div>
      {:else}
        <button class="ch-title-btn" title="Series details" onclick={onOpenPreview}>
          {readerState.activeManga?.title}
        </button>
        <span class="ch-sep">/</span>
        <div class="ch-pick-wrap">
          <button
            class="ch-name-btn"
            class:active={readerState.chapterPickerOpen}
            title="Select chapter"
            aria-expanded={readerState.chapterPickerOpen}
            onclick={toggleChapterPicker}
          >
            <span class="ch-name">{displayChapter?.name}</span>
          </button>
          {#if readerState.chapterPickerOpen}
            <div class="popover ch-picker-pop popover-{popoverSide}" role="presentation" onclick={(e) => e.stopPropagation()}>
              <ChapterPicker
                chapters={readerState.activeChapterList}
                currentId={displayChapter?.id ?? null}
                onSelect={pickChapter}
                onClose={() => { readerState.chapterPickerOpen = false; }}
              />
            </div>
          {/if}
        </div>
        {#if visibleChunkLastPage}
          <div class="ch-page-display" aria-hidden="true">
            <span>{readerState.pageNumber}</span>
            <span class="ch-page-sep">/</span>
            <span>{visibleChunkLastPage}</span>
          </div>
        {/if}
      {/if}
    </div>

    <button class="icon-btn"
      onclick={() => { if (rightChapter) { onMaybeMarkRead(); readerState.openReader(rightChapter); } }}
      disabled={!rightChapter}
      title={rightTitle}>
      {#if isVertical}<CaretDown size={13} weight="regular" />{:else}<CaretRight size={13} weight="regular" />{/if}
    </button>
  </div>

  {#if isVertical && progressBar}
    <div class="bar-middle">
      {@render progressBar()}
    </div>
  {/if}

  {#if !isVertical}
    <div class="bar-drag-gap" data-tauri-drag-region></div>
  {/if}

  <div class="bar-end">

    <div class="zoom-cluster">
      <button class="icon-btn zoom-step-btn" onclick={() => adjustZoom(-ZOOM_STEP)} title="Zoom out" disabled={zoom <= ZOOM_MIN}>
        <MagnifyingGlassMinus size={13} weight="regular" />
      </button>
      <button class="zoom-pct-btn" onclick={() => { readerState.zoomOpen = !readerState.zoomOpen; readerState.actionsOpen = false; readerState.chapterPickerOpen = false; }} title="Adjust zoom">
        {zoomPct}%
      </button>
      <button class="icon-btn zoom-step-btn" onclick={() => adjustZoom(ZOOM_STEP)} title="Zoom in" disabled={zoom >= ZOOM_MAX}>
        <MagnifyingGlassPlus size={13} weight="regular" />
      </button>

      {#if readerState.zoomOpen}
        <div class="popover zoom-popover popover-{popoverSide}" role="presentation" onclick={(e) => e.stopPropagation()}>
          <div class="zoom-row">
            <button class="zoom-step-sm" onclick={() => adjustZoom(-ZOOM_STEP)} disabled={zoom <= ZOOM_MIN}>−</button>
            <input type="range" class="zoom-slider" min={10} max={200} step={5} value={zoomPct}
              oninput={(e) => { onCaptureZoomAnchor(); onApplySettings({ readerZoom: onClampZoom(Number(e.currentTarget.value) / 100) }); onRestoreZoomAnchor(); }} />
            <button class="zoom-step-sm" onclick={() => adjustZoom(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}>+</button>
          </div>
          <div class="zoom-footer">
            <span class="zoom-readout">{zoomPct}%</span>
            <button class="zoom-reset" onclick={resetZoom} disabled={zoom === 1.0}>Reset</button>
          </div>
        </div>
      {/if}
    </div>

    <div class="bar-divider"></div>

    <button class="icon-btn" class:active={isBookmarked} onclick={onToggleBookmark}
      title={isBookmarked ? "Remove bookmark" : "Bookmark this page"}>
      <Bookmark size={14} weight={isBookmarked ? "fill" : "regular"} />
    </button>

    <div class="bar-divider"></div>

    <button class="icon-btn" class:active={perMangaEnabled}
      onclick={() => { readerState.presetOpen = true; closeAllPopovers(); }}
      title="Reader settings">
      <Sliders size={13} weight="regular" />
    </button>

    <div class="actions-wrap">
      <button
        class="icon-btn"
        class:active={readerState.actionsOpen}
        onclick={() => { readerState.actionsOpen = !readerState.actionsOpen; readerState.zoomOpen = false; readerState.chapterPickerOpen = false; }}
        title="More actions"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="2"    cy="6.5" r="1.3" fill="currentColor"/>
          <circle cx="6.5"  cy="6.5" r="1.3" fill="currentColor"/>
          <circle cx="11"   cy="6.5" r="1.3" fill="currentColor"/>
        </svg>
      </button>

      {#if readerState.actionsOpen}
        <div
          class="popover actions-popover popover-{popoverSide}"
          role="presentation"
          onclick={(e) => e.stopPropagation()}
          in:fly={isVertical
            ? (barPosition === "left" ? { x: -8, duration: 160, easing: cubicOut } : { x: 8, duration: 160, easing: cubicOut })
            : { y: -6, duration: 160, easing: cubicOut }}
          out:fly={isVertical
            ? (barPosition === "left" ? { x: -8, duration: 120, easing: cubicIn } : { x: 8, duration: 120, easing: cubicIn })
            : { y: -6, duration: 120, easing: cubicIn }}
        >
          <button class="action-row" onclick={() => { readerState.dlOpen = !readerState.dlOpen; readerState.actionsOpen = false; }}>
            <Download size={13} weight="regular" />
            <span>Download</span>
          </button>
          <button class="action-row" onclick={() => { onSettingsOpen(); readerState.actionsOpen = false; }}>
            <GearSix size={13} weight="regular" />
            <span>Settings</span>
          </button>
          <div class="action-divider"></div>
          <button class="action-row" onclick={async () => { readerState.actionsOpen = false; await toggleFullscreen(); }}>
            {#if isFullscreen}
              <ArrowsIn size={13} weight="regular" />
              <span>Exit fullscreen</span>
            {:else}
              <ArrowsOut size={13} weight="regular" />
              <span>Fullscreen</span>
            {/if}
          </button>
        </div>
      {/if}

      {#if readerState.dlOpen && readerState.activeChapter}
        {@const chapter = readerState.activeChapter}
        <div class="popover dl-popover popover-{popoverSide}" role="presentation" onclick={(e) => e.stopPropagation()}>
          <p class="dl-title">Download</p>
          <button class="dl-option" disabled={readerState.dlBusy || !!chapter.downloaded}
            onclick={() => runDl(() => enqueueOne(chapter.id))}>
            This chapter
            <span class="dl-sub">{chapter.downloaded ? "Already downloaded" : chapter.name}</span>
          </button>
          <div class="dl-row">
            <button class="dl-option" disabled={readerState.dlBusy || queueable.length === 0}
              onclick={() => runDl(() => enqueueMany(queueable.slice(0, readerState.nextN).map(c => c.id)))}>
              Next chapters
              <span class="dl-sub">{Math.min(readerState.nextN, queueable.length)} not yet downloaded</span>
            </button>
            <div class="dl-stepper" role="presentation" onclick={(e) => e.stopPropagation()}>
              <button class="dl-step-btn" onclick={() => readerState.nextN = Math.max(1, readerState.nextN - 1)} disabled={readerState.nextN <= 1}>−</button>
              <span class="dl-step-val">{readerState.nextN}</span>
              <button class="dl-step-btn" onclick={() => readerState.nextN = Math.min(queueable.length || 1, readerState.nextN + 1)} disabled={readerState.nextN >= queueable.length}>+</button>
            </div>
          </div>
          <button class="dl-option" disabled={readerState.dlBusy || queueable.length === 0}
            onclick={() => runDl(() => enqueueMany(queueable.map(c => c.id)))}>
            All remaining
            <span class="dl-sub">{queueable.length} not yet downloaded</span>
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 2px;
    position: fixed;
    z-index: 40;
    isolation: isolate;
    border-radius: var(--radius-lg);
    background: transparent;
    border: none;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    transition: opacity 0.2s ease, transform 0.2s ease, top 0.2s ease;
    overflow: visible;
    user-select: none;
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
  .bar.hidden { opacity: 0; pointer-events: none; }

  .bar-top {
    flex-direction: row;
    gap: 2px;
    top: calc(var(--sp-3) + var(--titlebar-slide));
    left: var(--sp-3);
    right: var(--sp-3);
    padding: 0 var(--sp-2);
    height: 44px;
    transition: opacity 0.2s ease, transform 0.2s ease, top 0.2s ease;
  }
  .bar-top.hidden { transform: translateY(-8px); }

  .bar-left, .bar-right {
    flex-direction: column;
    justify-content: space-between;
    padding: var(--sp-3) 0;
    width: 44px;
    top: calc(var(--sp-3) + var(--titlebar-slide));
    bottom: var(--sp-3);
    gap: 0;
  }
  .bar-left  { left: var(--sp-3); }
  .bar-right { right: var(--sp-3); }
  .bar-left.hidden  { transform: translateX(-8px); }
  .bar-right.hidden { transform: translateX(8px); }

  .bar-drag-gap { flex: 1; height: 100%; cursor: grab; }
  .bar-drag-gap:active { cursor: grabbing; }

  .bar-start, .bar-end {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }
  .bar-top .bar-start { overflow: visible; min-width: 0; flex-shrink: 1; }
  .bar-left .bar-start,  .bar-left .bar-end,
  .bar-right .bar-start, .bar-right .bar-end { flex-direction: column; }

  .bar-middle {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    min-height: 0;
    padding: var(--sp-1) 0;
    overflow: visible;
  }

  .bar-divider {
    flex-shrink: 0;
    background: var(--border-dim);
    border-radius: 1px;
  }
  .bar-top .bar-divider  { width: 1px; height: 18px; margin: 0 var(--sp-1); }
  .bar-left .bar-divider,
  .bar-right .bar-divider { height: 1px; width: 20px; margin: var(--sp-1) 0; }

  .icon-btn {
    display: flex; align-items: center; justify-content: center;
    width: 30px; height: 30px;
    border-radius: var(--radius-md);
    color: var(--text-muted);
    flex-shrink: 0;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .icon-btn:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-raised); }
  .icon-btn:disabled { opacity: 0.2; cursor: default; }
  .icon-btn.active { color: var(--accent-fg); }

  .close-btn:hover { color: var(--text-primary); background: color-mix(in srgb, #c0392b 15%, transparent); }

  .ch-hover-wrap {
    position: relative;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    overflow: visible;
  }

  .ch-title-btn, .ch-name-btn {
    background: none; border: none; cursor: pointer; padding: 3px 6px;
    font-size: var(--text-sm); font-family: inherit;
    border-radius: var(--radius-md); border: 1px solid transparent;
    min-width: 0;
    transition: border-color var(--t-fast), background var(--t-fast), color var(--t-fast);
  }
  .ch-title-btn {
    color: var(--text-secondary); font-weight: var(--weight-medium);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 22ch; flex-shrink: 1;
  }
  .ch-name-btn {
    display: inline-flex; align-items: center;
    color: var(--text-muted); flex-shrink: 1;
  }
  .ch-title-btn:hover, .ch-name-btn:hover, .ch-name-btn.active {
    border-color: var(--border-dim);
    background: var(--bg-raised);
    color: var(--text-primary);
  }
  .ch-sep   { color: var(--text-faint); flex-shrink: 0; }
  .ch-name  {
    color: inherit;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 28ch;
  }

  .ch-pick-wrap { position: relative; min-width: 0; display: flex; align-items: center; overflow: visible; }
  .bar-left .ch-pick-wrap, .bar-right .ch-pick-wrap { justify-content: center; }

  .ch-info-btn { font-size: 15px; line-height: 1; color: var(--text-faint); }

  .ch-page-sep { color: var(--border-strong); }
  .ch-page-display {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 3px;
    padding: 3px 7px;
    pointer-events: none;
  }
  .ch-page-input {
    font-family: var(--font-ui);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    letter-spacing: var(--tracking-wide);
    color: inherit;
    background: transparent;
    border: none;
    padding: 0;
    text-align: right;
    outline: none;
    cursor: text;
    min-width: 1.5ch;
  }
  .ch-page-input:disabled { opacity: 0.4; cursor: default; }

  .ch-picker-pop { padding: 0; overflow: hidden; }
  .ch-picker-page {
    display: flex; align-items: center; gap: var(--sp-2);
    padding: 8px 10px 6px;
    border-bottom: 1px solid var(--border-dim);
    font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted);
  }

  .zoom-cluster {
    position: relative;
    display: flex;
    align-items: center;
    background: var(--bg-overlay);
    border: 1px solid var(--border-dim);
    border-radius: var(--radius-md);
    overflow: visible;
    flex-shrink: 0;
  }
  .bar-left .zoom-cluster, .bar-right .zoom-cluster { flex-direction: column; }

  .zoom-step-btn {
    width: 26px; height: 26px;
    border-radius: calc(var(--radius-md) - 1px);
    color: var(--text-faint);
    flex-shrink: 0;
  }
  .zoom-step-btn:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-raised); }
  .zoom-step-btn:disabled { opacity: 0.2; cursor: default; }

  .zoom-pct-btn {
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    font-variant-numeric: tabular-nums;
    letter-spacing: var(--tracking-wide);
    color: var(--text-secondary);
    height: 26px;
    min-width: 36px;
    padding: 0 2px;
    text-align: center;
    transition: color var(--t-fast), background var(--t-fast);
    border-radius: 0;
    border-left: 1px solid var(--border-dim);
    border-right: 1px solid var(--border-dim);
  }
  .bar-left .zoom-pct-btn, .bar-right .zoom-pct-btn {
    height: 22px; min-width: unset; width: 26px;
    writing-mode: vertical-rl; font-size: 9px;
    rotate: 270deg;
    border-left: none; border-right: none;
    border-top: 1px solid var(--border-dim);
    border-bottom: 1px solid var(--border-dim);
  }
  .zoom-pct-btn:hover { color: var(--text-primary); background: var(--bg-raised); }

  .popover {
    position: absolute;
    background: var(--bg-raised);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-lg);
    box-shadow: 0 8px 32px rgba(0,0,0,0.55);
    z-index: 100;
    animation: scaleIn 0.12s ease both;
  }
  .popover-bottom { top: calc(100% + 8px); left: 50%; translate: -50% 0; transform-origin: top center; }
  .popover-right  { left: calc(100% + 8px); top: 50%; translate: 0 -50%; transform-origin: left center; }
  .popover-left   { right: calc(100% + 8px); top: 50%; translate: 0 -50%; transform-origin: right center; }
  .actions-wrap .popover-bottom { left: auto; right: 0; translate: none; transform-origin: top right; }
  .actions-wrap .popover-right  { top: auto; bottom: 0; translate: none; transform-origin: bottom left; }
  .actions-wrap .popover-left   { top: auto; bottom: 0; translate: none; transform-origin: bottom right; }
  .ch-pick-wrap .popover-bottom { left: 0; translate: none; transform-origin: top left; }
  .ch-pick-wrap .popover-right  { top: 0; translate: none; transform-origin: top left; }
  .ch-pick-wrap .popover-left   { top: 0; translate: none; transform-origin: top right; }

  .zoom-popover { padding: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-2); min-width: 200px; }
  .zoom-row { display: flex; align-items: center; gap: var(--sp-2); }
  .zoom-step-sm {
    display: flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; flex-shrink: 0;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-dim);
    background: var(--bg-overlay);
    color: var(--text-muted);
    font-size: var(--text-base); line-height: 1;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .zoom-step-sm:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-raised); }
  .zoom-step-sm:disabled { opacity: 0.25; cursor: default; }
  .zoom-slider { flex: 1; height: 3px; appearance: none; -webkit-appearance: none; background: var(--border-strong); border-radius: 2px; outline: none; cursor: pointer; }
  .zoom-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: var(--accent-fg); cursor: pointer; }
  .zoom-footer { display: flex; align-items: center; justify-content: space-between; }
  .zoom-readout { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); font-variant-numeric: tabular-nums; }
  .zoom-reset { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted); letter-spacing: var(--tracking-wide); padding: 3px var(--sp-2); border-radius: var(--radius-sm); border: 1px solid var(--border-dim); transition: color var(--t-fast), background var(--t-fast), border-color var(--t-fast); }
  .zoom-reset:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-overlay); border-color: var(--border-strong); }
  .zoom-reset:disabled { opacity: 0.3; cursor: default; }

  .actions-wrap { position: relative; flex-shrink: 0; }
  .actions-popover {
    min-width: 160px;
    padding: var(--sp-1);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .action-row {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    width: 100%;
    padding: 7px var(--sp-2);
    border-radius: var(--radius-md);
    background: none;
    border: none;
    color: var(--text-secondary);
    font-size: var(--text-sm);
    cursor: pointer;
    text-align: left;
    transition: background var(--t-fast), color var(--t-fast);
  }
  .action-row:hover { background: var(--bg-overlay); color: var(--text-primary); }

  .action-divider { height: 1px; background: var(--border-dim); margin: var(--sp-1) 0; }

  .dl-popover { min-width: 220px; padding: var(--sp-2); display: flex; flex-direction: column; gap: 1px; }
  .dl-title { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; padding: 2px var(--sp-2) var(--sp-2); border-bottom: 1px solid var(--border-dim); margin-bottom: var(--sp-1); }
  .dl-option { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; padding: 7px var(--sp-2); border-radius: var(--radius-md); font-size: var(--text-sm); color: var(--text-secondary); background: none; border: none; cursor: pointer; text-align: left; transition: background var(--t-fast), color var(--t-fast); }
  .dl-option:hover:not(:disabled) { background: var(--bg-overlay); color: var(--text-primary); }
  .dl-option:disabled { opacity: 0.3; cursor: default; }
  .dl-sub { font-size: var(--text-xs); color: var(--text-faint); }
  .dl-row { display: flex; align-items: center; gap: var(--sp-2); }
  .dl-stepper { display: flex; align-items: center; gap: 2px; background: var(--bg-overlay); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); overflow: hidden; flex-shrink: 0; }
  .dl-step-btn { display: flex; align-items: center; justify-content: center; width: 22px; height: 28px; font-size: var(--text-base); color: var(--text-muted); background: none; border: none; cursor: pointer; line-height: 1; transition: color var(--t-fast), background var(--t-fast); }
  .dl-step-btn:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-raised); }
  .dl-step-btn:disabled { opacity: 0.25; cursor: default; }
  .dl-step-val { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-secondary); min-width: 24px; text-align: center; letter-spacing: var(--tracking-wide); }

  @keyframes scaleIn { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
</style>
