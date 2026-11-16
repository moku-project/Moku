<script lang="ts">
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'
  import { t } from '$lib/i18n/index.svelte'
</script>

<div class="s-panel">

  <div class="s-section">
    <p class="s-section-title">{t('settings.player.playbackTitle')}</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.player.autoplayNext')}</span><span class="s-desc">{t('settings.player.autoplayNextDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.autoplayNextEpisode ?? true} aria-label={t('settings.player.autoplayNext')} class="s-toggle" class:on={settingsState.settings.autoplayNextEpisode ?? true} onclick={() => updateSettings({ autoplayNextEpisode: !(settingsState.settings.autoplayNextEpisode ?? true) })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.player.nethermind')}</span><span class="s-desc">{t('settings.player.nethermindDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.nethermindMode ?? false} aria-label={t('settings.player.nethermind')} class="s-toggle" class:on={settingsState.settings.nethermindMode ?? false} onclick={() => updateSettings({ nethermindMode: !(settingsState.settings.nethermindMode ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.player.tapToggle')}</span><span class="s-desc">{t('settings.player.tapToggleDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.playerManualChrome ?? false} aria-label={t('settings.player.tapToggle')} class="s-toggle" class:on={settingsState.settings.playerManualChrome ?? false} onclick={() => updateSettings({ playerManualChrome: !(settingsState.settings.playerManualChrome ?? false) })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.player.subtitlesTitle')}</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.player.subsDefault')}</span><span class="s-desc">{t('settings.player.subsDefaultDesc')}</span></div>
        <button role="switch" aria-checked={settingsState.settings.autoEnableSubtitles ?? true} aria-label={t('settings.player.subsDefaultAria')} class="s-toggle" class:on={settingsState.settings.autoEnableSubtitles ?? true} onclick={() => updateSettings({ autoEnableSubtitles: !(settingsState.settings.autoEnableSubtitles ?? true) })}><span class="s-toggle-thumb"></span></button>
      </label>
      <div class="s-row">
        <div class="s-row-info"><span class="s-label">{t('settings.player.subLang')}</span><span class="s-desc">{t('settings.player.subLangDesc')}</span></div>
        <input class="s-input" value={settingsState.settings.preferredSubtitleLang ?? ''}
          oninput={(e) => updateSettings({ preferredSubtitleLang: e.currentTarget.value })}
          placeholder={t('settings.player.subLangAuto')} spellcheck="false" />
      </div>
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.player.experimentalTitle')}</p>
    <div class="s-section-body">
      <label class="s-row">
        <div class="s-row-info">
          <span class="s-label">{t('settings.player.upscale')}</span>
          <span class="s-desc">{t('settings.player.upscaleDesc')}</span>
        </div>
        <button role="switch" aria-checked={settingsState.settings.videoUpscaleExperimental ?? false} aria-label={t('settings.player.upscale')}
          class="s-toggle" class:on={settingsState.settings.videoUpscaleExperimental ?? false}
          onclick={() => updateSettings({ videoUpscaleExperimental: !(settingsState.settings.videoUpscaleExperimental ?? false), videoUpscale: 'off' })}><span class="s-toggle-thumb"></span></button>
      </label>
    </div>
  </div>

  <p class="s-hint">{t('settings.player.hint')}</p>

</div>

<style>
  .s-hint {
    margin: var(--sp-2) 0 0;
    font-size: var(--text-xs);
    line-height: 1.5;
    color: var(--text-faint);
  }
</style>
