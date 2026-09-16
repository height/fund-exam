"""Auto-send capture, compact draggable prompt bar, and unobstructed study controls."""
import json
from playwright.sync_api import sync_playwright, expect
from test_notebook import APP, OUT, select, notes, wait_notes


def assert_clear(page):
    page.wait_for_function('''() => {
      const float = document.querySelector('.is-collapsed.note-modal-backdrop');
      if (!float) return false;
      const f = float.getBoundingClientRect();
      return f.x >= 0 && f.y >= 0 && f.right <= innerWidth + 1 && f.bottom <= innerHeight + 1 &&
        [...document.querySelectorAll('.actionbar,.app-bottom-nav,.calc-drawer,.calc-fab')]
          .filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
          .every(e => { const r = e.getBoundingClientRect(); return f.right <= r.left || f.left >= r.right || f.bottom <= r.top || f.top >= r.bottom });
    }''')
    for button in page.locator('.actionbar button,.app-bottom-nav button,.calc-fab').all():
        if button.is_visible():
            assert button.evaluate('e => { const r=e.getBoundingClientRect(); return !document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest(".note-modal-backdrop") }')


with sync_playwright() as p:
    for engine, mobile in [('chromium', False), ('webkit', True)]:
        browser = getattr(p, engine).launch(**({'channel': 'chrome'} if engine == 'chromium' else {}))
        page = browser.new_page(viewport={'width': 390 if mobile else 1100, 'height': 844}, is_mobile=mobile, has_touch=mobile)
        errors, requests, held = [], [], []
        page.on('pageerror', lambda e: errors.append(str(e)))
        def ai(route):
            payload = route.request.post_data_json
            materials = [json.loads(line) for line in payload['messages'][-1]['content'].splitlines() if line.startswith('{')]
            requests.append(materials)
            source = materials[0]
            quote = source['evidenceContext'].split('\n')[0]
            response = {'reply': '已整理，请展开确认。', 'note': {'subject': source['sourceSubject'], 'chapter': source['sourceChapter'], 'title': '自动整理的笔记', 'points': [quote], 'evidence': [quote], 'needsReview': False}}
            body = json.dumps({'choices': [{'message': {'content': json.dumps(response, ensure_ascii=False)}}]})
            if len(requests) == 1:
                held.append((route, body))
            else:
                route.fulfill(status=200, content_type='application/json', body=body)
        page.route('https://notebook.test/chat/completions', ai)
        page.goto(APP + '#/chapters')
        page.evaluate("localStorage.setItem('ai-config',JSON.stringify({active:'deepseek',providers:{deepseek:{url:'https://notebook.test/chat/completions',model:'test',key:'test-only'}}}))")
        page.locator('.ch-row').first.click(); page.wait_for_selector('.stem')
        select(page, '.stem', mobile, True)
        selected = page.locator('.sel-tip').get_attribute('data-term')
        page.get_by_role('button', name='记笔记', exact=True).click()
        floating = page.locator('.note-modal-backdrop.is-collapsed')
        expect(floating).to_contain_text('正在整理“')
        expect(floating).to_contain_text('”到笔记中…')
        assert page.locator('.note-float-excerpt').inner_text() == ' '.join(selected.split())[:60]
        assert_clear(page)
        page.screenshot(path=str(OUT / f'{engine}-floating-note-loading.png'))
        for _ in range(100):
            if held: break
            page.wait_for_timeout(10)
        route, body = held.pop()
        route.fulfill(status=200, content_type='application/json', body=body)
        expect(floating).to_contain_text('已整理 · 展开确认')
        assert len(requests) == 1 and requests[0][-1]['conversation'][0]['text'] == '整理这个知识点'
        assert requests[0][-1]['selectedExcerpt'] == selected
        assert notes(page) == [] and page.locator('.note-receipt').count() == 0
        assert not page.locator('#root').evaluate('e => e.inert')
        assert_clear(page)
        page.screenshot(path=str(OUT / f'{engine}-floating-note.png'))
        grip = page.get_by_role('button', name='移动笔记浮层')
        assert grip.evaluate('e => getComputedStyle(e).touchAction') == 'none'
        before = floating.bounding_box()
        handle = grip.bounding_box()
        page.mouse.move(handle['x'] + 12, handle['y'] + 12)
        page.mouse.down()
        page.mouse.move(handle['x'] - 100, 150, steps=8)
        page.mouse.up()
        after = floating.bounding_box()
        assert after['y'] < before['y'] - 50
        assert_clear(page)
        grip.focus(); grip.press('ArrowDown')
        assert floating.bounding_box()['y'] > after['y']
        # Native pointer capture keeps dragging stable even when the pointer leaves the bar.
        handle = grip.bounding_box()
        page.mouse.move(handle['x'] + 10, handle['y'] + 10); page.mouse.down()
        page.mouse.move(-300, -300, steps=5); page.mouse.up()
        assert_clear(page)
        assert floating.bounding_box()['x'] >= 0 and floating.bounding_box()['y'] >= 0
        # Editing text does not drag the window; collapsed sends stay collapsed.
        chat = page.get_by_role('textbox', name='告诉 AI 怎么调整')
        chat.fill('保留适用条件')
        page.get_by_role('button', name='发送', exact=True).click()
        expect(floating).to_contain_text('已整理 · 展开确认')
        page.wait_for_function("!document.querySelector('[aria-label=\"停止生成\"]')")
        assert len(requests) == 2 and notes(page) == []
        old_position = floating.bounding_box()
        page.get_by_role('button', name='展开笔记浮层').click()
        assert page.locator('#root').evaluate('e => e.inert')
        page.get_by_role('button', name='收起笔记浮层').click()
        assert abs(floating.bounding_box()['y'] - old_position['y']) < 2
        for width, height in [(320, 400), (390, 844)]:
            page.set_viewport_size({'width': width, 'height': height})
            assert_clear(page)
        # When the calculator opens, the floating bar must move out of the drawer's controls.
        page.evaluate("location.hash='#/formula'")
        page.get_by_role('button', name='打开科学计算器').wait_for()
        handle = grip.bounding_box()
        page.mouse.move(handle['x'] + 10, handle['y'] + 10); page.mouse.down()
        page.mouse.move(300, 800, steps=5); page.mouse.up()
        assert_clear(page)
        page.get_by_role('button', name='打开科学计算器').click()
        page.locator('.calc-drawer').wait_for()
        assert_clear(page)
        page.get_by_role('button', name='收起计算器', exact=True).click()
        page.get_by_role('button', name='展开笔记浮层').click()
        page.get_by_role('button', name='加入笔记本', exact=True).click()
        wait_notes(page, 1, 'ready')
        page.get_by_role('button', name='关闭笔记浮层').click()
        assert errors == [], errors
        browser.close()
    # Missing AI settings preserve the excerpt and show a useful action, without saving an empty note.
    browser = p.chromium.launch(channel='chrome')
    page = browser.new_page()
    page.goto(APP + '#/chapters'); page.locator('.ch-row').first.click(); page.wait_for_selector('.stem')
    select(page, '.stem', False, True)
    page.get_by_role('button', name='记笔记', exact=True).click()
    page.get_by_text('请先在 AI 设置中配置模型', exact=True).wait_for()
    assert page.get_by_role('button', name='前往 AI 设置', exact=True).is_visible()
    assert notes(page) == []
    browser.close()
print('Auto-send, draggable floating bar, protected controls and confirmation passed')
