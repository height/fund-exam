#!/usr/bin/env python3
"""WebKit 触摸长按 E2E：专门覆盖 Chromium CDP 无法代表的 Safari 事件模型。"""
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "dist" / "index.html").as_uri()


def point_for(page, selector, index):
    return page.eval_on_selector(selector, """(root, wanted) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let node, seen = 0
      while ((node = walker.nextNode())) {
        if (wanted < seen + node.data.length) {
          const at = wanted - seen, r = document.createRange()
          r.setStart(node, at); r.setEnd(node, Math.min(at + 1, node.data.length))
          const b = r.getBoundingClientRect()
          return {x:b.left + Math.max(1,b.width/2), y:b.top + b.height/2}
        }
        seen += node.data.length
      }
      throw new Error('指定字符超出文本')
    }""", index)


def touch(page, selector, kind, point, ident):
    """WebKit 不开放持续触摸协议，用它自身的 createTouch/TouchList 注入真实 DOM TouchEvent。"""
    page.eval_on_selector(selector, """(target, arg) => {
      const t = document.createTouch(window,target,arg.ident,arg.x,arg.y,arg.x,arg.y,
        arg.x,arg.y,2,2,0,1)
      const changed = document.createTouchList(t)
      const active = arg.kind === 'touchend' ? document.createTouchList() : changed
      target.dispatchEvent(new TouchEvent(arg.kind,{bubbles:true,cancelable:true,
        touches:active,targetTouches:active,changedTouches:changed}))
    }""", {"kind": kind, "x": point["x"], "y": point["y"], "ident": ident})


def hold(page, selector, index=2, ident=1):
    point = point_for(page, selector, index)
    touch(page, selector, "touchstart", point, ident)
    page.wait_for_timeout(500)
    page.wait_for_selector(".sel-tip", timeout=1200)
    return point


def expected_word(page, selector, index):
    return page.eval_on_selector(selector, """(root, index) => {
      const walker = document.createTreeWalker(root,NodeFilter.SHOW_TEXT)
      let node, value = ''
      while ((node = walker.nextNode())) value += node.data
      const segments = [...new Intl.Segmenter('zh-CN',{granularity:'word'}).segment(value)]
      const hit = segments.find(s => index >= s.index && index < s.index + s.segment.length)
      return hit?.isWordLike ? hit.segment : null
    }""", index)


def assert_custom_selection_visible(page):
    assert page.locator('.sel-marks i').count() >= 1, "自定义选区没有绘制高亮矩形"
    visible = page.eval_on_selector_all('.sel-marks i', """els => els.some(el => {
      const r = el.getBoundingClientRect(), bg = getComputedStyle(el).backgroundColor
      return r.width > 0 && r.height > 0 && bg !== 'transparent' && !bg.endsWith(', 0)')
    })""")
    assert visible, "自定义选区矩形不可见"


def assert_tip_above_selection(page):
    position = page.evaluate("""() => {
      const tip=document.querySelector('.sel-tip').getBoundingClientRect()
      const mark=document.querySelector('.sel-marks i').getBoundingClientRect()
      return {tipBottom:tip.bottom,markTop:mark.top,gap:mark.top-tip.bottom,
        side:document.querySelector('.sel-tip').dataset.side}
    }""")
    assert position["side"] == "above" and position["tipBottom"] <= position["markTop"], \
        f"解释控件没有位于选区上方：{position}"
    assert 2 <= position["gap"] <= 4, f"解释控件与选区的垂直间距发生漂移：{position}"


def assert_handles_aligned(page):
    position = page.evaluate("""() => {
      const marks=[...document.querySelectorAll('.sel-marks i')]
      const first=marks[0].getBoundingClientRect(), last=marks.at(-1).getBoundingClientRect()
      const center=(selector) => {
        const el=document.querySelector(selector), box=el.getBoundingClientRect()
        const knob=getComputedStyle(el,'::after')
        return box.top+parseFloat(knob.top)+parseFloat(knob.height)/2
      }
      return {markTop:first.top,markBottom:last.bottom,
        startCenter:center('.sel-handle-start'),endCenter:center('.sel-handle-end')}
    }""")
    assert abs(position["startCenter"] - position["markTop"]) <= 1, \
        f"起点手柄没有对齐选区顶部：{position}"
    assert abs(position["endCenter"] - position["markBottom"]) <= 1, \
        f"终点手柄没有对齐选区底部：{position}"


