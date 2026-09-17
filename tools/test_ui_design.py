from playwright.sync_api import sync_playwright
import os
from pathlib import Path

# Run against the production artifact by default, or set UI_TEST_URL for a dev server.
BASE = os.environ.get("UI_TEST_URL", (Path(__file__).resolve().parents[1] / "dist/index.html").as_uri())
SHOTS = Path(os.environ.get("UI_TEST_SHOTS", "/tmp/fund-ui"))
SHOTS.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(channel='chrome')
 errors=[]
 for width in [1440,390,320]:
  pg=b.new_page(viewport={'width':width,'height':1000 if width==1440 else 844},device_scale_factor=1)
  pg.on('pageerror',lambda e: errors.append(str(e)))
  pg.goto(BASE);pg.wait_for_selector('.hero-top');pg.wait_for_timeout(250)
  pg.screenshot(path=f'{SHOTS}/home-{width}.png',full_page=True)
  for route in ['home','practice','exam','wrong','data','chapters','notebook','formula','numbers','tools']:
   pg.goto(BASE+'#/'+route);pg.wait_for_timeout(250)
   assert pg.locator('h1').count(),route
   current_hash=pg.evaluate('location.hash')
   pg.locator('.skip').evaluate('e=>e.click()')
   assert pg.evaluate('location.hash')==current_hash
   assert pg.locator('#app').evaluate('e=>e===document.activeElement')
   overflow=pg.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
   assert not overflow,(width,route,'overflow')
  pg.goto(BASE+'#/chapters');pg.locator('.ch-row').first.click();pg.wait_for_selector('.opt')
  assert not pg.locator('.app-bottom-nav').count()
  pg.locator('.opt').first.click();pg.screenshot(path=f'{SHOTS}/practice-{width}.png',full_page=True)
  pg.goto(BASE+'#/home');pg.wait_for_selector('.hero-top');pg.wait_for_timeout(250)
  pg.emulate_media(color_scheme='dark');pg.wait_for_timeout(300);pg.screenshot(path=f'{SHOTS}/dark-{width}.png',full_page=True)
  pg.emulate_media(reduced_motion='reduce')
  assert pg.locator('#app').evaluate('e=>getComputedStyle(e).animationName')=='none'
  assert pg.locator('.app-bottom-nav button[aria-current=page]').count()==1
  assert 'user-scalable=no' not in pg.locator('meta[name=viewport]').get_attribute('content')
  pg.close()
 assert not errors, errors
 b.close()
 print('PASS: 10 routes × 3 viewports, answer flow, dark theme, reduced motion, zoom; no runtime errors')
