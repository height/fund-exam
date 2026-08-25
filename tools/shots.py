#!/usr/bin/env python3
"""生成 README 用的产品截图。先 build，再把一份像样的做题进度种进 IndexedDB
（空荡荡的首页拍出来没人想点），然后逐页截。

    python3 tools/shots.py        # -> docs/screenshots/*.png
"""
import json, random, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs/screenshots"
APP = (ROOT / "dist/index.html").as_uri()

# 假 AI 流：SSE 逐字回，截出来的是真实渲染，不是贴图
AI_TEXT = ("**考点**：基金财产的独立性。\n\n"
           "基金财产独立于基金管理人、托管人的固有财产。管理人破产清算时，"
           "基金财产不属于其清算财产——这是「财产独立性」最典型的体现。\n\n"
           "**怎么记**：钱只是放在他们那儿保管，不是他们的钱。"
           "保管员欠了债，债主不能来拿你寄存的东西。\n")


def sse(text):
    body = "".join('data: %s\n\n' % json.dumps(
        {"choices": [{"delta": {"content": c}}]}) for c in text)
    return body + "data: [DONE]\n\n"


def seed(pg, qs):
    """种一份 300 题、正确率 ~72% 的记录，外加两场模拟考"""
    random.seed(7)
    picked = random.sample(qs, 300)
    now = int(time.time() * 1000)
    recs, wrong = [], 0
    for i, q in enumerate(picked):
        ok = random.random() < 0.72
        if not ok and wrong < 34:
            wrong += 1
        recs.append({"qid": q["id"], "subject": q["subject"], "seen": 1,
                     "right": 1 if ok else 0, "wrong": 0 if ok else 1,
                     "wrongFlag": not ok and wrong <= 34,
                     # 摊到最近 8 天，不然首页会写「今日练习 300 题」
                     "lastTs": now - int(i / 40) * 86400000 - (i % 40) * 90000})
    exams = [
        {"id": now - 86400000 * 3, "subject": "科目一", "ts": now - 86400000 * 3,
         "score": 71, "right": 71, "total": 100, "usedMs": 68 * 60000, "ids": [], "answers": {}},
        {"id": now - 86400000, "subject": "科目一", "ts": now - 86400000,
         "score": 83, "right": 83, "total": 100, "usedMs": 61 * 60000, "ids": [], "answers": {}},
    ]
    pg.evaluate("""async ([recs, exams]) => {
        const db = await new Promise(res => {
            const r = indexedDB.open('fund-quiz', 1)
            r.onsuccess = () => res(r.result)
        })
        const put = (store, rows) => new Promise(res => {
            const t = db.transaction(store, 'readwrite').objectStore(store)
            rows.forEach(v => t.put(v))
            t.transaction.oncomplete = res
        })
        await put('records', recs)
        await put('exams', exams)
    }""", [recs, exams])


def shot(pg, name, full=False):
    pg.wait_for_timeout(450)
    pg.screenshot(path=str(OUT / f"{name}.png"), full_page=full)
    print("  ", name + (".png (整页)" if full else ".png"))


