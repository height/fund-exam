"""Built-artifact E2E: subject-wide mind map, Chrome/WebKit and mobile/desktop.
Run npm run build then npm run test:knowledge:browser.
Requires Python Playwright, Chrome and WebKit. KNOWLEDGE_TEST_URL can target a server.
"""
import json
import os
import re
from pathlib import Path
from urllib.parse import parse_qs
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'tmp/knowledge-ui'
OUT.mkdir(parents=True, exist_ok=True)
URL = os.environ.get('KNOWLEDGE_TEST_URL', (ROOT / 'dist/index.html').as_uri())
report = []


def fit(page):
    page.get_by_role('button', name='适应画布', exact=True).click()
    page.wait_for_timeout(300)


def click_node(page, name):
    fit(page)
    button = page.get_by_role('button', name=name, exact=True)
    assert button.evaluate('''el => {const r=el.getBoundingClientRect();
      const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return hit===el || el.contains(hit);}'''), f'node not hit-testable: {name}'
    button.click()


def check(page, count):
    expect(page.locator('.kg-depth-1')).to_have_count(count)
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
    assert page.evaluate('document.documentElement.scrollHeight <= innerHeight+1')


def run(browser, engine, mobile):
    context = browser.new_context(viewport={'width':390 if mobile else 1440,'height':844 if mobile else 1000},
                                  is_mobile=mobile, has_touch=mobile, reduced_motion='reduce', color_scheme='light')
    page = context.new_page()
    page.set_default_timeout(8000)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL+'#/map')
    check(page, 8)
    expect(page.get_by_role('button', name='阅读：一、金融市场与资产管理', exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='阅读：八、基金行业文化建设', exact=True)).to_be_visible()
    fit(page)
    canvas = page.locator('.kg-canvas').bounding_box()
    for node in page.locator('.kg-node').all():
        box = node.bounding_box()
        assert box['x'] >= canvas['x']-1 and box['x']+box['width'] <= canvas['x']+canvas['width']+1
        assert box['y'] >= canvas['y']-1 and box['y']+box['height'] <= canvas['y']+canvas['height']+1
    click_node(page, '展开：金融市场与资产管理')
    check(page, 8)
    expect(page.locator('.kg-depth-2')).to_have_count(2)
    click_node(page, '展开：金融市场')
    expect(page.locator('.kg-depth-3')).to_have_count(3)
    click_node(page, '阅读：金融市场五要素')
    detail = page.get_by_role('complementary', name='考点详情')
    expect(detail).to_contain_text('主体、客体')
    assert '页' not in detail.inner_text()
    page.get_by_role('button', name='关闭考点详情').click()
    click_node(page, '展开：基金行业文化建设')
    check(page, 8)
    expect(page.locator('.kg-depth-2')).to_have_count(6)
    click_node(page, '收起：金融市场')
    expect(page.locator('.kg-depth-3')).to_have_count(0)
    page.get_by_role('button', name='展开全部', exact=True).click()
    expect(page.locator('.kg-depth-3')).to_have_count(66)
    check(page, 8)
    page.get_by_role('button', name='收起全部', exact=True).click()
    expect(page.locator('.kg-depth-2')).to_have_count(0)
    page.get_by_role('button', name='放大', exact=True).click()
    page.get_by_role('button', name='恢复 100%', exact=True).click()
    expect(page.get_by_role('button', name='恢复 100%', exact=True)).to_have_text('100%')
    page.get_by_role('button', name='小地图', exact=True).click()
    expect(page.locator('.react-flow__minimap')).to_be_visible()
    page.get_by_role('button', name='小地图', exact=True).click()
    page.get_by_role('textbox', name='搜索知识图谱').fill('不存在的内容xyz')
    expect(page.get_by_text('没有找到相关内容', exact=True)).to_be_visible()
    page.get_by_role('button', name='清空搜索', exact=True).click()
    if mobile: page.get_by_role('button', name='关闭章节导航').click()
    page.get_by_role('button', name='全屏查看').click()
    expect(page.locator('.kg-workspace')).to_have_class(re.compile('kg-fullscreen'))
    page.get_by_role('tab', name=re.compile('科目二 投资基础')).click()
    check(page, 18)
    expect(page.get_by_role('button', name='阅读：十八、基金销售基础知识', exact=True)).to_be_visible()
    page.get_by_role('button', name='退出全屏').click()
    page.get_by_role('textbox', name='搜索知识图谱').fill('var 置信')
    page.get_by_role('complementary', name='搜索结果').get_by_role('button', name=re.compile('VaR、ES与压力测试')).click()
    check(page, 18)
    expect(detail).to_contain_text('置信水平')
    page.get_by_role('button', name='关闭考点详情').click()
    page.get_by_role('tab', name='大纲', exact=True).click()
    expect(page.locator('.kg-outline-chapter')).to_have_count(18)
    page.locator('.kg-outline-points').get_by_role('button', name=re.compile('VaR、ES与压力测试')).click()
    expect(detail).to_contain_text('置信水平')
    page.get_by_role('button', name='关闭考点详情').click()
    page.get_by_role('tab', name='脑图', exact=True).click()
    check(page, 18)
    page.get_by_role('button', name='切换到深色主题').click()
    expect(page.locator('.react-flow')).to_have_class(re.compile('dark'))
    fit(page)
    page.screenshot(path=str(OUT/f'{engine}-{"mobile" if mobile else "desktop"}-all-chapters.png'))
    page.get_by_role('textbox', name='搜索知识图谱').fill('var 置信')
    page.get_by_role('complementary', name='搜索结果').get_by_role('button', name=re.compile('VaR、ES与压力测试')).click()
    page.get_by_role('button', name='练习本章题目').click()
    page.wait_for_selector('.stem')
    assert parse_qs(page.url.split('?',1)[1])['scope']==['ch:投资风险管理']
    assert page.evaluate("document.body.style.overflow !== 'hidden'")
    assert not errors, errors
    report.append({'engine':engine,'mobile':mobile,'passed':True,'pageErrors':errors})
    context.close()


with sync_playwright() as p:
    for engine in ['chromium','webkit']:
        browser = getattr(p,engine).launch(**({'channel':'chrome'} if engine=='chromium' else {}))
        for mobile in [False,True]:
            run(browser,engine,mobile)
            print(f'PASS {engine} {"mobile" if mobile else "desktop"}',flush=True)
        browser.close()
(OUT/'e2e-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
