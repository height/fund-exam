from pathlib import Path
from playwright.sync_api import sync_playwright
Path('/tmp/fund-ui').mkdir(parents=True, exist_ok=True)
URL=(Path(__file__).resolve().parents[1] / 'dist/index.html').as_uri()
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome')
 for width in [320,390]:
  pg=b.new_page(viewport={'width':width,'height':844},is_mobile=True,has_touch=True)
  pg.goto(URL+'#/chapters');pg.wait_for_selector('.practice-dock')
  assert pg.locator('.app-bottom-nav').count()==0
  assert pg.locator('.calc-fab').count()==0
  pg.get_by_role('tab',name='科目二',exact=False).click()
  pg.locator('.practice-chapter-picker .ch-row').nth(2).click()
  title=pg.locator('.ch-row.selected b').inner_text()
  pg.reload();pg.wait_for_selector('.practice-dock')
  assert pg.get_by_role('tab',name='科目二',exact=False).get_attribute('aria-selected')=='true'
  assert pg.locator('.ch-row.selected b').inner_text()==title
  pg.get_by_role('button',name='随机',exact=True).click()
  assert pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
  box=pg.locator('.practice-start').bounding_box();assert box['y']+box['height']<=844
  pg.screenshot(path=f'/tmp/fund-ui/unified-{width}.png')
  pg.locator('.practice-range-tabs button').nth(2).click();assert pg.locator('.practice-start').is_disabled()
  pg.locator('.practice-range-tabs button').first.click()
  pg.locator('.practice-start').click();pg.wait_for_selector('.opt')
  assert title in pg.locator('.page-head h1').inner_text()
  pg.goto(URL+'#/home');pg.wait_for_selector('.go-seq');pg.locator('.go-seq').click();pg.wait_for_selector('.practice-dock')
  assert pg.locator('.ch-row.selected b').inner_text()==title
  pg.close()
 b.close()
 print('PASS: unified entries, saved subject/chapter, range filter, empty state, dock and start at 320/390px')
