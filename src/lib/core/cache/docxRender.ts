import * as mammoth from "mammoth";
import { pageServerUrl } from "$lib/core/cache/pageCache";

export async function renderDocxChapter(mediaId: string, chapterId: string): Promise<string> {
  const base = pageServerUrl();
  const res  = await fetch(`${base}/content/${encodeURIComponent(mediaId)}/${encodeURIComponent(chapterId)}/docx`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  const { value } = await mammoth.convertToHtml({ arrayBuffer });
  return value;
}
