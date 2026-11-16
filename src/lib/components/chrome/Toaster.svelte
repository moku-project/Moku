<script lang="ts">
  import { tick } from 'svelte'
  import { dismissToast } from '$lib/state/notifications.svelte'
  import { t, type MessageKey } from '$lib/i18n/index.svelte'
  import type { Toast } from '$lib/state/notifications.svelte'

  let { toasts }: { toasts: Toast[] } = $props()

  const EXIT_MS = 280
  const leaving = new Set<string>()
  const timers  = new Map<string, ReturnType<typeof setTimeout>>()

  let detail = $state<Toast | null>(null)

  function schedule(toast: Toast) {
    if (timers.has(toast.id)) return
    const dur = toast.duration ?? 3500
    if (dur === 0) return
    timers.set(toast.id, setTimeout(() => dismiss(toast.id), dur))
  }

  async function dismiss(id: string) {
    if (leaving.has(id)) return
    leaving.add(id)
    if (timers.has(id)) { clearTimeout(timers.get(id)!); timers.delete(id) }
    await tick()
    const el = document.querySelector<HTMLElement>(`[data-toast-id="${id}"]`)
    if (!el) { finalize(id); return }
    el.style.setProperty('--exit-h', `${el.offsetHeight}px`)
    el.classList.add('leaving')
    setTimeout(() => finalize(id), EXIT_MS)
  }

  function finalize(id: string) {
    leaving.delete(id)
    if (detail?.id === id) return
    dismissToast(id)
  }

  function openDetail(e: MouseEvent, toast: Toast) {
    e.preventDefault()
    detail = toast
    if (timers.has(toast.id)) { clearTimeout(timers.get(toast.id)!); timers.delete(toast.id) }
  }

  function closeDetail() {
    if (detail) dismiss(detail.id)
    detail = null
  }

  $effect(() => {
    const activeIds = new Set(toasts.map(toast => toast.id))
    toasts.forEach(schedule)
    for (const [id, timer] of timers) {
      if (!activeIds.has(id)) { clearTimeout(timer); timers.delete(id) }
    }
    if (detail && !activeIds.has(detail.id)) detail = null
  })

  const kindLabels: Record<Toast['kind'], MessageKey> = {
    success:  'chrome.toaster.kindSuccess',
    error:    'chrome.toaster.kindError',
    info:     'chrome.toaster.kindInfo',
    download: 'chrome.toaster.kindDownload',
  }

  const icons: Record<Toast['kind'], string> = {
    success:  'M20 6L9 17l-5-5',
    error:    'M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
    info:     'M12 16v-4M12 8h.01M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z',
    download: 'M12 3v13M7 11l5 5 5-5M5 21h14',
  }
</script>

