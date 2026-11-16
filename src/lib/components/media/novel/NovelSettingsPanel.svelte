<script lang="ts">
  import { onMount } from "svelte";
  import { seriesState } from "$lib/state/series.svelte";
  import { novelReaderState, type NovelFont, type NovelTheme } from "$lib/state/novelReader.svelte";
  import { platformService } from "$lib/platform-service";
  import { settingsState, updateSettings } from "$lib/state/settings.svelte";
  import MediaSettingsPanel from "$lib/components/media/shared/MediaSettingsPanel.svelte";
  import { t, type MessageKey } from "$lib/i18n/index.svelte";

  interface Props { onClose: () => void }
  let { onClose }: Props = $props();

  const st = novelReaderState;
  const autoScroll = $derived(settingsState.settings.autoScroll ?? false);

  let systemFonts: string[] = $state([]);
  onMount(async () => {
    try { systemFonts = await platformService.listSystemFonts(); } catch { systemFonts = []; }
  });

  const FONTS: { k: NovelFont; label: MessageKey }[] = [
    { k: "serif", label: "novel.settings.fontSerif" },
    { k: "sans",  label: "novel.settings.fontSans" },
    { k: "mono",  label: "novel.settings.fontMono" },
  ];
  const THEMES: { k: NovelTheme; label: MessageKey; swatch: string }[] = [
    { k: "paper", label: "novel.settings.themePaper", swatch: "#f5f2e9" },
    { k: "sepia", label: "novel.settings.themeSepia", swatch: "#efe3c8" },
    { k: "dark",  label: "novel.settings.themeDark", swatch: "#14140f" },
  ];
</script>

