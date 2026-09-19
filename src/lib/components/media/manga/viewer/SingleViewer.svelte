<script lang="ts">
  import { readerState } from "$lib/state/mangaReader.svelte";
  import type { PeelGeometry } from "$lib/components/media/manga/lib/pagePeel";

  interface Props {
    imgCls:       string;
    src:          string | null;
    incomingSrc?: string | null;
    peel?:        PeelGeometry | null;
  }

  const { imgCls, src, incomingSrc = null, peel = null }: Props = $props();
</script>

<div
  class="inspect-wrap"
  style="transform:scale({readerState.inspectScale}) translate({readerState.inspectPanX / readerState.inspectScale}px,{readerState.inspectPanY / readerState.inspectScale}px)"
>
  {#if src}
    <div
      class="peel-stack"
      class:peeling={!!peel}
    >
      {#if peel && incomingSrc}
        <img
          class="peel-under"
          src={incomingSrc}
          alt=""
          draggable="false"
          decoding="async"
          style:clip-path={peel.holeClip}
        />
        <svg class="peel-page-shadow" viewBox="0 0 {peel.boxW} {peel.boxH}" preserveAspectRatio="none" style:clip-path={peel.holeClip} aria-hidden="true">
          <defs>
            <linearGradient id="peel-page-shade" gradientUnits="userSpaceOnUse"
              x1={peel.creaseX} y1={peel.creaseY} x2={peel.pageShadeToX} y2={peel.pageShadeToY}>
              <stop offset="0" stop-color="#000" stop-opacity="0.46"/>
              <stop offset="0.45" stop-color="#000" stop-opacity="0.14"/>
              <stop offset="1" stop-color="#000" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#peel-page-shade)"/>
        </svg>
      {/if}
      <img
        {src}
        alt="Page {readerState.pageNumber}"
        class="peel-front {imgCls}"
        decoding="async"
        draggable="false"
        style:clip-path={peel?.outgoingClip ?? "none"}
      />
      {#if peel && peel.creaseLength > 4}
        <div class="peel-flap-wrap" style:clip-path={peel.flapClip}>
          <img
            class="peel-flap-img"
            {src}
            alt=""
            draggable="false"
            decoding="async"
            style:transform={peel.flapTransform}
          />
          <div class="peel-flap-paper"></div>
          <svg class="peel-flap-shadow" viewBox="0 0 {peel.boxW} {peel.boxH}" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="peel-flap-shade" gradientUnits="userSpaceOnUse"
                x1={peel.creaseX} y1={peel.creaseY} x2={peel.flapShadeToX} y2={peel.flapShadeToY}>
                <stop offset="0" stop-color="#000" stop-opacity="0.62"/>
                <stop offset="0.4" stop-color="#000" stop-opacity="0.34"/>
                <stop offset="1" stop-color="#000" stop-opacity="0.16"/>
              </linearGradient>
            </defs>
            <rect width="100%" height="100%" fill="url(#peel-flap-shade)"/>
          </svg>
        </div>
      {/if}
    </div>
  {:else}
    <div class="page-loader page-loader-single" aria-hidden="true">{@render skeleton()}</div>
  {/if}
</div>

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
  .inspect-wrap { display: flex; align-items: center; justify-content: center; transform-origin: center center; will-change: transform; }

  .peel-stack { position: relative; display: flex; align-items: center; justify-content: center; background: var(--bg-void); }
  .peel-stack.peeling { overflow: hidden; }

  /* Sizing is left entirely to the fit-mode class (fit-width/fit-height/fit-screen/
     fit-original, from PageView.svelte) - a hardcoded max-width/max-height/object-fit
     here would tie with those on specificity and could silently win the cascade,
     forcing every page into contain-style letterboxing regardless of fit mode. */
  .peel-front { position: relative; z-index: 2; }

  .peel-under {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
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

  .peel-flap-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    transform-origin: 0 0;
    filter: brightness(1.14) contrast(0.9) saturate(0.55);
  }

  .peel-flap-paper {
    position: absolute;
    inset: 0;
    background: rgba(248, 244, 236, 0.52);
  }

  .page-loader { border-radius: var(--radius-sm); display: flex; align-items: stretch; }
  .page-loader-single {
    width: min(100%, var(--effective-width, 100%));
    max-width: var(--effective-width, 100%);
    max-height: calc(var(--visual-vh, 100vh) - 80px);
    aspect-ratio: 2 / 3;
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
