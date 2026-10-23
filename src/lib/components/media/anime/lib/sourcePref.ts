import type { EpisodeStreamSource } from "./episodeSource";

// A saved source is a label like "HD-1 - Sub - 1080p". Most extensions keep
// labels stable across episodes, but some add per-episode details (bitrate,
// frame size) or rename servers, so when the exact label is gone the closest
// source with the same audio wins: same resolution first, then same host.

interface SourceTraits {
  audio:      "sub" | "dub" | "raw" | null;
  resolution: number;
  host:       string;
}

const AUDIO = /\b(?:hard[ -]?sub|soft[ -]?sub|sub(?:bed|s)?|dub(?:bed)?|raw)\b/gi;

function traits(label: string, resolution = 0): SourceTraits {
  const a = label.match(AUDIO)?.[0].toLowerCase() ?? null;
  const host = label
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(AUDIO, " ")
    .replace(/\b\d{3,4}p\b/gi, " ")
    .replace(/\b\d+(?:\.\d+)?\s*[kmg]?b(?:\/s|ps)?\b/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return {
    audio:      !a ? null : a.includes("dub") ? "dub" : a === "raw" ? "raw" : "sub",
    resolution: Number(label.match(/\b(\d{3,4})p\b/i)?.[1] ?? 0) || resolution,
    host,
  };
}

/** Index of the source that best matches a saved label, or -1 if none does. */
export function pickSavedSource(sources: EpisodeStreamSource[], saved: string | undefined): number {
  if (!saved) return -1;
  const exact = sources.findIndex(s => s.label === saved);
  if (exact >= 0) return exact;

  const want = traits(saved);
  let best = -1;
  let bestScore = -Infinity;
  sources.forEach((s, i) => {
    const t = traits(s.label, s.resolution);
    if (want.audio && t.audio && t.audio !== want.audio) return;
    const sameAudio = !!want.audio && t.audio === want.audio;
    const sameHost  = !!want.host && t.host === want.host;
    const sameRes   = !!want.resolution && t.resolution === want.resolution;
    if (!sameAudio && !sameHost && !sameRes) return;
    const score = (sameAudio ? 10_000 : 0)
      - (want.resolution && t.resolution ? Math.abs(t.resolution - want.resolution) : 0)
      + (sameHost ? 50 : 0)
      + t.resolution / 10_000;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}
