import { tsunagu } from "$lib/server-adapters/tsunagu";
import type { ContentType, Tracker } from "$lib/server-adapters/types";
import { t } from "$lib/i18n/index.svelte";

export const TRACK_STATUSES: { value: number; label: string }[] = [
  { value: 1, get label() { return t("notices.trackStatus.reading"); } },
  { value: 2, get label() { return t("notices.trackStatus.planToRead"); } },
  { value: 3, get label() { return t("notices.trackStatus.completed"); } },
  { value: 4, get label() { return t("notices.trackStatus.onHold"); } },
  { value: 5, get label() { return t("notices.trackStatus.dropped"); } },
  { value: 6, get label() { return t("notices.trackStatus.rereading"); } },
];

const TRACK_STATUSES_ANIME: { value: number; label: string }[] = [
  { value: 1, get label() { return t("notices.trackStatus.watching"); } },
  { value: 2, get label() { return t("notices.trackStatus.planToWatch"); } },
  { value: 3, get label() { return t("notices.trackStatus.completed"); } },
  { value: 4, get label() { return t("notices.trackStatus.onHold"); } },
  { value: 5, get label() { return t("notices.trackStatus.dropped"); } },
  { value: 6, get label() { return t("notices.trackStatus.rewatching"); } },
];

export function statusesFor(
  tracker?: Tracker | null,
  contentType?: ContentType | string | null,
): { value: number; label: string }[] {
  const anime = contentType === "ANIME";
  const opts = tracker?.statusOptions;
  if (opts && opts.length) {
    return opts.map((s) => ({ value: s.value, label: anime ? s.animeName || s.name : s.name }));
  }
  return anime ? TRACK_STATUSES_ANIME : TRACK_STATUSES;
}

export function statusLabel(
  value: number,
  tracker?: Tracker | null,
  contentType?: ContentType | string | null,
): string {
  return statusesFor(tracker, contentType).find((s) => s.value === value)?.label ?? String(value);
}

class TrackerState {
  list    = $state<Tracker[]>([]);
  loading = $state(false);
  error   = $state<string | null>(null);

  private loaded = false;
  private inFlight: Promise<void> | null = null;

  get configured(): boolean  { return this.list.some(tr => tr.configured); }
  get anyLoggedIn(): boolean { return this.list.some(tr => tr.isLoggedIn); }

  byKey(key: string): Tracker | undefined {
    return this.list.find(tr => tr.key === key);
  }

  async load(force = false): Promise<void> {
    if (this.inFlight) return this.inFlight;
    if (!force && this.loaded) return;
    this.loading = true;
    this.error = null;
    this.inFlight = (async () => {
      try {
        this.list = await tsunagu.trackers();
        this.loaded = true;
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e);
      } finally {
        this.loading = false;
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  patch(tracker: Tracker) {
    this.list = this.list.map(x => x.key === tracker.key ? tracker : x);
  }
}

export const trackerState = new TrackerState();
