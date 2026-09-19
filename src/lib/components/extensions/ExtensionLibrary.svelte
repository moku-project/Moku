<script lang="ts">
  import { ArrowLeft, MagnifyingGlass, GearSix, Swap, Funnel, Check, CircleNotch, UploadSimple, PencilSimple, Trash, Plus } from "phosphor-svelte";
  import Thumbnail           from "$lib/components/shared/manga/Thumbnail.svelte";
  import { resolvedCover }   from "$lib/core/cover/coverResolver";
  import { tsunagu }         from "$lib/server-adapters/tsunagu";
  import { setPreviewManga } from "$lib/state/series.svelte";
  import { platformService } from "$lib/platform-service";
  import { addToast }        from "$lib/state/notifications.svelte";

  import { libraryByExtension, type LibraryManga, type SourceNode, type SourceLibrary } from "$lib/components/extensions/lib/extensionLibrary";
  import SourceMigrateModal  from "$lib/components/extensions/panels/SourceMigrateModal.svelte";

  type SourceEntry = { id: string; displayName: string };

  interface Props {
    pkgName:       string;
    extensionName: string;
    iconUrl:       string;
    cropCovers:    boolean;
    statsAlways:   boolean;
    anims:         boolean;
    sources:       SourceEntry[];
    onBack:        () => void;
    onSettings:    () => void;
  }

  let { pkgName, extensionName, iconUrl, cropCovers, statsAlways, anims, sources, onBack, onSettings }: Props = $props();

  const isLocal = $derived(pkgName === '__local__');

  let groups:  SourceLibrary[] = $state([]);
  let sourceNodes: SourceNode[] = $state([]);

  let localItems:       any[]    = $state([]);
  let localPage:        number   = $state(1);
  let localHasNext:     boolean  = $state(false);
  let localLoadingMore: boolean  = $state(false);

  let loading  = $state(true);
  let search   = $state("");
  let searchInput = $state("");

  type ContentFilter = "unread" | "downloaded";
  let activeFilters = $state<Partial<Record<ContentFilter, boolean>>>({});
  let filterOpen    = $state(false);

  const hasActiveFilters = $derived(Object.values(activeFilters).some(Boolean));

  let migrateTarget: { sourceId: string; sourceName: string; iconUrl: string; contentType: string | null; manga: LibraryManga[] } | null = $state(null);
  const allManga = $derived(isLocal ? localItems : groups.flatMap(g => g.manga));

  const filtered = $derived((() => {
    let items = allManga;
    const q = (isLocal ? searchInput : search).trim().toLowerCase();
    if (q) items = items.filter((m: any) => m.title.toLowerCase().includes(q));
    if (!isLocal) {
      if (activeFilters.unread)     items = items.filter((m: any) => m.unreadCount > 0);
      if (activeFilters.downloaded) items = items.filter((m: any) => m.downloadCount > 0);
    }
    return items;
  })());

  const canImport = $derived(isLocal && platformService.platform === "tauri");
  let importing   = $state(false);
  let importProgress = $state<{ copied: number; total: number } | null>(null);
  let dragOver    = $state(false);
  let addMenuOpen = $state(false);
  let renaming    = $state<{ id: string; title: string; contentType: string | null } | null>(null);
  let renameInput = $state("");
  let deleting    = $state<{ id: string; title: string } | null>(null);
  let deleteBusy  = $state(false);
  let mediaDir    = $state("");
  let unlistenDrop: (() => void) | null = null;

  $effect(() => { load(); });

  $effect(() => {
    if (!canImport) return;
    let cancelled = false;
    (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (cancelled) return;
        if (event.payload.type === "over") { dragOver = true; return; }
        if (event.payload.type === "leave") { dragOver = false; return; }
        if (event.payload.type === "drop") {
          dragOver = false;
          void handleDrop(event.payload.paths);
        }
      });
      if (cancelled) unlisten();
      else unlistenDrop = unlisten;
    })();
    return () => { cancelled = true; unlistenDrop?.(); unlistenDrop = null; };
  });

  async function handleDrop(paths: string[]) {
    if (importing || paths.length === 0) return;
    importing = true;
    importProgress = null;
    try {
      if (!mediaDir) mediaDir = (await tsunagu.storageInfo()).mediaDir;
      const { importLocalPaths } = await import("$lib/core/localImport");
      const { imported, errors } = await importLocalPaths(paths, mediaDir, (copied, total) => {
        importProgress = { copied, total };
      });
      if (imported.length > 0) {
        await tsunagu.rescanLocalMedia();
        addToast({ kind: "success", title: `Imported ${imported.length} series`, body: [...new Set(imported)].join(", ") });
        await load();
      }
      for (const err of errors) {
        addToast({ kind: "error", title: "Import failed", body: `${err.path}: ${err.message}` });
      }
    } catch (e: any) {
      addToast({ kind: "error", title: "Import failed", body: e?.message ?? String(e) });
    } finally {
      importing = false;
      importProgress = null;
    }
  }

  async function pickAndImport(directory: boolean) {
    addMenuOpen = false;
    const paths = await platformService.pickImportPaths(directory);
    if (paths.length > 0) void handleDrop(paths);
  }

  async function load() {
    loading = true;
    try {
      if (isLocal) {
        const entries = await tsunagu.library();
        localItems = entries
          .filter((e) => !e.source)
          .map((e) => ({
            id:            e.id,
            title:         e.title,
            thumbnailUrl:  e.thumbnailUrl ?? "",
            unreadCount:   e.unreadCount,
            downloadCount: e.downloadCount,
            contentType:   e.contentType,
            source:        null,
          }));
        localPage    = 1;
        localHasNext = false;
      } else {
        const [entries, exts] = await Promise.all([
          tsunagu.library(),
          tsunagu.installedExtensions(),
        ]);
        const libraryManga: LibraryManga[] = entries.map((e) => ({
          id:            e.id,
          title:         e.title,
          thumbnailUrl:  e.thumbnailUrl ?? "",
          unreadCount:   e.unreadCount,
          downloadCount: e.downloadCount,
          contentType:   e.contentType,
          source:        e.source ? { id: e.source.id, displayName: e.source.displayName } : null,
        }));
        sourceNodes = exts.filter((e) => e.installed).map((e) => ({ id: e.id, displayName: e.displayName, iconUrl: e.iconUrl }));
        const pkgNameOf = (sourceId: string) => exts.find((e) => e.id === sourceId)?.packageName;
        groups = libraryByExtension(libraryManga, pkgNameOf, pkgName);
      }
    } finally {
      loading = false;
    }
  }

  async function loadMoreLocal() {
  }

  function startRename(m: LibraryManga) {
    renaming = { id: m.id, title: m.title, contentType: m.contentType ?? null };
    renameInput = m.title;
  }

  async function confirmRename() {
    if (!renaming) return;
    const newTitle = renameInput.trim();
    const oldTitle = renaming.title;
    if (!newTitle || newTitle === oldTitle) { renaming = null; return; }
    try {
      await tsunagu.renameLocalSeries(renaming.id, newTitle);
      renaming = null;
      await load();
    } catch (e: any) {
      addToast({ kind: "error", title: "Rename failed", body: e?.message ?? String(e) });
    }
  }

  function startDelete(m: LibraryManga) {
    deleting = { id: m.id, title: m.title };
  }

  async function confirmDelete() {
    if (!deleting) return;
    deleteBusy = true;
    try {
      await tsunagu.deleteLocalSeries(deleting.id);
      addToast({ kind: "success", title: "Deleted", body: deleting.title });
      deleting = null;
      await load();
    } catch (e: any) {
      addToast({ kind: "error", title: "Delete failed", body: e?.message ?? String(e) });
    } finally {
      deleteBusy = false;
    }
  }

  function onSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { searchInput = ''; search = ''; }
  }

  function toggleFilter(f: ContentFilter) {
    activeFilters = { ...activeFilters, [f]: !activeFilters[f] };
  }

  function clearFilters() {
    activeFilters = {};
  }

  function openMigrate(group: SourceLibrary) {
    const node = sourceNodes.find(s => s.id === group.sourceId);
    migrateTarget = {
      sourceId:   group.sourceId,
      sourceName: group.displayName,
      iconUrl:    (node as any)?.iconUrl ?? iconUrl,
      contentType: group.manga[0]?.contentType ?? null,
      manga:      group.manga,
    };
  }

  $effect(() => {
    if (!filterOpen) return;
    function onOutside(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest(".filter-wrap")) filterOpen = false;
    }
    setTimeout(() => document.addEventListener("mousedown", onOutside, true), 0);
    return () => document.removeEventListener("mousedown", onOutside, true);
  });

  $effect(() => {
    if (!addMenuOpen) return;
    function onOutside(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest(".add-menu-wrap")) addMenuOpen = false;
    }
    setTimeout(() => document.addEventListener("mousedown", onOutside, true), 0);
    return () => document.removeEventListener("mousedown", onOutside, true);
  });

  const CONTENT_FILTERS: [ContentFilter, string][] = [
    ["unread",     "Unread"],
    ["downloaded", "Downloaded"],
  ];
