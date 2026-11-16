<script lang="ts">
  import { ArrowsClockwise, X, QrCode } from 'phosphor-svelte'
  import { renderSVG } from 'uqr'
  import { tsunagu } from '$lib/server-adapters/tsunagu'
  import type { SyncStatus, SyncNearbyDevice, SyncPairPreview } from '$lib/server-adapters/tsunagu/sync'
  import { addToast } from '$lib/state/notifications.svelte'
  import { timeAgo } from '$lib/core/util'

  interface Props { popupOpen?: boolean }
  let { popupOpen = $bindable(false) }: Props = $props()

  const NAME_MAX = 40

  let status      = $state<SyncStatus | null>(null)
  let loadError   = $state('')
  let nameDraft   = $state('')
  let renaming    = $state(false)
  let nameBusy    = $state(false)
  let nameError   = $state('')

  let nearby      = $state<SyncNearbyDevice[]>([])
  let scanning    = $state(false)
  let scanError   = $state('')

  let code        = $state<{ code: string; expiresAt: number } | null>(null)
  let codeOpen    = $state(false)
  let codeBusy    = $state(false)
  let now         = $state(Date.now())

  let target      = $state<{ address: string; name?: string } | null>(null)
  let manualOpen  = $state(false)
  let manualAddr  = $state('')
  let codeInput   = $state('')
  let preview     = $state<SyncPairPreview | null>(null)
  let pairBusy    = $state(false)
  let pairError   = $state('')

  let confirmRemove = $state<string | null>(null)
  let installing    = $state<Record<string, boolean>>({})
  let syncing       = $state(false)

  const named = $derived(!!status?.name)
  const unpairedNearby = $derived(nearby.filter(d => !d.paired))
  const codeLeft = $derived(code ? Math.max(0, Math.round((code.expiresAt - now) / 1000)) : 0)
  const expired  = $derived(!!code && codeLeft === 0)

  // A phone that scans this has everything it needs to pair: where to reach this device, which device it is, and the code.
  const pairLink = $derived.by(() => {
    if (!code || !status?.name || !status.addresses.length) return ''
    const q = new URLSearchParams({ v: '1', node: status.node, name: status.name, code: code.code })
    for (const a of status.addresses) q.append('addr', a)
    return `moku://pair?${q}`
  })
  const qrSvg = $derived(pairLink ? renderSVG(pairLink, { ecc: 'M', border: 2, whiteColor: '#fff', blackColor: '#000' }) : '')

  $effect(() => { popupOpen = codeOpen })

  function message(e: unknown) { return e instanceof Error ? e.message : String(e) }

  async function load() {
    try {
      status = await tsunagu.syncStatus()
      loadError = ''
    } catch (e) {
      loadError = message(e)
    }
  }

  // Online dots and last-seen times only stay true while they're refreshed.
  $effect(() => {
    load()
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  })

  $effect(() => {
    if (!code) return
    const t = setInterval(() => { now = Date.now() }, 1000)
    return () => clearInterval(t)
  })

  let scannedOnce = false
  $effect(() => {
    if (named && !scannedOnce) { scannedOnce = true; scan() }
  })

  async function saveName() {
    const name = nameDraft.trim()
    if (!name || nameBusy) return
    nameBusy = true
    nameError = ''
    try {
      status = await tsunagu.setSyncDeviceName(name)
      renaming = false
    } catch (e) {
      nameError = message(e)
    } finally {
      nameBusy = false
    }
  }

  function startRename() {
    nameDraft = status?.name ?? ''
    nameError = ''
    renaming = true
  }

  async function scan() {
    if (scanning) return
    scanning = true
    scanError = ''
    try {
      nearby = await tsunagu.syncNearby()
    } catch (e) {
      scanError = message(e)
    } finally {
      scanning = false
    }
  }

  async function showCode() {
    if (codeBusy) return
    codeBusy = true
    try {
      const c = await tsunagu.createSyncPairingCode()
      now = Date.now()
      code = { code: c.code, expiresAt: new Date(c.expiresAt).getTime() }
      codeOpen = true
    } catch (e) {
      addToast({ kind: 'error', title: 'Couldn’t make a pairing code', body: message(e) })
    } finally {
      codeBusy = false
    }
  }

  function closeCode() {
    codeOpen = false
    code = null
  }

  function pairWith(address: string, name?: string) {
    target = { address, name }
    codeInput = ''
    preview = null
    pairError = ''
  }

  function cancelPairing() {
    target = null
    preview = null
    pairError = ''
  }

  const cleanCode = (s: string) => s.replace(/[\s-]/g, '').toUpperCase()

  async function runPreview() {
    if (!target || pairBusy) return
    pairBusy = true
    pairError = ''
    try {
      preview = await tsunagu.previewSyncPeer(target.address, cleanCode(codeInput))
    } catch (e) {
      pairError = message(e)
    } finally {
      pairBusy = false
    }
  }

  async function confirmPair() {
    if (!target || !preview || pairBusy) return
    pairBusy = true
    pairError = ''
    try {
      const peer = await tsunagu.connectSyncPeer(target.address, cleanCode(codeInput), preview.node)
      addToast({ kind: 'success', title: `Paired with ${peer.name}`, body: 'Your libraries will merge over the next few seconds.' })
      target = null
      preview = null
      manualAddr = ''
      manualOpen = false
      await load()
      nearby = nearby.map(d => (d.node === peer.node ? { ...d, paired: true } : d))
    } catch (e) {
      pairError = message(e)
    } finally {
      pairBusy = false
    }
  }

  async function remove(node: string) {
    try {
      status = await tsunagu.removeSyncPeer(node)
      nearby = nearby.map(d => (d.node === node ? { ...d, paired: false } : d))
    } catch (e) {
      addToast({ kind: 'error', title: 'Couldn’t remove the device', body: message(e) })
    } finally {
      confirmRemove = null
    }
  }

  async function syncNow() {
    if (syncing) return
    syncing = true
    try {
      status = await tsunagu.syncNow()
    } catch (e) {
      addToast({ kind: 'error', title: 'Sync didn’t finish', body: message(e) })
      await load()
    } finally {
      syncing = false
    }
  }

  async function install(pkg: string, name: string) {
    installing = { ...installing, [pkg]: true }
    try {
      await tsunagu.installSyncExtension(pkg)
      addToast({ kind: 'success', title: `${name} installed`, body: 'Its titles will appear in your library shortly.' })
      await load()
    } catch (e) {
      addToast({ kind: 'error', title: `Couldn’t install ${name}`, body: message(e) })
    } finally {
      installing = { ...installing, [pkg]: false }
    }
  }

  function lastSeen(at: string | null): string {
    return at ? `Last seen ${timeAgo(new Date(at).getTime())}` : 'Hasn’t connected yet'
  }

  const plural = (n: number, one: string, many = one + 's') => `${n.toLocaleString()} ${n === 1 ? one : many}`
  const groupCode = (c: string) => c.length === 8 ? `${c.slice(0, 4)} ${c.slice(4)}` : c
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
</script>

