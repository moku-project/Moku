<script lang="ts">
  import { X, ArrowLeft, CircleNotch, ArrowRight, Check, Warning, Sparkle, DownloadSimple, TrayArrowDown, ArrowsClockwise, Pause, Play, Trash, Books, FilmSlate } from "phosphor-svelte";
  import { tsunagu } from "$lib/server-adapters/tsunagu";
  import Thumbnail from "$lib/components/shared/manga/Thumbnail.svelte";
  import ExtensionIcon from "$lib/components/extensions/ExtensionIcon.svelte";
  import TrackerLogo from "$lib/components/tracking/TrackerLogo.svelte";
  import { addToast } from "$lib/state/notifications.svelte";
  import { settingsState } from "$lib/state/settings.svelte";
  import { loadLibrary } from "$lib/state/library.svelte";
  import type { Manga, Source } from "$lib/types";
  import type { ContentType, TrackerLibraryEntry } from "$lib/server-adapters/types";
  import { toBrowseManga, toSource } from "$lib/components/browse/lib/searchFilter";
  import { sourceErrorLabel } from "$lib/core/sourceErrors";
  import { canonicalLang, langBadge, LANG_ALL } from "$lib/core/lang";
  import { t, type MessageKey } from "$lib/i18n/index.svelte";
  import {
    STATUS_KEYS, EMPTY_LEDGER, LEDGER_VER,
    SEARCH_GAP_MS, SEARCH_QUERY_GAP_MS, ANILIST_GAP_MS, SNAPSHOT_TTL_MS, MATCH_THRESHOLD, GOOD_ENOUGH,
  } from "./trackerImport/types";
  import type { Phase, EntryStatus, EntryResult, CachePayload, ImportLedger } from "./trackerImport/types";
  import { sleep, alStatusToTrack, searchQueries, displayTitle, displaySub, scoreHit, previouslySeenIds } from "./trackerImport/utils";
  import {
    fromCachedMatch, buildCachePayload, hasResumableEntries,
    writeCache, clearCacheStorage, readCache as readCacheStorage,
    readLedger as readLedgerStorage, writeLedger,
  } from "./trackerImport/storage";

  interface Props {
    trackerKey: string;
    trackerName: string;
    username?: string | null;
    onClose: () => void;
    onDone: () => void;
  }
  let { trackerKey, trackerName, username = null, onClose, onDone }: Props = $props();

  let phase: Phase = $state("pick-target");
  let importKind = $state<ContentType>("MANGA");
  let installedSources: Source[] = $state([]);
  let loadingSources = $state(true);
  let targetSource: Source | null = $state(null);
  let selectedLang = $state(LANG_ALL);
  let langStripEl: HTMLDivElement | undefined = $state();
  let langStripOverflow = $state(false);
  let selectedStatuses = $state<string[]>(["CURRENT"]);
  let dryRun = $state(false);
  let stubImport = $state(false);
  let cancelled = false;
  let halt = false;
  let massSourceId = $state("");
  let selectedIds = $state<string[]>([]);
  let draft: CachePayload | null = $state(null);
  let ledger: ImportLedger = $state({ ...EMPTY_LEDGER });
  let listSnapshot: TrackerLibraryEntry[] = $state([]);
  let snapshotLoading = $state(false);
  let snapshotAt = 0;
  let snapshotTask: Promise<void> | null = null;
  let pulledIds: string[] = $state([]);

  let entries: EntryResult[] = $state([]);
  let searchProgress = $state({ done: 0, total: 0 });
  let importProgress = $state({ done: 0, total: 0, failed: 0 });
  let retryingIds = $state<string[]>([]);

  const isAnime = $derived(importKind === "ANIME");
  const progressWord = $derived(isAnime ? t('trackerImport.epAbbr') : t('trackerImport.chAbbr'));
  const statusChips = $derived(STATUS_KEYS.map(key => ({
    key,
    label: (key === "CURRENT" ? (isAnime ? "trackerImport.statusWatching" : "trackerImport.statusReading")
      : key === "REPEATING" ? (isAnime ? "trackerImport.statusRewatching" : "trackerImport.statusRereading")
      : key === "PLANNING" ? "trackerImport.statusPlanning"
      : key === "COMPLETED" ? "trackerImport.statusCompleted"
      : key === "PAUSED" ? "trackerImport.statusPaused"
      : "trackerImport.statusDropped") as MessageKey,
  })));
  const allSources = $derived(installedSources.filter(s => s.contentType === importKind));
  const availableLangs = $derived.by(() => {
    const langs = Array.from(new Set<string>(allSources.map(s => canonicalLang(s.lang)))).sort();
    const en = langs.indexOf("en");
    if (en > 0) { langs.splice(en, 1); langs.unshift("en"); }
    return langs;
  });
  const hasMultipleLangs = $derived(availableLangs.length > 1);

  $effect(() => {
    const el = langStripEl;
    void availableLangs.length;
    if (!el) {
      langStripOverflow = false;
      return;
    }
    const measure = () => {
      langStripOverflow = el.scrollWidth > el.clientWidth + 1;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  });
  const visibleSources = $derived.by(() => {
    if (selectedLang !== LANG_ALL) return allSources.filter(s => canonicalLang(s.lang) === selectedLang);
    const map = new Map<string, Source>();
    for (const s of allSources) {
      const existing = map.get(s.name);
      if (!existing || s.lang < existing.lang) map.set(s.name, s);
    }
    return Array.from(map.values());
  });
  const assignSources = $derived.by(() => {
    const pref = canonicalLang(settingsState.settings.preferredExtensionLang);
    return [...allSources].sort((a, b) => {
      if (pref !== LANG_ALL) {
        if (canonicalLang(a.lang) === pref && canonicalLang(b.lang) !== pref) return -1;
        if (canonicalLang(b.lang) === pref && canonicalLang(a.lang) !== pref) return 1;
      }
      return a.displayName.localeCompare(b.displayName);
    });
  });

  const foundCount = $derived(entries.filter(e => e.status === "found").length);
  const noMatchCount = $derived(entries.filter(e => e.status === "no-match").length);
  const alreadyCount = $derived(entries.filter(e => e.status === "already").length);
  const importedCount = $derived(entries.filter(e => e.status === "imported").length);
  const failedCount = $derived(entries.filter(e => e.status === "failed").length);
  const skippedCount = $derived(entries.filter(e => e.status === "skipped").length);
  const missingEntries = $derived(entries.filter(e => e.status === "no-match" || e.status === "searching" || e.status === "pending"));
  const missingIds = $derived(missingEntries.map(e => e.remote.remoteId));
  const pendingCount = $derived(entries.filter(e => e.status === "pending").length);
  const pulledSet = $derived(new Set(pulledIds));
  const statusCounts = $derived.by(() => {
    const prevAll = new Set(Object.values(ledger.lastSeen).flat());
    const hasHistory = ledger.lastFetchedAt > 0;
    const out: Record<string, { left: number; neu: number; total: number }> = {};
    for (const s of STATUS_KEYS) {
      const rows = listSnapshot.filter(e => (e.status || "").toUpperCase() === s);
      const left = rows.filter(e => !pulledSet.has(e.remoteId)).length;
      const neu = hasHistory ? rows.filter(e => !prevAll.has(e.remoteId) && !pulledSet.has(e.remoteId)).length : 0;
      out[s] = { left, neu, total: rows.length };
    }
    return out;
  });
  const leftoverTotal = $derived(STATUS_KEYS.reduce((n, s) => n + (statusCounts[s]?.left ?? 0), 0));
  const newTotal = $derived(STATUS_KEYS.reduce((n, s) => n + (statusCounts[s]?.neu ?? 0), 0));
  const allMissingSelected = $derived(missingIds.length > 0 && missingIds.every(id => selectedIds.includes(id)));
  const selectedMissing = $derived(selectedIds.filter(id => missingIds.includes(id)).length);
  const assignRows = $derived.by(() => {
    const rank = (s: EntryStatus) => {
      if (s === "searching") return 0;
      if (s === "failed") return 1;
      if (s === "pending") return 2;
      if (s === "no-match") return 3;
      if (s === "found") return 4;
      if (s === "imported") return 5;
      if (s === "skipped") return 6;
      return 7;
    };
    return entries
      .map((e, idx) => ({ e, idx }))
      .filter(x => x.e.status !== "already")
      .sort((a, b) => rank(a.e.status) - rank(b.e.status));
  });

  function sourceById(id: string | null): Source | null {
    if (!id) return targetSource;
    return allSources.find(s => s.id === id) ?? targetSource;
  }

  function sourceLabel(src: Source): string {
    return src.displayName;
  }

  function persistCache() {
    if (entries.length === 0) return;
    if (!hasResumableEntries(entries)) {
      clearCache();
      return;
    }
    const payload = buildCachePayload(
      trackerKey, importKind, targetSource?.id ?? "", selectedStatuses,
      entries, searchProgress.done, searchProgress.total,
    );
    if (writeCache(trackerKey, importKind, payload)) draft = payload;
  }

  function clearCache() {
    clearCacheStorage(trackerKey, importKind);
    draft = null;
  }

  function persistLedger(patch: Partial<ImportLedger>) {
    ledger = { ...ledger, ...patch, v: LEDGER_VER };
    writeLedger(trackerKey, importKind, ledger);
  }

  function rememberSeen(rows: TrackerLibraryEntry[], statuses: string[]) {
    const lastSeen = { ...ledger.lastSeen };
    for (const key of statuses) {
      lastSeen[key] = rows.filter(e => (e.status || "").toUpperCase() === key).map(e => e.remoteId);
    }
    persistLedger({ lastSeen, lastFetchedAt: Date.now(), lastStatuses: [...selectedStatuses] });
  }

  function snapshotIsFresh(): boolean {
    return snapshotAt > 0 && Date.now() - snapshotAt < SNAPSHOT_TTL_MS;
  }

  function snapshotForStatuses(statuses: string[]): TrackerLibraryEntry[] {
    const wanted = new Set(statuses.map(s => s.toUpperCase()));
    return listSnapshot.filter(e => wanted.has((e.status || "").toUpperCase()));
  }

  function mergeSnapshot(rows: TrackerLibraryEntry[]) {
    const byId = new Map(listSnapshot.map(e => [e.remoteId, e]));
    for (const r of rows) byId.set(r.remoteId, r);
    listSnapshot = [...byId.values()];
    snapshotAt = Date.now();
  }

  async function refreshSnapshot() {
    const kind = importKind;
    snapshotLoading = true;
    const run = (async () => {
      try {
        const [remote, local] = await Promise.all([
          tsunagu.trackerLibrary(trackerKey, kind, [...STATUS_KEYS]),
          tsunagu.library(kind).catch(() => []),
        ]);
        if (cancelled || importKind !== kind) return;
        listSnapshot = remote;
        snapshotAt = Date.now();
        pulledIds = local.flatMap(m => (m.trackLinks ?? []).filter(l => l.trackerKey === trackerKey).map(l => l.remoteId));
      } catch {
        if (cancelled || importKind !== kind) return;
        listSnapshot = [];
        snapshotAt = 0;
      } finally {
        if (importKind === kind) snapshotLoading = false;
      }
    })();
    snapshotTask = run;
    await run;
  }

  async function loadRemoteList(): Promise<{ rows: TrackerLibraryEntry[]; fromCache: boolean }> {
    const kind = importKind;
    if (snapshotTask) await snapshotTask;
    if (cancelled || importKind !== kind) return { rows: [], fromCache: true };
    if (snapshotIsFresh()) return { rows: snapshotForStatuses(selectedStatuses), fromCache: true };
    const remote = await tsunagu.trackerLibrary(trackerKey, kind, selectedStatuses);
    if (cancelled || importKind !== kind) return { rows: remote, fromCache: false };
    mergeSnapshot(remote);
    return { rows: remote, fromCache: false };
  }

  function applyCache(p: CachePayload) {
    selectedStatuses = p.statuses.length ? [...p.statuses] : selectedStatuses;
    targetSource = sourceById(p.sourceId);
    massSourceId = p.sourceId;
    entries = p.entries.map(e => ({
      remote: e.remote,
      match: fromCachedMatch(e.match),
      similarity: e.similarity,
      status: e.status === "searching" ? "pending" : e.status,
      sourceId: e.sourceId,
      error: e.error,
      fresh: ledger.lastFetchedAt > 0 && !previouslySeenIds(ledger).has(e.remote.remoteId) && e.status !== "already" && e.status !== "imported",
    }));
    searchProgress = { done: p.searchDone, total: p.searchTotal || p.entries.length };
  }

  function draftSourceName(): string {
    if (!draft) return "";
    if (!draft.sourceId) return t('trackerImport.libraryOnly');
    return allSources.find(s => s.id === draft!.sourceId)?.displayName ?? t('trackerImport.sourceFallback');
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== "Escape") return;
    if (phase === "matching" || phase === "importing") stopWork();
    else close();
  }

  function stopWork() {
    halt = true;
  }

  function goBack() {
    halt = true;
    cancelled = false;
    persistCache();
    if (listSnapshot.length) rememberSeen(listSnapshot, [...STATUS_KEYS]);
    phase = "pick-target";
  }

  function close() {
    halt = true;
    cancelled = true;
    persistCache();
    if (listSnapshot.length) rememberSeen(listSnapshot, [...STATUS_KEYS]);
    persistLedger({ lastStatuses: [...selectedStatuses] });
    onClose();
  }

  $effect(() => {
    tsunagu.installedExtensions()
      .then(exts => {
        installedSources = exts
          .filter(e => e.installed && (e.contentType === "MANGA" || e.contentType === "ANIME"))
          .map(toSource);
        applyKindChrome();
        void refreshSnapshot();
      })
      .catch(console.error)
      .finally(() => { loadingSources = false; });

    window.addEventListener("keydown", onKey);
    return () => {
      halt = true;
      cancelled = true;
      window.removeEventListener("keydown", onKey);
    };
  });

  function toggleStatus(key: string) {
    if (selectedStatuses.includes(key)) {
      if (selectedStatuses.length === 1) return;
      selectedStatuses = selectedStatuses.filter(s => s !== key);
    } else {
      selectedStatuses = [...selectedStatuses, key];
    }
    persistLedger({ lastStatuses: [...selectedStatuses] });
  }

  function applyKindChrome() {
    const prefLang = canonicalLang(settingsState.settings.preferredExtensionLang);
    const langs = new Set(installedSources.filter(s => s.contentType === importKind).map(s => canonicalLang(s.lang)));
    selectedLang = prefLang !== LANG_ALL && langs.has(prefLang) && langs.size > 1 ? prefLang : LANG_ALL;
    targetSource = null;
    massSourceId = "";
    listSnapshot = [];
    snapshotAt = 0;
    pulledIds = [];
    snapshotTask = null;
    draft = readCacheStorage(trackerKey, importKind);
    ledger = readLedgerStorage(trackerKey, importKind);
    selectedStatuses = (!draft && ledger.lastStatuses.length) ? [...ledger.lastStatuses] : ["CURRENT"];
    if (draft?.statuses.length) selectedStatuses = [...draft.statuses];
  }

  function setImportKind(kind: ContentType) {
    if (kind === importKind || phase !== "pick-target") return;
    importKind = kind;
    applyKindChrome();
    void refreshSnapshot();
  }

  function scrollLangStrip(dir: -1 | 1) {
    if (!langStripEl) return;
    const chips = Array.from(langStripEl.children) as HTMLElement[];
    const viewEnd = langStripEl.scrollLeft + langStripEl.clientWidth;
    if (dir === 1) {
      const next = chips.find(c => c.offsetLeft + c.offsetWidth > viewEnd + 2);
      if (next) langStripEl.scrollTo({ left: next.offsetLeft, behavior: "smooth" });
    } else {
      const prev = [...chips].reverse().find(c => c.offsetLeft < langStripEl!.scrollLeft - 2);
      if (prev) langStripEl.scrollTo({ left: prev.offsetLeft + prev.offsetWidth - langStripEl.clientWidth, behavior: "smooth" });
    }
  }

  function patchEntry(remoteId: string, patch: Partial<EntryResult>) {
    entries = entries.map(e => e.remote.remoteId === remoteId ? { ...e, ...patch } : e);
  }

  async function matchOnSource(source: Source, remote: TrackerLibraryEntry): Promise<Pick<EntryResult, "match" | "similarity" | "status" | "error">> {
    let best: { manga: Manga; similarity: number } | null = null;
    try {
      const queries = searchQueries(remote);
      for (let qi = 0; qi < queries.length; qi++) {
        const q = queries[qi];
        if (qi > 0) await sleep(SEARCH_QUERY_GAP_MS);
        const resp = await tsunagu.search(source.id, q, 1);
        for (const r of resp.results) {
          const similarity = scoreHit(remote, r.title);
          const manga = toBrowseManga(r, source.id);
          if (!best || similarity > best.similarity) best = { manga, similarity };
        }
        if (best && best.similarity >= GOOD_ENOUGH) break;
      }
    } catch (e: any) {
      return { match: null, similarity: 0, status: "no-match", error: e?.message ?? String(e) };
    }

    if (best && best.manga.inLibrary) {
      return { match: best.manga, similarity: best.similarity, status: "already" };
    }
    if (best && best.similarity > MATCH_THRESHOLD) {
      return { match: best.manga, similarity: best.similarity, status: "found" };
    }
    return { match: null, similarity: best?.similarity ?? 0, status: "no-match" };
  }

  async function startMatchRun(mode: "search" | "stub", target?: Source) {
    halt = false;
    stubImport = mode === "stub";
    targetSource = mode === "search" ? target ?? null : null;
    massSourceId = mode === "search" ? target?.id ?? "" : "";
    selectedIds = [];
    phase = "matching";
    entries = [];
    searchProgress = { done: 0, total: 0 };

    let remote: TrackerLibraryEntry[];
    let fromCache = false;
    try {
      const loaded = await loadRemoteList();
      remote = loaded.rows;
      fromCache = loaded.fromCache;
    } catch (e: any) {
      phase = "pick-target";
      addToast({ kind: "error", title: t('trackerImport.fetchListFailedToast'), body: e?.message ?? String(e) });
      return;
    }
    if (cancelled || halt) return;

    const local = await tsunagu.library(importKind).catch(() => []);
    const alreadyByRemote = new Set(
      local.flatMap(m => (m.trackLinks ?? []).filter(l => l.trackerKey === trackerKey).map(l => l.remoteId)),
    );
    pulledIds = [...alreadyByRemote];
    const seen = previouslySeenIds(ledger);
    const hasHistory = ledger.lastFetchedAt > 0;

    entries = remote.map(r => ({
      remote: r,
      match: null,
      similarity: mode === "stub" ? 1 : 0,
      status: alreadyByRemote.has(r.remoteId) ? "already" : mode === "stub" ? "found" : "pending",
      sourceId: mode === "search" ? target?.id ?? null : null,
      fresh: hasHistory && !seen.has(r.remoteId) && !alreadyByRemote.has(r.remoteId),
    }));
    entries.sort((a, b) => {
      if (a.status === "already" && b.status !== "already") return 1;
      if (b.status === "already" && a.status !== "already") return -1;
      if (a.fresh && !b.fresh) return -1;
      if (b.fresh && !a.fresh) return 1;
      return 0;
    });
    searchProgress = mode === "stub"
      ? { done: entries.length, total: entries.length }
      : { done: 0, total: entries.length };
    if (!fromCache) rememberSeen(remote, selectedStatuses);
    persistCache();

    if (mode === "search") {
      await continueMatching();
      return;
    }
    if (cancelled || halt) return;
    if (entries.every(e => e.status === "already")) {
      phase = "done";
      return;
    }
    phase = "assign";
  }

  async function resumeFromDraft() {
    if (!draft) return;
    halt = false;
    cancelled = false;
    stubImport = !draft.sourceId;
    applyCache(draft);
    selectedIds = [];
    if (!stubImport && !targetSource) {
      addToast({ kind: "error", title: t('trackerImport.sourceGoneToast') });
      return;
    }
    if (!stubImport && pendingCount > 0) {
      await continueMatching();
      return;
    }
    phase = foundCount > 0 || noMatchCount > 0 || pendingCount > 0 ? "assign" : "done";
  }

  async function continueMatching() {
    const target = targetSource;
    if (!target) return;
    halt = false;
    phase = "matching";

    for (let i = 0; i < entries.length; i++) {
      if (cancelled) return;
      if (halt) break;
      if (entries[i].status !== "pending") continue;
      entries[i] = { ...entries[i], status: "searching" };
      const result = await matchOnSource(target, entries[i].remote);
      if (cancelled) return;
      entries[i] = { ...entries[i], ...result, sourceId: target.id };
      searchProgress = {
        done: entries.filter(e => e.status !== "pending" && e.status !== "searching").length,
        total: entries.length,
      };
      persistCache();
      if (i + 1 < entries.length && !cancelled && !halt) await sleep(SEARCH_GAP_MS);
    }
    if (cancelled) return;
    persistCache();
    if (halt) {
      halt = false;
      phase = "assign";
      return;
    }
    if (entries.every(e => e.status !== "no-match" && e.status !== "pending")) {
      await startImport();
      return;
    }
    phase = "assign";
  }

  async function searchRow(remoteId: string, sourceId: string) {
    const source = sourceById(sourceId);
    const entry = entries.find(e => e.remote.remoteId === remoteId);
    if (!source || !entry) return;
    patchEntry(remoteId, { status: "searching", sourceId, match: null, error: undefined });
    const result = await matchOnSource(source, entry.remote);
    if (cancelled) return;
    patchEntry(remoteId, { ...result, sourceId });
    persistCache();
    if (result.status !== "no-match") {
      selectedIds = selectedIds.filter(id => id !== remoteId);
    }
  }

  async function searchSelected() {
    halt = false;
    cancelled = false;
    const source = sourceById(massSourceId) ?? targetSource;
    const ids = selectedIds.filter(id => missingIds.includes(id));
    if (!source || ids.length === 0) return;
    for (let i = 0; i < ids.length; i++) {
      if (cancelled || halt) return;
      await searchRow(ids[i], source.id);
      if (i + 1 < ids.length && !cancelled && !halt) await sleep(SEARCH_GAP_MS);
    }
  }

  function toggleRow(remoteId: string) {
    selectedIds = selectedIds.includes(remoteId)
      ? selectedIds.filter(id => id !== remoteId)
      : [...selectedIds, remoteId];
  }

  function toggleAllMissing() {
    selectedIds = allMissingSelected ? [] : [...missingIds];
  }

  function setDefaultSource(id: string) {
    const src = sourceById(id);
    if (!src) return;
    targetSource = src;
    massSourceId = src.id;
    entries = entries.map(e =>
      e.status === "no-match" || e.status === "pending" ? { ...e, sourceId: src.id } : e,
    );
    persistCache();
  }

  function excludeEntry(idx: number) {
    const id = entries[idx].remote.remoteId;
    entries[idx] = { ...entries[idx], status: "skipped", match: null };
    selectedIds = selectedIds.filter(x => x !== id);
    persistCache();
  }

  async function importOne(entry: EntryResult) {
    if (!entry.sourceId) {
      await tsunagu.createTrackerStub(
        trackerKey,
        entry.remote.remoteId,
        importKind,
        displayTitle(entry.remote),
        entry.remote.coverUrl,
      );
      if (!pulledIds.includes(entry.remote.remoteId)) pulledIds = [...pulledIds, entry.remote.remoteId];
      return;
    }
    const src = sourceById(entry.sourceId);
    if (!src) throw new Error(t('trackerImport.noSourceError'));
    if (!entry.match?.sourceEntryId) throw new Error(t('trackerImport.noMatchError'));
    const info = await tsunagu.mangaInfo(src.id, entry.match.sourceEntryId, true);
    const mediaId = info.id;
    if (!mediaId) throw new Error(t('trackerImport.noMatchError'));
    if (!info.inLibrary) await tsunagu.setInLibrary(mediaId, true);
    const link = await tsunagu.bindTrack(mediaId, trackerKey, entry.remote.remoteId);
    await sleep(ANILIST_GAP_MS);
    await tsunagu.updateTrack(link.id, {
      status: alStatusToTrack(entry.remote.status),
      score: entry.remote.score,
      lastChapterRead: entry.remote.progress,
    });
    if (!pulledIds.includes(entry.remote.remoteId)) pulledIds = [...pulledIds, entry.remote.remoteId];
  }

  async function retryImport(remoteId: string) {
    const idx = entries.findIndex(e => e.remote.remoteId === remoteId);
    if (idx < 0 || retryingIds.includes(remoteId)) return;
    const entry = entries[idx];
    if (entry.sourceId && !entry.match) {
      const src = sourceById(entry.sourceId);
      if (src) await searchRow(remoteId, src.id);
      return;
    }
    halt = false;
    cancelled = false;
    retryingIds = [...retryingIds, remoteId];
    try {
      if (dryRun) {
        entries[idx] = { ...entries[idx], status: "imported", error: undefined };
      } else {
        await importOne(entry);
        entries[idx] = { ...entries[idx], status: "imported", error: undefined };
        await loadLibrary(true);
      }
      persistCache();
    } catch (e: unknown) {
      entries[idx] = { ...entries[idx], status: "failed", error: sourceErrorLabel(e) };
      persistCache();
    } finally {
      retryingIds = retryingIds.filter(id => id !== remoteId);
    }
  }

  async function startImport() {
    const toImport = entries.filter(e => e.status === "found" && (e.match || !e.sourceId));
    if (toImport.length === 0) {
      phase = (noMatchCount > 0 || pendingCount > 0 || failedCount > 0) ? "assign" : "done";
      return;
    }
    importProgress = { done: 0, total: toImport.length, failed: 0 };
    phase = "importing";

    for (const entry of toImport) {
      if (cancelled) return;
      if (halt) break;
      const idx = entries.findIndex(e => e.remote.remoteId === entry.remote.remoteId);
      if (idx < 0) continue;
      try {
        if (dryRun) {
          entries[idx] = { ...entries[idx], status: "imported" };
        } else {
          await importOne(entry);
          entries[idx] = { ...entries[idx], status: "imported" };
        }
        importProgress = { ...importProgress, done: importProgress.done + 1 };
      } catch (e: unknown) {
        entries[idx] = { ...entries[idx], status: "failed", error: sourceErrorLabel(e) };
        importProgress = { ...importProgress, done: importProgress.done + 1, failed: importProgress.failed + 1 };
      }
      persistCache();
      if (!dryRun && entry.sourceId) await sleep(ANILIST_GAP_MS);
    }

    if (!dryRun) {
      await loadLibrary(true);
    }

    if (halt) {
      halt = false;
      phase = "assign";
      return;
    }

    if (entries.some(e => e.status === "no-match" || e.status === "pending" || e.status === "found" || e.status === "failed")) {
      persistCache();
      phase = "assign";
      addToast({
        kind: "success",
        title: dryRun ? t('trackerImport.dryRunCompleteToast') : stubImport ? t('trackerImport.importedStubsToast') : t('trackerImport.importedMatchedToast'),
        body: t('trackerImport.importedUnmatchedBody', { imported: importProgress.done - importProgress.failed, unmatched: noMatchCount + pendingCount }),
      });
      return;
    }

    clearCache();
    phase = "done";
    addToast({
      kind: "success",
      title: dryRun ? t('trackerImport.dryRunCompleteToast') : t('trackerImport.importCompleteToast'),
      body: t('trackerImport.importedFailedBody', { imported: importProgress.done - importProgress.failed, failed: importProgress.failed }),
    });
  }

  function exportFailed() {
    const rows = entries
      .filter(e => e.status === "failed" || e.status === "no-match" || e.status === "skipped")
      .map(e => ({
        remoteId: e.remote.remoteId,
        title: displayTitle(e.remote),
        titleEnglish: e.remote.titleEnglish,
        titleRomaji: e.remote.titleRomaji,
        url: e.remote.url,
        result: e.status,
        error: e.error ?? null,
        matchedTitle: e.match?.title ?? null,
      }));
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `anilist-import-${trackerKey}-${importKind}-failed.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const helloName = $derived((username ?? "").trim());
</script>

<div class="overlay" role="presentation" onclick={(e) => { if (e.target === e.currentTarget && phase !== "importing") close(); }} onkeydown={(e) => { if (e.key === "Escape" && phase !== "importing") close(); }}>
  <div class="modal" class:modal-wide={phase === "assign"} class:modal-fill={phase === "matching" || phase === "assign" || phase === "importing"}>

    <div class="modal-header">
      <div class="header-left">
        {#if phase === "matching" || phase === "assign" || phase === "done"}
          <button class="header-nav-btn" onclick={goBack} title={t('trackerImport.backToOptions')}>
            <ArrowLeft size={14} weight="light" />
          </button>
        {/if}
        <div class="source-context">
          <div class="source-icon-wrap logo">
            <TrackerLogo trackerKey={trackerKey} size={22} />
          </div>
          <div class="source-context-info">
            <span class="modal-eyebrow">{t('trackerImport.eyebrow')}</span>
            <span class="modal-title">{t('trackerImport.title', { tracker: trackerName })}</span>
            <span class="modal-sub">
              <Warning size={12} weight="bold" />
              {t('trackerImport.rateLimitNote')}
            </span>
          </div>
        </div>
      </div>
      {#if phase !== "importing"}
        <button class="header-nav-btn" onclick={close} title={t('common.close')}><X size={14} weight="light" /></button>
      {/if}
    </div>

    <div class="body">

      {#if phase === "pick-target"}
        {#if draft}
          <div class="resume-banner">
            <div class="resume-copy">
              <span class="resume-title">{t('trackerImport.resumeTitle')}</span>
              <span class="resume-sub">{t('trackerImport.resumeSub', { kind: isAnime ? t('nav.contentAnime') : t('nav.contentManga'), source: draftSourceName(), done: draft.searchDone, total: draft.searchTotal })}</span>
            </div>
            <button class="back-btn" onclick={clearCache}><Trash size={12} weight="light" /> {t('trackerImport.discard')}</button>
            <button class="migrate-btn" onclick={() => void resumeFromDraft()}>
              <Play size={12} weight="bold" /> {t('trackerImport.resume')}
            </button>
          </div>
        {/if}
        <div class="pick">
          <div class="pick-chrome">
            <div class="phase-label-row">
              <span class="phase-label">{t('trackerImport.typeLabel')}</span>
            </div>
            <div class="kind-seg">
              <button class="kind-seg-btn" class:kind-seg-active={importKind === "MANGA"} onclick={() => setImportKind("MANGA")}>
                <Books size={12} weight={importKind === "MANGA" ? "fill" : "regular"} /> {t('nav.contentManga')}
              </button>
              <button class="kind-seg-btn" class:kind-seg-active={importKind === "ANIME"} onclick={() => setImportKind("ANIME")}>
                <FilmSlate size={12} weight={importKind === "ANIME" ? "fill" : "regular"} /> {t('nav.contentAnime')}
              </button>
            </div>
            <div class="phase-label-row">
              <span class="phase-label">{t('trackerImport.statusesLabel')}</span>
            </div>
            <div class="status-chips">
              {#each statusChips as s}
                <button
                  class="status-chip"
                  class:status-chip-active={selectedStatuses.includes(s.key)}
                  onclick={() => toggleStatus(s.key)}
                >
                  {t(s.label)}
                  {#if statusCounts[s.key]?.neu}
                    <span class="chip-badge chip-badge-new">{t('trackerImport.chipNew', { left: statusCounts[s.key].left, count: statusCounts[s.key].neu })}</span>
                  {:else if statusCounts[s.key]?.left}
                    <span class="chip-badge">{statusCounts[s.key].left}</span>
                  {/if}
                </button>
              {/each}
            </div>
            {#if snapshotLoading}
              <p class="list-hint">{t('trackerImport.checkingLists')}</p>
            {:else if listSnapshot.length > 0}
              <p class="list-hint">
                {t('trackerImport.notInLibrary', { count: leftoverTotal })}
                {#if newTotal > 0} · {t('trackerImport.newOnAniList', { count: newTotal })}{/if}
                {#if ledger.lastFetchedAt}
                  · {t('trackerImport.lastSync', { date: new Date(ledger.lastFetchedAt).toLocaleDateString() })}
                {/if}
              </p>
            {/if}

            <div class="phase-label-row">
              <span class="phase-label">{t('trackerImport.importIntoLabel')}</span>
            </div>
            <div class="source-list source-list-tight">
              <button class="source-row source-row-library" onclick={() => void startMatchRun("stub")}>
                <div class="source-icon-wrap logo">
                  {#if isAnime}
                    <FilmSlate size={18} weight="light" />
                  {:else}
                    <Books size={18} weight="light" />
                  {/if}
                </div>
                <div class="source-info">
                  <span class="source-name">{t('trackerImport.libraryOnlyNoSource')}</span>
                  <span class="source-meta">{t('trackerImport.libraryOnlyDesc')}</span>
                </div>
                <ArrowRight size={13} weight="light" class="source-arrow" />
              </button>
            </div>
          </div>

          <div class="pick-sources">
            <div class="phase-label-row">
              <span class="phase-label">{t('trackerImport.matchOnSourceLabel')}</span>
            </div>
            {#if loadingSources}
              <div class="centered"><CircleNotch size={16} weight="light" class="anim-spin" style="color:var(--text-faint)" /></div>
            {:else if allSources.length === 0}
              <div class="centered"><span class="hint">{isAnime ? t('trackerImport.installAnimeSource') : t('trackerImport.installMangaSource')}</span></div>
            {:else}
              {#if hasMultipleLangs}
                <div class="src-lang-bar">
                  {#if langStripOverflow}
                    <button class="src-lang-nav" onclick={() => scrollLangStrip(-1)}>‹</button>
                  {/if}
                  <div class="src-lang-chips" bind:this={langStripEl}>
                    <button class="src-lang-chip" class:src-lang-chip-active={selectedLang === LANG_ALL} onclick={() => selectedLang = LANG_ALL}>{t('common.all')}</button>
                    {#each availableLangs as lang}
                      <button class="src-lang-chip" class:src-lang-chip-active={selectedLang === lang} onclick={() => selectedLang = lang}>
                        {langBadge(lang)}
                      </button>
                    {/each}
                  </div>
                  {#if langStripOverflow}
                    <button class="src-lang-nav" onclick={() => scrollLangStrip(1)}>›</button>
                  {/if}
                </div>
              {/if}
              <div class="source-list">
                {#each visibleSources as src}
                  <button class="source-row" onclick={() => void startMatchRun("search", src)}>
                    <div class="source-icon-wrap">
                      <ExtensionIcon src={src.iconUrl} alt={src.name} class="source-icon" size={36} />
                    </div>
                    <div class="source-info">
                      <span class="source-name">{src.displayName}</span>
                      <span class="source-meta">{langBadge(src.lang)}{src.isNsfw ? " · NSFW" : ""}</span>
                    </div>
                    <ArrowRight size={13} weight="light" class="source-arrow" />
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>

      {:else if phase === "matching" || phase === "importing"}
        <div class="review-header">
          <div class="review-route">
            <div class="review-source">
              <TrackerLogo trackerKey={trackerKey} size={16} />
              <span class="review-source-name">{trackerName}</span>
            </div>
            <ArrowRight size={14} weight="light" style="color:var(--text-faint);flex-shrink:0" />
            {#if targetSource}
              <div class="review-source">
                <div class="source-icon-wrap small">
                  <ExtensionIcon src={targetSource.iconUrl} alt={targetSource.name} class="source-icon" size={20} />
                </div>
                <span class="review-source-name">{targetSource.displayName}</span>
              </div>
            {:else if stubImport}
              <div class="review-source">
                <div class="source-icon-wrap small logo">
                  {#if isAnime}
                    <FilmSlate size={12} weight="light" />
                  {:else}
                    <Books size={12} weight="light" />
                  {/if}
                </div>
                <span class="review-source-name">{t('trackerImport.libraryOnly')}</span>
              </div>
            {/if}
          </div>

          {#if phase === "matching"}
            <div class="review-progress-row">
              <div class="review-progress-bar">
                <div class="review-progress-fill" style="width:{searchProgress.total ? (searchProgress.done / searchProgress.total) * 100 : 0}%"></div>
              </div>
              <span class="review-progress-label">
                {#if searchProgress.done < searchProgress.total}
                  {t('trackerImport.searchingProgress', { done: searchProgress.done, total: searchProgress.total })}
                {:else}
                  {t('trackerImport.matchSummary', { found: foundCount, already: alreadyCount, missing: noMatchCount })}
                {/if}
              </span>
              <button class="stop-btn" onclick={stopWork} title={t('trackerImport.stopMatching')}>
                <Pause size={11} weight="fill" /> {t('trackerImport.stop')}
              </button>
            </div>
          {:else}
            <div class="review-progress-row">
              <div class="review-progress-bar">
                <div class="review-progress-fill" style="width:{importProgress.total ? (importProgress.done / importProgress.total) * 100 : 0}%"></div>
              </div>
              <span class="review-progress-label">{dryRun ? t('trackerImport.dryRunProgress', { done: importProgress.done, total: importProgress.total }) : t('trackerImport.importingProgress', { done: importProgress.done, total: importProgress.total })}</span>
              <button class="stop-btn" onclick={stopWork} title={t('trackerImport.stopImport')}>
                <Pause size={11} weight="fill" /> {t('trackerImport.stop')}
              </button>
            </div>
          {/if}
        </div>

        <div class="entry-list">
          {#each entries as entry}
            <div class="entry-row" class:entry-imported={entry.status === "imported"} class:entry-failed={entry.status === "failed"} class:entry-already={entry.status === "already"}>
              <div class="entry-cover-wrap">
                <Thumbnail src={entry.remote.coverUrl ?? ""} alt={displayTitle(entry.remote)} class="entry-cover" />
              </div>
              <div class="entry-info">
                <span class="entry-title">
                  <span class="entry-title-text">{displayTitle(entry.remote)}</span>
                  {#if entry.fresh}<span class="new-pill">{t('trackerImport.newPill')}</span>{/if}
                </span>
                {#if displaySub(entry.remote)}
                  <span class="entry-sub">{displaySub(entry.remote)}</span>
                {/if}
                {#if entry.status === "found" && entry.match}
                  <span class="entry-match">
                    <Sparkle size={9} weight="fill" style="color:var(--accent-fg);flex-shrink:0" />
                    {entry.match.title}
                    <span class="entry-sim">{Math.round(entry.similarity * 100)}%</span>
                    <span class="entry-prog">{progressWord} {entry.remote.progress}</span>
                  </span>
                {:else if entry.status === "found"}
                  <span class="entry-match">{t('trackerImport.libraryStub', { unit: progressWord, progress: entry.remote.progress })}</span>
                {:else if entry.status === "no-match"}
                  <span class="entry-no-match">{t('trackerImport.noMatchFound')}</span>
                {:else if entry.status === "already"}
                  <span class="entry-already-label">{t('trackerImport.alreadyInLibrary')}</span>
                {:else if entry.status === "skipped"}
                  <span class="entry-no-match">{t('trackerImport.skipped')}</span>
                {:else if entry.status === "searching"}
                  <span class="entry-searching">{t('trackerImport.searching')}</span>
                {:else if entry.status === "imported"}
                  <span class="entry-done">{dryRun ? t('trackerImport.wouldImport') : t('trackerImport.imported')}</span>
                {:else if entry.status === "failed"}
                  <span class="entry-fail">{entry.error ?? t('trackerImport.failed')}</span>
                {:else if !displaySub(entry.remote)}
                  <span class="entry-searching">{entry.remote.status} · {progressWord} {entry.remote.progress}</span>
                {/if}
              </div>
              <div class="entry-status">
                {#if entry.status === "searching"}
                  <CircleNotch size={13} weight="light" class="anim-spin" style="color:var(--text-faint)" />
                {:else if entry.status === "found" && entry.match}
                  <div class="entry-cover-match">
                    <Thumbnail src={entry.match.thumbnailUrl} alt={entry.match.title} class="entry-match-cover" />
                  </div>
                {:else if entry.status === "imported"}
                  <Check size={13} weight="bold" style="color:var(--color-success)" />
                {:else if entry.status === "failed"}
                  <Warning size={13} weight="light" style="color:var(--color-error)" />
                {:else if entry.status === "already"}
                  <Check size={13} weight="light" style="color:var(--text-faint)" />
                {/if}
              </div>
            </div>
          {/each}
        </div>

      {:else if phase === "assign"}
        <div class="assign-summary">
          <span class="assign-stats">
            {#if foundCount > 0}<span class="stat-ready">{t('trackerImport.readyCount', { count: foundCount })}</span>{/if}
            {#if foundCount > 0 && missingEntries.length > 0}<span class="stat-dot">·</span>{/if}
            {#if missingEntries.length > 0}<span class="stat-unmatched">{t('trackerImport.unmatchedCount', { count: missingEntries.length })}</span>{/if}
            {#if (foundCount > 0 || missingEntries.length > 0) && alreadyCount > 0}<span class="stat-dot">·</span>{/if}
            {#if alreadyCount > 0}<span class="stat-already">{t('trackerImport.alreadyInLibraryCount', { count: alreadyCount })}</span>{/if}
          </span>
          {#if assignSources.length > 0 && !stubImport}
            <label class="assign-default">
              {t('common.default')}
              <select
                class="src-select"
                value={targetSource?.id ?? massSourceId}
                disabled={assignSources.length === 0}
                onchange={(e) => setDefaultSource((e.currentTarget as HTMLSelectElement).value)}
              >
                {#each assignSources as src}
                  <option value={src.id}>{sourceLabel(src)}</option>
                {/each}
              </select>
            </label>
          {/if}
        </div>

        {#if !stubImport}
        <div class="mass-bar">
          <label class="mass-check">
            <input class="s-check" type="checkbox" checked={allMissingSelected} onchange={toggleAllMissing} />
            {t('trackerImport.selectedCount', { count: selectedMissing })}
          </label>
          <button
            class="migrate-btn mass-search-btn"
            onclick={() => void searchSelected()}
            disabled={selectedMissing === 0 || !(massSourceId || targetSource)}
          >
            <ArrowsClockwise size={12} weight="bold" />
            {t('trackerImport.searchCount', { count: selectedMissing })}
          </button>
        </div>
        {/if}

        <div class="table-wrap">
          <table class="assign-table">
            <thead>
              <tr>
                <th class="col-check"></th>
                <th class="col-title">{t('trackerImport.colTitle')}</th>
                <th class="col-prog">{isAnime ? t('trackerImport.colEp') : t('trackerImport.colCh')}</th>
                {#if !stubImport}<th class="col-src">{t('trackerImport.colSource')}</th>{/if}
                <th class="col-stat">{stubImport ? t('trackerImport.colStatus') : t('trackerImport.colMatch')}</th>
              </tr>
            </thead>
            <tbody>
              {#each assignRows as { e: entry, idx } (entry.remote.remoteId)}
                <tr class:row-ok={entry.status === "found" || entry.status === "imported"}>
                  <td class="col-check">
                    {#if entry.status === "no-match" || entry.status === "searching" || entry.status === "pending"}
                      <input
                        class="s-check"
                        type="checkbox"
                        checked={selectedIds.includes(entry.remote.remoteId)}
                        disabled={entry.status === "searching"}
                        onchange={() => toggleRow(entry.remote.remoteId)}
                      />
                    {/if}
                  </td>
                    <td class="col-title">
                      <div class="table-title">
                        <div class="entry-cover-wrap">
                          <Thumbnail src={entry.remote.coverUrl ?? ""} alt={displayTitle(entry.remote)} class="entry-cover" />
                        </div>
                        <div class="entry-info">
                          <span class="entry-title">
                            <span class="entry-title-text">{displayTitle(entry.remote)}</span>
                            {#if entry.fresh}<span class="new-pill">{t('trackerImport.newPill')}</span>{/if}
                          </span>
                          {#if entry.match && (entry.status === "found" || entry.status === "imported")}
                            <span class="entry-sub">{entry.match.title}</span>
                          {:else if displaySub(entry.remote)}
                            <span class="entry-sub">{displaySub(entry.remote)}</span>
                          {/if}
                        </div>
                      </div>
                    </td>
                    <td class="col-prog">{entry.remote.progress}</td>
                    {#if !stubImport}
                    <td class="col-src">
                      {#if entry.status === "imported"}
                        {@const src = sourceById(entry.sourceId)}
                        <span class="src-static">{src ? sourceLabel(src) : "—"}</span>
                      {:else}
                        <select
                          class="src-select"
                          value={entry.sourceId ?? targetSource?.id ?? ""}
                          disabled={entry.status === "searching" || retryingIds.includes(entry.remote.remoteId)}
                          onchange={(e) => void searchRow(entry.remote.remoteId, (e.currentTarget as HTMLSelectElement).value)}
                        >
                          {#each assignSources as src}
                            <option value={src.id}>{sourceLabel(src)}</option>
                          {/each}
                        </select>
                      {/if}
                    </td>
                    {/if}
                    <td class="col-stat">
                      <div class="stat-cell">
                        {#if entry.status === "searching" || retryingIds.includes(entry.remote.remoteId)}
                          <CircleNotch size={13} weight="light" class="anim-spin" style="color:var(--text-faint)" />
                        {:else if entry.status === "pending"}
                          <span class="entry-searching">{t('trackerImport.notSearched')}</span>
                        {:else if entry.status === "found"}
                          <Check size={13} weight="bold" style="color:var(--color-success)" />
                          <span class="entry-done">{stubImport ? t('trackerImport.ready') : t('trackerImport.matched')}</span>
                          {#if stubImport}
                            <button class="entry-exclude-btn" onclick={() => excludeEntry(idx)} title={t('trackerImport.skipTitle')}>
                              <X size={10} weight="bold" />
                            </button>
                          {/if}
                        {:else if entry.status === "imported"}
                          <Check size={13} weight="bold" style="color:var(--color-success)" />
                          <span class="entry-done">{t('trackerImport.imported')}</span>
                        {:else if entry.status === "failed"}
                          <Warning size={13} weight="light" style="color:var(--color-error)" />
                          <span class="entry-fail" title={entry.error}>{sourceErrorLabel(entry.error)}</span>
                          <button class="entry-exclude-btn" onclick={() => void retryImport(entry.remote.remoteId)} title={t('trackerImport.retryImport')}>
                            <ArrowsClockwise size={11} weight="bold" />
                          </button>
                        {:else if entry.status === "skipped"}
                          <span class="entry-no-match">{t('trackerImport.skipped')}</span>
                        {:else}
                          <span class="entry-no-match">{t('trackerImport.noMatch')}</span>
                          <button class="entry-exclude-btn" onclick={() => excludeEntry(idx)} title={t('trackerImport.skipTitle')}>
                            <X size={10} weight="bold" />
                          </button>
                        {/if}
                      </div>
                    </td>
                  </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="review-actions">
          <div class="dry-run">
            <span>{t('trackerImport.dryRun')}</span>
            <button
              type="button"
              class="s-toggle"
              class:on={dryRun}
              role="switch"
              aria-checked={dryRun}
              aria-label={t('trackerImport.dryRun')}
              onclick={() => (dryRun = !dryRun)}
            ><span class="s-toggle-thumb"></span></button>
          </div>
          {#if pendingCount > 0 && !stubImport}
            <button class="back-btn" onclick={() => void continueMatching()}>
              <Play size={12} weight="bold" /> {t('trackerImport.resumeSearch')}
            </button>
          {/if}
          <button class="migrate-btn" onclick={() => void startImport()} disabled={foundCount === 0}>
            <TrayArrowDown size={13} weight="bold" />
            {stubImport ? t('trackerImport.importCount', { count: foundCount }) : t('trackerImport.importMatchedCount', { count: foundCount })}
          </button>
        </div>

      {:else if phase === "done"}
        <div class="welcome">
          <div class="welcome-check"><Check size={22} weight="bold" /></div>
          <h2 class="welcome-title">{helloName ? t('trackerImport.welcomeNamed', { name: helloName }) : t('trackerImport.welcome')}</h2>
          <p class="welcome-sub">
            {t('trackerImport.doneImported', { count: importedCount })}
            {#if alreadyCount > 0} · {t('trackerImport.alreadyInLibraryCount', { count: alreadyCount })}{/if}
            {#if skippedCount > 0} · {t('trackerImport.doneSkipped', { count: skippedCount })}{/if}
            {#if failedCount > 0} · {t('trackerImport.doneFailed', { count: failedCount })}{/if}
            {#if dryRun} · {t('trackerImport.doneDryRun')}{/if}
          </p>
        </div>
        <div class="review-actions">
          {#if noMatchCount + failedCount + skippedCount > 0}
            <button class="back-btn" onclick={exportFailed}>
              <DownloadSimple size={12} weight="light" /> {t('trackerImport.exportLeftover')}
            </button>
          {/if}
            <button class="migrate-btn" onclick={() => { clearCache(); onDone(); }}><Check size={13} weight="bold" /> {t('common.done')}</button>
        </div>
      {/if}

    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; padding: 24px; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: calc(var(--z-settings) + 2); animation: fadeIn 0.1s ease both; }
  .modal { background: var(--bg-base); border: 1px solid var(--border-base); border-radius: var(--radius-xl); width: 560px; max-height: calc(100vh - 48px); min-height: 0; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 8px 40px rgba(0,0,0,0.5); }
  .modal-wide { width: min(860px, 100%); }
  .modal-fill { align-self: stretch; }

  .modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-3); padding: var(--sp-4) var(--sp-5); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }
  .header-left { display: flex; align-items: flex-start; gap: var(--sp-3); min-width: 0; }
  .source-context { display: flex; align-items: center; gap: var(--sp-3); min-width: 0; }
  .source-icon-wrap { width: 36px; height: 36px; border-radius: var(--radius-md); overflow: hidden; flex-shrink: 0; background: var(--bg-raised); border: 1px solid var(--border-dim); }
  .source-icon-wrap.logo { display: flex; align-items: center; justify-content: center; }
  .source-icon-wrap.small { width: 20px; height: 20px; border-radius: var(--radius-sm); }
  :global(.source-icon) { width: 100%; height: 100%; object-fit: cover; }
  .source-context-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .modal-eyebrow { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; }
  .modal-title { font-size: var(--text-base); font-weight: var(--weight-medium); color: var(--text-primary); letter-spacing: var(--tracking-tight); }
  .modal-sub {
    display: flex; align-items: flex-start; gap: 6px;
    font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-muted);
    letter-spacing: var(--tracking-wide); line-height: 1.4;
  }
  .modal-sub :global(svg) { flex-shrink: 0; margin-top: 1px; color: var(--text-faint); }
  .header-nav-btn { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--radius-md); color: var(--text-faint); background: none; border: 1px solid transparent; cursor: pointer; transition: color 0.12s ease, background 0.12s ease, border-color 0.12s ease, transform 0.08s ease; flex-shrink: 0; margin-top: 2px; }
  .header-nav-btn:hover { color: var(--text-muted); background: var(--bg-raised); border-color: var(--border-dim); }
  .header-nav-btn:active { transform: scale(0.9); background: var(--bg-overlay); }

  .body { flex: 1; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }

  .pick { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; --source-row-h: calc(36px + 16px); }
  .pick-chrome { flex: 0 0 auto; }
  .pick-sources { flex: 1 1 auto; min-height: calc(4 * var(--source-row-h)); display: flex; flex-direction: column; }

  .phase-label-row { padding: var(--sp-3) var(--sp-4) var(--sp-2); flex-shrink: 0; }
  .phase-label { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-widest); text-transform: uppercase; }
  .centered { flex: 1; min-height: calc(4 * var(--source-row-h)); display: flex; align-items: center; justify-content: center; padding: var(--sp-8); }
  .hint { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }

  .kind-seg { display: flex; margin: 0 var(--sp-4) var(--sp-2); border: 1px solid var(--border-dim); border-radius: var(--radius-md); overflow: hidden; }
  .kind-seg-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 6px var(--sp-3); font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); color: var(--text-faint); background: transparent; border: none; cursor: pointer; transition: background 0.12s ease, color 0.12s ease, transform 0.08s ease; }
  .kind-seg-btn:not(:last-child) { border-right: 1px solid var(--border-dim); }
  .kind-seg-btn:hover:not(.kind-seg-active) { color: var(--text-muted); background: var(--bg-raised); }
  .kind-seg-btn:active { transform: scale(0.97); }
  .kind-seg-active { background: var(--accent-muted); color: var(--accent-fg); }

  .status-chips { display: flex; flex-wrap: wrap; gap: var(--sp-1); padding: 0 var(--sp-4) var(--sp-2); flex-shrink: 0; }
  .status-chip { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 4px 10px; border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: none; color: var(--text-faint); cursor: pointer; white-space: nowrap; transition: color 0.12s ease, border-color 0.12s ease, background 0.12s ease, transform 0.08s ease; display: inline-flex; align-items: center; gap: 6px; }
  .status-chip:hover { color: var(--text-muted); background: var(--bg-raised); }
  .status-chip:active { transform: scale(0.95); }
  .status-chip-active { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }
  .chip-badge { font-size: 9px; letter-spacing: var(--tracking-wide); padding: 0 5px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); color: var(--text-faint); }
  .chip-badge-new { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }
  .list-hint { margin: 0; padding: 0 var(--sp-4) var(--sp-2); font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }

  .src-lang-bar { display: flex; align-items: center; gap: var(--sp-1); padding: var(--sp-2); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }
  .src-lang-nav { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; flex-shrink: 0; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); background: none; color: var(--text-faint); font-size: 15px; line-height: 1; cursor: pointer; transition: color var(--t-base), background var(--t-base); }
  .src-lang-nav:hover { color: var(--text-muted); background: var(--bg-raised); }
  .src-lang-chips { display: flex; align-items: center; gap: var(--sp-1); flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .src-lang-chips::-webkit-scrollbar { display: none; }
  .src-lang-chip { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 3px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); background: none; color: var(--text-faint); cursor: pointer; white-space: nowrap; flex-shrink: 0; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .src-lang-chip:hover { color: var(--text-muted); background: var(--bg-raised); }
  .src-lang-chip-active { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }

  .source-list { flex: 1; min-height: calc(4 * var(--source-row-h)); overflow-y: auto; padding: var(--sp-2); display: flex; flex-direction: column; gap: 1px; }
  .source-list-tight { flex: 0 0 auto; min-height: 0; padding-bottom: 0; }
  .source-row { display: flex; align-items: center; gap: var(--sp-3); padding: 8px var(--sp-3); border-radius: var(--radius-md); border: 1px solid transparent; background: none; text-align: left; width: 100%; cursor: pointer; transition: background var(--t-fast), border-color var(--t-fast); }
  .source-row:hover { background: var(--bg-raised); border-color: var(--border-dim); }
  .source-row-library { border-color: var(--border-dim); }
  .source-info { flex: 1; display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
  .source-name { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .source-meta { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  :global(.source-arrow) { color: var(--text-faint); opacity: 0; transition: opacity var(--t-base); flex-shrink: 0; }
  .source-row:hover :global(.source-arrow) { opacity: 1; }

  .review-header { padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; display: flex; flex-direction: column; gap: var(--sp-2); }
  .review-route { display: flex; align-items: center; gap: var(--sp-2); }
  .review-source { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }
  .review-source-name { font-size: var(--text-xs); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: var(--weight-medium); }
  .review-progress-row { display: flex; align-items: center; gap: var(--sp-3); }
  .review-progress-bar { flex: 1; height: 3px; background: var(--bg-overlay); border-radius: var(--radius-full); overflow: hidden; }
  .review-progress-fill { height: 100%; background: var(--accent); border-radius: var(--radius-full); transition: width 0.3s ease; }
  .review-progress-label { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); white-space: nowrap; flex-shrink: 0; }
  .stop-btn { display: flex; align-items: center; gap: 4px; font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 3px 8px; border-radius: var(--radius-sm); background: none; color: var(--text-muted); border: 1px solid var(--border-dim); cursor: pointer; flex-shrink: 0; }
  .stop-btn:hover { color: var(--color-error); border-color: var(--color-error); background: var(--bg-raised); }

  .resume-banner {
    display: flex; align-items: center; gap: var(--sp-2);
    padding: var(--sp-3) var(--sp-4);
    border-bottom: 1px solid var(--accent-dim);
    background: var(--accent-muted);
    flex-shrink: 0;
  }
  .resume-copy { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .resume-title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); }
  .resume-sub { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }

  .entry-list { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: var(--sp-2); display: flex; flex-direction: column; gap: 1px; }
  .entry-row { display: flex; align-items: center; gap: var(--sp-3); padding: 7px var(--sp-3); border-radius: var(--radius-md); border: 1px solid transparent; transition: background var(--t-fast); }
  .entry-row:hover { background: var(--bg-raised); }
  .entry-imported { opacity: 0.5; }
  .entry-already { opacity: 0.65; }
  .entry-failed { border-color: rgba(180,60,60,0.15); background: rgba(180,60,60,0.04); }
  .entry-cover-wrap { width: 28px; height: 42px; border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-raised); border: 1px solid var(--border-dim); flex-shrink: 0; }
  :global(.entry-cover) { width: 100%; height: 100%; object-fit: cover; }
  .entry-info { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; overflow: hidden; }
  .entry-title { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: var(--text-sm); color: var(--text-secondary); }
  .entry-title-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .new-pill { flex-shrink: 0; font-family: var(--font-ui); font-size: 9px; letter-spacing: var(--tracking-wide); text-transform: uppercase; padding: 0 5px; border-radius: var(--radius-sm); color: var(--accent-fg); border: 1px solid var(--accent-dim); background: var(--accent-muted); }
  .entry-sub { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .entry-match { display: flex; align-items: center; gap: 4px; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .entry-sim { background: var(--bg-overlay); border: 1px solid var(--border-dim); border-radius: var(--radius-sm); padding: 0 4px; font-size: 9px; flex-shrink: 0; }
  .entry-prog { flex-shrink: 0; }
  .entry-no-match, .entry-searching, .entry-already-label { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .entry-done { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--color-success); letter-spacing: var(--tracking-wide); }
  .entry-fail { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--color-error); letter-spacing: var(--tracking-wide); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .entry-status { display: flex; align-items: center; gap: var(--sp-1); flex-shrink: 0; }
  .entry-cover-match { width: 24px; height: 36px; border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-raised); border: 1px solid var(--border-dim); flex-shrink: 0; }
  :global(.entry-match-cover) { width: 100%; height: 100%; object-fit: cover; }
  .entry-exclude-btn { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: var(--radius-sm); color: var(--text-faint); background: none; border: none; cursor: pointer; transition: color var(--t-base), background var(--t-base); flex-shrink: 0; }
  .entry-exclude-btn:hover { color: var(--color-error); background: var(--bg-raised); }

  .assign-summary { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .assign-stats { display: flex; align-items: center; gap: 6px; min-width: 0; flex-wrap: wrap; }
  .stat-ready { color: var(--accent-fg); }
  .stat-unmatched { color: var(--text-secondary); }
  .stat-already { color: var(--text-faint); }
  .stat-dot { color: var(--text-faint); }
  .assign-default { display: flex; align-items: center; gap: 8px; color: var(--text-muted); flex-shrink: 0; }
  .mass-bar { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-4); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }
  .mass-check { display: flex; align-items: center; gap: 6px; margin-right: var(--sp-5); font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); cursor: pointer; white-space: nowrap; }
  .mass-search-btn { padding: 5px 12px; }
  .src-select {
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    color: var(--text-secondary);
    background-color: var(--bg-raised);
    border: 1px solid var(--border-dim);
    border-radius: var(--radius-sm);
    padding: 4px 22px 4px 8px;
    min-width: 0; max-width: 220px; cursor: pointer;
    appearance: none; -webkit-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%236e6c68' stroke-width='1.3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
  }
  .src-select:focus { outline: none; border-color: var(--accent-dim); }
  .src-select:disabled { opacity: 0.5; cursor: default; }
  .src-select option { background: var(--bg-surface); color: var(--text-secondary); }

  .table-wrap { flex: 1; overflow: auto; min-height: 0; }
  .assign-table { width: 100%; table-layout: fixed; border-collapse: collapse; }
  .assign-table th {
    position: sticky; top: 0; z-index: 1; background: var(--bg-base);
    font-family: var(--font-ui); font-size: 10px; letter-spacing: var(--tracking-widest); text-transform: uppercase;
    color: var(--text-faint); font-weight: var(--weight-medium); text-align: left;
    padding: 8px var(--sp-3); border-bottom: 1px solid var(--border-dim);
  }
  .assign-table td { padding: 6px var(--sp-3); border-bottom: 1px solid var(--border-dim); vertical-align: middle; }
  .assign-table tbody tr:hover { background: var(--bg-raised); }
  .col-check { width: 32px; }
  .col-prog { width: 44px; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); }
  .col-src { width: 220px; }
  .col-stat { width: 148px; }
  .stat-cell { display: flex; align-items: center; gap: 4px; }
  .col-src .src-select { width: 100%; max-width: none; }
  .src-static { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .row-ok { opacity: 0.85; }
  .table-title { display: flex; align-items: center; gap: var(--sp-3); min-width: 0; }

  .welcome { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--sp-3); padding: var(--sp-8) var(--sp-5); text-align: center; }
  .welcome-check { width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: var(--accent-muted); border: 1px solid var(--accent-dim); color: var(--accent-fg); }
  .welcome-title { margin: 0; font-size: var(--text-lg); font-weight: var(--weight-medium); color: var(--text-primary); letter-spacing: var(--tracking-tight); }
  .welcome-sub { margin: 0; font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }

  .review-actions { display: flex; justify-content: flex-end; align-items: center; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4); border-top: 1px solid var(--border-dim); flex-shrink: 0; }
  .back-btn { display: flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 6px 10px; border-radius: var(--radius-md); background: none; color: var(--text-muted); border: 1px solid var(--border-dim); cursor: pointer; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .back-btn:hover:not(:disabled) { color: var(--text-secondary); border-color: var(--border-strong); background: var(--bg-raised); }
  .back-btn:disabled { opacity: 0.4; cursor: default; }
  .dry-run { display: flex; align-items: center; gap: 8px; margin-right: auto; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); }
  .migrate-btn { display: flex; align-items: center; gap: var(--sp-2); font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 7px 16px; border-radius: var(--radius-md); background: var(--accent-dim); border: 1px solid var(--accent); color: var(--accent-fg); cursor: pointer; transition: background var(--t-base), border-color var(--t-base); }
  .migrate-btn:hover:not(:disabled) { background: var(--accent-muted); border-color: var(--accent-bright); }
  .migrate-btn:disabled { opacity: 0.4; cursor: default; }

  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
</style>
