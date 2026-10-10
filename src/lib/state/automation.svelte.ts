import { tsunagu } from "$lib/server-adapters/tsunagu";
import { settingsState } from "$lib/state/settings.svelte";
import { libraryState, loadLibrary } from "$lib/state/library.svelte";
import { addToast } from "$lib/state/notifications.svelte";
import type {
  AutomationSettings, AutomationSettingsInput, MediaAutomation, MediaAutomationInput, RefreshInterval,
} from "$lib/server-adapters/types";

// Automation rules live on the server, which applies them (delete after read,
// download ahead, auto-download, scheduled updates). This module only mirrors
// them for the settings UI.

class AutomationState {
  settings  = $state<AutomationSettings | null>(null);
  overrides = $state<Record<string, MediaAutomation>>({});
  error     = $state<string | null>(null);
}

export const automationState = new AutomationState();

export async function loadAutomation(): Promise<void> {
  try {
    const [settings, overrides] = await Promise.all([
      tsunagu.automationSettings(),
      tsunagu.mediaAutomationOverrides(),
    ]);
    automationState.settings  = settings;
    automationState.overrides = Object.fromEntries(overrides.map(o => [o.mediaId, o]));
    automationState.error     = null;
  } catch (e) {
    automationState.error = e instanceof Error ? e.message : String(e);
  }
}

export async function saveAutomation(patch: AutomationSettingsInput): Promise<void> {
  const prev = automationState.settings;
  if (prev) automationState.settings = { ...prev, ...patch };
  try {
    automationState.settings = await tsunagu.updateAutomationSettings(patch);
    // Effective per-series rules depend on the globals.
    const overrides = await tsunagu.mediaAutomationOverrides();
    automationState.overrides = Object.fromEntries(overrides.map(o => [o.mediaId, o]));
  } catch (e) {
    automationState.settings = prev;
    addToast({ kind: "error", title: "Couldn't save automation settings", body: e instanceof Error ? e.message : String(e) });
  }
}

export async function loadMediaAutomation(mediaId: string): Promise<MediaAutomation | null> {
  try {
    const m = await tsunagu.mediaAutomation(mediaId);
    automationState.overrides = { ...automationState.overrides, [mediaId]: m };
    return m;
  } catch {
    return null;
  }
}

const OVERRIDE_KEYS = [
  "autoDownload", "downloadAhead", "deleteOnRead", "deleteDelayHours",
  "maxKeepChapters", "pauseUpdates", "refreshInterval",
] as const satisfies readonly (keyof MediaAutomationInput)[];

function overridesOf(m: MediaAutomation | undefined): MediaAutomationInput {
  const out: MediaAutomationInput = {};
  if (!m) return out;
  for (const k of OVERRIDE_KEYS) (out as Record<string, unknown>)[k] = m[k];
  return out;
}

export function hasOverrides(mediaId: string): boolean {
  const m = automationState.overrides[mediaId];
  return !!m && OVERRIDE_KEYS.some(k => m[k] !== null && m[k] !== undefined);
}

/** Sets one per-series override; `null` returns that rule to the global default. */
export async function setMediaOverride<K extends keyof MediaAutomationInput>(
  mediaId: string, key: K, value: MediaAutomationInput[K],
): Promise<void> {
  const input = { ...overridesOf(automationState.overrides[mediaId]), [key]: value };
  try {
    const m = await tsunagu.setMediaAutomation(mediaId, input);
    automationState.overrides = { ...automationState.overrides, [mediaId]: m };
  } catch (e) {
    addToast({ kind: "error", title: "Couldn't save series rule", body: e instanceof Error ? e.message : String(e) });
  }
}

export async function resetMediaAutomation(mediaId?: string): Promise<void> {
  try {
    await tsunagu.resetMediaAutomation(mediaId);
    if (mediaId) await loadMediaAutomation(mediaId);
    else await loadAutomation();
  } catch (e) {
    addToast({ kind: "error", title: "Couldn't reset rules", body: e instanceof Error ? e.message : String(e) });
  }
}

const LEGACY_INTERVAL: Record<string, RefreshInterval | undefined> = {
  daily: "DAILY", weekly: "WEEKLY", manual: "MANUAL",
};