</script>

<div class="root">
  <div class="header">
    <button class="header-btn" onclick={onBack}>
      <ArrowLeft size={14} weight="bold" />
    </button>
    {#if iconUrl}
      <Thumbnail src={iconUrl} alt={extensionName} class="header-icon" onerror={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
    {/if}
    <div class="title-block">
      <span class="eyebrow">{isLocal ? 'Local Source' : 'In Library'}</span>
      <span class="title">{extensionName}</span>
    </div>
    {#if !loading}
      <span class="count-badge">
        {isLocal ? filtered.length + (localHasNext ? '+' : '') : `${filtered.length}${filtered.length !== allManga.length ? ` / ${allManga.length}` : ''}`}
      </span>
    {/if}
    <div class="header-right">
      <div class="search-wrap">
        <MagnifyingGlass size={12} class="search-icon" weight="light" />
        {#if isLocal}
          <input class="search" placeholder="Search" bind:value={searchInput} autocomplete="off" onkeydown={onSearchKeydown} />
        {:else}
          <input class="search" placeholder="Search" bind:value={search} autocomplete="off" />
        {/if}
      </div>

      {#if canImport}
        <div class="filter-wrap add-menu-wrap">
          <button class="settings-btn" onclick={() => addMenuOpen = !addMenuOpen} title="Add series">
            <Plus size={14} weight="bold" />
          </button>
          {#if addMenuOpen}
            <div class="filter-panel" role="menu">
              <button class="panel-item" role="menuitem" onclick={() => pickAndImport(true)}>
                Add folder…
              </button>
              <button class="panel-item" role="menuitem" onclick={() => pickAndImport(false)}>
                Add files…
              </button>
            </div>
          {/if}
        </div>
      {/if}

      {#if !isLocal}
        <div class="filter-wrap">
          <button
            class="filter-btn"
            class:filter-btn-active={hasActiveFilters}
            title="Filter"
            onclick={() => filterOpen = !filterOpen}
          >
            <Funnel size={13} weight={hasActiveFilters ? "fill" : "bold"} />
          </button>
          {#if filterOpen}
            <div class="filter-panel" role="menu">
              <div class="filter-panel-header">
                <span class="panel-heading">Filter</span>
                {#if hasActiveFilters}
                  <button class="panel-clear-btn" onclick={clearFilters}>Clear all</button>
                {/if}
              </div>
              <div class="panel-divider"></div>
              <p class="panel-label">Content</p>
              {#each CONTENT_FILTERS as [f, label]}
                <button
                  class="panel-item"
                  class:panel-item-active={activeFilters[f]}
                  role="menuitem"
                  onclick={() => toggleFilter(f)}
                >
                  <span class="panel-check" class:panel-check-on={activeFilters[f]}>
                    {#if activeFilters[f]}<Check size={9} weight="bold" />{/if}
                  </span>
                  {label}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        {#if sources.length > 0}
          <button class="settings-btn" onclick={onSettings} title="Extension settings">
            <GearSix size={14} weight="bold" />
          </button>
        {/if}
      {/if}
    </div>
  </div>

  {#if canImport}
    <div class="drop-banner" class:drop-banner-active={dragOver}>
      {#if importing}
        <CircleNotch size={13} weight="light" class="anim-spin" />
        {#if importProgress && importProgress.total > 0}
          Importing… {importProgress.copied} / {importProgress.total} files
          <div class="import-progress-track">
            <div class="import-progress-fill" style="width:{Math.min(100, (importProgress.copied / importProgress.total) * 100)}%"></div>
          </div>
        {:else}
          Importing…
        {/if}
      {:else}
        <UploadSimple size={13} weight="bold" />
        Drag manga, anime, or novel folders (or .cbz/.cbr/.cb7/.cbt/.pdf/.epub/.docx files) anywhere in this window to import them
      {/if}
    </div>
  {/if}

  <div class="content">
    {#if loading}
      <div class="grid">
        {#each Array(12) as _}
          <div class="card-skeleton">
            <div class="cover-skeleton skeleton"></div>
            <div class="title-skeleton skeleton"></div>
          </div>
        {/each}
      </div>
    {:else if filtered.length === 0}
      <div class="empty">
        {isLocal
          ? (allManga.length === 0
              ? (canImport ? 'No local series yet — drag a manga, anime, or novel folder in to get started.' : 'No local series yet.')
              : 'No matches.')
          : allManga.length === 0
            ? 'Nothing from this extension is in your library.'
            : 'No matches.'}
      </div>
    {:else}
      {#if !isLocal && groups.length > 1}
        <div class="source-groups">
          {#each groups as group}
            <div class="source-group-header">
              <span class="source-group-name">{group.displayName}</span>
              <span class="source-group-count">{group.manga.length}</span>
              <button class="migrate-btn" onclick={() => openMigrate(group)} title="Migrate this source">
                <Swap size={12} weight="bold" />
                Migrate source
              </button>
            </div>
          {/each}
        </div>
      {:else if !isLocal && groups.length === 1}
        <div class="single-source-bar">
          <span class="source-group-name">{groups[0].displayName}</span>
          <button class="migrate-btn" onclick={() => openMigrate(groups[0])} title="Migrate this source">
            <Swap size={12} weight="bold" />
            Migrate source
          </button>
        </div>
      {/if}

      <div class="grid">
        {#each filtered as m (m.id)}
          {@const isCompleted = !m.unreadCount && m.downloadCount > 0}
          <button class="card" class:anims onclick={() => setPreviewManga(m as any)}>
            <div class="cover-wrap" class:completed={isCompleted}>
              <Thumbnail
                src={resolvedCover(m.id, m.thumbnailUrl)}
                alt={m.title}
                class="cover"
                style="object-fit:{cropCovers ? 'cover' : 'contain'}"
                draggable="false"
              />
              {#if !isLocal}
                <div class="card-info-overlay" class:anim={anims} class:instant={!anims} class:always={statsAlways}>
                  <div class="overlay-badges">
                    {#if isCompleted}
                      <span class="badge badge-done">✓ Done</span>
                    {:else if m.unreadCount}
                      <span class="badge badge-unread">{m.unreadCount} new</span>
                    {/if}
                    {#if m.downloadCount}
                      <span class="badge badge-dl">↓ {m.downloadCount}</span>
                    {/if}
                  </div>
                </div>
              {/if}
              {#if canImport}
                <div class="card-actions">
                  <button
                    class="rename-btn"
                    title="Rename"
                    onclick={(e) => { e.stopPropagation(); startRename(m as LibraryManga); }}
                  >
                    <PencilSimple size={11} weight="bold" />
                  </button>
                  <button
                    class="rename-btn delete-btn"
                    title="Delete"
                    onclick={(e) => { e.stopPropagation(); startDelete(m as LibraryManga); }}
                  >
                    <Trash size={11} weight="bold" />
                  </button>
                </div>
              {/if}
            </div>
            <p class="card-title">{m.title}</p>
          </button>
        {/each}
      </div>

      {#if isLocal && localHasNext}
        <div class="load-more">
          <button class="load-more-btn" onclick={loadMoreLocal} disabled={localLoadingMore}>
            {#if localLoadingMore}
              <CircleNotch size={13} weight="light" class="anim-spin" />
              Loading…
            {:else}
              Load more
            {/if}
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>

{#if renaming}
  <div class="backdrop" role="button" tabindex="-1" aria-label="Close" onclick={(e) => { if (e.target === e.currentTarget) renaming = null; }} onkeydown={(e) => e.key === 'Escape' && (renaming = null)}>
    <div class="rename-modal" role="dialog" aria-label="Rename series">
      <span class="rename-label">Rename series</span>
      <input
        class="rename-input"
        bind:value={renameInput}
        autofocus
        onkeydown={(e) => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') renaming = null; }}
      />
      <div class="rename-actions">
        <button class="rename-btn-cancel" onclick={() => renaming = null}>Cancel</button>
        <button class="rename-btn-confirm" onclick={confirmRename}>Rename</button>
      </div>
    </div>
  </div>
{/if}

{#if deleting}
  <div class="backdrop" role="button" tabindex="-1" aria-label="Close" onclick={(e) => { if (e.target === e.currentTarget && !deleteBusy) deleting = null; }} onkeydown={(e) => e.key === 'Escape' && !deleteBusy && (deleting = null)}>
    <div class="rename-modal" role="dialog" aria-label="Delete series">
      <span class="rename-label">Delete "{deleting.title}"? This permanently removes its files from disk and can't be undone.</span>
      <div class="rename-actions">
        <button class="rename-btn-cancel" onclick={() => deleting = null} disabled={deleteBusy}>Cancel</button>
        <button class="rename-btn-confirm delete-confirm-btn" onclick={confirmDelete} disabled={deleteBusy}>
          {deleteBusy ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  </div>
{/if}

{#if migrateTarget}
  <SourceMigrateModal
    sourceId={migrateTarget.sourceId}
    sourceName={migrateTarget.sourceName}
    sourceIconUrl={migrateTarget.iconUrl}
    contentType={migrateTarget.contentType}
    manga={migrateTarget.manga}
    onClose={() => migrateTarget = null}
    onDone={() => { migrateTarget = null; load(); }}
  />
{/if}

<style>
  .root { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

  :global(.header-icon) { width: 24px; height: 24px; border-radius: var(--radius-sm); object-fit: cover; flex-shrink: 0; background: var(--bg-raised); }

  .header { display: flex; align-items: center; gap: var(--sp-3); padding: var(--sp-4) var(--sp-6); border-bottom: 1px solid var(--border-dim); flex-shrink: 0; }
  .header-right { display: flex; align-items: center; gap: var(--sp-2); margin-left: auto; }

  .header-btn { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--radius-md); color: var(--text-faint); flex-shrink: 0; transition: color var(--t-base), background var(--t-base); }
  .header-btn:hover { color: var(--text-primary); background: var(--bg-raised); }

  .title-block { display: flex; flex-direction: column; gap: 1px; }
  .eyebrow { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wider); text-transform: uppercase; }
  .title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); }

  .count-badge { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 2px 8px; border-radius: var(--radius-sm); background: var(--bg-overlay); border: 1px solid var(--border-dim); color: var(--text-muted); flex-shrink: 0; }

  .search-wrap { position: relative; display: flex; align-items: center; }
  .search-wrap :global(.search-icon) { position: absolute; left: 9px; color: var(--text-faint); pointer-events: none; }
  .search { background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md); padding: 5px 10px 5px 26px; color: var(--text-primary); font-size: var(--text-sm); width: 160px; outline: none; transition: border-color var(--t-base); }
  .search::placeholder { color: var(--text-faint); }
  .search:focus { border-color: var(--border-strong); }

  .filter-wrap { position: relative; }
  .filter-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: var(--bg-raised); color: var(--text-faint); cursor: pointer; flex-shrink: 0; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .filter-btn:hover { color: var(--text-primary); border-color: var(--border-strong); }
  .filter-btn-active { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }

  .settings-btn { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: var(--radius-md); border: 1px solid var(--border-dim); background: var(--bg-raised); color: var(--text-faint); cursor: pointer; flex-shrink: 0; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .settings-btn:hover { color: var(--text-primary); border-color: var(--border-strong); }

  .filter-panel { position: absolute; top: calc(100% + 6px); right: 0; z-index: 9999; min-width: 200px; background: var(--bg-raised); border: 1px solid var(--border-base); border-radius: var(--radius-lg); padding: var(--sp-1); box-shadow: 0 8px 32px rgba(0,0,0,0.5); animation: fadeIn 0.1s ease both; }
  .filter-panel-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px 4px; }
  .panel-heading { font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); color: var(--text-secondary); font-weight: var(--weight-medium, 500); }
  .panel-clear-btn { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); color: var(--text-faint); background: none; border: none; cursor: pointer; padding: 0; transition: color var(--t-base); }
  .panel-clear-btn:hover { color: var(--color-error); }
  .panel-divider { height: 1px; background: var(--border-dim); margin: 4px 2px; }
  .panel-label { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wider); text-transform: uppercase; color: var(--text-faint); padding: 4px 8px 8px; }
  .panel-item { display: flex; align-items: center; gap: var(--sp-2); width: 100%; padding: 7px 10px; border-radius: var(--radius-sm); border: none; background: transparent; color: var(--text-muted); font-family: var(--font-ui); font-size: var(--text-xs); cursor: pointer; text-align: left; transition: background var(--t-base), color var(--t-base); }
  .panel-item:hover { background: var(--bg-overlay); color: var(--text-primary); }
  .panel-item-active { color: var(--accent-fg); background: var(--accent-muted); font-weight: var(--weight-medium, 500); }
  .panel-item-active:hover { background: var(--accent-dim); }
  .panel-check { width: 13px; height: 13px; border-radius: 2px; border: 1px solid var(--border-strong); background: transparent; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--bg-base); transition: background var(--t-base), border-color var(--t-base); }
  .panel-check-on { background: var(--accent); border-color: var(--accent); }

  .content { flex: 1; overflow-y: auto; padding: var(--sp-4) var(--sp-6) var(--sp-6); will-change: scroll-position; display: flex; flex-direction: column; gap: var(--sp-3); }

  .source-groups { display: flex; flex-direction: column; gap: var(--sp-1); }
  .source-group-header { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) 0; border-bottom: 1px solid var(--border-dim); }
  .single-source-bar { display: flex; align-items: center; gap: var(--sp-2); padding-bottom: var(--sp-2); border-bottom: 1px solid var(--border-dim); }
  .source-group-name { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted); letter-spacing: var(--tracking-wide); font-weight: var(--weight-medium); }
  .source-group-count { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); padding: 1px 6px; border-radius: var(--radius-sm); background: var(--bg-overlay); border: 1px solid var(--border-dim); }
  .migrate-btn { display: flex; align-items: center; gap: 5px; margin-left: auto; font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 3px 9px; border-radius: var(--radius-sm); background: none; color: var(--text-faint); border: 1px solid var(--border-dim); cursor: pointer; flex-shrink: 0; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .migrate-btn:hover { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: var(--sp-4); }

  .card { background: none; border: none; padding: 0; cursor: pointer; text-align: left; }
  .card.anims:hover .cover-wrap { transform: translateY(-3px); border-color: var(--border-strong); box-shadow: 0 6px 20px rgba(0,0,0,0.35); }
  .card:hover .card-title { color: var(--text-primary); }

  .cover-wrap { position: relative; aspect-ratio: 2/3; overflow: hidden; border-radius: var(--radius-md); background: var(--bg-raised); border: 1px solid var(--border-dim); will-change: transform; }
  .card.anims .cover-wrap { transition: transform 0.18s cubic-bezier(0.16,1,0.3,1), border-color var(--t-base), box-shadow 0.18s cubic-bezier(0.16,1,0.3,1); }
  .cover-wrap.completed { box-shadow: inset 0 -2px 0 0 var(--accent); }

  .card-info-overlay { position: absolute; bottom: -4px; left: 0; right: 0; z-index: 2; padding: 32px 6px 10px; background: linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 50%, transparent 100%); opacity: 0; pointer-events: none; }
  .card-info-overlay.anim { transition: opacity 0.18s ease; }
  .card-info-overlay.instant { transition: none; }
  .card-info-overlay.always { opacity: 1; }
  .card:hover .card-info-overlay { opacity: 1; }

  .overlay-badges { display: flex; align-items: flex-end; justify-content: space-between; gap: 4px; flex-wrap: wrap; }
  .badge { font-family: var(--font-ui); font-size: 9.5px; font-weight: 700; letter-spacing: 0.04em; line-height: 1; padding: 3px 7px; border-radius: 20px; white-space: nowrap; }
  .badge-unread { background: var(--accent); color: #fff; box-shadow: 0 1px 8px rgba(0,0,0,0.5); }
  .badge-done { background: rgba(255,255,255,0.18); color: rgba(255,255,255,0.9); border: 1px solid rgba(255,255,255,0.25); }
  .badge-dl { background: rgba(0,0,0,0.55); color: rgba(255,255,255,0.8); border: 1px solid rgba(255,255,255,0.18); margin-left: auto; }

  .card-title { margin-top: var(--sp-2); font-size: var(--text-sm); color: var(--text-secondary); line-height: var(--leading-snug); display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 2lh; }
  .card.anims .card-title { transition: color var(--t-base); }

  .card-skeleton { padding: 0; }
  .cover-skeleton { aspect-ratio: 2/3; border-radius: var(--radius-md); }
  .title-skeleton { height: 12px; margin-top: var(--sp-2); width: 80%; border-radius: var(--radius-sm); }

  .empty { display: flex; align-items: center; justify-content: center; height: 60%; color: var(--text-muted); font-size: var(--text-sm); text-align: center; padding: 0 var(--sp-6); }

  .load-more { display: flex; justify-content: center; padding: var(--sp-4) 0; }
  .load-more-btn { display: flex; align-items: center; gap: var(--sp-2); font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); padding: 7px 20px; border-radius: var(--radius-md); background: var(--bg-raised); color: var(--text-muted); border: 1px solid var(--border-dim); cursor: pointer; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .load-more-btn:hover:not(:disabled) { color: var(--text-primary); border-color: var(--border-strong); }
  .load-more-btn:disabled { opacity: 0.5; cursor: default; }

  @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }

  .drop-banner {
    display: flex; align-items: center; justify-content: center; gap: var(--sp-2);
    padding: var(--sp-2) var(--sp-4);
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    color: var(--text-faint);
    background: var(--bg-raised);
    border-bottom: 1px dashed var(--border-dim);
    flex-shrink: 0;
    transition: color var(--t-base), background var(--t-base), border-color var(--t-base);
  }
  .drop-banner-active {
    color: var(--accent-fg);
    background: var(--accent-muted);
    border-color: var(--accent-dim);
  }

  .import-progress-track {
    width: 120px; height: 4px; border-radius: 2px;
    background: var(--bg-overlay); overflow: hidden;
  }
  .import-progress-fill {
    height: 100%; background: var(--accent);
    transition: width 0.15s ease;
  }

  .card-actions {
    position: absolute; top: 6px; right: 6px; z-index: 3;
    display: flex; gap: 4px;
    opacity: 0; transition: opacity var(--t-base);
  }
  .card:hover .card-actions, .card:focus-visible .card-actions { opacity: 1; }

  .rename-btn {
    display: flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: var(--radius-sm);
    background: rgba(0,0,0,0.55); border: 1px solid rgba(255,255,255,0.18);
    color: rgba(255,255,255,0.85); cursor: pointer;
  }
  .delete-btn:hover { background: var(--color-error); border-color: var(--color-error); color: #fff; }

  .delete-confirm-btn { background: var(--color-error); border-color: var(--color-error); }
  .delete-confirm-btn:disabled, .rename-btn-cancel:disabled { opacity: 0.5; cursor: default; }

  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.72);
    z-index: calc(var(--z-settings, 1000) + 2);
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px);
    animation: fadeIn 0.1s ease both;
  }
  .rename-modal {
    width: min(320px, calc(100vw - 48px));
    display: flex; flex-direction: column; gap: var(--sp-3);
    background: var(--bg-surface);
    border: 1px solid var(--border-base); border-radius: var(--radius-lg);
    padding: var(--sp-5);
    box-shadow: 0 24px 64px rgba(0,0,0,0.6);
  }
  .rename-label { font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide); color: var(--text-secondary); }
  .rename-input {
    background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-md);
    padding: 7px 10px; color: var(--text-primary); font-size: var(--text-sm); outline: none;
    transition: border-color var(--t-base);
  }
  .rename-input:focus { border-color: var(--border-strong); }
  .rename-actions { display: flex; justify-content: flex-end; gap: var(--sp-2); }
  .rename-btn-cancel, .rename-btn-confirm {
    padding: 6px 14px; border-radius: var(--radius-md);
    font-family: var(--font-ui); font-size: var(--text-xs); letter-spacing: var(--tracking-wide);
    cursor: pointer; transition: opacity var(--t-base), background var(--t-base);
  }
  .rename-btn-cancel { background: var(--bg-raised); border: 1px solid var(--border-dim); color: var(--text-muted); }
  .rename-btn-cancel:hover { color: var(--text-primary); }
  .rename-btn-confirm { background: var(--accent); border: 1px solid var(--accent); color: var(--accent-contrast, #fff); }
  .rename-btn-confirm:hover { opacity: 0.88; }
</style>
