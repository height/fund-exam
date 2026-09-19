"""Check the authored study experience in the built app, without external AI calls."""
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tmp/knowledge-distillation'
OUT.mkdir(parents=True, exist_ok=True)
URL = (ROOT / 'dist/index.html').as_uri() + '#/map'
report = []

with sync_playwright() as p:
    for engine in ['chromium', 'webkit']:
        browser = getattr(p, engine).launch(**({'channel': 'chrome'} if engine == 'chromium' else {}))
        for mobile in [False, True]:
            context = browser.new_context(viewport={'width': 390 if mobile else 1440, 'height': 844 if mobile else 1000}, is_mobile=mobile, has_touch=mobile, reduced_motion='reduce', color_scheme='light')
            page = context.new_page()
            page.set_default_timeout(8000)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(URL)
            expect(page.locator('.kg-path-stage')).to_have_count(4)
            expect(page.locator('.kg-path-chapter')).to_have_count(8)
            page.locator('.kg-path-chapter > button').first.click()
            expect(page.locator('.kg-path-leaves button')).to_have_count(6)
            page.locator('.kg-path-leaves button').first.click()
            detail = page.get_by_role('complementary', name='考点详情')
            expect(detail).to_contain_text('谁交易')
            expect(detail.locator('.kg-reference, .kg-pen-legend')).to_have_count(0)
            detail.get_by_role('button', name='下一考点').click()
            expect(detail.locator('.kg-reference, .kg-pen-legend')).to_have_count(0)
            page.get_by_role('button', name='关闭考点详情').click()
            page.get_by_role('tab', name=re.compile('科目二 投资基础')).click()
            expect(page.locator('.kg-path-stage')).to_have_count(6)
            expect(page.locator('.kg-path-chapter')).to_have_count(18)
            page.screenshot(path=str(OUT / f'{engine}-{"mobile" if mobile else "desktop"}-path.png'))
            def select(title):
                page.get_by_role('searchbox', name='搜索知识图谱').fill(title)
                page.get_by_role('complementary', name='搜索结果').get_by_role('button', name=re.compile(title)).click()
            for title in ['风险调整收益', '均值方差与分散化', 'CAL、CML与CAPM', '久期、凸性与期限结构', '募集、合同生效与认购']:
                select(title)
                page.get_by_role('button', name='笔记全屏').click()
                expect(detail.locator('math').first).to_be_visible()
                expect(detail.locator('.katex-error')).to_have_count(0)
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                assert detail.locator('.kg-detail-scroll').evaluate('el => el.scrollWidth <= el.clientWidth + 1'), title
                if title in ['CAL、CML与CAPM', '久期、凸性与期限结构', '募集、合同生效与认购']:
                    expect(detail.locator('.kg-concept-diagram svg')).to_have_attribute('role', 'img')
                    assert detail.locator('.kg-concept-diagram svg').evaluate('el => !!el.querySelector("title").textContent && !!el.querySelector("desc").textContent')
                if title == '风险调整收益':
                    detail.locator('.kg-mini-example > summary').click()
                    expect(detail).to_contain_text('夏普0.5')
                    page.screenshot(path=str(OUT / f'{engine}-{"mobile" if mobile else "desktop"}-formula.png'))
                if title == 'CAL、CML与CAPM':
                    detail.locator('.kg-concept-diagram').scroll_into_view_if_needed()
                    page.screenshot(path=str(OUT / f'{engine}-{"mobile" if mobile else "desktop"}-diagram.png'))
                    detail.locator('.kg-related').get_by_role('button', name='系统性风险与套利定价').click()
                    expect(detail.get_by_role('heading', name='系统性风险与套利定价', exact=True)).to_be_visible()
                page.get_by_role('button', name='关闭考点详情').click()
            for _ in range(4):
                if page.locator('html').get_attribute('data-theme') == 'dark': break
                page.locator('.theme-toggle').click()
            select('风险调整收益')
            page.get_by_role('button', name='笔记全屏').click()
            page.screenshot(path=str(OUT / f'{engine}-{"mobile" if mobile else "desktop"}-dark.png'))
            assert not errors, errors
            report.append({'engine': engine, 'mobile': mobile, 'passed': True})
            print('PASS', engine, 'mobile' if mobile else 'desktop', flush=True)
            context.close()
        browser.close()
(OUT / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
