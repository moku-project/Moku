<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { ArrowSquareOut, CheckCircle, CircleNotch, LinkBreak, ArrowClockwise, Copy, TrayArrowDown } from "phosphor-svelte";
  import { platformService } from "$lib/platform-service";
  import { addToast } from "$lib/state/notifications.svelte";
  import { trackerState } from "$lib/state/trackers.svelte";
  import { tsunagu } from "$lib/server-adapters/tsunagu";
  import TrackerLogo from "$lib/components/tracking/TrackerLogo.svelte";
  import { t } from "$lib/i18n/index.svelte";

  interface Props { importKey?: string | null }
  let { importKey = $bindable(null) }: Props = $props();

  let drafts  = $state<Record<string, string>>({});
  let busy    = $state<Record<string, boolean>>({});
  let polling = $state<Record<string, boolean>>({});

  let alive = true;
  onMount(() => { trackerState.load(); });
  onDestroy(() => { alive = false; });

  function setDraft(key: string, v: string) { drafts = { ...drafts, [key]: v }; }
  function setBusy(key: string, v: boolean) { busy = { ...busy, [key]: v }; }

  async function openAuth(url: string) {
    try {
      await platformService.openExternal(url);
    } catch {
      try { window.open(url, "_blank", "noopener"); } catch { }
    }
  }

  async function copyAuth(url: string) {
    try { await navigator.clipboard.writeText(url); addToast({ kind: "success", title: t("settings.tracking.linkCopied") }); }
    catch { }
  }

  async function submitToken(key: string) {
    const raw = (drafts[key] ?? "").trim();
    if (!raw) return;
    setBusy(key, true);
    try {
      const updated = await tsunagu.trackerLogin(key, raw);
      trackerState.patch(updated);
      setDraft(key, "");
      addToast({ kind: "success", title: t("settings.tracking.connected", { name: updated.name }), body: updated.username ?? "" });
    } catch (e: any) {
      addToast({ kind: "error", title: t("settings.tracking.connectFailed"), body: e?.message ?? String(e) });
    } finally {
      setBusy(key, false);
    }
  }

  async function authorize(key: string, url: string) {
    await openAuth(url);
    polling = { ...polling, [key]: true };
    const until = Date.now() + 120_000;
    while (alive && polling[key] && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 2500));
      if (!alive || !polling[key]) break;
      await trackerState.load(true);
      if (trackerState.byKey(key)?.isLoggedIn) {
        addToast({ kind: "success", title: t("settings.tracking.connected", { name: trackerState.byKey(key)?.name ?? t("settings.tracking.trackerFallback") }) });
        break;
      }
    }
    polling = { ...polling, [key]: false };
  }

  function noOauthClientParts(name: string): [string, string] {
    const [before, after = ""] = t("settings.tracking.noOauthClient", { name, env: "\u0000" }).split("\u0000");
    return [before, after];
  }

  async function disconnect(key: string) {
    setBusy(key, true);
    try {
      await tsunagu.trackerLogout(key);
      await trackerState.load(true);
    } catch (e: any) {
      addToast({ kind: "error", title: t("settings.tracking.disconnectFailed"), body: e?.message ?? String(e) });
    } finally {
      setBusy(key, false);
    }
  }
</script>

