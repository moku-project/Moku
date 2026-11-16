<script lang="ts">
  import { tsunagu } from '$lib/server-adapters/tsunagu'
  import { addToast } from '$lib/state/notifications.svelte'
  import { settingsState, updateSettings } from '$lib/state/settings.svelte'
  import { platformService } from '$lib/platform-service'
  import { setAuthToken, clearAuthToken } from '$lib/state/auth.svelte'
  import { t } from '$lib/i18n/index.svelte'

  const isTauri = platformService.platform === 'tauri'

  let passwordSet   = $state(false)
  let authLoading   = $state(true)
  let password      = $state('')
  let authBusy      = $state(false)
  let authError     = $state('')

  async function loadAuth() {
    authLoading = true
    try {
      passwordSet = (await tsunagu.authStatus()).passwordSet
    } catch {
    } finally {
      authLoading = false
    }
  }

  $effect(() => { loadAuth() })

  async function enable() {
    if (authBusy || !password) return
    authBusy = true
    authError = ''
    try {
      await tsunagu.setPassword(password)
      const { token } = await tsunagu.login(password)
      await setAuthToken(token)
      addToast({ kind: 'success', title: t('settings.auth.passwordSetTitle'), body: t('settings.auth.passwordSetBody') })
      passwordSet = true
      password = ''
    } catch (e) {
      authError = e instanceof Error ? e.message : String(e)
    } finally {
      authBusy = false
    }
  }

  async function disable() {
    if (authBusy) return
    authBusy = true
    authError = ''
    try {
      await tsunagu.disableServerAuth()
      await clearAuthToken()
      addToast({ kind: 'success', title: t('settings.auth.passwordDisabledTitle'), body: t('settings.auth.passwordDisabledBody') })
      passwordSet = false
    } catch (e) {
      authError = e instanceof Error ? e.message : String(e)
    } finally {
      authBusy = false
    }
  }

  function toggleServerAuth() {
    if (passwordSet) disable()
  }

  let pin = $state(settingsState.settings.appLockPin ?? '')

  function savePin(value: string) {
    const next = value.replace(/\D/g, '').slice(0, 8)
    pin = next
    updateSettings({ appLockPin: next })
  }

  let helloAvailable = $state(false)

  $effect(() => {
    if (!isTauri) return
    let cancelled = false
    import('@tauri-apps/api/core')
      .then(({ invoke }) => invoke<boolean>('windows_hello_available'))
      .then(v => { if (!cancelled) helloAvailable = v })
      .catch(() => { if (!cancelled) helloAvailable = false })
    return () => { cancelled = true }
  })
</script>

<div class="s-panel">
  <div class="s-section">
    <p class="s-section-title">{t('settings.auth.serverPasswordTitle')}</p>
    <div class="s-section-body">
      {#if authLoading}
        <div class="s-row"><span class="s-desc">{t('common.loading')}</span></div>
      {:else}
        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">{t('settings.auth.requirePassword')}</span>
            <span class="s-desc">{t('settings.auth.requirePasswordDesc')}</span>
          </div>
          <button role="switch" aria-checked={passwordSet} aria-label={t('settings.auth.requirePassword')}
            class="s-toggle" class:on={passwordSet} disabled={authBusy}
            onclick={toggleServerAuth}>
            <span class="s-toggle-thumb"></span>
          </button>
        </div>
        {#if !passwordSet}
          <div class="s-row">
            <div class="s-row-info"><span class="s-label">{t('settings.auth.password')}</span></div>
            <input class="s-input" type="password" autocomplete="new-password" disabled={authBusy}
              bind:value={password}
              onkeydown={(e) => { if (e.key === 'Enter') enable() }} />
          </div>
          <div class="s-row">
            <span class="s-desc">{t('settings.auth.apiTokenNote')}</span>
            <button class="s-btn" disabled={authBusy || !password} onclick={enable}>
              {authBusy ? t('settings.auth.saving') : t('common.enable')}
            </button>
          </div>
        {/if}
        {#if authError}
          <div class="s-row"><span class="s-desc ss-err">{authError}</span></div>
        {/if}
      {/if}
    </div>
  </div>

  <div class="s-section">
    <p class="s-section-title">{t('settings.auth.appLockTitle')}</p>
    <div class="s-section-body">
      <div class="s-row">
        <div class="s-row-info">
          <span class="s-label">{t('settings.auth.pin')}</span>
          <span class="s-desc">{t('settings.auth.pinDesc')}</span>
        </div>
        <input class="s-input" type="password" inputmode="numeric" autocomplete="off" placeholder={t('settings.auth.pinPlaceholder')}
          value={pin} oninput={(e) => savePin((e.currentTarget as HTMLInputElement).value)} />
      </div>
      {#if isTauri && helloAvailable}
        <div class="s-row">
          <div class="s-row-info">
            <span class="s-label">Windows Hello</span>
            <span class="s-desc">{t('settings.auth.windowsHelloDesc')}</span>
          </div>
          <button role="switch" aria-checked={settingsState.settings.appLockWindowsHello ?? false} aria-label="Windows Hello"
            class="s-toggle" class:on={settingsState.settings.appLockWindowsHello ?? false} disabled={!pin}
            onclick={() => updateSettings({ appLockWindowsHello: !(settingsState.settings.appLockWindowsHello ?? false) })}>
            <span class="s-toggle-thumb"></span>
          </button>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .ss-err { color: var(--color-error); }
</style>