def run():
    subprocess.run(["npm", "run", "build"], cwd=ROOT, check=True)
    with sync_playwright() as p:
        browser = p.webkit.launch()
        context = browser.new_context(viewport={"width": 390, "height": 844},
                                      is_mobile=True, has_touch=True)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(APP)
        page.wait_for_selector(".today")

        env = page.evaluate("""() => ({
          coarse:matchMedia('(any-pointer:coarse)').matches,
          touch:'ontouchstart' in window,
          enabled:document.documentElement.hasAttribute('data-custom-selection'),
          caret:!!(document.caretPositionFromPoint || document.caretRangeFromPoint)
        })""")
        assert env["enabled"] and env["touch"] and env["caret"], f"WebKit 触摸环境未就绪：{env}"

        # 用户截图的原始失败位置：首页「今日练习」。
        expected = expected_word(page, ".today>span", 2)
        point = hold(page, ".today>span", ident=11)
        assert page.locator(".sel-tip").get_attribute("data-term") == expected, \
            "WebKit 首页长按命中了相邻词"
        assert page.locator(".sel-tip-copy").text_content() == f'解释 “{expected}”', \
            "解释按钮没有显示当前选中词"
        assert page.locator(".sel-tip-term").inner_text() == expected
        assert page.eval_on_selector(".sel-tip-term", "e=>e.scrollWidth<=e.clientWidth"), \
            "短词不应出现省略"
        assert page.locator(".sel-handle").count() == 2, "WebKit 没画双端手柄"
        assert_custom_selection_visible(page)
        assert_handles_aligned(page)
        assert_tip_above_selection(page)
        assert page.evaluate("getSelection().isCollapsed"), "WebKit 误用了系统 Selection"
        touch(page, ".today>span", "touchend", point, 11)

        # iOS WebView 可能返回上一行的旧 caret；强制让浏览器 API 给出错误结果，
        # 几何命中仍必须按实际字符矩形选中触点下的词。
        page.evaluate("""() => {
          window.__originalCaretPositionFromPoint = document.caretPositionFromPoint
          document.caretPositionFromPoint = () => ({offsetNode:document.body,offset:0})
        }""")
        # 用户第一张图的触点：首页战绩主标题。
        expected = expected_word(page, ".hero-verdict b", 2)
        point = hold(page, ".hero-verdict b", ident=13)
        assert page.locator(".sel-tip").get_attribute("data-term") == expected, \
            "WebKit 错误 caret 干扰了几何取词"
        assert page.locator(".sel-tip-copy").text_content() == f'解释 “{expected}”'
        assert_custom_selection_visible(page)
        assert page.evaluate("getSelection().isCollapsed"), "WebKit 主标题取词退回了系统 Selection"
        touch(page, ".hero-verdict b", "touchend", point, 13)
        page.evaluate("""() => {
          if (window.__originalCaretPositionFromPoint)
            document.caretPositionFromPoint = window.__originalCaretPositionFromPoint
          else delete document.caretPositionFromPoint
          delete window.__originalCaretPositionFromPoint
        }""")

        # 题干同样走自定义选区，解释入口可真实点开。
        page.evaluate("location.hash='#/practice'")
        page.wait_for_selector('button:has-text("开始练习")')
        page.click('button:has-text("开始练习")')
        page.wait_for_selector(".stem")
        point = hold(page, ".stem", ident=12)
        term = page.locator(".sel-tip").get_attribute("data-term")
        assert term and page.locator(".sel-handle").count() == 2
        touch(page, ".stem", "touchend", point, 12)
        page.locator(".sel-tip").tap()
        page.wait_for_selector(".bubble")
        assert page.locator(".bubble-term").inner_text() == term
        assert not errors, f"WebKit 页面报错：{errors}"
        browser.close()
    print("WebKit 长按 E2E 通过")


if __name__ == "__main__":
    sys.exit(run())
