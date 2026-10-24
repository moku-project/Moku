import { tsunagu } from "$lib/server-adapters/tsunagu";
import { seriesState } from "$lib/state/series.svelte";

type ProgressOpts = { completed?: boolean; positionSeconds?: number; durationSeconds?: number };

function activeMediaId(): string | null {
  const manga = seriesState.activeManga;
  return manga ? (manga.mediaId ?? manga.libraryEntryId ?? manga.id) : null;
}

export function reportProgress(chapterId: string, fraction: number, opts: ProgressOpts = {}, mediaId = activeMediaId()): void {
  if (!mediaId) return;
  tsunagu.updateReadingProgress({
    libraryEntryId: mediaId,
    chapterId,
    progress: Math.max(0, Math.min(1, fraction)),
    completed: opts.completed,
    positionSeconds: opts.positionSeconds,
    durationSeconds: opts.durationSeconds,
  }).catch(console.error);
}

export function throttledProgressReporter(minGapMs = 4000) {
  let last = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let send: (() => void) | null = null;

  const fire = () => {
    if (pending) { clearTimeout(pending); pending = null; }
    const s = send;
    send = null;
    if (!s) return;
    last = Date.now();
    s();
  };

  const report = (chapterId: string, fraction: number, opts?: ProgressOpts) => {
    const mediaId = activeMediaId();
    send = () => reportProgress(chapterId, fraction, opts, mediaId);
    const wait = minGapMs - (Date.now() - last);
    if (wait <= 0) fire();
    else if (!pending) pending = setTimeout(fire, wait);
  };
  return Object.assign(report, { flush: fire });
}