<div class="s-panel">
  <div class="s-section">
    <div class="s-section-title">
      <span>{t("settings.tracking.title")}</span>
      <button class="trk-reload" title={t("settings.tracking.reload")} onclick={() => trackerState.load(true)} aria-label={t("settings.tracking.reload")}>
        <ArrowClockwise size={13} weight="regular" class={trackerState.loading ? "anim-spin" : ""} />
      </button>
    </div>

    <div class="s-section-body">
      {#if trackerState.loading && trackerState.list.length === 0}
        <p class="s-empty"><CircleNotch size={14} weight="light" class="anim-spin" /> {t("common.loading")}</p>
      {:else if trackerState.error}
        <p class="s-empty" style="color:var(--color-error)">{trackerState.error}</p>
      {:else if trackerState.list.length === 0}
        <p class="s-empty">{t("settings.tracking.empty")}</p>
      {:else}
        {#each trackerState.list as tr (tr.key)}
          {@const isMal = tr.key === "mal" || tr.key === "myanimelist"}
          <div class="trk">
            <div class="trk-top">
              <TrackerLogo trackerKey={tr.key} iconUrl={tr.iconUrl} size={22} />
              <div class="trk-id">
                <span class="trk-name">{tr.name}</span>
                {#if !isMal && tr.isLoggedIn && tr.username}
                  <span class="trk-user">{t("settings.tracking.signedInAs", { username: tr.username })}</span>
                {/if}
              </div>
              {#if isMal}
                <span class="trk-badge trk-badge-off">{t("settings.tracking.comingSoon")}</span>
              {:else if !tr.configured}
                <span class="trk-badge trk-badge-off">{t("settings.tracking.notConfigured")}</span>
              {:else if tr.isLoggedIn}
                <span class="trk-badge trk-badge-on"><CheckCircle size={11} weight="fill" /> {t("settings.tracking.statusConnected")}</span>
              {:else}
                <span class="trk-badge">{t("settings.tracking.notConnected")}</span>
              {/if}
            </div>

            {#if isMal}
              <p class="s-desc">{t("settings.tracking.malUnavailable")}</p>

            {:else if !tr.configured}
              {@const oauthParts = noOauthClientParts(tr.name)}
              <p class="s-desc">{oauthParts[0]}<code>TSUNAGU_ANILIST_CLIENT_ID</code>{oauthParts[1]}</p>

            {:else if tr.isLoggedIn}
              <div class="trk-actions">
                {#if tr.key === "anilist"}
                  <button class="s-btn s-btn-accent" onclick={() => (importKey = tr.key)}>
                    <TrayArrowDown size={12} weight="light" /> {t("settings.tracking.importFrom", { name: tr.name })}
                  </button>
                {/if}
                <button class="s-btn s-btn-danger" disabled={busy[tr.key]} onclick={() => disconnect(tr.key)}>
                  <LinkBreak size={12} weight="light" /> {t("settings.tracking.disconnect")}
                </button>
              </div>

            {:else}
              <p class="s-desc">{t("settings.tracking.authHint")}</p>
              <div class="trk-connect">
                <div class="trk-row">
                  {#if polling[tr.key]}
                    <button class="s-btn s-btn-accent" onclick={() => (polling = { ...polling, [tr.key]: false })}>
                      <CircleNotch size={12} weight="light" class="anim-spin" /> {t("settings.tracking.waitingCancel")}
                    </button>
                  {:else}
                    <button class="s-btn s-btn-accent" onclick={() => tr.authUrl && authorize(tr.key, tr.authUrl)} disabled={!tr.authUrl}>
                      <ArrowSquareOut size={12} weight="light" /> {t("settings.tracking.authorize", { name: tr.name })}
                    </button>
                  {/if}
                  {#if tr.authUrl}
                    <button class="s-btn trk-icon-btn" title={t("settings.tracking.copyLink")} onclick={() => copyAuth(tr.authUrl!)} aria-label={t("settings.tracking.copyAuthLink")}>
                      <Copy size={12} weight="light" />
                    </button>
                  {/if}
                </div>
                <div class="trk-row">
                  <input
                    class="s-input full mono"
                    placeholder={t("settings.tracking.tokenPlaceholder")}
                    value={drafts[tr.key] ?? ""}
                    oninput={(e) => setDraft(tr.key, (e.currentTarget as HTMLInputElement).value)}
                    onkeydown={(e) => { if (e.key === "Enter") submitToken(tr.key); }}
                  />
                  <button class="s-btn s-btn-accent" disabled={busy[tr.key] || !(drafts[tr.key] ?? "").trim()} onclick={() => submitToken(tr.key)}>
                    {busy[tr.key] ? "…" : t("settings.tracking.connect")}
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .trk-reload {
    display: flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; margin: -4px 0; border-radius: var(--radius-sm);
    border: none; background: none; color: var(--text-faint); cursor: pointer;
    transition: color var(--t-fast), background var(--t-fast);
  }
  .trk-reload:hover { color: var(--text-primary); background: var(--bg-surface); }

  .trk {
    display: flex; flex-direction: column; gap: var(--sp-3);
    padding: var(--sp-4);
    border-bottom: 1px solid var(--border-dim);
  }
  .trk:last-child { border-bottom: none; }

  .trk-top { display: flex; align-items: center; gap: var(--sp-3); }
  .trk-id  { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
  .trk-name { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); }
  .trk-user {
    font-family: var(--font-ui); font-size: var(--text-2xs); color: var(--text-faint);
    letter-spacing: var(--tracking-wide);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .trk-badge {
    display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;
    font-family: var(--font-ui); font-size: var(--text-2xs); letter-spacing: var(--tracking-wide);
    padding: 3px 8px; border-radius: var(--radius-full);
    background: var(--bg-surface); color: var(--text-faint); border: 1px solid var(--border-dim);
  }
  .trk-badge-on  { color: var(--accent-fg); background: var(--accent-muted); border-color: var(--accent-dim); }
  .trk-badge-off { color: var(--text-faint); }

  .trk-connect { display: flex; flex-direction: column; gap: var(--sp-2); }
  .trk-row     { display: flex; align-items: center; gap: var(--sp-2); }
  .trk-actions { display: flex; gap: var(--sp-2); }
  .trk-icon-btn { padding: 5px 10px; }

  .s-desc code {
    font-family: var(--font-mono, monospace); font-size: 0.9em;
    background: var(--bg-surface); border: 1px solid var(--border-dim);
    border-radius: 3px; padding: 0 3px;
  }
</style>
