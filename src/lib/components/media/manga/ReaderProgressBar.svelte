<script lang="ts">
  import { ArrowLeft, ArrowRight } from "phosphor-svelte";
  import { onDestroy }             from "svelte";
  import type { Chapter }          from "$lib/types";

  interface Props {
    style:        string;
    loading:      boolean;
    rtl:          boolean;
    sliderPage:   number;
    sliderMax:    number;
    lastPage:     number;
    pageGroups?:  number[][];
    adjacent:     { prev: Chapter | null; next: Chapter | null };
    uiVisible:    boolean;
    barPosition:  "top" | "left" | "right";
    onGoPrev:     () => void;
    onGoNext:     () => void;
    onJumpToPage: (page: number, commit?: boolean) => void;
  }

  const {
    style, loading, rtl, sliderPage, sliderMax, lastPage,
    pageGroups = [],
    adjacent, uiVisible,
    barPosition,
    onGoPrev, onGoNext, onJumpToPage,
  }: Props = $props();

  const isVertical = $derived(barPosition === "left" || barPosition === "right");
  const slots = $derived(Array.from({ length: Math.max(0, sliderMax) }, (_, i) => i + 1));

  let dragging  = $state(false);
  let hoverSlot = $state<number | null>(null);

  function slotLabel(slot: number): string {
    if (style === "double" && pageGroups[slot - 1]) {
      const g = pageGroups[slot - 1];
      const span = g.length === 1 ? `${g[0]}` : `${g[0]}–${g[g.length - 1]}`;
      return lastPage > 0 ? `${span} / ${lastPage}` : span;
    }
    return `${slot} / ${sliderMax}`;
  }

  function jump(slot: number, commit: boolean) {
    onJumpToPage(slot, commit);
  }

  function onSegDown(e: PointerEvent, slot: number) {
    if (e.button !== 0) return;
    dragging = true;
    hoverSlot = slot;
    jump(slot, false);
  }

  function onSegEnter(slot: number) {
    hoverSlot = slot;
    if (dragging) jump(slot, false);
  }

  function onSegLeave(slot: number) {
    if (dragging) return;
    if (hoverSlot === slot) hoverSlot = null;
  }

  function onSegClick(slot: number) {
    if (dragging) return;
    jump(slot, true);
  }

  function endDrag() {
    if (!dragging) return;
    dragging = false;
    if (hoverSlot != null) jump(hoverSlot, true);
  }

  function onWinUp() { endDrag(); }

  $effect(() => {
    if (!dragging) return;
    window.addEventListener("pointerup", onWinUp);
    window.addEventListener("pointercancel", onWinUp);
    return () => {
      window.removeEventListener("pointerup", onWinUp);
      window.removeEventListener("pointercancel", onWinUp);
    };
  });

  onDestroy(() => { dragging = false; });
</script>

{#snippet segment(slot: number)}
  <button
    type="button"
    class="seg"
    class:done={slot < sliderPage}
    class:current={slot === sliderPage}
    disabled={loading}
    onpointerdown={(e) => onSegDown(e, slot)}
    onpointerenter={() => onSegEnter(slot)}
    onpointerleave={() => onSegLeave(slot)}
    onclick={() => onSegClick(slot)}
  >
    <span class="cell"></span>
    {#if hoverSlot === slot}
      <span class="tip-box" class:tip-v={isVertical} class:tip-right={barPosition === "right"}>
        {slotLabel(slot)}
      </span>
    {/if}
  </button>
{/snippet}

{#if !isVertical}
  <div class="bottombar" class:hidden={!uiVisible}>
    <button class="nav-btn" onclick={onGoPrev}
      disabled={loading || (style === "longstrip" ? !adjacent.prev : (sliderPage === 1 && !adjacent.prev))}>
      <ArrowLeft size={13} weight="light" />
    </button>

    {#if sliderMax > 1}
      <div class="track" class:rtl>
        {#each slots as slot (slot)}
          {@render segment(slot)}
        {/each}
      </div>
    {/if}

    <button class="nav-btn" onclick={onGoNext}
      disabled={loading || (style === "longstrip" ? !adjacent.next : (sliderPage === sliderMax && !adjacent.next))}>
      <ArrowRight size={13} weight="light" />
    </button>
  </div>

{:else}
  <div class="vbar-progress" class:hidden={!uiVisible}>
    {#if sliderMax > 1}
      <div class="vtrack" class:rtl>
        {#each slots as slot (slot)}
          {@render segment(slot)}
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .bottombar {
    position: fixed; z-index: 40;
    bottom: var(--sp-4); left: 50%; transform: translateX(-50%);
    width: min(1320px, calc(100vw - var(--sp-8)));
    display: flex; align-items: center; gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--radius-lg);
    background: var(--frost-bg);
    border: 1px solid var(--frost-border);
    backdrop-filter: var(--frost-blur); -webkit-backdrop-filter: var(--frost-blur);
    box-shadow: var(--frost-shadow);
    transition: opacity 0.25s ease, transform 0.2s ease;
  }
  .bottombar.hidden { opacity: 0; pointer-events: none; transform: translateX(-50%) translateY(8px); }

  .nav-btn { display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; flex-shrink: 0; border-radius: var(--radius-md); border: none; color: var(--text-muted); transition: background var(--t-base), color var(--t-base); }
  .nav-btn:hover:not(:disabled) { background: var(--bg-raised); color: var(--text-primary); }
  .nav-btn:disabled { opacity: 0.25; cursor: default; }

  .track {
    flex: 1;
    display: flex;
    align-items: stretch;
    height: 34px;
    min-width: 0;
  }
  .track.rtl { flex-direction: row-reverse; }

  .vbar-progress {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
    width: 100%;
    min-height: 0;
    padding: var(--sp-1) 0;
    transition: opacity 0.25s ease;
    pointer-events: none;
  }
  .vbar-progress.hidden { opacity: 0; }

  .vtrack {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    min-height: 0;
    pointer-events: all;
  }
  .vtrack.rtl { flex-direction: column-reverse; }

  .seg {
    position: relative;
    flex: 1 1 0;
    min-width: 0;
    min-height: 0;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .seg:disabled { cursor: default; }
  .vtrack .seg { width: 100%; }

  .cell {
    display: block;
    width: calc(100% - 1px);
    height: 3px;
    border-radius: 1px;
    background: var(--border-strong);
    pointer-events: none;
    transition: height 0.15s ease, width 0.15s ease, background var(--t-fast);
  }
  .track:hover .cell { height: 5px; }
  .seg.done .cell,
  .seg.current .cell { background: var(--accent-fg); }

  .vtrack .cell {
    width: 5px;
    height: calc(100% - 1px);
  }
  .vtrack:hover .cell { width: 7px; }
  .vtrack .seg.done .cell,
  .vtrack .seg.current .cell { background: var(--accent); }

  .tip-box {
    position: absolute;
    bottom: calc(100% + 2px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-raised);
    border: 1px solid var(--border-base);
    border-radius: var(--radius-sm);
    padding: 2px 6px;
    font-family: var(--font-ui);
    font-size: var(--text-2xs);
    color: var(--text-secondary);
    white-space: nowrap;
    pointer-events: none;
    z-index: 10;
    letter-spacing: var(--tracking-wide);
  }
  .tip-box.tip-v {
    bottom: auto;
    left: calc(100% + 8px);
    top: 50%;
    transform: translateY(-50%);
  }
  .tip-box.tip-v.tip-right {
    left: auto;
    right: calc(100% + 8px);
  }
</style>
