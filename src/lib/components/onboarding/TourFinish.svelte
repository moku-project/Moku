<script lang="ts">
  import logoUrl                          from '$lib/assets/moku-icon-splash.svg'
  import { tourState, finishTour }        from '$lib/state/onboarding.svelte'
  import { t } from '$lib/i18n/index.svelte'

  const DISCORD_URL = 'https://discord.gg/Jq3pwuNqPp'

  const COLORS = ['#6b8f6b', '#a8e0a8', '#e8d78a', '#e0a8a8', '#a8c8e0']

  let canvasEl = $state<HTMLCanvasElement | undefined>(undefined)

  interface Particle {
    x: number; y: number; vx: number; vy: number
    size: number; rot: number; vrot: number; color: string; life: number
  }

  function burstConfetti(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    function resize() {
      canvas.width  = window.innerWidth  * dpr
      canvas.height = window.innerHeight * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const originX = window.innerWidth  / 2
    const originY = window.innerHeight / 2 - 40

    const particles: Particle[] = Array.from({ length: 260 }, () => {
      const angle = Math.random() * Math.PI * 2
      const speed = 5 + Math.random() * 13
      return {
        x: originX, y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 5,
        size: 7 + Math.random() * 8,
        rot: Math.random() * Math.PI,
        vrot: (Math.random() - 0.5) * 0.35,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        life: 1,
      }
    })

    let raf = 0
    const gravity = 0.13
    const drag = 0.99

    function frame() {
      ctx!.clearRect(0, 0, canvas.width, canvas.height)
      let alive = false
      for (const p of particles) {
        if (p.life <= 0) continue
        alive = true
        p.vx *= drag
        p.vy = p.vy * drag + gravity
        p.x += p.vx
        p.y += p.vy
        p.rot += p.vrot
        p.life -= 0.0055

        ctx!.save()
        ctx!.translate(p.x, p.y)
        ctx!.rotate(p.rot)
        ctx!.globalAlpha = Math.max(0, p.life)
        ctx!.fillStyle = p.color
        ctx!.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx!.restore()
      }
      if (alive) raf = requestAnimationFrame(frame)
      else window.removeEventListener('resize', resize)
    }
    raf = requestAnimationFrame(frame)

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }

  $effect(() => {
    if (!tourState.finished || !canvasEl) return
    return burstConfetti(canvasEl)
  })
</script>

{#if tourState.finished}
  <div class="scrim"></div>
  <canvas bind:this={canvasEl} class="confetti"></canvas>
  <div class="card-wrap">
    <div class="card">
      <img src={logoUrl} alt="Moku" class="logo" />
      <p class="title">{t('onboarding.welcomeTitle')}</p>
      <p class="body">{t('onboarding.finishBody')}</p>

      <a class="discord" href={DISCORD_URL} target="_blank" rel="noreferrer">
        {t('onboarding.joinDiscord')}
      </a>

      <button class="btn" onclick={finishTour}>{t('common.done')}</button>
    </div>
  </div>
{/if}


<style>
  .scrim    { position:fixed; inset:0; z-index:10599; background:rgba(0,0,0,0.7); backdrop-filter:blur(6px); animation:overlayIn 0.28s cubic-bezier(0,0,0.2,1) both; }
  .confetti { position:fixed; inset:0; z-index:10600; pointer-events:none; width:100vw; height:100vh; }
  .card-wrap { position:fixed; inset:0; z-index:10601; display:flex; align-items:center; justify-content:center; pointer-events:none; }

  .card { pointer-events:auto; width:min(320px, calc(100vw - 48px)); background:var(--bg-surface); border:1px solid var(--border-base); border-radius:var(--radius-xl); padding:var(--sp-6) var(--sp-5); display:flex; flex-direction:column; align-items:center; gap:var(--sp-3); box-shadow:0 32px 80px rgba(0,0,0,0.75); text-align:center; animation:cardIn 0.38s cubic-bezier(0.22,1,0.36,1) 0.06s both; }

  .logo  { width:56px; height:56px; border-radius:14px; display:block; }
  .title { font-family:var(--font-ui); font-size:11px; font-weight:500; letter-spacing:0.26em; text-transform:uppercase; color:var(--text-secondary); margin:-6px 0 0; user-select:none; }
  .body  { font-family:var(--font-ui); font-size:var(--text-sm); color:var(--text-faint); margin:0; }

  .discord {
    width:100%; padding:9px; border-radius:var(--radius-md);
    background:var(--bg-raised); border:1px solid var(--border-dim);
    color:var(--text-secondary); font-size:var(--text-sm); font-family:var(--font-ui);
    text-decoration:none; transition:border-color var(--t-base), color var(--t-base);
  }
  .discord:hover { border-color:var(--border-strong); color:var(--text-primary); }

  .btn                              { width:100%; padding:9px; border-radius:var(--radius-md); background:var(--accent-muted); border:1px solid var(--accent-dim); color:var(--accent-fg); font-size:var(--text-sm); font-family:var(--font-ui); letter-spacing:var(--tracking-wide); cursor:pointer; transition:filter var(--t-base); }
  .btn:hover                        { filter:brightness(1.12); }

  @keyframes overlayIn { from { opacity:0 } to { opacity:1 } }
  @keyframes cardIn    { from { opacity:0; transform:translateY(28px) scale(0.97) } to { opacity:1; transform:translateY(0) scale(1) } }
</style>