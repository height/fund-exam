"""Built-app regression: whole-node taps, drag suppression and viewport-wide notes."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tmp/knowledge-interaction'
OUT.mkdir(parents=True, exist_ok=True)
URL = (ROOT / 'dist/index.html').as_uri() + '#/map'
report = []

with sync_playwright() as p:
    for engine in ['chromium', 'webkit']:
        browser = getattr(p, engine).launch(**({'channel': 'chrome'} if engine == 'chromium' else {}))
        for mobile in [False, True]:
            context = browser.new_context(viewport={'width':390 if mobile else 1440, 'height':844 if mobile else 1000}, is_mobile=mobile, has_touch=mobile, reduced_motion='reduce', color_scheme='light')
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(URL)
            page.get_by_role('tab', name='脑图', exact=True).click()
            def action(name):
                target = page.get_by_role('button', name=name, exact=True)
                if mobile: target.tap()
                else: target.click()
            action('展开：金融市场与资产管理')
            expect(page.locator('.kg-depth-2')).to_have_count(2)
            expect(page.get_by_role('complementary', name='考点详情')).to_have_count(0)
            action('收起：金融市场与资产管理')
            expect(page.locator('.kg-depth-2')).to_have_count(0)
            action('展开：金融市场与资产管理')
            action('展开：金融市场')
            expect(page.locator('.kg-depth-3')).to_have_count(3)
            action('收起：金融市场')
            expect(page.locator('.kg-depth-3')).to_have_count(0)
            action('展开：金融市场')
            # Drag beginning on a node must pan, not expand/collapse on pointer up.
            # WebKit suppresses compatibility mouse input just after a touch tap.
            if mobile: page.wait_for_timeout(600)
            target = page.get_by_role('button', name='收起：金融市场', exact=True)
            box = target.bounding_box()
            transform = page.locator('.react-flow__viewport').get_attribute('style')
            page.mouse.move(box['x']+box['width']/2, box['y']+box['height']/2)
            page.mouse.down()
            page.mouse.move(box['x']+box['width']/2-40, box['y']+box['height']/2+70, steps=8)
            page.mouse.up()
            expect(page.locator('.kg-depth-3')).to_have_count(3)
            assert page.locator('.react-flow__viewport').get_attribute('style') != transform
            # Search provides a route to any off-screen point without shrinking text.
            page.get_by_role('searchbox', name='搜索知识图谱').fill('金融市场五要素')
            page.get_by_role('complementary', name='搜索结果').get_by_role('button').click()
            detail = page.get_by_role('complementary', name='考点详情')
            expect(detail).to_be_visible()
            page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
            before = page.locator('.react-flow__viewport').get_attribute('style')
            action('笔记全屏')
            expect(page.locator('.kg-header')).to_be_hidden()
            expect(page.locator('.kg-toolbar')).to_be_hidden()
            box = detail.bounding_box()
            size = page.viewport_size
            assert abs(box['x']) < 1 and abs(box['y']) < 1, box
            assert abs(box['width']-size['width']) < 1 and abs(box['height']-size['height']) < 1, box
            expect(detail.get_by_role('button', name='朗读考点笔记')).to_be_visible()
            expect(detail.get_by_role('button', name='下一考点')).to_be_visible()
            expect(detail.get_by_role('button', name='练习本章题目')).to_be_visible()
            page.screenshot(path=str(OUT / f'{engine}-{"mobile" if mobile else "desktop"}-fullscreen.png'))
            page.keyboard.press('Escape')
            expect(detail).to_be_visible()
            expect(page.locator('.kg-header')).to_be_visible()
            expect(page.locator('.react-flow__viewport')).to_have_attribute('style', before)
            action('笔记全屏')
            action('下一考点')
            expect(detail.get_by_role('heading', name='金融工具、资产与产品', exact=True)).to_be_visible()
            expect(page.locator('.kg-header')).to_be_hidden()
            if mobile:
                page.set_viewport_size({'width':844,'height':390})
                page.wait_for_timeout(150)
                assert abs(detail.bounding_box()['height'] - 390) < 1
                page.set_viewport_size({'width':390,'height':844})
            action('关闭考点详情')
            expect(page.locator('.kg-header')).to_be_visible()
            expect(detail).to_have_count(0)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            page.screenshot(path=str(OUT / f'{engine}-{"mobile" if mobile else "desktop"}-map.png'))
            assert not errors, errors
            report.append({'engine':engine,'mobile':mobile,'passed':True})
            print('PASS',engine,'mobile' if mobile else 'desktop',flush=True)
            context.close()
        browser.close()
(OUT/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
