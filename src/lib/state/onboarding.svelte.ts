import { settingsState, updateSettings } from '$lib/state/settings.svelte'
import { app } from '$lib/state/app.svelte'
import type { MessageKey } from '$lib/i18n/index.svelte'

export const onboardingState = $state({
  open: false,
})

export function maybeStartOnboarding() {
  if (!settingsState.settings.hasOnboarded) onboardingState.open = true
}

export function completeOnboarding() {
  onboardingState.open = false
  updateSettings({ hasOnboarded: true })
}

export function skipOnboarding() {
  completeOnboarding()
}

export function replayOnboarding() {
  onboardingState.open = true
}

export interface TourStep {
  selector:  string
  title:     MessageKey
  body:      MessageKey
  placement?: 'right' | 'bottom'
  route?:     string
  padding?:   number
  settingsTab?: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    selector:  '[data-tour="sidebar-nav"]',
    title:     'onboarding.tour.navigationTitle',
    body:      'onboarding.tour.navigationBody',
    placement: 'right',
    padding:   16,
  },
  {
    selector:  '[data-tour="global-search"]',
    title:     'onboarding.tour.searchTitle',
    body:      'onboarding.tour.searchBody',
    placement: 'right',
    padding:   12,
  },
  {
    selector:  '[data-tour="content-switch"]',
    title:     'onboarding.tour.contentSwitchTitle',
    body:      'onboarding.tour.contentSwitchBody',
    placement: 'right',
    padding:   4,
  },
  {
    selector:  '[data-tour="add-source"]',
    title:     'onboarding.tour.addSourceTitle',
    body:      'onboarding.tour.addSourceBody',
    placement: 'bottom',
    route:     '/extensions',
  },
  {
    selector:  '[data-tour="local-source"]',
    title:     'onboarding.tour.localSourceTitle',
    body:      'onboarding.tour.localSourceBody',
    placement: 'bottom',
    route:     '/extensions',
  },
  {
    selector:  '[data-tour="settings-btn"]',
    title:     'onboarding.tour.settingsTitle',
    body:      'onboarding.tour.settingsBody',
    placement: 'right',
    padding:   12,
  },
  {
    selector:  '[data-tour="settings-tab-tracking"]',
    title:     'onboarding.tour.trackingTitle',
    body:      'onboarding.tour.trackingBody',
    placement: 'right',
    padding:   3,
    settingsTab: 'tracking',
  },
]

export const tourState = $state({
  active:   false,
  step:     0,
  finished: false,
})

export function startTour() {
  app.setSettingsOpen(false)
  onboardingState.open = false
  tourState.step     = 0
  tourState.active   = true
  tourState.finished = false
}

export function nextTourStep() {
  if (tourState.step >= TOUR_STEPS.length - 1) { finishTourSteps(); return }
  tourState.step++
}

export function endTour() {
  tourState.active   = false
  tourState.finished = false
  app.setSettingsOpen(false)
}

async function finishTourSteps() {
  tourState.active = false
  app.setSettingsOpen(false)
  const { goto } = await import('$app/navigation')
  await goto('/')
  tourState.finished = true
}

export function finishTour() {
  tourState.finished = false
}