<div class="s-panel">
  {#if !status}
    <div class="s-section">
      <div class="s-section-body">
        <div class="s-row"><span class="s-desc" class:sy-err={!!loadError}>{loadError ? `Can’t reach the server: ${loadError}` : 'Loading…'}</span></div>
      </div>
    </div>

  {:else if !named}
    <div class="s-section">
      <p class="s-section-title">Name this device</p>
      <div class="s-section-body">
        <div class="s-row sy-stack">
          <span class="s-desc">Your other devices will see this name.</span>
          <form class="sy-inline" onsubmit={(e) => { e.preventDefault(); saveName() }}>
            <input id="sync-name" class="s-input full" maxlength={NAME_MAX} placeholder="e.g. Desk" autocomplete="off"
              bind:value={nameDraft} disabled={nameBusy} />
            <button class="s-btn s-btn-accent" type="submit" disabled={nameBusy || !nameDraft.trim()}>
              {nameBusy ? 'Saving…' : 'Continue'}
            </button>
          </form>
          {#if nameError}<span class="s-desc sy-err">{nameError}</span>{/if}
        </div>
      </div>
    </div>

  {:else}
    <div class="s-section">
      <p class="s-section-title">This device</p>
      <div class="s-section-body">
        {#if renaming}
          <div class="s-row sy-stack">
            <form class="sy-inline" onsubmit={(e) => { e.preventDefault(); saveName() }}>
              <input id="sync-rename" class="s-input full" maxlength={NAME_MAX} autocomplete="off" bind:value={nameDraft} disabled={nameBusy} />
              <button class="s-btn s-btn-accent" type="submit" disabled={nameBusy || !nameDraft.trim()}>{nameBusy ? 'Saving…' : 'Save'}</button>
              <button class="s-btn" type="button" onclick={() => (renaming = false)}>Cancel</button>
            </form>
            {#if nameError}<span class="s-desc sy-err">{nameError}</span>{/if}
          </div>
        {:else}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label">{status.name}</span>
              <span class="s-desc">Shown on your other devices.</span>
            </div>
            <button class="s-btn" onclick={startRename}>Rename</button>
          </div>
        {/if}
        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Sync</span>
            <span class="s-desc">
              {#if status.pendingTitles > 0}
                {plural(status.pendingTitles, 'title')} still loading.
              {:else if status.peers.some(p => p.online)}
                Up to date.
              {:else if status.peers.length}
                No devices connected.
              {:else}
                No devices paired.
              {/if}
            </span>
          </div>
          <button class="s-btn" disabled={syncing || !status.peers.length} onclick={syncNow}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>
    </div>

    <div class="s-section">
      <p class="s-section-title">Paired devices</p>
      <div class="s-section-body">
        {#each status.peers as p (p.node)}
          <div class="s-row">
            <div class="sy-device">
              <span class="sy-dot" class:on={p.online} aria-hidden="true"></span>
              <div class="s-row-info">
                <span class="s-label">{p.name}</span>
                <span class="s-desc">{p.online ? 'Connected' : lastSeen(p.lastSeenAt)}</span>
              </div>
            </div>
            {#if confirmRemove === p.node}
              <div class="s-btn-row">
                <span class="s-desc">Remove {p.name}?</span>
                <button class="s-btn s-btn-danger" onclick={() => remove(p.node)}>Remove</button>
                <button class="s-btn" onclick={() => (confirmRemove = null)}>Cancel</button>
              </div>
            {:else}
              <button class="s-btn" onclick={() => (confirmRemove = p.node)}>Remove</button>
            {/if}
          </div>
        {:else}
          <div class="s-row"><span class="s-desc">None yet.</span></div>
        {/each}
      </div>
    </div>

    <div class="s-section">
      <p class="s-section-title">Pair a device</p>
      <div class="s-section-body">
        {#if target}
          <div class="s-row sy-stack">
            <span class="s-label">Pair with {preview?.name ?? target.name ?? target.address}</span>
            {#if !preview}
              <span class="s-desc">Enter the code shown on {target.name ?? 'that device'} under Sync › Show code.</span>
              <form class="sy-inline" onsubmit={(e) => { e.preventDefault(); runPreview() }}>
                <input id="sync-code" class="s-input mono sy-code-input" placeholder="XXXX XXXX" maxlength={11} autocomplete="off"
                  spellcheck="false" bind:value={codeInput} disabled={pairBusy} />
                <button class="s-btn s-btn-accent" type="submit" disabled={pairBusy || cleanCode(codeInput).length !== 8}>
                  {pairBusy ? 'Checking…' : 'Continue'}
                </button>
                <button class="s-btn" type="button" onclick={cancelPairing}>Cancel</button>
              </form>
            {:else}
              <span class="s-desc">Libraries merge. Nothing is removed.</span>
              <ul class="sy-preview">
                <li><b>{plural(preview.newTitles, 'title')}</b> added here</li>
                <li><b>{plural(preview.sentTitles, 'title')}</b> sent there</li>
                <li><b>{plural(preview.readChapters, 'read chapter')}</b></li>
                {#if preview.mergingFolders.length}
                  <li>Merging folders: {preview.mergingFolders.join(', ')}</li>
                {/if}
              </ul>
              <div class="s-btn-row">
                <button class="s-btn s-btn-accent" disabled={pairBusy} onclick={confirmPair}>{pairBusy ? 'Pairing…' : `Pair with ${preview.name}`}</button>
                <button class="s-btn" onclick={cancelPairing}>Cancel</button>
              </div>
            {/if}
            {#if pairError}<span class="s-desc sy-err">{pairError}</span>{/if}
          </div>
        {:else}
          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label">Nearby</span>
              <span class="s-desc">On this network.</span>
            </div>
            <button class="s-btn-icon" aria-label="Look again" title="Look again" disabled={scanning} onclick={scan}>
              <span class:sy-spin={scanning}><ArrowsClockwise size={14} weight="light" /></span>
            </button>
          </div>
          {#each unpairedNearby as d (d.node)}
            <div class="s-row">
              <div class="s-row-info">
                <span class="s-label">{d.name}</span>
                {#if unpairedNearby.filter(x => x.name === d.name).length > 1}
                  <span class="s-desc">{d.address.replace(/^https?:\/\//, '')}</span>
                {/if}
              </div>
              <button class="s-btn s-btn-accent" onclick={() => pairWith(d.address, d.name)}>Pair</button>
            </div>
          {:else}
            <div class="s-row">
              <span class="s-desc" class:sy-err={!!scanError}>
                {#if scanning}Looking…{:else if scanError}{scanError}{:else}Nothing found. Open Moku on the other device.{/if}
              </span>
            </div>
          {/each}

          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label">Show a code</span>
              <span class="s-desc">Scan it on a phone, or type it on another device.</span>
            </div>
            <button class="s-btn" disabled={codeBusy} onclick={showCode}>
              <QrCode size={13} weight="light" /> Show code
            </button>
          </div>

          <div class="s-row">
            <div class="s-row-info">
              <span class="s-label">Pair by address</span>
              <span class="s-desc">Tailscale or HTTPS address.</span>
            </div>
            {#if manualOpen}
              <form class="sy-inline" onsubmit={(e) => { e.preventDefault(); if (manualAddr.trim()) pairWith(manualAddr.trim()) }}>
                <input id="sync-address" class="s-input mono" placeholder="http://192.168.1.20:6008" spellcheck="false" bind:value={manualAddr} />
                <button class="s-btn" type="submit" disabled={!manualAddr.trim()}>Next</button>
              </form>
            {:else}
              <button class="s-btn" onclick={() => (manualOpen = true)}>Enter address</button>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    {#if status.missingExtensions.length}
      <div class="s-section">
        <p class="s-section-title">Extensions to install</p>
        <div class="s-section-body">
                    {#each status.missingExtensions as m (m.packageName)}
            <div class="s-row">
              <div class="s-row-info">
                <span class="s-label">{m.name} <span class="sy-meta">{m.lang.toUpperCase()} · {m.contentType}</span></span>
                <span class="s-desc">
                  {plural(m.titles, 'title')}{m.examples.length ? `: ${m.examples.join(', ')}${m.titles > m.examples.length ? '…' : ''}` : ''}
                  {#if !m.available && !m.repository}<br />Add its repository first.{/if}
                </span>
              </div>
              <button class="s-btn s-btn-accent" disabled={installing[m.packageName] || (!m.available && !m.repository)}
                onclick={() => install(m.packageName, m.name)}>
                {installing[m.packageName] ? 'Installing…' : 'Install'}
              </button>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>

<svelte:window onkeydown={(e) => { if (codeOpen && e.key === 'Escape') { e.stopPropagation(); closeCode() } }} />

{#if codeOpen && code && status?.name}
  <div class="sy-backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) closeCode() }}>
    <div class="sy-dialog" role="dialog" aria-modal="true" aria-label="Pairing code">
      <header class="sy-dialog-head">
        <span class="sy-dialog-title">Pair with {status.name}</span>
        <button class="sy-close" aria-label="Close" onclick={closeCode}><X size={14} weight="bold" /></button>
      </header>
      <div class="sy-dialog-body" class:dim={expired}>
        {#if qrSvg}
          <div class="sy-qr" aria-label="QR code for pairing">{@html qrSvg}</div>
        {/if}
        <span class="sy-code" aria-label="Pairing code">{groupCode(code.code)}</span>
        <span class="s-desc sy-center">
          {#if expired}
            This code has expired.
          {:else if qrSvg}
            Scan with Moku on your phone, or enter the code on another device. Expires in {clock(codeLeft)}.
          {:else}
            Enter the code on the other device. Expires in {clock(codeLeft)}.
          {/if}
        </span>
      </div>
      {#if expired}
        <div class="sy-dialog-foot"><button class="s-btn s-btn-accent" disabled={codeBusy} onclick={showCode}>New code</button></div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .sy-err { color: var(--color-error); }
  .sy-stack { flex-direction: column; align-items: stretch; gap: var(--sp-3); }
  .sy-stack:hover { background: none; }
  .sy-inline { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
  .sy-inline .s-input.full { flex: 1; min-width: 180px; width: auto; }
  .sy-device { display: flex; align-items: center; gap: var(--sp-3); min-width: 0; flex: 1; }
  .sy-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: var(--text-faint); opacity: 0.5; }
  .sy-dot.on { background: var(--color-success); opacity: 1; }
  .sy-code {
    font-family: monospace; font-size: var(--text-lg); letter-spacing: 0.18em;
    color: var(--accent-fg); background: var(--accent-muted); border: 1px solid var(--accent-dim);
    border-radius: var(--radius-md); padding: 6px 14px; user-select: all;
  }
  .sy-backdrop {
    position: fixed; inset: 0; z-index: calc(var(--z-settings) + 1);
    display: flex; align-items: center; justify-content: center;
    background: rgba(0, 0, 0, 0.55); backdrop-filter: blur(4px);
    animation: sy-fade 0.14s ease both;
  }
  .sy-dialog {
    width: min(340px, calc(100vw - 32px));
    background: var(--bg-surface); border: 1px solid var(--border-base); border-radius: var(--radius-2xl);
    box-shadow: 0 0 0 1px var(--border-dim), 0 32px 80px rgba(0, 0, 0, 0.7);
    overflow: hidden; animation: sy-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .sy-dialog-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px var(--sp-4); border-bottom: 1px solid var(--border-dim);
  }
  .sy-dialog-title { font-size: var(--text-sm); font-weight: var(--weight-medium); color: var(--text-primary); }
  .sy-close {
    display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
    border: none; background: none; border-radius: var(--radius-md); color: var(--text-faint); cursor: pointer;
  }
  .sy-close:hover { color: var(--text-muted); background: var(--bg-raised); }
  .sy-dialog-body { display: flex; flex-direction: column; align-items: center; gap: var(--sp-4); padding: var(--sp-5); }
  .sy-dialog-body.dim .sy-qr, .sy-dialog-body.dim .sy-code { opacity: 0.25; }
  .sy-dialog-foot { display: flex; justify-content: center; padding: 0 var(--sp-5) var(--sp-5); }
  .sy-qr { width: 200px; height: 200px; padding: 6px; background: #fff; border-radius: var(--radius-lg); }
  .sy-qr :global(svg) { display: block; width: 100%; height: 100%; }
  .sy-center { text-align: center; }
  @keyframes sy-fade { from { opacity: 0 } to { opacity: 1 } }
  @keyframes sy-pop { from { transform: scale(0.96); opacity: 0 } to { transform: scale(1); opacity: 1 } }
  @media (prefers-reduced-motion: reduce) { .sy-backdrop, .sy-dialog { animation: none; } }
  .sy-code-input { width: 130px; letter-spacing: 0.12em; text-transform: uppercase; }
  .sy-preview {
    margin: 0; padding: var(--sp-3) var(--sp-4) var(--sp-3) calc(var(--sp-4) + 1em);
    display: grid; gap: 4px; font-size: var(--text-sm); color: var(--text-secondary);
    background: var(--bg-surface); border: 1px solid var(--border-dim); border-radius: var(--radius-md);
  }
  .sy-preview b { color: var(--text-primary); font-weight: 600; }
  .sy-meta { font-size: var(--text-2xs); color: var(--text-faint); letter-spacing: var(--tracking-wide); margin-left: 6px; }
  .sy-spin { display: inline-flex; animation: sy-spin 0.9s linear infinite; }
  @keyframes sy-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .sy-spin { animation: none; } }
</style>
