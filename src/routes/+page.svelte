<script lang="ts" module>
  // The default view applies at launch only; afterwards Home must stay reachable.
  let launchRedirectDone = false
</script>

<script lang="ts">
  import { goto } from '$app/navigation'
  import Home from '$lib/components/home/Home.svelte'
  import { settingsState } from '$lib/state/settings.svelte'

  const DEFAULT_VIEW_PATHS: Record<string, string> = {
    library:    '/library',
    browse:     '/browse',
    downloads:  '/downloads',
    recent:     '/recent',
    extensions: '/extensions',
  }

  $effect(() => {
    if (!settingsState.loaded || launchRedirectDone) return
    launchRedirectDone = true
    const path = DEFAULT_VIEW_PATHS[settingsState.settings.defaultView ?? 'home']
    if (path) goto(path, { replaceState: true })
  })
</script>

<Home />
