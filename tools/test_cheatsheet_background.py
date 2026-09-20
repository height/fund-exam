#!/usr/bin/env python3
"""Global cheatsheet task: controlled AI, real route changes and IndexedDB."""
import json
from playwright.sync_api import sync_playwright, expect
from test_notebook import APP, OUT, seed


def cached(page, subject="科目二"):
    return page.evaluate("""subject => new Promise(resolve => {
      const r = indexedDB.open('fund-quiz'); r.onsuccess = () => {
        const db = r.result, q = db.transaction('kv').objectStore('kv').get('notebook-cheatsheet:subject:' + subject);
        q.onsuccess = () => { resolve(q.result?.v || null); db.close() }
      }
    })""", subject)


def navigate(page, name):
    page.evaluate("""name => { location.hash = '#/' + name + (name === 'cheatsheet' ? '?subject=' + encodeURIComponent('科目二') : '') }""", name)
    page.wait_for_function('name => location.hash.startsWith("#/" + name)', arg=name)


def run():
    with sync_playwright() as p:
        for engine, width in [('chromium', 1100), ('webkit', 320)]:
            browser = getattr(p, engine).launch(**({'channel': 'chrome'} if engine == 'chromium' else {}))
            page = browser.new_page(viewport={'width': width, 'height': 844})
            errors, requests, held = [], [], []
            page.on('pageerror', lambda e: errors.append(str(e)))
            def ai(route):
                requests.append(route.request.post_data_json)
                held.append(route)
            page.route('https://notebook.test/chat/completions', ai)
            page.goto(APP)
            page.wait_for_selector('.app-bottom-nav')
            page.evaluate("localStorage.setItem('ai-config',JSON.stringify({active:'deepseek',providers:{deepseek:{url:'https://notebook.test/chat/completions',model:'test',key:'test-only'}}}))")
            seed(page, {'id': 'background-source', 'status': 'ready', 'subject': '科目二', 'chapter': '固定收益投资',
                'title': '债券价格', 'points': ['其他条件不变，市场利率上升时债券价格下降。'],
                'markdown': '其他条件不变，市场利率上升时债券价格下降。', 'excerpt': '债券价格', 'context': '',
                'evidence': [], 'createdAt': 1, 'updatedAt': 1})
            seed(page, {'id': 'subject-one-source', 'status': 'ready', 'subject': '科目一', 'chapter': '基金法律法规体系和监管体系',
                'title': '合规管理', 'points': ['遵守法律法规'], 'markdown': '遵守法律法规', 'excerpt': '合规管理',
                'context': '', 'evidence': [], 'createdAt': 1, 'updatedAt': 1})
            navigate(page, 'cheatsheet')
            page.get_by_role('button', name='生成小抄', exact=True).click()
            bar = page.get_by_role('complementary', name='小抄生成任务')
            expect(bar).to_contain_text('正在生成小抄')
            page.wait_for_function('document.querySelector(".cs-progress")')
            # Leave using the actual page back button, then return using the global pill.
            page.locator('.page-head-back').click()
            expect(page.locator('.cs-page')).to_have_count(0)
            expect(bar).to_contain_text('正在生成小抄')
            bar.get_by_role('button').click()
            page.get_by_role('button', name='取消生成', exact=True).wait_for()
            assert len(requests) == 1
            page.get_by_role('tab', name='科目一', exact=True).click()
            expect(page.get_by_role('heading', name='科目二 · 复习小抄', exact=True)).to_have_count(0)
            expect(bar).to_contain_text('科目二')
            bar.get_by_role('button').click()
            expect(page.get_by_role('tab', name='科目二', exact=True)).to_have_attribute('aria-selected', 'true')
            navigate(page, 'home')
            page.wait_for_selector('.notebook-home')
            page.screenshot(path=str(OUT / f'{engine}-cheatsheet-global-busy.png'), animations='disabled')

            def finish(label):
                assert held
                route = held.pop(0)
                source = json.loads(route.request.post_data_json['messages'][-1]['content'].splitlines()[-1])
                assert all(n['id'] == ('subject-one-source' if source['subject'] == '科目一' else 'background-source') for n in source['notes'])
                plan = {'groups': [{'title': '基础知识', 'topics': [{'title': label, 'sourceIds': [n['id'] for n in source['notes']], 'requirements': ['保留条件']}]}]}
                route.fulfill(status=200, content_type='application/json', body=json.dumps({'choices': [{'message': {'content': json.dumps(plan, ensure_ascii=False)}}]}))
                for _ in range(100):
                    if held: break
                    page.wait_for_timeout(20)
                route = held.pop(0)
                source = json.loads(route.request.post_data_json['messages'][-1]['content'].splitlines()[-1])
                result = {'items': [{'topicId': t['id'], 'sourceIds': t['sourceIds'], 'title': t['title'], 'markdown': source['notes'][0]['markdown'], 'coverage': [0], 'reviewNotes': []} for t in source['plan']['topics']], 'figures': []}
                route.fulfill(status=200, content_type='application/json', body=json.dumps({'choices': [{'message': {'content': json.dumps(result, ensure_ascii=False)}}]}))
                bar.get_by_role('button', name='保留', exact=True).wait_for()

            finish('跨页生成')
            assert cached(page) is None
            for w in [320, 390, 1100]:
                page.set_viewport_size({'width': w, 'height': 844})
                page.wait_for_timeout(100)
                box = bar.bounding_box()
                assert box['x'] >= 0 and box['x'] + box['width'] <= w + 1, box
                nav = page.locator('.app-bottom-nav').bounding_box()
                assert box['y'] + box['height'] <= nav['y'] or box['x'] + box['width'] <= nav['x'] or box['x'] >= nav['x'] + nav['width'], (box, nav)
            page.set_viewport_size({'width': width, 'height': 844})
            for theme in ['light', 'dark']:
                page.evaluate('t => document.documentElement.dataset.theme = t', theme)
                bar.screenshot(path=str(OUT / f'{engine}-cheatsheet-global-ready-{theme}.png'))
            bar.get_by_role('button', name='查看生成的小抄').click()
            page.get_by_role('region', name='本次生成的小抄').wait_for()
            navigate(page, 'home')
            bar.get_by_role('button', name='保留', exact=True).click()
            expect(bar).to_have_count(0)
            saved = cached(page)
            assert saved['notes'][0]['title'] == '跨页生成'
            navigate(page, 'cheatsheet')
            page.get_by_role('region', name='上次生成的小抄').wait_for()
            page.reload()
            page.get_by_role('region', name='上次生成的小抄').wait_for()
            assert len(requests) == 2 and cached(page) == saved
            page.screenshot(path=str(OUT / f'{engine}-cheatsheet-subject-tabs.png'), animations='disabled')
            page.get_by_role('tab', name='科目一', exact=True).click()
            page.get_by_role('button', name='生成小抄', exact=True).click()
            page.wait_for_timeout(100)
            finish('科目一独立小抄')
            page.get_by_role('tab', name='科目二', exact=True).click()
            expect(page.get_by_role('region', name='上次生成的小抄')).to_be_visible()
            expect(page.get_by_role('button', name='重新生成', exact=True)).to_be_disabled()
            bar.get_by_role('button', name='保留', exact=True).click()
            expect(bar).to_have_count(0)
            saved_one = cached(page, '科目一')
            assert saved_one['notes'][0]['title'] == '科目一独立小抄'
            assert cached(page) == saved
            page.reload()
            page.get_by_role('region', name='上次生成的小抄').wait_for()
            page.get_by_role('tab', name='科目一', exact=True).click()
            expect(page.get_by_role('heading', name='科目一 · 复习小抄', exact=True)).to_be_visible()
            page.get_by_role('tab', name='科目二', exact=True).click()

            page.get_by_role('button', name='重新生成', exact=True).click()
            expect(bar).to_contain_text('正在生成小抄')
            navigate(page, 'home')
            page.wait_for_selector('.notebook-home')
            finish('丢弃的新版')
            bar.get_by_role('button', name='丢弃', exact=True).click()
            expect(bar).to_have_count(0)
            assert cached(page) == saved

            navigate(page, 'cheatsheet')
            page.get_by_role('button', name='重新生成', exact=True).click()
            expect(bar).to_contain_text('正在生成小抄')
            navigate(page, 'home')
            page.wait_for_selector('.notebook-home')
            held.pop(0).fulfill(status=400, body='{}')
            expect(bar).to_contain_text('生成未完成')
            assert cached(page) == saved
            bar.get_by_role('button', name='重新生成小抄').click()
            expect(bar).to_contain_text('正在生成小抄')
            # Give the routed request one event-loop turn to arrive.
            page.wait_for_timeout(100)
            finish('重试成功')
            assert cached(page) == saved
            bar.get_by_role('button', name='保留', exact=True).click()
            expect(bar).to_have_count(0)
            assert cached(page)['notes'][0]['title'] == '重试成功'
            saved = cached(page)

            navigate(page, 'cheatsheet')
            page.get_by_role('button', name='重新生成', exact=True).click()
            page.get_by_role('button', name='取消生成', exact=True).click()
            page.get_by_role('alert').filter(has_text='已取消').wait_for()
            assert cached(page) == saved
            for route in held:
                try: route.abort()
                except Exception: pass
            assert cached(page, '科目一') == saved_one
            assert not errors, errors
            browser.close()
            print(engine + ' global generation, keep/discard, retry and cancellation passed')


if __name__ == '__main__':
    run()
