/**
 * iOS 默认把 Web Audio 放在 ambient 会话，硬件静音时不会出声。
 * Safari 17+ 可直接切到 playback；旧版则在朗读期间播放一段无声的
 * HTMLAudio，把 Web Audio 一并带到媒体通道。返回函数负责恢复现场。
 */

const noop = () => {}

function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
}

function silentWav(sampleRate) {
  const frames = 8
  const buf = new ArrayBuffer(44 + frames * 2)
  const v = new DataView(buf)
  const ascii = (at, text) => {
    for (let i = 0; i < text.length; i++) v.setUint8(at + i, text.charCodeAt(i))
  }
  ascii(0, 'RIFF'); v.setUint32(4, 36 + frames * 2, true); ascii(8, 'WAVE')
  ascii(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true)
  v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  ascii(36, 'data'); v.setUint32(40, frames * 2, true)
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}

function openLegacyMediaChannel(sampleRate) {
  if (typeof document === 'undefined') return noop
  const url = silentWav(sampleRate)
  const audio = document.createElement('audio')
  let released = false
  audio.controls = false
  audio.disableRemotePlayback = true
  audio.setAttribute('x-webkit-airplay', 'deny')
  audio.preload = 'auto'
  audio.loop = true
  audio.src = url
  audio.load()

  const release = () => {
    if (released) return
    released = true
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
    URL.revokeObjectURL(url)
  }
  const playing = audio.play()
  playing?.catch(release)
  return release
}

/**
 * 必须在用户点击朗读的同步调用链中执行，才能满足 iOS 的媒体播放授权。
 * webAudio=false 时 HTMLAudio 自己已经走媒体通道，只需配置新式 AudioSession。
 */
export function claimIOSPlayback({ webAudio = false, sampleRate = 44100 } = {}) {
  if (typeof navigator === 'undefined') return noop
  const session = navigator.audioSession
  if (session && 'type' in session) {
    const previous = session.type
    try {
      session.type = 'playback'
      if (session.type === 'playback') {
        let released = false
        return () => {
          if (released) return
          released = true
          try { if (session.type === 'playback') session.type = previous || 'auto' }
          catch { /* Safari 可能已销毁页面音频会话 */ }
        }
      }
    } catch { /* 旧版或关闭实验能力时走下面的媒体通道兜底 */ }
  }
  return webAudio && isIOS() ? openLegacyMediaChannel(sampleRate) : noop
}
