<script lang="ts">
  import { onMount, onDestroy, tick, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { TextT, BookmarkSimple } from "phosphor-svelte";
  import { seriesState, setPreviewManga } from "$lib/state/series.svelte";
  import { settingsState, updateSettings } from "$lib/state/settings.svelte";
  import { novelReaderState, resolvedNovelFont, type NovelSegment } from "$lib/state/novelReader.svelte";
  import { mediaViewState } from "$lib/state/mediaView.svelte";
  import { chapterNav } from "$lib/components/media/shared/useChapterNav";
  import { createMediaKeyHandler } from "$lib/components/media/shared/mediaKeybinds";
  import { createBarReveal } from "$lib/components/media/shared/barReveal.svelte";
  import { throttledProgressReporter } from "$lib/components/media/shared/progress";
  import { trackHistory } from "$lib/components/media/shared/historyTracking.svelte";
  import { markChapterRead } from "$lib/components/media/manga/lib/chapterActions";
  import { getChapterText } from "$lib/components/media/novel/lib/novelLoader";
  import { sanitizeNovelHtml } from "$lib/components/media/novel/lib/sanitizeHtml";
  import MediaChrome from "$lib/components/media/shared/MediaChrome.svelte";
  import MediaSlider from "$lib/components/media/shared/MediaSlider.svelte";
  import NovelSettingsPanel from "$lib/components/media/novel/NovelSettingsPanel.svelte";
  import { setReading, clearReading } from "$lib/core/discord";

  const nav        = chapterNav();
  const manga      = $derived(seriesState.activeManga);
  const chapter    = $derived(seriesState.activeChapter);
  const reportProg = throttledProgressReporter(4000);
  const markedRead = new Set<string>();

  let scrollEl = $state<HTMLDivElement | null>(null);

  const st = novelReaderState;
  const mediaId = $derived(manga?.mediaId ?? manga?.libraryEntryId ?? manga?.id ?? "");

  $effect(() => {
    if (manga && chapter) setReading(manga, chapter).catch(() => {});
  });
  onDestroy(() => { clearReading().catch(() => {}); });

  const activeSeg = $derived(st.segments.find(s => s.chapterId === chapter?.id) ?? st.segments[0]);
  const chapterLabel = $derived(
    activeSeg ? `Ch. ${activeSeg.chapterNumber}${activeSeg.name ? ` — ${activeSeg.name}` : ""}` : "",
  );
  const pctExact = $derived(st.scrollPct * 100);
  // One line's box height (in rem) is fontScale * lineHeight; add a small buffer so
  // ascenders/descenders on the boundary lines are never clipped by the guide edges.
  const guideHeightRem = $derived(st.fontScale * st.lineHeight * st.readingGuideLines + 0.2);
  const readout  = $derived(st.pageLabel);

  trackHistory(() => pctExact);

  let cfgOpen = $state(false);

  const isBookmarked = $derived(
    !!seriesState.bookmarks.find(b => b.mangaId === manga?.id && b.chapterId === chapter?.id),
  );
  function toggleBookmark() {
    const c = chapter, m = manga;
    if (!c || !m) return;
    if (isBookmarked) {
      seriesState.removeBookmark(m.id);
    } else {
      seriesState.setBookmark({
        mangaId: m.id, mangaTitle: m.title, thumbnailUrl: m.thumbnailUrl ?? "",
        chapterId: c.id, chapterName: c.name, pageNumber: 0,
      });
    }
  }

  async function fetchSegment(chapterId: string, num: number, name: string): Promise<NovelSegment | null> {
    const res = await getChapterText(mediaId, chapterId);
    if (res.unsupported || res.text == null) return null;
    return {
      chapterId, chapterNumber: num, name,
      format: res.format ?? "text",
      body: res.format === "html" ? sanitizeNovelHtml(res.text) : res.text,
    };
  }

  async function loadInitial() {
    const c = chapter;
    if (!c || !mediaId) return;
    st.reset();
    anchor = null;
    const seg = await fetchSegment(c.id, c.chapterNumber, c.name);
    st.unsupported = seg == null;
    st.segments    = seg ? [seg] : [];
    st.loading     = false;
    mediaViewState.loading = false;
    await tick();
    if (scrollEl) jumpTo(scrollEl, 0);
    st.scrollPct = 0;
  }

  async function appendNext() {
    if (st.appending) return;
    const list = seriesState.readerChapterList;
    const last = st.segments[st.segments.length - 1];
    if (!last) return;
    const i = list.findIndex(c => c.id === last.chapterId);
    const next = i >= 0 ? list[i + 1] : null;
    if (!next || st.hasSegment(next.id)) return;
    st.appending = true;
    try {
      const seg = await fetchSegment(next.id, next.chapterNumber, next.name);
      if (seg) st.segments = [...st.segments, seg];
    } finally {
      st.appending = false;
    }
  }

  let prepending = $state(false);

  // With a reading guide fixed at mid-screen, the only way to actually bring the
  // opening lines of a chapter up to the guide is to keep scrolling past its start —
  // so scrolling up past the top of what's loaded pulls the previous chapter in,
  // preserving scroll position so the content doesn't jump.
  async function prependPrev() {
    if (prepending) return;
    const list = seriesState.readerChapterList;
    const first = st.segments[0];
    if (!first) return;
    const i = list.findIndex(c => c.id === first.chapterId);
    const prev = i > 0 ? list[i - 1] : null;
    if (!prev || st.hasSegment(prev.id)) return;
    const el = scrollEl;
    prepending = true;
    try {
      const seg = await fetchSegment(prev.id, prev.chapterNumber, prev.name);
      if (seg && el) {
        const axis = st.paged ? "scrollLeft" : "scrollTop";
        const size = st.paged ? "scrollWidth" : "scrollHeight";
        const prevPos  = el[axis];
        const prevSize = el[size];
        st.segments = [seg, ...st.segments];
        await tick();
        el[axis] = prevPos + (el[size] - prevSize);
      }
    } finally {
      prepending = false;
    }
  }

  // Page mode lays each chapter out as CSS columns so a page is one column wide.
  const PAGE_SIDE = 24;
  let geo = $state({ textW: 0, step: 0 });

  function measure() {
    const el = scrollEl;
    if (!el) return;
    const rem   = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const textW = Math.max(1, Math.min(st.pageWidth * rem, el.clientWidth - 2 * PAGE_SIDE));
    geo = { textW, step: textW + 2 * PAGE_SIDE };
  }

  function pageOrigin(el: HTMLElement): number {
    return (el.clientWidth - geo.textW) / 2;
  }

  function along(el: HTMLElement, node: HTMLElement): number {
    if (!st.paged) return node.offsetTop;
    return node.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
  }

  function pageOf(el: HTMLElement, x: number): number {
    if (!geo.step) return 0;
    return Math.max(0, Math.floor((x - pageOrigin(el) + 1) / geo.step));
  }

  function pageCount(el: HTMLElement): number {
    if (!geo.step) return 1;
    return Math.ceil((el.scrollWidth - el.clientWidth) / geo.step) + 1;
  }

  function curPage(el: HTMLElement): number {
    return geo.step ? Math.round(el.scrollLeft / geo.step) : 0;
  }

  function goPage(el: HTMLElement, page: number, smooth = false) {
    if (!geo.step) return;
    const max  = el.scrollWidth - el.clientWidth;
    const left = Math.min(Math.max(0, page) * geo.step, max);
    el.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
  }

  function jumpTo(el: HTMLElement, pos: number) {
    if (st.paged) goPage(el, pageOf(el, pos));
    else el.scrollTop = pos;
  }

  function turnPage(dir: 1 | -1) {
    const el = scrollEl;
    if (!el || !st.paged) return;
    goPage(el, curPage(el) + dir, true);
  }

  let cachedSections: HTMLElement[] = [];
  let cachedForSegments: unknown = null;

  function getSections(el: HTMLElement): HTMLElement[] {
    if (cachedForSegments !== st.segments) {
      cachedSections = Array.from(el.querySelectorAll<HTMLElement>("[data-cid]"));
      cachedForSegments = st.segments;
    }
    return cachedSections;
  }

  // Anchored by paragraph index, not pixels, so the position survives reflow.
  let anchor: { cid: string; pIdx: number } | null = null;
  let layoutStamp = 0;

  async function relayout() {
    const el = scrollEl;
    if (!el) return;
    layoutStamp = performance.now();
    measure();
    await tick();
    if (!anchor) return;
    const p = el.querySelector(`[data-cid="${anchor.cid}"]`)?.querySelectorAll<HTMLElement>("p")[anchor.pIdx];
    if (!p) return;
    jumpTo(el, along(el, p) - (st.paged ? 0 : el.clientHeight / 2));
  }

  $effect(() => {
    void [st.fontScale, st.lineHeight, st.paraSpacing, st.pageWidth, st.fontFamily, st.systemFont, st.textAlign, st.paged];
    untrack(() => { void relayout(); });
  });

  $effect(() => {
    const el = scrollEl;
    if (!el) return;
    const ro = new ResizeObserver(() => { void relayout(); });
    ro.observe(el);
    return () => ro.disconnect();
  });

  function syncActiveSegment() {
    const el = scrollEl;
    if (!el || !st.segments.length) return;
    const line = st.paged ? el.scrollLeft + el.clientWidth / 2 : el.scrollTop + el.clientHeight / 2;
    const sections = getSections(el);
    let currentId = st.segments[0].chapterId;
    for (const sec of sections) {
      if (along(el, sec) <= line) currentId = sec.dataset.cid!;
      else break;
    }

    const outgoingId = chapter?.id ?? null;
    if (currentId !== outgoingId) {
      const list = seriesState.readerChapterList;
      const ch = list.find(c => c.id === currentId);
      if (ch) {
        const from = st.segments.findIndex(s => s.chapterId === outgoingId);
        const to   = st.segments.findIndex(s => s.chapterId === currentId);
        if (from !== -1 && to > from) {
          for (let i = from; i < to; i++) {
            const cid = st.segments[i].chapterId;
            if (!markedRead.has(cid)) markChapterRead(cid, markedRead);
          }
        }
        lastChapterId = ch.id;
        seriesState.activeChapter = ch;
        goto(`/media/${encodeURIComponent(mediaId)}/${encodeURIComponent(ch.id)}`, { replaceState: true, noScroll: true });
      }
    }

    const activeIdx = sections.findIndex(s => s.dataset.cid === currentId);
    const activeSec = sections[activeIdx];
    if (activeSec) {
      if (performance.now() - layoutStamp > 250) {
        const ps = activeSec.querySelectorAll<HTMLElement>("p");
        let pIdx = 0;
        for (let i = 0; i < ps.length; i++) {
          if (along(el, ps[i]) <= line) pIdx = i;
          else break;
        }
        anchor = { cid: currentId, pIdx };
      }

      let frac: number;
      let label: string;
      if (st.paged) {
        const startPage = pageOf(el, along(el, activeSec));
        const endPage   = activeIdx + 1 < sections.length ? pageOf(el, along(el, sections[activeIdx + 1])) : pageCount(el);
        const count = Math.max(1, endPage - startPage);
        const cur   = Math.min(count - 1, Math.max(0, curPage(el) - startPage));
        frac  = count <= 1 ? 1 : cur / (count - 1);
        label = `${cur + 1} / ${count}`;
      } else {
        const span = activeSec.offsetHeight - el.clientHeight;
        frac  = span <= 0 ? 1 : Math.max(0, Math.min(1, (el.scrollTop - activeSec.offsetTop) / span));
        label = `${Math.round(frac * 100)}%`;
      }
      st.scrollPct = frac;
      st.pageLabel = label;
      reportProg(currentId, frac, { completed: frac >= 0.98 });
      if (frac >= 0.98 && !markedRead.has(currentId)) markChapterRead(currentId, markedRead);
    }

    const viewStart = st.paged ? el.scrollLeft : el.scrollTop;
    sections.forEach((sec, i) => {
      const cid = sec.dataset.cid!;
      const end = st.paged
        ? (i + 1 < sections.length ? along(el, sections[i + 1]) : Infinity)
        : sec.offsetTop + sec.offsetHeight;
      if (end < viewStart && !markedRead.has(cid)) markChapterRead(cid, markedRead);
    });
  }

  let syncScheduled = false;
  let lastSyncTime  = 0;
  const SYNC_INTERVAL_MS = 100;
  let snapTimer: ReturnType<typeof setTimeout> | null = null;

  function onScroll() {
    const el = scrollEl;
    if (!el) return;
    const pos  = st.paged ? el.scrollLeft : el.scrollTop;
    const end  = st.paged ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
    const near = st.paged ? geo.step * 2 : 1500;
    if (end - pos < near) void appendNext();
    if (pos < near) void prependPrev();

    if (st.paged) {
      if (snapTimer) clearTimeout(snapTimer);
      snapTimer = setTimeout(() => goPage(el, curPage(el)), 150);
    }

    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => {
      syncScheduled = false;
      const now = performance.now();
      if (now - lastSyncTime < SYNC_INTERVAL_MS) return;
      lastSyncTime = now;
      syncActiveSegment();
    });
  }

  function seek(toPct: number) {
    const el = scrollEl;
    if (!el) return;
    const sections = getSections(el);
    const idx = sections.findIndex(s => s.dataset.cid === chapter?.id);
    if (idx === -1) return;
    const sec  = sections[idx];
    const frac = toPct / 100;
    if (st.paged) {
      const startPage = pageOf(el, along(el, sec));
      const endPage   = idx + 1 < sections.length ? pageOf(el, along(el, sections[idx + 1])) : pageCount(el);
      goPage(el, startPage + Math.round(frac * Math.max(0, endPage - startPage - 1)), true);
      return;
    }
    el.scrollTo({ top: sec.offsetTop + frac * Math.max(1, sec.offsetHeight - el.clientHeight) });
  }

  let autoScrollPaused     = false;
  let autoScrollPauseTimer: ReturnType<typeof setTimeout> | null = null;

  function pauseAutoScroll() {
    autoScrollPaused = true;
    if (autoScrollPauseTimer) clearTimeout(autoScrollPauseTimer);
    autoScrollPauseTimer = setTimeout(() => { autoScrollPaused = false; }, 2500);
  }

  let wheelAt = 0;
  function onWheel(e: WheelEvent) {
    if (!e.ctrlKey) pauseAutoScroll();
    if (!st.paged || e.ctrlKey) return;
    e.preventDefault();
    const now = performance.now();
    if (now - wheelAt < 350 || Math.abs(e.deltaY) < 4) return;
    wheelAt = now;
    turnPage(e.deltaY > 0 ? 1 : -1);
  }

  function onPageClick(e: MouseEvent) {
    const el = scrollEl;
    if (st.paged && el && !window.getSelection()?.toString()) {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      if (x < 0.3) turnPage(-1);
      else if (x > 0.7) turnPage(1);
    }
    bar.onClick();
  }

  $effect(() => {
    if (!settingsState.settings.autoScroll || !scrollEl || st.paged) return;
    let rafId: number;
    let remainder = 0;
    const tick = () => {
      if (!autoScrollPaused && scrollEl) {
        remainder += (settingsState.settings.autoScrollSpeed ?? 5) * 0.5;
        const whole = Math.trunc(remainder);
        if (whole !== 0) {
          scrollEl.scrollTop += whole;
          remainder -= whole;
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  });

  const bar = createBarReveal();

  $effect(() => {
    // MediaChrome forces uiVisible while a picker/menu is open but never
    // re-arms the hide timer once it closes, so the bar would otherwise be
    // stuck visible forever the moment any holdUi-triggering popover closes
    // (e.g. opening settings to toggle auto-scroll, then closing it).
    if (!mediaViewState.holdUi) bar.show();
  });

  const onKey = createMediaKeyHandler({
    close: nav.close, next: nav.goNext, prev: nav.goPrev,
    toggleAutoScroll: () => updateSettings({ autoScroll: !(settingsState.settings.autoScroll ?? false) }),
  });

  function onReaderKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    const typing = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA";
    if (st.paged && !typing && ["ArrowLeft", "ArrowRight", "PageUp", "PageDown"].includes(e.key)) {
      e.preventDefault();
      turnPage(e.key === "ArrowRight" || e.key === "PageDown" ? 1 : -1);
      return;
    }
    onKey(e);
  }

  onMount(() => { window.addEventListener("keydown", onReaderKey); bar.show(); loadInitial(); });
  onDestroy(() => { window.removeEventListener("keydown", onReaderKey); bar.destroy(); });

  let lastChapterId: string | null = null;
  $effect(() => {
    const id = chapter?.id ?? null;
    if (!id || id === lastChapterId) return;
    lastChapterId = id;
    if (st.hasSegment(id)) {
      tick().then(() => {
        const el  = scrollEl;
        const sec = el?.querySelector<HTMLElement>(`[data-cid="${id}"]`);
        if (sec && el) jumpTo(el, along(el, sec));
      });
    } else {
      loadInitial();
    }
  });
</script>

<div class="root" class:ui-unzoom={!(settingsState.settings.readerContainerized ?? false)} role="presentation" onmousemove={bar.onMove}>
  <div
    class="novel novel-{st.theme}"
    class:is-paged={st.paged}
    role="presentation"
    bind:this={scrollEl}
    onscroll={onScroll}
    onwheel={onWheel}
    onpointerdown={pauseAutoScroll}
    onclick={onPageClick}
    ondblclick={bar.onDblClick}
  >
    <article
      class="col"
      class:is-paged={st.paged}
      style="font-family: {resolvedNovelFont(st)}; font-size: {st.fontScale}rem; line-height: {st.lineHeight}; max-width: {st.pageWidth}rem; text-align: {st.textAlign}; --para-gap: {st.paraSpacing}em;{st.paged ? ` width: ${geo.textW}px; column-width: ${geo.textW}px; column-gap: ${2 * PAGE_SIDE}px;` : ''}"
    >
      {#if st.loading}
        <p class="notice">Loading…</p>
      {:else if st.unsupported}
        <div class="notice">
          <p class="notice-title">Nothing to read here yet</p>
          <p>The server didn't return any text for this chapter. It may not be
             downloaded, or this source doesn't provide chapter text. Try
             downloading the chapter, or pick another source for this series.</p>
        </div>
      {:else if st.error}
        <p class="notice">{st.error}</p>
      {:else}
        {#if prepending}<p class="notice appending">Loading previous chapter…</p>{/if}
        {#each st.segments as seg (seg.chapterId)}
          <section data-cid={seg.chapterId} class="seg">
            <p class="seg-head">Ch. {seg.chapterNumber}{seg.name ? ` — ${seg.name}` : ""}</p>
            {#if seg.format === "html"}
              {@html seg.body}
            {:else}
              {#each seg.body.split(/\n{2,}/) as para}<p>{para}</p>{/each}
            {/if}
          </section>
        {/each}
        {#if st.appending}<p class="notice appending">Loading next chapter…</p>{/if}
      {/if}
    </article>

    {#if st.readingGuide}
      <div class="reading-guide" style="height:{guideHeightRem}rem" aria-hidden="true"></div>
    {/if}
  </div>

  <MediaChrome
    title={manga?.title ?? ""}
    {chapterLabel}
    {readout}
    hasPrev={!!nav.prev}
    hasNext={!!nav.next}
    onPrev={nav.goPrev}
    onNext={nav.goNext}
    onClose={nav.close}
    onOpenPreview={() => { if (manga) setPreviewManga(manga); }}
    chapters={seriesState.readerChapterList}
    currentChapterId={chapter?.id ?? null}
    onSelectChapter={(ch) => nav.open(ch)}
  >
    {#snippet endControls()}
      <button class="icon-btn" class:active={isBookmarked}
        data-tip={isBookmarked ? "Remove bookmark" : "Bookmark"} aria-label="Bookmark" onclick={toggleBookmark}>
        <BookmarkSimple size={14} weight={isBookmarked ? "fill" : "regular"} />
      </button>

      <button class="icon-btn" class:active={cfgOpen} data-tip="Text options" aria-label="Text options"
        onclick={() => (cfgOpen = !cfgOpen)}>
        <TextT size={14} weight="regular" />
      </button>
    {/snippet}

    {#snippet slider()}
      <MediaSlider pct={pctExact} label={readout} onSeek={seek} />
    {/snippet}
  </MediaChrome>

  {#if cfgOpen}
    <NovelSettingsPanel onClose={() => (cfgOpen = false)} />
  {/if}
</div>

<style>
  .root { position: fixed; inset: 0; background: #000; z-index: var(--z-reader); }

  .novel { position: absolute; inset: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; }
  .novel.is-paged { overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
  .novel.is-paged::-webkit-scrollbar { display: none; }
  .col {
    margin: 0 auto;
    padding: calc(44px + var(--sp-8)) var(--sp-6) calc(50px + var(--sp-8));
  }
  .col.is-paged {
    height: 100%; box-sizing: border-box;
    padding-left: 0; padding-right: 0;
    column-fill: auto;
  }
  .col.is-paged .seg { break-before: column; }
  .col.is-paged :global(h1), .col.is-paged :global(h2), .col.is-paged :global(h3),
  .col.is-paged :global(h4), .col.is-paged :global(h5), .col.is-paged :global(h6) { break-after: avoid; }
  .seg { padding-bottom: var(--sp-10); }
  .seg-head {
    font-family: var(--font-ui); font-size: 0.72em; letter-spacing: var(--tracking-wider);
    text-transform: uppercase; opacity: 0.45; margin: 0 0 1.4em; padding-bottom: 0.5em;
    border-bottom: 1px solid currentColor;
  }
  .col :global(p) { margin: 0 0 var(--para-gap, 1.1em); }
  .col :global(h1), .col :global(h2), .col :global(h3),
  .col :global(h4), .col :global(h5), .col :global(h6) { margin: 1.6em 0 0.6em; font-weight: 700; line-height: 1.3; }
  .col :global(blockquote) { margin: 0 0 1.1em; padding-left: 1em; border-left: 2px solid currentColor; opacity: 0.8; }
  .col :global(ul), .col :global(ol) { margin: 0 0 1.1em 1.4em; }
  .col :global(hr) { border: none; border-top: 1px solid currentColor; opacity: 0.3; margin: 2em auto; width: 40%; }
  .notice { font-family: var(--font-ui); font-size: var(--text-sm); color: var(--text-muted); line-height: 1.6; }
  .notice > :global(p) { margin: 0 0 0.6em; }
  .notice-title { color: var(--text-secondary); font-weight: var(--weight-medium); }
  .appending { text-align: center; opacity: 0.6; }

  .reading-guide {
    --rg-border: color-mix(in srgb, currentColor 22%, transparent);
    position: fixed;
    left: 0; right: 0; top: 50%;
    transform: translateY(-50%);
    background: color-mix(in srgb, currentColor 8%, transparent);
    border-top: 1px solid var(--rg-border);
    border-bottom: 1px solid var(--rg-border);
    pointer-events: none;
    mix-blend-mode: multiply;
  }
  .novel-dark .reading-guide { mix-blend-mode: screen; }

  .novel-paper { background: #f5f2e9; color: #2b2622; }
  .novel-sepia { background: #efe3c8; color: #4a3c28; }
  .novel-dark  { background: #14140f; color: #cbc6bd; }

  .icon-btn {
    position: relative;
    display: flex; align-items: center; justify-content: center; gap: 4px;
    height: 30px; min-width: 30px; padding: 0 6px; border-radius: var(--radius-md);
    color: var(--text-muted); background: none; border: none; cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .icon-btn:hover, .icon-btn.active { color: var(--text-primary); background: var(--bg-raised); }

</style>
