<script lang="ts">
  import { readerState }        from "$lib/state/mangaReader.svelte";
  import { createPinchTracker } from "$lib/components/media/manga/lib/pinchZoom";
  import type { PinchTracker }  from "$lib/components/media/manga/lib/pinchZoom";
  import { createPageGestures } from "$lib/components/media/manga/lib/inspectGestures";
  import { READ_LINE_PCT }      from "$lib/components/media/manga/lib/scrollHandler";
  import { settingsState }      from "$lib/state/settings.svelte";
  import { tick }               from "svelte";
  import LongstripViewer        from "$lib/components/media/manga/viewer/LongstripViewer.svelte";
  import SingleViewer           from "$lib/components/media/manga/viewer/SingleViewer.svelte";
  import DoubleViewer, { type SpreadFlip } from "$lib/components/media/manga/viewer/DoubleViewer.svelte";
  import {
    type PeelGeometry,
    type FoldHalf,
    PEEL_MS, FLIP_MS, peelGeometry, peelCorner, easeOutCubic, spreadShade,
  } from "$lib/components/media/manga/lib/pagePeel";
  import { spreadLayout, buildPageGroups } from "$lib/components/media/manga/lib/pageLoader";
  import { getPrevPrefetchUrls, getNextPrefetchUrls } from "$lib/components/media/manga/lib/chapterLoader";

  export interface StripChapter {
    chapterId:   string;
    chapterName: string;
    urls:        string[];
  }

  type FlatPage = {
    chapterId:   string;
    chapterName: string;
    localIndex:  number;
    url:         string;
    total:       number;
  };

  interface Props {
    style:            string;
    imgCls:           string;
    effectiveWidth:   number | undefined;
    loading:          boolean;
    error:            string | null;
    pageReady:        boolean;
    pageGroups:       number[][];
    currentGroup:     number[];
    turning:          boolean;
    turnDir:          1 | -1;
    transition:       string;
    rtl:              boolean;
    tapToToggleBar:   boolean;
    pinchZoomEnabled: boolean;
    useBlob:          boolean;
    barPosition:      "top" | "left" | "right";
    onGetZoom:        () => number;
    onSetZoom:        (z: number) => void;
    resolveUrl:       (url: string, priority?: number) => Promise<string>;
    onTap:            (e: MouseEvent) => void;
    onWheel:          (e: WheelEvent) => void;
    onToggleUi:       () => void;
    onSwipe:          (forward: boolean) => void;
    bindContainer:    (el: HTMLDivElement) => void;
    onPageChange:     (page: number) => void;
    onChapterChange:  (chapterId: string) => void;
    onCenterIdxChange:(flatIdx: number) => void;
    onMarkRead:       (chapterId: string) => void;
    onAppend:         () => void;
    onCrossBoundary:  (dir: 1 | -1, targetPage: number) => void;
  }

  const {
    style, imgCls, effectiveWidth, loading, error, pageReady,
    pageGroups, currentGroup, turning, turnDir, transition, rtl,
    tapToToggleBar, pinchZoomEnabled, useBlob, barPosition,
    onGetZoom, onSetZoom, resolveUrl, onTap, onWheel, onToggleUi, onSwipe, bindContainer,
    onPageChange, onChapterChange, onCenterIdxChange, onMarkRead, onAppend, onCrossBoundary,
  }: Props = $props();

  let stripChunks = $state<StripChapter[]>([]);

  export function loadStrip(chapterId: string, chapterName: string, urls: string[], resumeTo = 0) {
    stripChunks = [{ chapterId, chapterName, urls }];
    if (resumeTo > 1) {
      setTimeout(() => scrollToFlatIndex(resumeTo - 1), 0);
    }
  }

  export async function appendStripChunk(chapterId: string, chapterName: string, urls: string[]) {
    if (stripChunks.some(c => c.chapterId === chapterId)) return;
    stripChunks = [...stripChunks, { chapterId, chapterName, urls }];
  }

  export function getStripChunks(): StripChapter[] {
    return stripChunks;
  }

  const flatPages = $derived.by<FlatPage[]>(() => {
    const out: FlatPage[] = [];
    for (const chunk of stripChunks) {
      for (let i = 0; i < chunk.urls.length; i++) {
        out.push({
          chapterId:   chunk.chapterId,
          chapterName: chunk.chapterName,
          localIndex:  i,
          url:         chunk.urls[i],
          total:       chunk.urls.length,
        });
      }
    }
    return out;
  });

  let currentSrc       = $state<string | null>(null);
  let currentGroupSrcs = $state<(string | null)[]>([]);
  let srcPage          = 0;
  let srcUrl           = "";
  let srcGroupKey      = "";
  let incomingPeelSrc  = $state<string | null>(null);
  let peelGeom         = $state<PeelGeometry | null>(null);
  let spreadFlip       = $state<SpreadFlip | null>(null);
  let peelRaf          = 0;
  let peelWait         = null as (() => void) | null;

  $effect(() => {
    if (style === "longstrip" || !pageReady) return;
    const pageNum = readerState.pageNumber;
    const urls    = readerState.pageUrls;
    const group   = currentGroup;
    let cancelled = false;
    if (style === "double") {
      const key = group.join(",");
      if (srcGroupKey === key && currentGroupSrcs.length === group.length && currentGroupSrcs.every(Boolean)) return;
      currentGroupSrcs = group.map(() => null);
      srcGroupKey = "";
      group.forEach((pg, i) => {
        const url = urls[pg - 1];
        if (!url) return;
        resolveUrl(url, 999).then(src => {
          if (cancelled) return;
          currentGroupSrcs = currentGroupSrcs.map((s, j) => j === i ? src : s);
          if (currentGroupSrcs.length === group.length && currentGroupSrcs.every(Boolean)) srcGroupKey = key;
        });
      });
    } else {
      const url = urls[pageNum - 1];
      if (!url) { currentSrc = null; srcPage = 0; srcUrl = ""; return; }
      if (srcPage === pageNum && srcUrl === url && currentSrc) return;
      currentSrc = null;
      srcPage = 0;
      resolveUrl(url, 999).then(src => {
        if (cancelled) return;
        currentSrc = src;
        srcPage = pageNum;
        srcUrl = url;
      });
    }
    return () => { cancelled = true; };
  });

  $effect(() => {
    if (style === "longstrip" || !currentSrc) return;
    const n    = readerState.pageNumber;
    const urls = readerState.pageUrls;
    for (const url of [urls[n], urls[n - 2]]) {
      if (!url) continue;
      const img = new Image();
      img.src = url;
    }
  });

  $effect(() => {
    void readerState.activeChapter?.id;
    return () => {
      if (peelRaf) cancelAnimationFrame(peelRaf);
      peelRaf = 0;
      peelWait?.();
      peelWait = null;
      peelGeom = null;
      incomingPeelSrc = null;
      spreadFlip = null;
    };
  });

  function waitDecoded(src: string): Promise<void> {
    const img = new Image();
    img.src = src;
    if (typeof img.decode === "function") {
      return img.decode().catch(() => {});
    }
    return new Promise(resolve => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    });
  }

  function measureOutgoing(): { w: number; h: number } | null {
    const img = containerEl?.querySelector<HTMLElement>(".peel-stack > img.peel-front");
    if (!img) return null;
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    if (w < 8 || h < 8) return null;
    return { w, h };
  }

  function runPeelAnim(corner: ReturnType<typeof peelCorner>, w: number, h: number): Promise<void> {
    return new Promise(resolve => {
      const t0 = performance.now();
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (peelRaf) cancelAnimationFrame(peelRaf);
        peelRaf = 0;
        peelWait = null;
        resolve();
      };
      peelWait = finish;
      const frame = (now: number) => {
        const t = Math.min(1, (now - t0) / PEEL_MS);
        peelGeom = peelGeometry(corner, easeOutCubic(t), w, h);
        if (t < 1) {
          peelRaf = requestAnimationFrame(frame);
          return;
        }
        finish();
      };
      peelRaf = requestAnimationFrame(frame);
      setTimeout(finish, PEEL_MS + 80);
    });
  }

  function measureSpread(): { w: number; h: number } | null {
    const wrap = containerEl?.querySelector<HTMLElement>(".double-wrap");
    if (!wrap) return null;
    const w = wrap.offsetWidth;
    const h = wrap.offsetHeight;
    if (w < 16 || h < 8) return null;
    return { w, h };
  }

  function runSpreadPeelAnim(corner: ReturnType<typeof peelCorner>, w: number, h: number, fold: FoldHalf): Promise<void> {
    return new Promise(resolve => {
      const t0 = performance.now();
      let settled = false;
      const finish = (t = 1) => {
        if (settled) return;
        settled = true;
        if (peelRaf) cancelAnimationFrame(peelRaf);
        peelRaf = 0;
        peelWait = null;
        if (spreadFlip) {
          spreadFlip = { ...spreadFlip, geom: peelGeometry(corner, 1, w, h, fold), shade: spreadShade(t) };
        }
        resolve();
      };
      peelWait = () => finish(1);
      const frame = (now: number) => {
        const t = Math.min(1, (now - t0) / FLIP_MS);
        const geom = peelGeometry(corner, easeOutCubic(t), w, h, fold);
        if (spreadFlip) spreadFlip = { ...spreadFlip, geom, shade: spreadShade(t) };
        if (t < 1) {
          peelRaf = requestAnimationFrame(frame);
          return;
        }
        finish(1);
      };
      peelRaf = requestAnimationFrame(frame);
      setTimeout(() => finish(1), FLIP_MS + 80);
    });
  }

  async function srcForPage(pg: number): Promise<string | null> {
    const url = readerState.pageUrls[pg - 1];
    if (!url) return null;
    const src = await resolveUrl(url, 999);
    await waitDecoded(src);
    return src;
  }

  async function playSpreadFlip(dir: 1 | -1): Promise<boolean> {
    const groups = pageGroups;
    if (!groups.length) return false;
    const from = readerState.pageNumber;
    const gi = groups.findIndex(g => g.includes(from));
    if (gi < 0) return false;
    const toGi = gi + dir;
    if (toGi < 0 || toGi >= groups.length) return false;

    const fromFile = groups[gi];
    const toFile   = groups[toGi];
    const fromVis  = rtl ? [...fromFile].reverse() : [...fromFile];
    const toVis    = rtl ? [...toFile].reverse() : [...toFile];
    const fromLay  = spreadLayout(fromVis, rtl);
    const toLay    = spreadLayout(toVis, rtl);

    const fromRight = rtl ? dir === -1 : dir === 1;
    if (fromRight && fromLay.right == null) return false;
    if (!fromRight && fromLay.left == null) return false;

    const corner = peelCorner(dir, rtl);
    const fold: FoldHalf = fromRight ? "right" : "left";
    const box    = measureSpread();
    if (!box) return false;
    const chapterId = readerState.activeChapter?.id;

    readerState.turnDir = dir;
    readerState.turning = true;

    try {
      const srcOf = async (pg: number | null): Promise<string | null> => {
        if (pg == null) return null;
        const i = currentGroup.indexOf(pg);
        if (i >= 0 && currentGroupSrcs[i]) return currentGroupSrcs[i];
        return srcForPage(pg);
      };
      const toLeft       = await srcOf(toLay.left);
      const toRight      = await srcOf(toLay.right);
      const fromLeft     = await srcOf(fromLay.left);
      const fromRightSrc = await srcOf(fromLay.right);
      if (fromRight && !fromRightSrc) return false;
      if (!fromRight && !fromLeft) return false;
      if (toLay.left != null && !toLeft) return false;
      if (toLay.right != null && !toRight) return false;
      if (readerState.activeChapter?.id !== chapterId) return false;
      if (readerState.pageNumber !== from) return false;

      spreadFlip = {
        fromRight,
        foldFull:   false,
        boxW:       box.w,
        boxH:       box.h,
        geom:       peelGeometry(corner, 0, box.w, box.h, fold),
        shade:      1,
        underLeft:  toLeft,
        underRight: toRight,
        underFull:  null,
        outLeft:    fromLeft,
        outRight:   fromRightSrc,
        outFull:    null,
        flapSrc:    fromRight ? toLeft : toRight,
        fromStart:  gi === 0,
        fromEnd:    gi === groups.length - 1,
        toStart:    toGi === 0,
        toEnd:      toGi === groups.length - 1,
      };
      await tick();
      await runSpreadPeelAnim(corner, box.w, box.h, fold);
      if (readerState.activeChapter?.id !== chapterId) return false;

      currentGroupSrcs = toVis.map(pg => {
        if (toLay.left === pg) return toLeft;
        if (toLay.right === pg) return toRight;
        return toLeft ?? toRight;
      });
      srcGroupKey = toVis.join(",");
      readerState.pageNumber = toFile[0];
      spreadFlip = null;
      return true;
    } catch {
      return false;
    } finally {
      if (peelRaf) cancelAnimationFrame(peelRaf);
      peelRaf = 0;
      peelWait?.();
      peelWait = null;
      spreadFlip = null;
      readerState.turning = false;
    }
  }

  async function playBoundaryFlip(dir: 1 | -1): Promise<boolean> {
    const groups = pageGroups;
    if (!groups.length) return false;
    const from = readerState.pageNumber;
    const gi = groups.findIndex(g => g.includes(from));
    if (gi < 0) return false;

    const fromFile = groups[gi];
    if (fromFile.length !== 1) return false;

    let adjacentUrls: string[] | null;
    let toFile: number[];
    if (dir === 1) {
      if (gi !== groups.length - 1) return false;
      adjacentUrls = getNextPrefetchUrls();
      if (!adjacentUrls) return false;
      const nextGroups = buildPageGroups(adjacentUrls, settingsState.settings.offsetDoubleSpreads ?? false);
      toFile = nextGroups.length > 1 ? nextGroups[1] : nextGroups[0];
    } else {
      if (gi !== 0) return false;
      adjacentUrls = getPrevPrefetchUrls();
      if (!adjacentUrls) return false;
      const prevGroups = buildPageGroups(adjacentUrls, settingsState.settings.offsetDoubleSpreads ?? false);
      const last = prevGroups[prevGroups.length - 1];
      toFile = last.length === 1 && prevGroups.length > 1 ? prevGroups[prevGroups.length - 2] : last;
    }

    const boundarySrc = dir === 1 ? readerState.boundaryNextSrc : readerState.boundaryPrevSrc;
    const fromVis = rtl ? [...fromFile].reverse() : [...fromFile];
    const toVis   = rtl ? [...toFile].reverse()   : [...toFile];
    const fromLay = spreadLayout(fromVis, rtl);
    const toLay   = spreadLayout(toVis, rtl);

    const fromRight = rtl ? dir === -1 : dir === 1;
    const corner = peelCorner(dir, rtl);
    const fold: FoldHalf = fromRight ? "right" : "left";
    const box = measureSpread();
    if (!box) return false;
    const chapterId = readerState.activeChapter?.id;

    readerState.turnDir = dir;
    readerState.turning = true;

    try {
      const srcOfAdjacent = async (pg: number | null): Promise<string | null> => {
        if (pg == null || !adjacentUrls) return null;
        const url = adjacentUrls[pg - 1];
        if (!url) return null;
        const src = await resolveUrl(url, 999);
        await waitDecoded(src);
        return src;
      };

      const fromLeft     = fromLay.left  != null ? await srcForPage(fromLay.left)  : boundarySrc;
      const fromRightSrc = fromLay.right != null ? await srcForPage(fromLay.right) : boundarySrc;
      const toLeft        = await srcOfAdjacent(toLay.left);
      const toRight       = await srcOfAdjacent(toLay.right);
      if (fromRight && !fromRightSrc) return false;
      if (!fromRight && !fromLeft) return false;
      if (toLay.left != null && !toLeft) return false;
      if (toLay.right != null && !toRight) return false;
      if (readerState.activeChapter?.id !== chapterId) return false;
      if (readerState.pageNumber !== from) return false;

      spreadFlip = {
        fromRight,
        foldFull:   false,
        boxW:       box.w,
        boxH:       box.h,
        geom:       peelGeometry(corner, 0, box.w, box.h, fold),
        shade:      1,
        underLeft:  toLeft,
        underRight: toRight,
        underFull:  null,
        outLeft:    fromLeft,
        outRight:   fromRightSrc,
        outFull:    null,
        flapSrc:    fromRight ? toLeft : toRight,
        fromStart:  gi === 0,
        fromEnd:    gi === groups.length - 1,
        toStart:    false,
        toEnd:      false,
      };
      await tick();
      await runSpreadPeelAnim(corner, box.w, box.h, fold);
      if (readerState.activeChapter?.id !== chapterId) return false;

      spreadFlip = null;
      onCrossBoundary(dir, toFile[0]);
      return true;
    } catch {
      return false;
    } finally {
      if (peelRaf) cancelAnimationFrame(peelRaf);
      peelRaf = 0;
      peelWait?.();
      peelWait = null;
      spreadFlip = null;
      readerState.turning = false;
    }
  }

  /** Auto corner-peel or spread flip. Commits pageNumber after the outgoing layer is gone. */
  export async function playPeel(dir: 1 | -1): Promise<boolean> {
    if (readerState.turning) return false;
    if (readerState.inspectScale > 1) return false;
    if (!pageReady) return false;
    if (style === "double") return (await playSpreadFlip(dir)) || playBoundaryFlip(dir);
    if (style !== "single" && style !== "auto") return false;
    if (!currentSrc) return false;

    const from = readerState.pageNumber;
    const to   = from + dir;
    const urls = readerState.pageUrls;
    const url  = urls[to - 1];
    if (!url) return false;

    const chapterId = readerState.activeChapter?.id;
    const box = measureOutgoing();
    if (!box) return false;

    readerState.turnDir = dir;
    readerState.turning = true;

    try {
      const incoming = await resolveUrl(url, 999);
      await waitDecoded(incoming);
      if (readerState.activeChapter?.id !== chapterId) return false;
      if (readerState.pageNumber !== from) return false;

      incomingPeelSrc = incoming;
      const corner = peelCorner(dir, rtl);
      peelGeom = peelGeometry(corner, 0, box.w, box.h);
      await runPeelAnim(corner, box.w, box.h);
      if (readerState.activeChapter?.id !== chapterId) return false;

      currentSrc = incoming;
      srcPage = to;
      srcUrl = url;
      incomingPeelSrc = null;
      peelGeom = null;
      readerState.pageNumber = to;
      return true;
    } catch {
      return false;
    } finally {
      if (peelRaf) cancelAnimationFrame(peelRaf);
      peelRaf = 0;
      peelWait?.();
      peelWait = null;
      incomingPeelSrc = null;
      peelGeom = null;
      spreadFlip = null;
      readerState.turning = false;
    }
  }

  $effect(() => {
    void readerState.pageNumber;
    if (style !== "longstrip" && containerEl) containerEl.scrollTo(0, 0);
  });

  let lastTrackedPage    = 0;
  let lastTrackedChapter = "";

  function handleScroll() {
    if (style !== "longstrip" || !containerEl || !flatPages.length) return;

    const containerRect = containerEl.getBoundingClientRect();
    const readY         = containerRect.top + containerEl.clientHeight * READ_LINE_PCT;

    const slots = containerEl.querySelectorAll<HTMLElement>(".strip-slot");
    let centerFlatIdx = 0;
    let bestDist      = Infinity;

    slots.forEach((slot, idx) => {
      const rect = slot.getBoundingClientRect();
      const mid  = (rect.top + rect.bottom) / 2;
      const dist = Math.abs(mid - readY);
      if (dist < bestDist) { bestDist = dist; centerFlatIdx = idx; }
    });

    onCenterIdxChange(centerFlatIdx);

    const page = flatPages[centerFlatIdx];
    if (!page) return;

    const localPage = page.localIndex + 1;
    if (localPage !== lastTrackedPage || page.chapterId !== lastTrackedChapter) {
      lastTrackedPage    = localPage;
      lastTrackedChapter = page.chapterId;
      onPageChange(localPage);
      onChapterChange(page.chapterId);
    }

    for (const chunk of stripChunks) {
      const lastLocalIdx = chunk.urls.length - 1;
      let flatLastIdx = -1;
      for (let i = 0; i < flatPages.length; i++) {
        if (flatPages[i].chapterId === chunk.chapterId && flatPages[i].localIndex === lastLocalIdx) {
          flatLastIdx = i;
          break;
        }
      }
      if (flatLastIdx < 0) continue;
      const lastSlot = slots[flatLastIdx];
      if (!lastSlot) continue;
      const lastRect = lastSlot.getBoundingClientRect();
      if (lastRect.bottom < readY) onMarkRead(chunk.chapterId);
    }

    const scrollBottom = containerEl.scrollTop + containerEl.clientHeight;
    const scrollTotal  = containerEl.scrollHeight;
    if (scrollTotal - scrollBottom < containerEl.clientHeight * 1.5) onAppend();
  }

  let containerEl = $state<HTMLDivElement | undefined>();
  let stripRef: LongstripViewer | undefined = $state();
  let pinch: PinchTracker | null = null;

  export function captureAnchor()              { stripRef?.captureAnchor(); }
  export function restoreAnchor()              { stripRef?.restoreAnchor(); }
  export function notifyScrollCenter(idx: number)        { stripRef?.notifyScrollCenter(idx); }
  export async function scrollToFlatIndex(idx: number)   { await stripRef?.scrollToFlatIndex(idx); }

  const gestures = createPageGestures({
    getContainer:    () => containerEl,
    isLongstrip:     () => style === "longstrip",
    getRtl:          () => rtl,
    getInspectScale: () => readerState.inspectScale,
    getPan:          () => ({ x: readerState.inspectPanX, y: readerState.inspectPanY }),
    setInspect:      (scale, panX, panY) => {
      readerState.inspectScale = scale;
      readerState.inspectPanX  = panX;
      readerState.inspectPanY  = panY;
    },
    getPinch:        () => pinch,
    onSwipe,
    onWheelNav:      onWheel,
    getStrip:        () => stripRef,
  });

  export const onInspectMouseDown = gestures.onInspectMouseDown;
  export const onInspectMouseMove = gestures.onInspectMouseMove;
  export const onInspectMouseUp   = gestures.onInspectMouseUp;
  export const onPointerDown      = gestures.onPointerDown;
  export const onPointerMove      = gestures.onPointerMove;
  export const onPointerUp        = gestures.onPointerUp;
  export const handleWheel        = gestures.onWheel;

  $effect(() => {
    if (pinchZoomEnabled) {
      pinch = createPinchTracker({
        getZoom:         onGetZoom,
        setZoom:         onSetZoom,
        getInspectScale: () => readerState.inspectScale,
        setInspectScale: (s) => { readerState.inspectScale = s; },
        resetInspectPan: () => { readerState.inspectPanX = 0; readerState.inspectPanY = 0; },
        isLongstrip:     () => style === "longstrip",
      });
    } else {
      pinch = null;
    }
  });

  $effect(() => { if (style !== "longstrip") readerState.resetInspect(); });

  let tapTimer: ReturnType<typeof setTimeout> | null = null;

  function handleTap(e: MouseEvent) {
    if (gestures.consumeTap()) return;
    if (style === "longstrip") return;
    if (tapToToggleBar) {
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; return; }
      tapTimer = setTimeout(() => { tapTimer = null; onTap(e); }, 220);
    } else {
      onTap(e);
    }
  }

  function handleDblClick() {
    if (tapToToggleBar) {
      if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; }
      onToggleUi();
    }
  }

  function setContainer(el: HTMLDivElement) {
    containerEl = el;
    bindContainer(el);
  }
