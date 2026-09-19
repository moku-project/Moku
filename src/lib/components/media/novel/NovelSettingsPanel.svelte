<script lang="ts">
  import { onMount } from "svelte";
  import { seriesState } from "$lib/state/series.svelte";
  import { novelReaderState, type NovelFont, type NovelTheme } from "$lib/state/novelReader.svelte";
  import { platformService } from "$lib/platform-service";
  import { settingsState, updateSettings } from "$lib/state/settings.svelte";
  import MediaSettingsPanel from "$lib/components/media/shared/MediaSettingsPanel.svelte";

  interface Props { onClose: () => void }
  let { onClose }: Props = $props();

  const st = novelReaderState;
  const autoScroll = $derived(settingsState.settings.autoScroll ?? false);

  let systemFonts: string[] = $state([]);
  onMount(async () => {
    try { systemFonts = await platformService.listSystemFonts(); } catch { systemFonts = []; }
  });

  const FONTS: { k: NovelFont; label: string }[] = [
    { k: "serif", label: "Serif" },
    { k: "sans",  label: "Sans" },
    { k: "mono",  label: "Mono" },
  ];
  const THEMES: { k: NovelTheme; label: string; swatch: string }[] = [
    { k: "paper", label: "Paper", swatch: "#f5f2e9" },
    { k: "sepia", label: "Sepia", swatch: "#efe3c8" },
    { k: "dark",  label: "Dark",  swatch: "#14140f" },
  ];
</script>

<MediaSettingsPanel title="Novel Settings" subtitle={seriesState.activeManga?.title} onClose={onClose}>
  <div class="msp-group">
    <p class="msp-label">Font</p>
    <div class="msp-seg">
      {#each FONTS as f (f.k)}
        <button class="msp-seg-btn" class:on={st.fontFamily === f.k && !st.systemFont} onclick={() => st.setFont(f.k)}>{f.label}</button>
      {/each}
    </div>
    {#if systemFonts.length > 0}
      <select
        class="ns-font-select"
        value={st.systemFont ?? ""}
        onchange={(e) => st.setSystemFont((e.currentTarget as HTMLSelectElement).value || null)}
      >
        <option value="">System font — default</option>
        {#each systemFonts as f (f)}
          <option value={f}>{f}</option>
        {/each}
      </select>
    {/if}
  </div>

  <div class="msp-group">
    <p class="msp-label">Text</p>
    <div class="msp-row">
      <span>Size</span>
      <div class="msp-stepper">
        <button aria-label="Smaller" onclick={() => st.bumpFont(-0.05)}>−</button>
        <span class="msp-val">{Math.round(st.fontScale * 100)}%</span>
        <button aria-label="Larger" onclick={() => st.bumpFont(0.05)}>+</button>
      </div>
    </div>
    <div class="msp-row">
      <span>Line height</span>
      <div class="msp-stepper">
        <button aria-label="Tighter" onclick={() => st.bumpLine(-0.1)}>−</button>
        <span class="msp-val">{st.lineHeight.toFixed(1)}</span>
        <button aria-label="Looser" onclick={() => st.bumpLine(0.1)}>+</button>
      </div>
    </div>
    <div class="msp-row">
      <span>Paragraph gap</span>
      <div class="msp-stepper">
        <button aria-label="Less" onclick={() => st.bumpPara(-0.1)}>−</button>
        <span class="msp-val">{st.paraSpacing.toFixed(1)}</span>
        <button aria-label="More" onclick={() => st.bumpPara(0.1)}>+</button>
      </div>
    </div>
    <div class="msp-row">
      <span>Column width</span>
      <div class="msp-stepper">
        <button aria-label="Narrower" onclick={() => st.bumpWidth(-2)}>−</button>
        <span class="msp-val">{st.pageWidth}</span>
        <button aria-label="Wider" onclick={() => st.bumpWidth(2)}>+</button>
      </div>
    </div>
  </div>

  <div class="msp-group">
    <p class="msp-label">Scrolling</p>
    <div class="msp-row">
      <span>Auto scroll</span>
      <button class="msp-toggle" class:on={autoScroll}
        role="switch" aria-checked={autoScroll} aria-label="Auto scroll"
        onclick={() => updateSettings({ autoScroll: !autoScroll })}
      ><span class="msp-toggle-knob"></span></button>
    </div>
    {#if autoScroll}
      <div class="msp-row">
        <span>Scroll speed</span>
        <input class="msp-slider" type="range" min={1} max={30} step={1}
          value={settingsState.settings.autoScrollSpeed ?? 5}
          oninput={(e) => updateSettings({ autoScrollSpeed: Number(e.currentTarget.value) })} />
        <span class="msp-readout">{settingsState.settings.autoScrollSpeed ?? 5}</span>
      </div>
    {/if}
  </div>

  <div class="msp-group">
    <p class="msp-label">Reading guide</p>
    <div class="msp-row">
      <span>Guide bar</span>
      <button class="msp-toggle" class:on={st.readingGuide}
        role="switch" aria-checked={st.readingGuide} aria-label="Reading guide"
        onclick={() => st.setReadingGuide(!st.readingGuide)}
      ><span class="msp-toggle-knob"></span></button>
    </div>
    {#if st.readingGuide}
      <div class="msp-row">
        <span>Thickness</span>
        <div class="msp-stepper">
          <button aria-label="Fewer lines" onclick={() => st.bumpGuideLines(-1)}>−</button>
          <span class="msp-val">{st.readingGuideLines} {st.readingGuideLines === 1 ? "line" : "lines"}</span>
          <button aria-label="More lines" onclick={() => st.bumpGuideLines(1)}>+</button>
        </div>
      </div>
    {/if}
  </div>

  <div class="msp-group">
    <p class="msp-label">Alignment</p>
    <div class="msp-seg">
      <button class="msp-seg-btn" class:on={st.textAlign === "left"} onclick={() => st.setAlign("left")}>Left</button>
      <button class="msp-seg-btn" class:on={st.textAlign === "justify"} onclick={() => st.setAlign("justify")}>Justify</button>
    </div>
  </div>

  <div class="msp-group">
    <p class="msp-label">Theme</p>
    <div class="msp-tiles ns-themes">
      {#each THEMES as t (t.k)}
        <button class="msp-tile" class:on={st.theme === t.k} onclick={() => st.setTheme(t.k)}>
          <span class="ns-swatch" style="background:{t.swatch}"></span>
          <span class="msp-tile-label">{t.label}</span>
        </button>
      {/each}
    </div>
  </div>
</MediaSettingsPanel>

<style>
  .ns-font-select {
    width: 100%; margin-top: 4px; padding: 6px 26px 6px 8px;
    font-family: var(--font-ui); font-size: var(--text-2xs);
    color: var(--text-muted); cursor: pointer;
    background-color: color-mix(in srgb, var(--bg-void) 55%, transparent);
    border: 1px solid var(--frost-border); border-radius: var(--radius-md);
    color-scheme: dark;
    outline: none;
    appearance: none; -webkit-appearance: none; -moz-appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%23888' stroke-width='1.3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 9px center;
  }
  .ns-font-select:focus { border-color: var(--border-strong); }
  .ns-font-select option { background: var(--bg-surface); color: var(--text-secondary); }
  .ns-themes { grid-template-columns: repeat(3, 1fr); }
  .ns-swatch {
    width: 20px; height: 20px; border-radius: var(--radius-sm);
    border: 1px solid color-mix(in srgb, #fff 22%, transparent);
  }
</style>
