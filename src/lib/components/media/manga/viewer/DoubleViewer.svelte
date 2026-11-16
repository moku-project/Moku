<script lang="ts">
  import { readerState } from "$lib/state/mangaReader.svelte";
  import type { PeelGeometry } from "$lib/components/media/manga/lib/pagePeel";
  import { t } from "$lib/i18n/index.svelte";
  import { getCachedAspect, spreadLayout } from "$lib/components/media/manga/lib/pageLoader";

  export interface SpreadFlip {
    fromRight:  boolean;
    foldFull:   boolean;
    boxW:       number;
    boxH:       number;
    geom:       PeelGeometry;
    shade:      number;
    underLeft:  string | null;
    underRight: string | null;
    underFull:  string | null;
    outLeft:    string | null;
    outRight:   string | null;
    outFull:    string | null;
    flapSrc:    string | null;
    fromStart:  boolean;
    fromEnd:    boolean;
    toStart:    boolean;
    toEnd:      boolean;
  }

  interface Props {
    imgCls:          string;
    currentGroup:    number[];
    srcs:            (string | null)[];
    pageGroups:      number[][];
    rtl:             boolean;
    flip?:           SpreadFlip | null;
    boundaryPrevSrc?: string | null;
    boundaryNextSrc?: string | null;
  }

  const {
    imgCls, currentGroup, srcs, pageGroups, rtl,
    flip = null,
    boundaryPrevSrc = null, boundaryNextSrc = null,
  }: Props = $props();

  const idle = $derived.by(() => {
    const layout = spreadLayout(currentGroup, rtl);
    const srcOf = (pg: number | null) => {
      if (pg == null) return null;
      const i = currentGroup.indexOf(pg);
      return i >= 0 ? srcs[i] ?? null : null;
    };
    let leftSrc  = srcOf(layout.left);
    let rightSrc = srcOf(layout.right);
    const totalPages = readerState.pageUrls.length;
    const soloPg = layout.left ?? layout.right;
    if (soloPg != null && totalPages > 1) {
      if (soloPg === 1 && layout.left == null && boundaryPrevSrc) leftSrc = boundaryPrevSrc;
      else if (soloPg === 1 && layout.right == null && boundaryPrevSrc) rightSrc = boundaryPrevSrc;
      else if (soloPg === totalPages && layout.left == null && boundaryNextSrc) leftSrc = boundaryNextSrc;
      else if (soloPg === totalPages && layout.right == null && boundaryNextSrc) rightSrc = boundaryNextSrc;
    }
    return {
      leftSrc,
      rightSrc,
      leftPg:   layout.left,
      rightPg:  layout.right,
    };
  });

  const pageAspect = $derived.by(() => {
    const pg = idle.leftPg ?? idle.rightPg;
    if (pg == null) return 2 / 3;
    return getCachedAspect(readerState.pageUrls[pg - 1]) ?? 2 / 3;
  });
</script>

<div
  class="inspect-wrap"
  style="transform:scale({readerState.inspectScale}) translate({readerState.inspectPanX / readerState.inspectScale}px,{readerState.inspectPanY / readerState.inspectScale}px)"
