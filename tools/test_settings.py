#!/usr/bin/env python3
"""设置页回归：隔离浏览器、模拟 AI/TTS；运行前先 npm run build。"""
import base64
import functools
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


TTS_MOCK = r"""pcm => {
  const realFetch = window.fetch.bind(window)
  window.__ttsRequests = []
  window.__ttsStatus = 200
  window.__ttsDelay = 0
  window.__ttsAborted = 0
  window.fetch = (input, init = {}) => {
    if (!String(input).includes('api.xiaomimimo.com')) return realFetch(input, init)
    window.__ttsRequests.push(JSON.parse(init.body))
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (window.__ttsStatus !== 200) return resolve(new Response('{}', {status: window.__ttsStatus}))
        const body = 'data: ' + JSON.stringify({choices: [{delta: {audio: {data: pcm}}}]}) + '\n\ndata: [DONE]\n\n'
        resolve(new Response(body, {headers: {'Content-Type': 'text/event-stream'}}))
      }, window.__ttsDelay)
      init.signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        window.__ttsAborted++
        reject(new DOMException('Aborted', 'AbortError'))
      }, {once: true})
    })
  }
}"""


def open_section(page, name):
    page.locator('nav').get_by_role('button', name='设置', exact=True).click()
    page.locator('.settings-link').filter(has_text=name).click()
    expect(page.get_by_role('heading', name=name, exact=True)).to_be_visible()


