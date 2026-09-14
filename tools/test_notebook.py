#!/usr/bin/env python3
"""笔记闭环验证：真实浏览器与本地存储，AI 用受控 SSE 响应，不使用真实 Key。先运行 npm run build。"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from test_selection_webkit import hold, touch, assert_custom_selection_visible, point_for

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / 'dist/index.html').as_uri()
OUT = Path('/tmp/fund-notebook-qa')
OUT.mkdir(exist_ok=True)


def notes(page):
    return page.evaluate('''() => new Promise((resolve,reject) => {
      const r=indexedDB.open('fund-quiz');r.onsuccess=()=>{
        const db=r.result, req=db.transaction('kv').objectStore('kv').getAll();
        req.onsuccess=()=>{resolve(req.result.filter(r=>r.k.startsWith('notebook:')).map(r=>r.v));db.close()};req.onerror=()=>reject(req.error)
      }
    })''')


def select(page, selector, mobile, whole=False):
    page.locator(selector).first.scroll_into_view_if_needed()
    if mobile:
        point = hold(page, selector, ident=61)
        touch(page, selector, 'touchend', point, 61)
        assert_custom_selection_visible(page)
        if whole:
            end = page.eval_on_selector(selector, 'el=>Math.min(el.textContent.length-2,110)')
            at = point_for(page, selector, end)
            handle = page.locator('.sel-handle-end').bounding_box()
            touch(page, '.sel-handle-end', 'touchstart', {'x':handle['x']+12,'y':handle['y']+10}, 62)
            touch(page, '.sel-handle-end', 'touchmove', at, 62)
            page.wait_for_timeout(100)
            touch(page, '.sel-handle-end', 'touchend', at, 62)
    else:
        page.eval_on_selector(selector, '''el=>{
          const r=document.createRange();r.selectNodeContents(el);
          getSelection().removeAllRanges();getSelection().addRange(r)
        }''')
    page.wait_for_selector('.sel-tip')
    box=page.locator('.sel-tip').bounding_box()
    assert box['x'] >= 0 and box['x']+box['width'] <= page.viewport_size['width']+1, box

def wait_notes(page, count, status=None):
    for _ in range(200):
        rows = notes(page)
        if len(rows) == count and (not status or all(n['status'] == status for n in rows)): return
        page.wait_for_timeout(100)
    raise AssertionError((count, status, rows))


def seed(page,note):
    page.evaluate('''note=>new Promise(resolve=>{const r=indexedDB.open('fund-quiz');r.onsuccess=()=>{const db=r.result,tx=db.transaction('kv','readwrite');tx.objectStore('kv').put({k:'notebook:'+note.id,v:note});tx.oncomplete=()=>{db.close();window.dispatchEvent(new Event('notebook-changed'));resolve()}}})''',note)


def run():
    # Creation now requires explicit confirmation; use the current end-to-end flow.
    from test_note_dialog import run as run_dialog
    run_dialog()

if __name__=='__main__':run()