>
  {#if pageGroups.length}
    <div
      class="double-wrap"
      class:peeling={!!flip}
      style:width={flip ? `${flip.boxW}px` : undefined}
      style:height={flip ? `${flip.boxH}px` : undefined}
      style:--page-aspect={pageAspect}
    >
      {#if flip}
        <div class="peel-under" style:clip-path={flip.geom.holeClip}>
          {#if flip.underFull}
            <img src={flip.underFull} alt="" class="{imgCls} page-full" decoding="async" draggable="false" />
          {:else}
            <div class="slot gap-left">
              {@render pageSlot(flip.underLeft, flip.underLeft ? 1 : null, "")}
            </div>
            <div class="slot gap-right">
              {@render pageSlot(flip.underRight, flip.underRight ? 1 : null, "")}
            </div>
          {/if}
        </div>
        {#if flip.geom.creaseLength > 4}
          <svg class="peel-page-shadow" viewBox="0 0 {flip.geom.boxW} {flip.geom.boxH}" preserveAspectRatio="none" style:clip-path={flip.geom.holeClip} style:opacity={flip.shade} aria-hidden="true">
            <defs>
              <linearGradient id="spread-page-shade" gradientUnits="userSpaceOnUse"
                x1={flip.geom.creaseX} y1={flip.geom.creaseY} x2={flip.geom.pageShadeToX} y2={flip.geom.pageShadeToY}>
                <stop offset="0" stop-color="#000" stop-opacity="0.46"/>
                <stop offset="0.45" stop-color="#000" stop-opacity="0.14"/>
                <stop offset="1" stop-color="#000" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#spread-page-shade)"/>
          </svg>
        {/if}
        <div class="peel-out" style:clip-path={flip.geom.outgoingClip}>
          {#if flip.outFull}
            <img src={flip.outFull} alt="" class="{imgCls} page-full" decoding="async" draggable="false" />
          {:else}
            <div class="slot gap-left">
              {@render pageSlot(flip.outLeft, flip.outLeft ? 1 : null, "")}
            </div>
            <div class="slot gap-right">
              {@render pageSlot(flip.outRight, flip.outRight ? 1 : null, "")}
            </div>
          {/if}
        </div>
        {#if flip.geom.creaseLength > 4}
          <div class="peel-flap-wrap" style:clip-path={flip.geom.flapClip}>
            <div class="peel-flap-inner" style:transform={flip.geom.flapTransform}>
              {#if flip.foldFull && flip.outFull && flip.flapSrc}
                <img class="peel-flap-img sheet" src={flip.flapSrc} alt="" draggable="false" decoding="async"
                  style:filter="brightness({1 + 0.14 * flip.shade}) contrast({1 - 0.1 * flip.shade}) saturate({1 - 0.45 * flip.shade})" />
              {:else if flip.foldFull}
                <div class="slot gap-left">
                  {#if flip.outLeft}
                    <img src={flip.outLeft} alt="" class={imgCls} decoding="async" draggable="false"
                      style:filter="brightness({1 + 0.14 * flip.shade}) contrast({1 - 0.1 * flip.shade}) saturate({1 - 0.45 * flip.shade})" />
                  {/if}
                </div>
                <div class="slot gap-right">
                  {#if flip.outRight}
                    <img src={flip.outRight} alt="" class={imgCls} decoding="async" draggable="false"
                      style:filter="brightness({1 + 0.14 * flip.shade}) contrast({1 - 0.1 * flip.shade}) saturate({1 - 0.45 * flip.shade})" />
                  {/if}
                </div>
              {:else if flip.flapSrc}
                <img
                  class="peel-flap-img"
                  class:from-right={flip.fromRight}
                  class:from-left={!flip.fromRight}
                  src={flip.flapSrc}
                  alt=""
                  draggable="false"
                  decoding="async"
                  style:filter="brightness({1 + 0.14 * flip.shade}) contrast({1 - 0.1 * flip.shade}) saturate({1 - 0.45 * flip.shade})"
                />
              {/if}
            </div>
            <div class="peel-flap-paper" style:opacity={flip.shade}></div>
            <svg class="peel-flap-shadow" viewBox="0 0 {flip.geom.boxW} {flip.geom.boxH}" preserveAspectRatio="none" style:opacity={flip.shade} aria-hidden="true">
              <defs>
                <linearGradient id="spread-flap-shade" gradientUnits="userSpaceOnUse"
                  x1={flip.geom.creaseX} y1={flip.geom.creaseY} x2={flip.geom.flapShadeToX} y2={flip.geom.flapShadeToY}>
                  <stop offset="0" stop-color="#000" stop-opacity="0.62"/>
                  <stop offset="0.4" stop-color="#000" stop-opacity="0.34"/>
                  <stop offset="1" stop-color="#000" stop-opacity="0.16"/>
                </linearGradient>
              </defs>
              <rect width="100%" height="100%" fill="url(#spread-flap-shade)"/>
            </svg>
          </div>
        {/if}
      {:else}
        <div class="slot gap-left">
          {@render pageSlot(idle.leftSrc, idle.leftPg, t("reader.pageAlt", { page: String(idle.leftPg) }))}
        </div>
        <div class="slot gap-right">
          {@render pageSlot(idle.rightSrc, idle.rightPg, t("reader.pageAlt", { page: String(idle.rightPg) }))}
        </div>
      {/if}
    </div>
  {:else}
    <div class="center-overlay">
      <div class="page-loader page-loader-single" aria-hidden="true">{@render skeleton()}</div>
    </div>
  {/if}
</div>

{#snippet pageSlot(src: string | null, pg: number | null, alt: string)}
  {#if src}
    <img {src} {alt} class={imgCls} decoding="async" draggable="false" />
  {:else if pg != null}
    <div class="page-loader" aria-hidden="true">{@render skeleton()}</div>
  {:else}
    <div class="spread-void"></div>
  {/if}
{/snippet}

{#snippet skeleton()}
  <svg class="panel-skeleton" viewBox="0 0 100 150" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <rect class="ps-r ps-r1" x="2"  y="2"  width="62" height="88" rx="1"/>
    <rect class="ps-r ps-r2" x="68" y="2"  width="30" height="42" rx="1"/>
    <rect class="ps-r ps-r3" x="68" y="48" width="30" height="42" rx="1"/>
    <rect class="ps-r ps-r4" x="2"  y="94" width="44" height="54" rx="1"/>
    <rect class="ps-r ps-r5" x="50" y="94" width="48" height="54" rx="1"/>
  </svg>
{/snippet}

<style>
  .inspect-wrap {
    --spread-h: calc(var(--visual-vh, 100vh) - 80px);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    transform-origin: center center;
    will-change: transform;
  }

  .double-wrap {
    --spread-gap: 2px;
    display: flex;
    align-items: stretch;
    justify-content: center;
    width: max-content;
    height: var(--spread-h);
    max-height: var(--spread-h);
    position: relative;
    background: var(--bg-void);
  }
  .double-wrap.peeling { overflow: hidden; }
  .double-wrap.peeling .slot {
    flex: 1 1 0;
    width: 0;
    min-width: 0;
  }
  .double-wrap.peeling .spread-void {
    width: 100%;
    height: 100%;
    aspect-ratio: auto;
  }

  .slot {
    flex: 0 0 auto;
    height: 100%;
    display: flex;
    align-items: stretch;
    justify-content: center;
    overflow: hidden;
    background: var(--bg-void);
  }
  .gap-left  { margin-right: var(--spread-gap); }
  .gap-right { margin-left: var(--spread-gap); }

  .spread-void {
    height: 100%;
    aspect-ratio: var(--page-aspect, 0.67);
    width: auto;
    flex: 0 0 auto;
  }

  .double-wrap .slot > :global(img) {
    display: block;
    height: 100%;
    width: auto;
    max-width: none;
    max-height: none;
    object-fit: contain;
  }
  .page-full {
    display: block;
    max-height: var(--spread-h);
    width: auto;
    height: auto;
    object-fit: contain;
  }
  .double-wrap.peeling .page-full,
  .double-wrap.peeling .slot > :global(img) {
    max-width: 100%;
    max-height: 100%;
    height: 100%;
    width: auto;
  }

  .peel-under, .peel-out {
    display: flex;
    align-items: stretch;
  }
  .peel-under {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }
  .peel-out {
    position: relative;
    z-index: 2;
    width: 100%;
    height: 100%;
  }

  .peel-page-shadow, .peel-flap-shadow {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }
  .peel-page-shadow { z-index: 1; }

  .peel-flap-wrap {
    position: absolute;
    inset: 0;
    z-index: 3;
    pointer-events: none;
  }
  .peel-flap-inner {
    position: absolute;
    inset: 0;
    display: flex;
    transform-origin: 0 0;
  }
  .peel-flap-img {
    width: calc(50% - var(--spread-gap));
    height: 100%;
    object-fit: contain;
    transform: scaleX(-1);
  }
  .peel-flap-img.from-right { margin-left: auto; }
  .peel-flap-img.from-left  { margin-right: auto; }
  .peel-flap-img.sheet {
    width: 100%;
    height: 100%;
    transform: none;
  }

  .peel-flap-paper {
    position: absolute;
    inset: 0;
    background: rgba(248, 244, 236, 0.52);
  }

  .center-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }

  .page-loader {
    border-radius: var(--radius-sm);
    display: flex;
    align-items: stretch;
    aspect-ratio: 2 / 3;
    height: var(--spread-h);
    max-height: var(--spread-h);
    width: auto;
    max-width: calc((var(--effective-width, 100vw) - 4px) / 2);
  }
  .page-loader-single {
    width: min(100%, var(--effective-width, 100%));
    max-width: var(--effective-width, 100%);
    max-height: var(--spread-h);
    aspect-ratio: 2 / 3;
    height: auto;
  }

  .panel-skeleton { width: 100%; height: 100%; }
  .panel-skeleton :global(.ps-r) {
    stroke: var(--border-strong); stroke-width: 0.8; fill: none;
    stroke-dasharray: 400; stroke-dashoffset: 400;
    animation: ps-shimmer 2s ease-in-out infinite;
  }
  .panel-skeleton :global(.ps-r1) { animation-delay: 0s; }
  .panel-skeleton :global(.ps-r2) { animation-delay: 0.15s; }
  .panel-skeleton :global(.ps-r3) { animation-delay: 0.3s; }
  .panel-skeleton :global(.ps-r4) { animation-delay: 0.1s; }
  .panel-skeleton :global(.ps-r5) { animation-delay: 0.25s; }

  @keyframes ps-shimmer {
    0%   { stroke-dashoffset: 400;  opacity: 0.25; }
    40%  { stroke-dashoffset: 0;    opacity: 0.55; }
    70%  { stroke-dashoffset: 0;    opacity: 0.55; }
    100% { stroke-dashoffset: -400; opacity: 0.25; }
  }
</style>