// Before automation moved server-side, rules lived in this client's settings.
// Push them up once, the first time any client talks to a server that has
// never been configured. Only values that differ from the old defaults move,
// so untouched series inherit the global rules.
async function migrateLocalRules(): Promise<void> {
  const s = settingsState.settings;
  const g = s.automationDefaults ?? {};
  const input: AutomationSettingsInput = {};
  if (s.automationEnforceGlobal !== undefined) input.enforceGlobal = s.automationEnforceGlobal;
  if (g.autoDownload !== undefined)     input.autoDownload     = g.autoDownload;
  if (g.downloadAhead !== undefined)    input.downloadAhead    = g.downloadAhead;
  if (g.deleteOnRead !== undefined)     input.deleteOnRead     = g.deleteOnRead;
  if (g.deleteDelayHours !== undefined) input.deleteDelayHours = g.deleteDelayHours;
  if (g.maxKeepChapters !== undefined)  input.maxKeepChapters  = g.maxKeepChapters;
  const interval = g.refreshInterval ? LEGACY_INTERVAL[g.refreshInterval] : undefined;
  if (interval) input.refreshInterval = interval;

  for (const [id, prefs] of Object.entries(s.mangaPrefs ?? {})) {
    if (!/^\d+$/.test(id) || !prefs) continue;
    const ov: MediaAutomationInput = {};
    if (prefs.autoDownload) ov.autoDownload = prefs.autoDownload;
    if (prefs.downloadAhead) ov.downloadAhead = prefs.downloadAhead;
    if (prefs.deleteOnRead) ov.deleteOnRead = prefs.deleteOnRead;
    if (prefs.deleteDelayHours) ov.deleteDelayHours = prefs.deleteDelayHours;
    if (prefs.maxKeepChapters) ov.maxKeepChapters = prefs.maxKeepChapters;
    if (prefs.pauseUpdates) ov.pauseUpdates = prefs.pauseUpdates;
    const ri = prefs.refreshInterval ? LEGACY_INTERVAL[prefs.refreshInterval] : undefined;
    if (ri) ov.refreshInterval = ri;
    if (Object.keys(ov).length) await tsunagu.setMediaAutomation(id, ov).catch(() => {});
  }
  // Saving (even an empty patch) marks the server configured so this runs once.
  automationState.settings = await tsunagu.updateAutomationSettings(input);
}

let appOpenUpdateDone = false;

/** Library update on app open. The server applies the user's "update on
 *  open" setting, a cooldown, and skips paused/manual series. */
async function runAppOpenUpdate(): Promise<void> {
  if (appOpenUpdateDone) return;
  appOpenUpdateDone = true;
  const started = await tsunagu.startLibraryUpdate(undefined, "APP_OPEN");
  if (!started) return;
  libraryState.refreshing = true;
  try {
    let status = await tsunagu.libraryUpdateStatus();
    while (status.running) {
      await new Promise(r => setTimeout(r, 3000));
      status = await tsunagu.libraryUpdateStatus();
    }
    await loadLibrary(true);
    const n = status.newChapterCount;
    if (n > 0) addToast({ kind: "success", title: "Library updated", body: `${n} new chapter${n === 1 ? "" : "s"}` });
  } finally {
    libraryState.refreshing = false;
  }
}

/** Called once the app reaches the server on launch. */
export async function onServerConnected(): Promise<void> {
  try {
    await loadAutomation();
    if (automationState.settings && !automationState.settings.configured) {
      await migrateLocalRules();
      await loadAutomation();
    }
  } catch (e) {
    console.error("automation: load/migrate failed", e);
  }
  try {
    await runAppOpenUpdate();
  } catch (e) {
    console.error("automation: app-open library update failed", e);
  }
}

/** True when marking a chapter of this series read may make the server
 *  delete or queue downloads (so chapter download state should be refetched). */
export function readTriggersAutomation(mediaId: string): boolean {
  const s = automationState.settings;
  if (!s?.enabled) return false;
  const e = automationState.overrides[mediaId]?.effective
    ?? { deleteOnRead: s.deleteOnRead, downloadAhead: s.downloadAhead, maxKeepChapters: s.maxKeepChapters };
  return e.deleteOnRead || e.downloadAhead > 0 || e.maxKeepChapters > 0;
}