</script>

<div
  use:setContainer
  class="viewer"
  class:strip={style === "longstrip"}
  class:swipeable={style !== "longstrip"}
  class:inspect-active={readerState.inspectScale > 1}
  style={effectiveWidth != null ? `--effective-width:${effectiveWidth}px` : ""}
  role="presentation"
  tabindex="-1"
  onclick={handleTap}
  onauxclick={(e) => { if (e.button === 1 && style === "longstrip") e.preventDefault(); }}
  ondblclick={handleDblClick}
  onscroll={style === "longstrip" ? handleScroll : undefined}
  onmousedown={onInspectMouseDown}
  onpointerdown={onPointerDown}
  onwheel={(e) => {
    if (e.ctrlKey || style !== "longstrip") e.preventDefault();
    handleWheel(e);
  }}
  onkeydown={(e) => {
    if (e.key === " " && style === "longstrip") {
      e.preventDefault();
      settingsState.settings.autoScroll = !settingsState.settings.autoScroll;
      return;
    }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") && style !== "longstrip") e.preventDefault();
  }}
>
  {#if loading}
    <div class="center-overlay">
      <div class="page-loader page-loader-single" aria-hidden="true">{@render skeleton()}</div>
    </div>
  {/if}

  {#if error}
    <div class="center-overlay"><p class="error-msg">{error}</p></div>
  {/if}

  {#if style === "longstrip"}
    <LongstripViewer
      bind:this={stripRef}
      {containerEl}
      {flatPages}
      {imgCls}
      {effectiveWidth}
      {resolveUrl}
      {barPosition}
    />

  {:else if pageReady}
    <div
      class="page-stage"
      class:turning={turning && transition !== "flip"}
      style="--turn-x:{transition === 'slide' ? `${turnDir * (rtl ? -1 : 1) * 40}%` : '0'};--turn-deg:0deg;--turn-op:{transition === 'none' ? 1 : ((transition === 'flip' && !readerState.boundaryFading) ? 1 : (turning ? 0 : 1))};--turn-speed:0.1s"
    >
      {#if style === "double"}
        <DoubleViewer
          {imgCls} {currentGroup} srcs={currentGroupSrcs} {pageGroups} {rtl} flip={spreadFlip}
          boundaryPrevSrc={readerState.boundaryPrevSrc} boundaryNextSrc={readerState.boundaryNextSrc}
        />
      {:else}
        <SingleViewer {imgCls} src={currentSrc} incomingSrc={incomingPeelSrc} peel={peelGeom} />
      {/if}
    </div>
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
  .viewer { flex: 1; overflow-y: auto; overflow-x: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; -webkit-overflow-scrolling: touch; position: relative; touch-action: pan-x pan-y; zoom: calc(1 / var(--ui-zoom, 1)); user-select: none; -webkit-user-select: none; }
  .viewer.strip { justify-content: flex-start; padding: var(--sp-4) 0; }
  .viewer:focus { outline: none; }
  .viewer.inspect-active { cursor: grab; overflow: hidden; }
  .viewer.inspect-active:active { cursor: grabbing; }

  .viewer.swipeable { touch-action: pan-y; }
  :global(.pinch-active) .viewer { touch-action: none; }

  .page-stage {
    display: flex;
    justify-content: center;
    width: 100%;
    perspective: 1200px;
    transform: translateX(0) rotateY(0deg);
    opacity: var(--turn-op, 1);
    transition: transform var(--turn-speed, 0.18s) ease, opacity var(--turn-speed, 0.18s) ease;
    will-change: transform, opacity;
  }
  .page-stage.turning { transform: translateX(var(--turn-x, 0)) rotateY(var(--turn-deg, 0deg)); }

  .page-loader { border-radius: var(--radius-sm); display: flex; align-items: stretch; }
  .page-loader-single {
    width: min(100%, var(--effective-width, 100%));
    max-width: var(--effective-width, 100%);
    max-height: calc(var(--visual-vh, 100vh) - 80px);
    aspect-ratio: 2 / 3;
  }

  .panel-skeleton { width: 100%; height: 100%; }
  .panel-skeleton :global(.ps-r) {
    stroke: var(--border-strong);
    stroke-width: 0.8;
    fill: none;
    stroke-dasharray: 400;
    stroke-dashoffset: 400;
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

  :global(.img) { display: block; user-select: none; -webkit-user-drag: none; image-rendering: auto; }
  :global(.img.optimize-contrast) { image-rendering: -webkit-optimize-contrast; }
  :global(.fit-width)    { max-width: var(--effective-width, 100%); width: 100%; height: auto; }
  :global(.fit-height)   { max-height: calc(var(--visual-vh, 100vh) - 80px); width: auto; max-width: var(--effective-width, 100%); height: auto; }
  :global(.fit-screen)   { max-width: var(--effective-width, 100%); max-height: calc(var(--visual-vh, 100vh) - 80px); object-fit: contain; height: auto; }
  :global(.fit-original) { max-width: 100%; width: auto; height: auto; }
  :global(.strip-gap)    { margin-bottom: 8px; }

  .center-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .error-msg      { color: var(--color-error); font-size: var(--text-base); }
</style>