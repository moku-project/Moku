export { fetchPages, resolveUrl, preloadImage, measureAspect, clearPageCache, clearResolvedUrl, clearResolvedUrlCache, getCachedAspect } from "$lib/core/cache/pageCache";

export function buildPageGroups(urls: string[], offsetSpreads: boolean): number[][] {
  const groups: number[][] = [[1]];
  if (offsetSpreads) groups.push([2]);
  let i = offsetSpreads ? 3 : 2;
  while (i <= urls.length) {
    if (i === urls.length) { groups.push([i++]); continue; }
    groups.push([i, i + 1]); i += 2;
  }
  return groups;
}

export interface SpreadLayout {
  left:  number | null;
  right: number | null;
}

/** Display-order pages → left/right slots. A lone page sits on the recto/verso by parity. */
export function spreadLayout(vis: number[], rtl: boolean): SpreadLayout {
  if (vis.length >= 2) return { left: vis[0], right: vis[1] };
  const pg = vis[0];
  if (pg == null) return { left: null, right: null };
  const odd = pg % 2 === 1;
  const onRight = rtl ? !odd : odd;
  return onRight ? { left: null, right: pg } : { left: pg, right: null };
}
