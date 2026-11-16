<script lang="ts">
  import { onMount }    from "svelte";
  import { X, ArrowCounterClockwise } from "phosphor-svelte";
  import { automationState, loadAutomation, loadMediaAutomation, setMediaOverride, resetMediaAutomation, hasOverrides } from "$lib/state/automation.svelte";
  import { libraryState }     from "$lib/state/library.svelte";
  import { resolvedCover }    from "$lib/core/cover/coverResolver";
  import Thumbnail            from "$lib/components/shared/manga/Thumbnail.svelte";
  import type { AutomationRules, MediaAutomationInput, RefreshInterval } from "$lib/server-adapters/types";
  import type { Manga }       from "$lib/types";
  import { t, type MessageKey } from "$lib/i18n/index.svelte";

  let { mangaId, mediaId, manga: mangaProp = null, onClose }: {
    mangaId:  string;
    /** Server media id the rules belong to. */
    mediaId:  string;
    manga?:   Manga | null;
    onClose:  () => void;
  } = $props();

  const DOWNLOAD_AHEAD_OPTIONS: { value: number; label?: MessageKey }[] = [
    { value: 0,  label: "common.off" },
    { value: 2  },
    { value: 5  },
    { value: 10 },
  ];

  const MAX_KEEP_OPTIONS: { value: number; label?: MessageKey }[] = [
    { value: 0,  label: "common.off" },
    { value: 5  },
    { value: 10 },
    { value: 25 },
  ];

  const DELETE_DELAY_OPTIONS: { value: number; label: MessageKey }[] = [
    { value: 0,   label: "series.automation.delayNow"  },
    { value: 24,  label: "series.automation.delayDay"  },
    { value: 168, label: "series.automation.delayWeek" },
  ];

  const REFRESH_INTERVAL_OPTIONS: { value: RefreshInterval | null; label: MessageKey }[] = [
    { value: null,     label: "common.default"                },
    { value: "DAILY",  label: "series.automation.intervalDaily"  },
    { value: "WEEKLY", label: "series.automation.intervalWeekly" },
    { value: "MANUAL", label: "series.automation.intervalManual" },
  ];

  // Values shown are the effective rules (override or inherited global); picking
  // one stores an override for this series on the server.
  const ma  = $derived(automationState.overrides[mediaId]);
  const get = <K extends keyof AutomationRules>(key: K): AutomationRules[K] | undefined => ma?.effective[key];
  const set = <K extends keyof MediaAutomationInput>(key: K, value: MediaAutomationInput[K]) => void setMediaOverride(mediaId, key, value);
  const custom   = $derived(hasOverrides(mediaId));
  const disabled = $derived(automationState.settings ? !automationState.settings.enabled : false);
  const enforced = $derived(automationState.settings?.enforceGlobal ?? false);

  onMount(() => {
    if (!automationState.settings) void loadAutomation();
    if (mediaId) void loadMediaAutomation(mediaId);
  });

  const manga    = $derived(libraryState.items.find(m => m.id === mangaId) ?? mangaProp);
  const coverSrc = $derived(manga ? resolvedCover(manga.id, manga.thumbnailUrl) : null);

  function onBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }
</script>

