"""新版章节和知识图谱交互回归；先 npm run build，依赖 Playwright 和本机 Chrome。"""
import re
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1];url=(root/'dist/index.html').as_uri()
(root/'tmp/lecture-review').mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
 browser=p.chromium.launch(channel='chrome')
 page=browser.new_page(viewport={'width':390,'height':844})
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(url+'#/map')
 page.wait_for_selector('[role=tree]')
 assert page.locator('.map-node.d1').count()==8
 assert not re.search(r'讲义第|讲义.*页|依据：',page.locator('body').inner_text())
 page.get_by_role('treeitem',name='基金行业文化建设',exact=True).click()
 page.get_by_role('treeitem',name='中国特色金融文化的内涵',exact=True).click()
 page.get_by_role('treeitem',name='中国特色金融文化',exact=True).click()
 assert '诚实守信' in page.get_by_role('dialog').inner_text()
 page.get_by_role('tab',name=re.compile('科目二 投资基础')).click()
 assert page.locator('.map-node.d1').count()==18
 assert page.get_by_role('dialog').count()==0
 assert page.locator('.map-node.d2').count()==0,'切科目后不能串用展开状态'
 page.get_by_role('treeitem',name='投资风险管理',exact=True).click()
 page.get_by_role('treeitem',name='投资风险的测度',exact=True).click()
 page.get_by_role('treeitem',name='VaR、ES与压力测试',exact=True).click()
 assert '置信水平' in page.get_by_role('dialog').inner_text()
 assert '页' not in page.get_by_role('dialog').inner_text()
 page.screenshot(path=str(root/'tmp/lecture-review/map-mobile.png'),full_page=True)
 page.get_by_role('button',name='去练「投资风险管理」›',exact=True).click()
 page.wait_for_selector('.stem')
 assert 'ch%3A' in page.url or 'scope=ch' in page.url
 assert page.locator('.chip').filter(has_text='投资风险管理').count()>0
 page.goto(url+'#/chapters')
 page.wait_for_selector('.ch-row')
 assert page.locator('.ch-row').count()==18
 assert '投资管理基础' in page.locator('.ch-row').nth(2).inner_text()
 assert '4 节' in page.locator('.ch-row').nth(2).inner_text()
 assert '页' not in '\n'.join(page.locator('.ch-row').all_inner_texts())
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
 page.screenshot(path=str(root/'tmp/lecture-review/chapters-mobile.png'),full_page=True)
 page.get_by_role('tab',name=re.compile('科目一 法律法规')).click()
 assert page.locator('.ch-row').count()==8
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
 page.goto(url+'#/map')
 page.wait_for_selector('[role=tree]')
 page.get_by_role('button',name='展开',exact=True).click()
 assert page.locator('.map-node.d3').count()==66
 page.get_by_role('button',name='收起',exact=True).click()
 assert page.locator('.map-node.d3').count()==0
 assert not errors,errors
 browser.close()
 print('浏览器通过：两科章节与图谱、切换重置、考点详情无页码、按章跳题、手机宽度、展开收起；无运行时错误')
