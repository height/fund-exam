// 只带 capture 所需核心，不把回放、调查等可选模块塞进离线 PWA。
import posthog from 'posthog-js/dist/module.slim.no-external'

const PREF_KEY = 'fund-exam:anonymous-analytics'
const projectKey = import.meta.env.VITE_POSTHOG_KEY?.trim()
const apiHost = import.meta.env.VITE_POSTHOG_HOST?.trim()

let initialized = false

export const analyticsConfigured = Boolean(projectKey && apiHost)

export function getAnalyticsEnabled() {
  return localStorage.getItem(PREF_KEY) !== 'off'
}

function displayMode() {
  if (matchMedia('(display-mode: standalone)').matches) return 'standalone'
  return navigator.standalone ? 'standalone' : 'browser'
}

function safeUrl(raw) {
  try {
    const url = new URL(raw, location.origin)
    const view = url.origin === location.origin ? url.hash.match(/^#\/[a-z]+/)?.[0] || '' : ''
    return `${url.origin}${url.pathname}${view}`
  } catch {
    return undefined
  }
}

function redactUrls(capture) {
  if (!capture) return capture
  const properties = { ...capture.properties }
  for (const key of ['$current_url', '$initial_current_url', '$session_entry_url', '$referrer', '$initial_referrer']) {
    if (!properties[key]) continue
    const value = safeUrl(properties[key])
    if (value) properties[key] = value
    else delete properties[key]
  }
  return { ...capture, properties }
}

/**
 * 没配 PostHog 环境变量时所有调用都是 no-op，本地开发仍可正常运行。
 */
export function initAnalytics() {
  if (initialized) return true
  if (!projectKey || !apiHost) return false
  initialized = true

  posthog.init(projectKey, {
    api_host: apiHost,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: true,
    capture_exceptions: false,
    capture_performance: false,
    disable_external_dependency_loading: true,
    disable_session_recording: true,
    disable_surveys: true,
    advanced_disable_feature_flags: true,
    person_profiles: 'never',
    persistence: 'localStorage',
    respect_dnt: true,
    before_send: redactUrls,
    opt_out_capturing_by_default: !getAnalyticsEnabled(),
    opt_out_persistence_by_default: true,
    defaults: '2026-05-30',
    loaded: client => {
      client.register({
        app: 'fund-exam',
        app_version: __BUILD_TIME__.slice(0, 10),
        display_mode: displayMode(),
      })
      if (getAnalyticsEnabled()) client.capture('app_opened')
    },
  })

  addEventListener('appinstalled', () => track('pwa_installed'), { once: true })
  return true
}

export function setAnalyticsEnabled(enabled) {
  localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off')
  if (!initialized) return
  if (enabled) {
    posthog.opt_in_capturing({ captureEventName: false })
    posthog.capture('anonymous_analytics_enabled')
  } else {
    posthog.opt_out_capturing()
  }
}

export function track(event, properties = {}) {
  if (!initialized || !getAnalyticsEnabled()) return
  posthog.capture(event, properties)
}

export function trackPageview(view) {
  if (!initialized || !getAnalyticsEnabled()) return
  // 丢掉 query/hash 参数，避免把章节、题号或未来新增的敏感参数带进 URL。
  const url = `${location.origin}${location.pathname}#/${view}`
  posthog.capture('$pageview', { $current_url: url, view })
}