<div class="backdrop" role="presentation" tabindex="-1" onmousedown={onBackdrop}>
  <div class="modal" role="dialog" aria-modal="true" aria-label={t("series.header.automation")}>

    <div class="cover-col">
      {#if coverSrc}
        <div class="cover-wrap">
          <Thumbnail src={coverSrc} alt={manga?.title} class="cover" contentType={manga?.contentType} />
        </div>
      {:else}
        <div class="cover-placeholder"></div>
      {/if}
    </div>

    <div class="content">
      <div class="content-header">
        <div class="title-block">
          <span class="title">{manga?.title ?? t("series.header.automation")}</span>
          <span class="subtitle">{custom ? t("series.automation.customRules") : t("series.automation.usingGlobal")}</span>
        </div>
        {#if custom}
          <button class="reset-btn" onclick={() => resetMediaAutomation(mediaId)} title={t("series.automation.resetHint")}>
            <ArrowCounterClockwise size={12} /> {t("common.reset")}
          </button>
        {/if}
        <button class="close-btn" onclick={onClose} aria-label={t("common.close")}>
          <X size={16} weight="light" />
        </button>
      </div>

      <div class="content-body">
        {#if !mediaId}
          <p class="notice">{t("series.automation.needsLibrary")}</p>
        {:else if disabled}
          <p class="notice">{t("series.automation.disabledNotice")}</p>
        {:else if enforced}
          <p class="notice">{t("series.automation.enforcedNotice")}</p>
        {/if}

        <p class="section-label">{t("series.automation.sectionDownloads")}</p>

        <div class="auto-row">
          <div class="auto-info">
            <span class="auto-label">{t("series.automation.autoDownload")}</span>
            <span class="auto-desc">{t("series.automation.autoDownloadDesc")}</span>
          </div>
          <button
            role="switch"
            aria-checked={get("autoDownload")}
            aria-label={t("series.automation.autoDownload")}
            class="auto-toggle"
            class:auto-toggle-on={get("autoDownload")}
            onclick={() => set("autoDownload", !get("autoDownload"))}
          ><span class="auto-toggle-thumb"></span></button>
        </div>

        <div class="auto-row auto-row-col">
          <div class="auto-info">
            <span class="auto-label">{t("series.automation.downloadAhead")}</span>
            <span class="auto-desc">{t("series.automation.downloadAheadDesc")}</span>
          </div>
          <div class="auto-chip-group">
            {#each DOWNLOAD_AHEAD_OPTIONS as opt}
              <button
                class="auto-chip"
                class:auto-chip-on={get("downloadAhead") === opt.value}
                onclick={() => set("downloadAhead", opt.value)}
              >{opt.label ? t(opt.label) : opt.value}</button>
            {/each}
          </div>
        </div>

        <div class="auto-row auto-row-col">
          <div class="auto-info">
            <span class="auto-label">{t("series.automation.maxKeep")}</span>
            <span class="auto-desc">{t("series.automation.maxKeepDesc")}</span>
          </div>
          <div class="auto-chip-group">
            {#each MAX_KEEP_OPTIONS as opt}
              <button
                class="auto-chip"
                class:auto-chip-on={get("maxKeepChapters") === opt.value}
                onclick={() => set("maxKeepChapters", opt.value)}
              >{opt.label ? t(opt.label) : opt.value}</button>
            {/each}
          </div>
        </div>

        <div class="divider"></div>

        <p class="section-label">{t("series.automation.sectionOnRead")}</p>

        <div class="auto-row">
          <div class="auto-info">
            <span class="auto-label">{t("series.automation.deleteOnRead")}</span>
            <span class="auto-desc">{t("series.automation.deleteOnReadDesc")}</span>
          </div>
          <button
            role="switch"
            aria-checked={get("deleteOnRead")}
            aria-label={t("series.automation.deleteOnRead")}
            class="auto-toggle"
            class:auto-toggle-on={get("deleteOnRead")}
            onclick={() => set("deleteOnRead", !get("deleteOnRead"))}
          ><span class="auto-toggle-thumb"></span></button>
        </div>

        {#if get("deleteOnRead")}
          <div class="auto-row auto-row-sub">
            <span class="auto-label">{t("series.automation.deleteDelay")}</span>
            <div class="auto-chip-group">
              {#each DELETE_DELAY_OPTIONS as opt}
                <button
                  class="auto-chip"
                  class:auto-chip-on={get("deleteDelayHours") === opt.value}
                  onclick={() => set("deleteDelayHours", opt.value)}
                >{t(opt.label)}</button>
              {/each}
            </div>
          </div>
        {/if}

        <div class="divider"></div>

        <p class="section-label">{t("series.automation.sectionUpdates")}</p>

        <div class="auto-row">
          <div class="auto-info">
            <span class="auto-label">{t("series.automation.pauseUpdates")}</span>
            <span class="auto-desc">{t("series.automation.pauseUpdatesDesc")}</span>
          </div>
          <button
            role="switch"
            aria-checked={get("pauseUpdates")}
            aria-label={t("series.automation.pauseUpdates")}
            class="auto-toggle"
            class:auto-toggle-on={get("pauseUpdates")}
            onclick={() => set("pauseUpdates", !get("pauseUpdates"))}
          ><span class="auto-toggle-thumb"></span></button>
        </div>

        <div class="auto-row auto-row-col">
          <div class="auto-info">
            <span class="auto-label">{t("series.automation.refreshInterval")}</span>
            <span class="auto-desc">{t("series.automation.refreshIntervalDesc")}</span>
          </div>
          <div class="auto-chip-group">
            {#each REFRESH_INTERVAL_OPTIONS as opt}
              <button
                class="auto-chip"
                class:auto-chip-on={(ma?.refreshInterval ?? null) === opt.value}
                onclick={() => set("refreshInterval", opt.value)}
              >{t(opt.label)}</button>
            {/each}
          </div>
        </div>

      </div>
    </div>

  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 300;
    background: rgba(0,0,0,0.6);
    display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.1s ease both;
  }

  .modal {
    display: flex; flex-direction: row;
    width: 600px; max-width: calc(100vw - var(--sp-6));
    height: 480px; max-height: 85vh;
    background: var(--bg-surface); border: 1px solid var(--border-base);
    border-radius: var(--radius-xl); overflow: hidden;
    box-shadow: 0 0 0 1px var(--border-dim), 0 24px 64px rgba(0,0,0,0.6);
    animation: scaleIn 0.15s ease both;
  }

  .cover-col {
    width: 200px; flex-shrink: 0;
    background: var(--bg-raised);
    border-right: 1px solid var(--border-dim);
    display: flex; flex-direction: column;
    padding: var(--sp-4);
    overflow: hidden;
  }

  .cover-wrap { position: relative; width: 100%; flex: 1; min-height: 0; }

  :global(.cover) {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: cover; object-position: center top;
    border-radius: var(--radius-md);
    border: 1px solid var(--border-dim);
    display: block;
  }

  .cover-placeholder {
    position: absolute; inset: 0;
    background: var(--bg-overlay);
    border-radius: var(--radius-md);
  }

  .content {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column;
    overflow: hidden;
    border-left: 1px solid var(--border-dim);
  }

  .content-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: var(--sp-4); padding: var(--sp-5) var(--sp-6) var(--sp-4);
    border-bottom: 1px solid var(--border-dim);
    flex-shrink: 0;
  }

  .title-block { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--sp-1); }

  .title {
    font-size: var(--text-base); font-weight: var(--weight-medium);
    color: var(--text-primary); letter-spacing: var(--tracking-tight);
    line-height: var(--leading-tight);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .subtitle {
    font-family: var(--font-ui); font-size: var(--text-xs);
    color: var(--text-faint); letter-spacing: var(--tracking-wide);
  }

  .close-btn {
    display: flex; align-items: center; justify-content: center;
    width: 28px; height: 28px; flex-shrink: 0;
    border-radius: var(--radius-sm); color: var(--text-faint);
    background: none; border: none; cursor: pointer;
    transition: color var(--t-base), background var(--t-base);
  }
  .close-btn:hover { color: var(--text-muted); background: var(--bg-raised); }

  .content-body {
    flex: 1; overflow-y: auto; scrollbar-width: none;
    display: flex; flex-direction: column; gap: var(--sp-3);
    padding: var(--sp-5) var(--sp-6);
  }
  .content-body::-webkit-scrollbar { display: none; }

  .section-label {
    font-family: var(--font-ui); font-size: var(--text-2xs);
    letter-spacing: var(--tracking-widest); color: var(--text-faint);
    text-transform: uppercase; margin: 0;
  }

  .reset-btn { display: flex; align-items: center; gap: 4px; font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 3px 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); background: none; color: var(--text-muted); cursor: pointer; flex-shrink: 0; }
  .reset-btn:hover { color: var(--text-primary); border-color: var(--border-strong); background: var(--bg-raised); }
  .notice { margin: 0; font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-muted); background: var(--bg-raised); border: 1px solid var(--border-dim); border-radius: var(--radius-sm); padding: var(--sp-2) var(--sp-3); line-height: var(--leading-snug); }

  .divider { height: 1px; background: var(--border-dim); margin: var(--sp-1) 0; }

  .auto-row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
  .auto-row-col { flex-direction: column; align-items: flex-start; gap: var(--sp-2); }
  .auto-row-sub { padding-left: var(--sp-3); border-left: 2px solid var(--border-dim); }

  .auto-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .auto-label { font-family: var(--font-ui); font-size: var(--text-xs); color: var(--text-muted); letter-spacing: var(--tracking-wide); }
  .auto-desc  { font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); line-height: var(--leading-snug); }

  .auto-toggle { width: 28px; height: 16px; border-radius: var(--radius-full); border: 1px solid var(--border-strong); background: var(--bg-overlay); cursor: pointer; padding: 0; flex-shrink: 0; position: relative; transition: background var(--t-base), border-color var(--t-base); }
  .auto-toggle-on { background: var(--accent); border-color: var(--accent); }
  .auto-toggle-thumb { position: absolute; top: 1px; left: 1px; width: 12px; height: 12px; border-radius: 50%; background: var(--text-faint); transition: transform var(--t-base), background var(--t-base); }
  .auto-toggle-on .auto-toggle-thumb { transform: translateX(12px); background: var(--bg-base); }

  .auto-chip-group { display: flex; flex-direction: row; gap: 4px; flex-wrap: wrap; }
  .auto-chip { font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide); padding: 2px 7px; border-radius: var(--radius-sm); border: 1px solid var(--border-dim); background: none; color: var(--text-faint); cursor: pointer; white-space: nowrap; transition: color var(--t-base), border-color var(--t-base), background var(--t-base); }
  .auto-chip:hover { color: var(--text-muted); border-color: var(--border-strong); background: var(--bg-raised); }
  .auto-chip-on { color: var(--accent-fg); border-color: var(--accent-dim); background: var(--accent-muted); }

  @keyframes fadeIn  { from { opacity: 0 }                         to { opacity: 1 } }
  @keyframes scaleIn { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }
</style>