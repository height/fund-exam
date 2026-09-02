// 只带 capture 所需核心，不把回放、调查等可选模块塞进离线 PWA。
import posthog from 'posthog-js/dist/module.slim.no-external'

// Project token 是公开的客户端标识。保留环境变量覆盖能力，方便以后迁移项目，
// 但常规构建不再依赖部署平台额外配置。
const projectKey = import.meta.env.VITE_POSTHOG_KEY?.trim() || 'phc_ytCkvj3hbcSgCh6xYF6vpfWtPdNchQNzRYcuCmNSx2GT'
const apiHost = import.meta.env.VITE_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com'

let initialized = false

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

export function initAnalytics() {
  if (initialized) return true
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
    before_send: redactUrls,
    opt_out_persistence_by_default: true,
    defaults: '2026-05-30',
    loaded: client => {
      // 旧版设置页允许 opt-out，PostHog 会将该状态持久化。新版统一恢复上报，
      // 否则曾经关闭过的用户即使升级也仍然收不到事件。
      client.opt_in_capturing({ captureEventName: false })
      client.register({
        app: 'fund-exam',
        app_version: __BUILD_TIME__.slice(0, 10),
        display_mode: displayMode(),
      })
      client.capture('app_opened')
    },
  })

  addEventListener('appinstalled', () => track('pwa_installed'), { once: true })
  return true
}

export function track(event, properties = {}) {
  if (!initialized) return
  posthog.capture(event, properties)
}

export function trackPageview(view) {
  if (!initialized) return
  // 丢掉 query/hash 参数，避免把章节、题号或未来新增的敏感参数带进 URL。
  const url = `${location.origin}${location.pathname}#/${view}`
  posthog.capture('$pageview', { $current_url: url, view })
}