<MediaSettingsPanel title={t("novel.settings.title")} subtitle={seriesState.activeManga?.title} onClose={onClose}>
  <div class="msp-group">
    <p class="msp-label">{t("novel.settings.font")}</p>
    <div class="msp-seg">
      {#each FONTS as f (f.k)}
        <button class="msp-seg-btn" class:on={st.fontFamily === f.k && !st.systemFont} onclick={() => st.setFont(f.k)}>{t(f.label)}</button>
      {/each}
    </div>
    {#if systemFonts.length > 0}
      <select
        class="ns-font-select"
        value={st.systemFont ?? ""}
        onchange={(e) => st.setSystemFont((e.currentTarget as HTMLSelectElement).value || null)}
      >
        <option value="">{t("novel.settings.systemFontDefault")}</option>
        {#each systemFonts as f (f)}
          <option value={f}>{f}</option>
        {/each}
      </select>
    {/if}
  </div>

  <div class="msp-group">
    <p class="msp-label">{t("novel.settings.text")}</p>
    <div class="msp-row">
      <span>{t("novel.settings.size")}</span>
      <div class="msp-stepper">
        <button aria-label={t("novel.settings.smaller")} onclick={() => st.bumpFont(-0.05)}>−</button>
        <span class="msp-val">{Math.round(st.fontScale * 100)}%</span>
        <button aria-label={t("novel.settings.larger")} onclick={() => st.bumpFont(0.05)}>+</button>
      </div>
    </div>
    <div class="msp-row">
      <span>{t("novel.settings.lineHeight")}</span>
      <div class="msp-stepper">
        <button aria-label={t("novel.settings.tighter")} onclick={() => st.bumpLine(-0.1)}>−</button>
        <span class="msp-val">{st.lineHeight.toFixed(1)}</span>
        <button aria-label={t("novel.settings.looser")} onclick={() => st.bumpLine(0.1)}>+</button>
      </div>
    </div>
    <div class="msp-row">
      <span>{t("novel.settings.paragraphGap")}</span>
      <div class="msp-stepper">
        <button aria-label={t("novel.settings.less")} onclick={() => st.bumpPara(-0.1)}>−</button>
        <span class="msp-val">{st.paraSpacing.toFixed(1)}</span>
        <button aria-label={t("novel.settings.more")} onclick={() => st.bumpPara(0.1)}>+</button>
      </div>
    </div>
    <div class="msp-row">
      <span>{t("novel.settings.columnWidth")}</span>
      <div class="msp-stepper">
        <button aria-label={t("novel.settings.narrower")} onclick={() => st.bumpWidth(-4)}>−</button>
        <span class="msp-val">{st.pageWidth}</span>
        <button aria-label={t("novel.settings.wider")} onclick={() => st.bumpWidth(4)}>+</button>
      </div>
    </div>
  </div>

  <div class="msp-group">
    <p class="msp-label">{t("novel.settings.scrolling")}</p>
    <div class="msp-row">
      <span>{t("novel.settings.paged")}</span>
      <button class="msp-toggle" class:on={st.paged}
        role="switch" aria-checked={st.paged} aria-label={t("novel.settings.pagedReading")}
        onclick={() => st.setPaged(!st.paged)}
      ><span class="msp-toggle-knob"></span></button>
    </div>
    {#if !st.paged}
    <div class="msp-row">
      <span>{t("novel.settings.autoScroll")}</span>
      <button class="msp-toggle" class:on={autoScroll}
        role="switch" aria-checked={autoScroll} aria-label={t("novel.settings.autoScroll")}
        onclick={() => updateSettings({ autoScroll: !autoScroll })}
      ><span class="msp-toggle-knob"></span></button>
    </div>
    {#if autoScroll}
      <div class="msp-row">
        <span>{t("novel.settings.scrollSpeed")}</span>
        <input class="msp-slider" type="range" min={1} max={30} step={1}
          value={settingsState.settings.autoScrollSpeed ?? 5}
          oninput={(e) => updateSettings({ autoScrollSpeed: Number(e.currentTarget.value) })} />
        <span class="msp-readout">{settingsState.settings.autoScrollSpeed ?? 5}</span>
      </div>
    {/if}
    {/if}
  </div>

  <div class="msp-group">
    <p class="msp-label">{t("novel.settings.readingGuide")}</p>
    <div class="msp-row">
      <span>{t("novel.settings.guideBar")}</span>
      <button class="msp-toggle" class:on={st.readingGuide}
        role="switch" aria-checked={st.readingGuide} aria-label={t("novel.settings.readingGuide")}
        onclick={() => st.setReadingGuide(!st.readingGuide)}
      ><span class="msp-toggle-knob"></span></button>
    </div>
    {#if st.readingGuide}
      <div class="msp-row">
        <span>{t("novel.settings.thickness")}</span>
        <div class="msp-stepper">
          <button aria-label={t("novel.settings.fewerLines")} onclick={() => st.bumpGuideLines(-1)}>−</button>
          <span class="msp-val">{t("novel.settings.guideLines", { count: st.readingGuideLines })}</span>
          <button aria-label={t("novel.settings.moreLines")} onclick={() => st.bumpGuideLines(1)}>+</button>
        </div>
      </div>
    {/if}
  </div>

  <div class="msp-group">
    <p class="msp-label">{t("novel.settings.alignment")}</p>
    <div class="msp-seg">
      <button class="msp-seg-btn" class:on={st.textAlign === "left"} onclick={() => st.setAlign("left")}>{t("novel.settings.alignLeft")}</button>
      <button class="msp-seg-btn" class:on={st.textAlign === "justify"} onclick={() => st.setAlign("justify")}>{t("novel.settings.alignJustify")}</button>
    </div>
  </div>

  <div class="msp-group">
    <p class="msp-label">{t("novel.settings.theme")}</p>
    <div class="msp-tiles ns-themes">
      {#each THEMES as th (th.k)}
        <button class="msp-tile" class:on={st.theme === th.k} onclick={() => st.setTheme(th.k)}>
          <span class="ns-swatch" style="background:{th.swatch}"></span>
          <span class="msp-tile-label">{t(th.label)}</span>
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