def run():
    subprocess.run(["npm", "run", "build"], cwd=ROOT, check=True,
                   stdout=subprocess.DEVNULL)
    qs = json.loads((ROOT / "src/data/questions.json").read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as p:
        br = p.chromium.launch(channel="chrome")
        pg = br.new_page(viewport={"width": 390, "height": 844},
                         device_scale_factor=2, is_mobile=True, has_touch=True,
                         color_scheme="dark")
        pg.route("**/chat/completions", lambda r: r.fulfill(
            status=200, content_type="text/event-stream", body=sse(AI_TEXT)))

        pg.goto(APP)
        pg.wait_for_selector(".tile")
        seed(pg, qs)
        pg.evaluate("""() => localStorage.setItem('ai-config', JSON.stringify(
            {active:'deepseek', providers:{deepseek:{
                url:'https://api.deepseek.com/chat/completions',
                model:'deepseek-v4-pro', key:'sk-demo'}}, ttsKey:'demo'}))""")
        pg.reload()
        pg.wait_for_selector(".tile")
        print("截图 ->", OUT)

        shot(pg, "01-home")

        pg.evaluate("location.hash='#/chapters'"); shot(pg, "02-chapters")

        # 练习：答一题并把解析露出来
        pg.evaluate("location.hash='#/practice?scope=all&order=seq'")
        pg.wait_for_selector(".stem")
        pg.locator(".opt").nth(2).click()
        pg.wait_for_selector(".explain")
        shot(pg, "03-practice")

        # AI 解析：答错才有这个 tab
        tabs = pg.locator('.explain-tabs button:has-text("AI 解析")')
        if tabs.count():
            tabs.click()
            pg.wait_for_timeout(1400)
            pg.locator(".explain").scroll_into_view_if_needed()
            shot(pg, "04-ai")

        pg.evaluate("location.hash='#/practice'")
        pg.wait_for_selector("h1")
        shot(pg, "05-practice-setup", full=True)

        # 模拟考：开考后带倒计时
        pg.evaluate("location.hash='#/exam'")
        pg.wait_for_selector("h1")
        btn = pg.get_by_role("button", name="开始考试")
        if btn.count():
            btn.click()
            pg.wait_for_selector(".timer")
            for _ in range(12):
                pg.locator(".opt").nth(random.randint(0, 3)).click()
                pg.wait_for_timeout(60)
                nxt = pg.locator('.actionbar button[aria-label="下一题"]')
                (nxt if nxt.count() else pg.locator(".actionbar button").nth(1)).click()
                pg.wait_for_timeout(60)
            pg.wait_for_timeout(2200)          # 让倒计时走起来，别停在 120:00
            shot(pg, "06-exam")
            pg.evaluate("() => indexedDB.open('fund-quiz',1)")
        pg.evaluate("""async () => {
            const db = await new Promise(r => { const q=indexedDB.open('fund-quiz',1); q.onsuccess=()=>r(q.result) })
            db.transaction('kv','readwrite').objectStore('kv').delete('activeExam')
        }""")

        pg.evaluate("location.hash='#/wrong'"); shot(pg, "07-wrong")

        # 公式攻坚 + 计算器抽屉
        pg.evaluate("location.hash='#/formula'")
        pg.wait_for_selector(".calc-fab")
        pg.locator(".calc-fab").click()
        pg.wait_for_selector(".calc-drawer")
        for k in ["1", "0", "0", "0", "0", "×", "(", "1", "+", "3", "%", ")", "x²"]:
            pg.locator(f'.calc-pad button:text-is("{k}")').click()
        shot(pg, "08-calculator")

        pg.evaluate("location.hash='#/timeline'")
        pg.wait_for_selector(".tl-card")
        shot(pg, "09-timeline")

        pg.evaluate("location.hash='#/map'")
        pg.wait_for_selector(".map-node")
        pg.locator(".map-node.d1").first.click()
        pg.wait_for_timeout(500)
        pg.evaluate("() => document.querySelector('.map-wrap').scrollLeft = 0")
        shot(pg, "10-map")

        pg.evaluate("location.hash='#/data'")
        pg.wait_for_selector("h1")
        shot(pg, "11-settings")

        # 浅色的首页，让 README 能同时展示两套主题
        pg.evaluate("() => document.documentElement.setAttribute('data-theme','light')")
        pg.evaluate("location.hash='#/home'")
        shot(pg, "12-home-light")

        br.close()

    # PNG 压缩：UI 截图色彩少，量化到 256 色肉眼看不出差别，体积降一个数量级
    from PIL import Image
    total = 0
    for f in sorted(OUT.glob("*.png")):
        before = f.stat().st_size
        im = Image.open(f).convert("RGB").quantize(colors=256, method=Image.MAXCOVERAGE)
        im.save(f, optimize=True)
        total += f.stat().st_size
        print(f"   {f.name}  {before // 1024}K -> {f.stat().st_size // 1024}K")
    print(f"合计 {total // 1024}K")


if __name__ == "__main__":
    sys.exit(run())