{#if toasts.length}
  <div class="toaster" aria-live="polite">
    {#each toasts as toast (toast.id)}
      <button
        class="toast toast-{toast.kind}"
        data-toast-id={toast.id}
        aria-label="{toast.title}{toast.body ? ': ' + toast.body : ''}"
        onclick={() => dismiss(toast.id)}
        oncontextmenu={(e) => openDetail(e, toast)}
      >
        <div class="accent-bar"></div>
        <span class="icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d={icons[toast.kind]}/>
          </svg>
        </span>
        <div class="body">
          <p class="message">{toast.title}</p>
          <p class="sub">{toast.body ?? '\u00a0'}</p>
        </div>
      </button>
    {/each}
  </div>
{/if}

{#if detail}
  <div
    class="detail-backdrop"
    role="presentation"
    onclick={() => closeDetail()}
    onkeydown={(e) => { if (e.key === 'Escape') closeDetail() }}
  >
    <div
      class="detail-panel detail-{detail.kind}"
      role="dialog"
      aria-modal="true"
      aria-label={detail.title}
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <div class="detail-accent"></div>
      <div class="detail-body">
        <div class="detail-header">
          <span class="detail-kind">{t(kindLabels[detail.kind])}</span>
          <button class="detail-close" onclick={closeDetail} aria-label={t('common.close')}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <p class="detail-message">{detail.title}</p>
        {#if detail.body}
          <pre class="detail-text">{detail.body}</pre>
        {/if}
        <div class="detail-actions">
          <button class="detail-copy" onclick={() => navigator.clipboard.writeText(`${detail!.title}${detail!.body ? '\n' + detail!.body : ''}`)}>
            {t('common.copy')}
          </button>
          <button class="detail-dismiss" onclick={closeDetail}>
            {t('chrome.toaster.dismiss')}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .toaster { position:fixed; bottom:var(--sp-5); right:var(--sp-5); z-index:9999; display:flex; flex-direction:column; gap:6px; pointer-events:none; }

  .toast {
    display:flex; align-items:center; gap:12px; padding:14px var(--sp-4) 14px 0;
    border-radius:var(--radius-md); background:var(--bg-raised); border:1px solid var(--border-dim);
    box-shadow:0 8px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.04) inset;
    pointer-events:all; width:320px; overflow:hidden; cursor:pointer;
    font-family:inherit; font-size:inherit; color:inherit; text-align:left;
    will-change:transform, opacity;
    animation:slideIn 0.35s cubic-bezier(0.16,1,0.3,1) both;
    transition:border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
  }
  .toast:hover  { border-color:var(--border-base); box-shadow:0 12px 40px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.06) inset; transform:translateX(-3px); }
  .toast:active { transform:translateX(0) scale(0.98); }

  :global(.toast.leaving) { animation:slideOut 0.28s cubic-bezier(0.4,0,1,1) forwards !important; pointer-events:none; }

  @keyframes slideIn { from { opacity:0; transform:translateX(20px) scale(0.96) } to { opacity:1; transform:translateX(0) scale(1) } }
  @keyframes slideOut {
    0%   { opacity:1; transform:translateX(0) scale(1);       max-height:var(--exit-h,80px); margin-bottom:0; }
    40%  { opacity:0; transform:translateX(14px) scale(0.96); max-height:var(--exit-h,80px); margin-bottom:0; }
    100% { opacity:0; transform:translateX(14px) scale(0.96); max-height:0;                  margin-bottom:-5px; }
  }

  .accent-bar { width:3px; align-self:stretch; flex-shrink:0; border-radius:0 2px 2px 0; }
  .toast-success  .accent-bar { background:var(--accent-fg); }
  .toast-error    .accent-bar { background:var(--color-error); }
  .toast-info     .accent-bar { background:var(--text-faint); }
  .toast-download .accent-bar { background:var(--accent-fg); }

  .icon { flex-shrink:0; display:flex; align-items:center; justify-content:center; }
  .toast-success  .icon { color:var(--accent-fg); }
  .toast-error    .icon { color:var(--color-error); }
  .toast-info     .icon { color:var(--text-muted); }
  .toast-download .icon { color:var(--accent-fg); }

  .body    { flex:1; min-width:0; display:flex; flex-direction:column; gap:5px; }
  .message { font-size:var(--text-sm); font-family:var(--font-ui); color:var(--text-secondary); font-weight:var(--weight-medium); letter-spacing:var(--tracking-wide); line-height:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .sub     { font-family:var(--font-ui); font-size:var(--text-xs); color:var(--text-faint); letter-spacing:var(--tracking-wide); line-height:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  .detail-backdrop { position:fixed; inset:0; z-index:10000; background:rgba(0,0,0,0.45); display:flex; align-items:center; justify-content:center; animation:fadeIn 0.15s ease both; }
  @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }

  .detail-panel { display:flex; width:420px; max-width:calc(100vw - 32px); max-height:60vh; border-radius:var(--radius-lg); background:var(--bg-raised); border:1px solid var(--border-base); box-shadow:0 24px 64px rgba(0,0,0,0.7), 0 1px 0 rgba(255,255,255,0.05) inset; overflow:hidden; animation:popIn 0.2s cubic-bezier(0.16,1,0.3,1) both; }
  @keyframes popIn { from { opacity:0; transform:scale(0.95) } to { opacity:1; transform:scale(1) } }

  .detail-accent { width:3px; flex-shrink:0; }
  .detail-error    .detail-accent { background:var(--color-error); }
  .detail-success  .detail-accent { background:var(--accent-fg); }
  .detail-info     .detail-accent { background:var(--text-faint); }
  .detail-download .detail-accent { background:var(--accent-fg); }

  .detail-body { flex:1; min-width:0; display:flex; flex-direction:column; padding:var(--sp-3); gap:var(--sp-2); overflow:hidden; }
  .detail-header { display:flex; align-items:center; justify-content:space-between; }
  .detail-kind { font-family:var(--font-ui); font-size:var(--text-2xs); letter-spacing:var(--tracking-wider); text-transform:uppercase; color:var(--text-faint); }
  .detail-error .detail-kind { color:var(--color-error); }

  .detail-close { display:flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:var(--radius-sm); background:none; border:none; color:var(--text-faint); cursor:pointer; transition:color var(--t-fast), background var(--t-fast); }
  .detail-close:hover { color:var(--text-primary); background:var(--bg-overlay); }

  .detail-message { font-family:var(--font-ui); font-size:var(--text-sm); color:var(--text-secondary); font-weight:var(--weight-medium); line-height:var(--leading-snug); word-break:break-word; }

  .detail-text { flex:1; min-height:0; overflow-y:auto; font-family:var(--font-ui); font-size:var(--text-xs); color:var(--text-muted); line-height:var(--leading-base); white-space:pre-wrap; word-break:break-all; background:var(--bg-void); border:1px solid var(--border-dim); border-radius:var(--radius-sm); padding:var(--sp-2) var(--sp-3); scrollbar-width:thin; margin:0; }

  .detail-actions { display:flex; gap:var(--sp-2); margin-top:var(--sp-1); }
  .detail-copy, .detail-dismiss { font-family:var(--font-ui); font-size:var(--text-2xs); letter-spacing:var(--tracking-wide); padding:5px var(--sp-3); border-radius:var(--radius-sm); cursor:pointer; transition:color var(--t-base), background var(--t-base), border-color var(--t-base); }
  .detail-copy { border:1px solid var(--border-dim); background:none; color:var(--text-muted); }
  .detail-copy:hover { color:var(--text-primary); border-color:var(--border-strong); background:var(--bg-overlay); }
  .detail-dismiss { border:1px solid color-mix(in srgb, var(--color-error) 40%, transparent); background:color-mix(in srgb, var(--color-error) 10%, transparent); color:var(--color-error); }
  .detail-dismiss:hover { background:color-mix(in srgb, var(--color-error) 18%, transparent); }
</style>