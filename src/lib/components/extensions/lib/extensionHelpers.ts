import type { Extension } from "$lib/server-adapters/types";
import type { ContentTypeFilter } from "$lib/types/settings";
import { canonicalLang, sameLang, LANG_ALL } from "$lib/core/lang";
import { t, type MessageKey } from "$lib/i18n/index.svelte";

export type Filter = "installed" | "available" | "updates" | "all";
export type Panel  = null | "apk" | "repos";
export type { ContentTypeFilter } from "$lib/types/settings";

export function baseName(name: string): string {
  return name.replace(/\s*\([A-Z0-9-]{2,10}\)\s*$/, "").trim();
}

export function matchesFilter(ext: Extension, filter: Filter): boolean {
  if (filter === "installed") return ext.installed;
  if (filter === "available") return !ext.installed;
  if (filter === "updates")   return ext.needsUpdate ?? false;
  return true;
}

export interface ExtensionGroup {
  base:     string;
  primary:  Extension;
  variants: Extension[];
}

export function groupExtensions(
  extensions: Extension[],
  preferredLang: string | undefined,
): ExtensionGroup[] {
  const map = new Map<string, Extension[]>();
  for (const ext of extensions) {
    const key = `${ext.contentType}::${baseName(ext.name)}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ext);
  }
  const pref = canonicalLang(preferredLang);
  return Array.from(map.values()).map((all) => {
    const primary =
      (pref !== LANG_ALL ? all.find((v) => sameLang(v.lang, pref)) : undefined) ??
      all.find((v) => sameLang(v.lang, LANG_ALL)) ??
      all.find((v) => sameLang(v.lang, "en")) ??
      all[0];
    return { base: baseName(primary.name), primary, variants: all.filter((v) => v.packageName !== primary.packageName) };
  });
}

export function validateUrl(url: string, ext?: string): string | null {
  if (!url.startsWith("http://") && !url.startsWith("https://"))
    return t("extensions.validation.urlScheme");
  if (ext && !url.endsWith(ext))
    return t("extensions.validation.urlFileType", { ext });
  return null;
}

export const FILTERS: { id: Filter; label: MessageKey }[] = [
  { id: "installed", label: "extensions.filters.installed" },
  { id: "available", label: "extensions.filters.available" },
  { id: "updates",   label: "extensions.filters.updates"   },
  { id: "all",       label: "common.all"                 },
];

export const CONTENT_TYPES: { id: ContentTypeFilter; label: MessageKey }[] = [
  { id: "all",    label: "nav.contentAll"    },
  { id: "MANGA",  label: "nav.contentManga"  },
  { id: "NOVEL",  label: "nav.contentNovels" },
  { id: "ANIME",  label: "nav.contentAnime"  },
];