def preview(page):
    page.get_by_role('button', name='试听音色', exact=True).click()
    expect(page.locator('.settings-preview .spk')).to_have_attribute('data-state', 'idle', timeout=10000)


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT / 'dist')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/'
    errors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(channel='chrome')
            ctx = browser.new_context(viewport={'width': 390, 'height': 844}, reduced_motion='reduce')
            ctx.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
            page = ctx.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto(base + '#/data')
            expect(page.locator('.settings-link')).to_have_count(3)
            expect(page.locator('.settings input')).to_have_count(0)
            page.get_by_role('button', name='浅色', exact=True).click()
            page.screenshot(path='/tmp/settings-overview.png')

            # AI 配置：预设切换、未保存草稿、接口隐藏、成功保存、错误不覆盖。
            open_section(page, 'AI 解析')
            ai = page.get_by_label('AI 服务', exact=True)
            key = page.get_by_label('API Key', exact=True)
            expect(key).to_have_attribute('type', 'password')
            page.get_by_role('button', name='显示 Key', exact=True).click()
            expect(key).to_have_attribute('type', 'text')
            page.get_by_role('button', name='隐藏 Key', exact=True).click()
            ai.select_option('glm')
            page.locator('.settings-advanced summary').click()
            expect(page.get_by_label('模型名称', exact=True)).to_have_value('glm-5.3')
            key.fill('test-glm-draft')
            ai.select_option('zenmux')
            expect(page.get_by_label('接口地址', exact=True)).to_have_value('https://zenmux.ai/api/v1/chat/completions')
            ai.select_option('glm')
            expect(key).to_have_value('test-glm-draft')
            ai.select_option('deepseek')
            key.fill('test-ai-key')
            page.route('**/chat/completions', lambda r: r.fulfill(status=200, content_type='application/json', body='{}'))
            page.get_by_role('button', name='保存并测试', exact=True).click()
            expect(page.locator('.settings-feedback')).to_contain_text('配置已保存')
            saved = page.evaluate("JSON.parse(localStorage.getItem('ai-config')).providers.deepseek.key")
            assert saved == 'test-ai-key'
            page.unroute('**/chat/completions')
            page.route('**/chat/completions', lambda r: r.fulfill(status=401, body='{}'))
            key.fill('bad-key')
            page.get_by_role('button', name='保存并测试', exact=True).click()
            expect(page.locator('.settings-feedback')).to_contain_text('Key 无效')
            assert page.evaluate("JSON.parse(localStorage.getItem('ai-config')).providers.deepseek.key") == saved
            # 收起后的无效接口仍会展开，避免隐藏字段使表单无法提交。
            page.get_by_label('接口地址', exact=True).fill('invalid-url')
            page.locator('.settings-advanced summary').click()
            page.get_by_role('button', name='保存并测试', exact=True).click()
            expect(page.get_by_label('接口地址', exact=True)).to_be_visible()
            page.reload()
            expect(page.get_by_role('heading', name='AI 解析', exact=True)).to_be_visible()
            expect(key).to_have_value('test-ai-key')
            page.screenshot(path='/tmp/settings-ai.png')

            # 8 个音色；无配置、旧默认、不支持的值均回退到冰糖。
            open_section(page, '语音朗读')
            voices = page.get_by_label('朗读音色', exact=True)
            expect(voices).to_have_value('冰糖')
            assert voices.locator('option').count() == 8
            assert voices.locator('optgroup').count() == 2
            expect(page.get_by_role('button', name='试听音色', exact=True)).to_be_disabled()
            for old in ['mimo_default', 'unknown-voice']:
                page.evaluate("v => { const s=JSON.parse(localStorage.getItem('ai-config'));s.ttsVoice=v;localStorage.setItem('ai-config',JSON.stringify(s)) }", old)
                page.reload()
                expect(voices).to_have_value('冰糖')
            tts_key = page.get_by_label('MiMo API Key', exact=True)
            tts_key.fill('test-tts-key')
            page.evaluate(TTS_MOCK, base64.b64encode(b'\x00' * 24000).decode())
            for voice in ['冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean']:
                voices.select_option(voice)
                preview(page)
                request = page.evaluate('window.__ttsRequests.at(-1)')
                assert request['audio'] == {'format': 'pcm16', 'voice': voice}
                assert request['model'] == 'mimo-v2.5-tts' and request['stream'] is True
            assert page.evaluate('window.__ttsRequests.length') == 8
            voices.select_option('冰糖')
            preview(page)
            assert page.evaluate('window.__ttsRequests.length') == 8, '相同音色和风格未复用缓存'
            page.get_by_label('朗读风格', exact=True).select_option('natural')
            preview(page)
            assert page.evaluate('window.__ttsRequests.length') == 9, '新风格错用旧缓存'
            assert '自然' in page.evaluate('window.__ttsRequests.at(-1).messages[0].content')
            page.locator('.settings-speed').get_by_role('button', name='1.5×', exact=True).click()
            preview(page)
            assert page.evaluate('window.__ttsRequests.length') == 9, '调速不应重新合成'

            # 失败可重试；切换音色和离开页面都取消尚未完成的试听。
            page.get_by_label('朗读风格', exact=True).select_option('encouraging')
            page.evaluate('window.__ttsStatus=401')
            page.get_by_role('button', name='试听音色', exact=True).click()
            expect(page.locator('.settings-preview .spk')).to_have_attribute('data-state', 'error')
            expect(page.locator('.toast')).to_contain_text('语音 Key 无效')
            page.evaluate('window.__ttsStatus=200;window.__ttsDelay=10000')
            page.get_by_role('button', name='朗读失败，点击重试', exact=True).click()
            page.wait_for_function('window.__ttsRequests.length === 11')
            voices.select_option('茉莉')
            expect(page.locator('.settings-preview .spk')).to_have_attribute('data-state', 'idle')
            page.wait_for_function('window.__ttsAborted > 0')
            page.get_by_role('button', name='试听音色', exact=True).click()
            page.wait_for_function('window.__ttsRequests.length === 12')
            page.locator('.page-head-back').click()
            page.wait_for_function('window.__ttsAborted > 1')
            expect(page.locator('.settings-link').filter(has_text='语音朗读')).to_contain_text('茉莉 · 1.5×')
            page.go_back()
            expect(voices).to_have_value('茉莉')
            page.reload()
            expect(voices).to_have_value('茉莉')
            expect(page.get_by_label('朗读风格', exact=True)).to_have_value('encouraging')
            expect(page.locator('.settings-speed button.on')).to_have_text('1.5×')
            expect(tts_key).to_have_value('test-tts-key')
            page.evaluate(TTS_MOCK, base64.b64encode(b'\x00' * 24000).decode())
            page.get_by_label('朗读风格', exact=True).select_option('sarcastic')
            preview(page)
            assert '嘲讽' in page.evaluate('window.__ttsRequests.at(-1).messages[0].content')
            assert '不添加或改写内容' in page.evaluate('window.__ttsRequests.at(-1).messages[0].content')
            page.screenshot(path='/tmp/settings-voice.png')

            # 导入、导出、取消清空及确认清空，均只操作测试浏览器的数据。
            open_section(page, '数据与备份')
            backup = {'app': 'fund-quiz', 'version': 1, 'records': [{'qid': 'settings-test', 'seen': 2, 'right': 1, 'wrong': 1, 'lastTs': 1, 'wrongFlag': True}], 'exams': []}
            page.locator('input[type=file]').set_input_files({'name': 'progress.json', 'mimeType': 'application/json', 'buffer': json.dumps(backup).encode()})
            dialog = page.get_by_role('dialog')
            expect(dialog).to_be_visible()
            dialog.get_by_role('button', name='合并', exact=True).click()
            expect(page.locator('.list-item').filter(has_text='做过的题').locator('b')).to_have_text('1')
            with page.expect_download() as download:
                page.get_by_role('button', name='导出进度', exact=True).click()
            exported = json.loads(Path(download.value.path()).read_text())
            assert exported['records'][0]['qid'] == 'settings-test'
            assert 'test-ai-key' not in json.dumps(exported) and 'test-tts-key' not in json.dumps(exported)
            page.get_by_role('button', name='清空全部进度', exact=True).click()
            dialog.get_by_role('button', name='再想想', exact=True).click()
            expect(page.locator('.list-item').filter(has_text='做过的题').locator('b')).to_have_text('1')
            page.get_by_role('button', name='清空全部进度', exact=True).click()
            dialog.get_by_role('button', name='清空', exact=True).click()
            expect(page.locator('.list-item').filter(has_text='做过的题').locator('b')).to_have_text('0')
            assert page.evaluate("JSON.parse(localStorage.getItem('ai-config')).ttsVoice") == '茉莉'
            page.screenshot(path='/tmp/settings-storage.png')
            ctx.close()
            browser.close()

            # Chrome 和 WebKit 的窄屏/桌面、浅色/深色布局与保存持久性。
            for engine in ['chromium', 'webkit']:
                browser = p.chromium.launch(channel='chrome') if engine == 'chromium' else p.webkit.launch()
                for width in [320, 390, 1280]:
                    ctx = browser.new_context(viewport={'width': width, 'height': 844}, reduced_motion='reduce')
                    ctx.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
                    page = ctx.new_page()
                    page.on('pageerror', lambda e: errors.append(str(e)))
                    for theme in ['浅色', '深色']:
                        page.goto(base+'#/data')
                        page.get_by_role('button', name=theme, exact=True).click()
                        for section in ['AI 解析', '语音朗读', '数据与备份']:
                            open_section(page, section)
                            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), (engine, width, section)
                            sizes = page.locator('.settings input:not([type=file]),.settings select').evaluate_all('els=>els.map(e=>parseFloat(getComputedStyle(e).fontSize))')
                            assert all(size >= 16 for size in sizes)
                            assert not page.get_by_text('自动保存', exact=False).count()
                            assert not page.get_by_text('即时生效', exact=False).count()
                            if section == '语音朗读':
                                voices = page.get_by_label('朗读音色', exact=True)
                                voices.select_option('Chloe')
                                page.reload()
                                expect(voices).to_have_value('Chloe')
                                button = page.locator('.settings-preview .spk')
                                assert button.evaluate('e=>e.scrollWidth <= e.clientWidth'), '试听按钮文字被裁切'
                                if width == 390 and engine == 'webkit':
                                    page.screenshot(path=f'/tmp/settings-voice-{theme}.png')
                    ctx.close()
                browser.close()
            assert not errors, errors
            print('PASS: settings routing, AI save/error, 8 TTS voices, style/cache/rate, cancellation, backup/reset, Chrome/WebKit responsive layouts')
    finally:
        server.shutdown()


if __name__ == '__main__':
    run()
