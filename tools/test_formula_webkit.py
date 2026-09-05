#!/usr/bin/env python3
"""Real WebKit regression against the production PWA. Run npm run build first."""
import functools
import json
import subprocess
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
KEY = 'formula-course-progress-v1'
COURSES = json.loads(subprocess.check_output(['node', '--input-type=module', '-e',
    'import {COURSE_UNITS,guidedQuestion} from "./src/data/formulaCourses.js"; console.log(JSON.stringify(COURSE_UNITS.map(u=>({...u, guided:u.steps.map((s,i)=>guidedQuestion(u,i)),questions:u.questions.map(q=>({...q,correctInput:typeof q.answer==="number"?q.answer.toFixed(2):q.answer}))}))));'], cwd=ROOT))

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_): pass

READ = """key => new Promise((resolve, reject) => {
  const r = indexedDB.open('fund-quiz', 1);
  r.onsuccess = () => { const db=r.result; const q=db.transaction('kv').objectStore('kv').get(key); q.onsuccess=()=>{resolve(q.result?.v);db.close()}; q.onerror=()=>reject(q.error); };
})"""
WRITE = """([key, value]) => new Promise((resolve, reject) => {
  const r=indexedDB.open('fund-quiz',1);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put({k:key,v:value});tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>reject(tx.error)};
})"""

def wait_save(page):
    expect(page.locator('.fc-save')).to_have_text('学习记录保存在本机')

def answer(page, q):
    if q.get('options'):
        page.get_by_role('radio', name=str(q['answer']), exact=True).check()
    else:
        page.locator('.fc-number-input input').fill(q.get('correctInput', str(round(q['answer'], 2))))
    page.get_by_role('button', name='检查答案', exact=True).click()
    expect(page.locator('.fc-feedback')).to_contain_text('独立完成' if q.get('phase') in ['assessment','review'] else '这一步算对了')


def run():
    server = ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT/'dist')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}/'
    errors = []
    with sync_playwright() as p:
        browser = p.webkit.launch()
        context = browser.new_context(viewport={'width':390,'height':844}, reduced_motion='reduce')
        # Keep test traffic local, including analytics in the existing application shell.
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
        page = context.new_page()
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(base+'#/formula')
        expect(page.locator('.fc-path')).to_have_count(3)
        expect(page.locator('.fc-unit-link')).to_have_count(6)
        page.screenshot(path='/tmp/formula-home.png', full_page=True)
        page.get_by_role('button',name='做四道小题').click()
        page.get_by_role('button',name='10',exact=True).click()
        page.get_by_role('button',name='检查这一题').click()
        expect(page.locator('.fc-feedback')).to_contain_text('从这个小关系补起')
        page.get_by_role('button',name='跳过，直接学习').click()
        # Every course: walkthrough, guided inputs, 3-mode formula, all independent dimensions.
        for unit in COURSES:
            page.goto(base+'#/formula?unit='+unit['id'])
            expect(page.locator('.fc-scene')).to_be_visible()
            page.get_by_role('button',name='跟着算下一步').click()
            for q in filter(None, unit['guided']):
                if q.get('options'):
                    page.get_by_role('radio',name=str(q['answer']),exact=True).check()
                else:
                    page.locator('.fc-number-input input').fill(str(round(q['answer'],2)))
                page.get_by_role('button',name='检查答案',exact=True).click()
                expect(page.locator('.fc-feedback')).to_contain_text('这一步算对了')
                page.get_by_role('button',name='继续下一步').click()
            expect(page.locator('.fc-expression')).to_be_visible()
            for mode in ['代入数字','字母写法','中文关系']:
                page.get_by_role('button',name=mode,exact=True).click()
                expect(page.locator('.fc-math')).to_be_visible()
            if unit['id']=='return-rate':
                page.screenshot(path='/tmp/formula-expression.png',full_page=True)
            page.get_by_role('button',name='收起提示，独立试一遍').click()
            for dimension in ['relation','calculation','transfer']:
                q = next(q for q in unit['questions'] if q['phase']=='assessment' and q['dimension']==dimension)
                # Inputs and exact current item must survive a reload.
                if dimension=='calculation':
                    page.locator('.fc-number-input input').fill('123.45')
                    wait_save(page)
                    page.reload()
                    expect(page.locator('.fc-number-input input')).to_have_value('123.45')
                assert page.locator('.fc-scene').count()==0, 'Independent test exposed solved scene'
                answer(page,q)
                page.get_by_role('button',name='继续检验').click()
            expect(page.locator('.fc-status')).to_have_text('能独立完成')
            expect(page.locator('.fc-summary')).to_be_visible()
            wait_save(page)
        saved = page.evaluate(READ,KEY)
        assert len(saved['units'])==6
        # Dark, wide and mobile scenes; distribution updates with keyboard-compatible range inputs.
        page.goto(base+'#/formula?unit=weights')
        page.get_by_role('button',name='再看一遍示范').click()
        page.set_viewport_size({'width':1280,'height':900})
        page.evaluate("document.documentElement.dataset.theme='dark'")
        page.locator('input[aria-label="A 的资金占比"]').fill('60')
        expect(page.locator('.fc-scene-result')).to_contain_text('14%')
        page.screenshot(path='/tmp/formula-desktop-dark.png',full_page=True)
        for width in [320,390,768,1280]:
            page.set_viewport_size({'width':width,'height':900})
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), f'overflow {width}'
        page.set_viewport_size({'width':390,'height':844})
        page.evaluate("document.documentElement.dataset.theme='light'")
        page.get_by_role('button',name='跟着算下一步').click()
        expect(page.locator('.fc-number-input input')).to_have_value('14')
        page.screenshot(path='/tmp/formula-guided-mobile.png',full_page=True)
        # Export, repeated merge and overwrite: new evidence IDs remain unchanged.
        wait_save(page)
        before = page.evaluate(READ,KEY)
        page.goto(base+'#/data')
        with page.expect_download() as download:
            page.get_by_role('button',name='导出进度',exact=True).click()
        exported = json.loads(Path(download.value.path()).read_text())
        assert exported['formulaProgress']==before
        for _ in range(2):
            page.locator('input[type=file]').set_input_files({'name':'progress.json','mimeType':'application/json','buffer':json.dumps(exported).encode()})
            page.get_by_role('dialog').get_by_role('button',name='合并',exact=True).click()
            expect(page.get_by_role('dialog')).to_have_count(0)
            page.wait_for_function("document.body.innerText.includes('导入成功')")
        assert page.evaluate(READ,KEY)==before
        # Legacy backup overwrite clears course evidence, then kv-only backup restores it.
        page.locator('input[type=file]').set_input_files({'name':'old.json','mimeType':'application/json','buffer':json.dumps({'app':'fund-quiz','version':1,'records':[]}).encode()})
        page.get_by_role('dialog').get_by_role('button',name='清空后覆盖',exact=True).click()
        page.wait_for_function("document.body.innerText.includes('导入成功')")
        assert page.evaluate(READ,KEY)['units']=={}
        kvonly={**exported};kvonly.pop('formulaProgress')
        page.locator('input[type=file]').set_input_files({'name':'kv.json','mimeType':'application/json','buffer':json.dumps(kvonly).encode()})
        page.get_by_role('dialog').get_by_role('button',name='清空后覆盖',exact=True).click()
        page.wait_for_function("document.body.innerText.includes('导入成功')")
        assert page.evaluate(READ,KEY)==before
        # Shift only test fixtures in local IDB, never system time. Check new review questions.
        shifted=page.evaluate(READ,KEY)
        for data in shifted['units'].values():
            for ev in data['events']: ev['at']-=25*60*60*1000
        page.evaluate(WRITE,[KEY,shifted])
        page.goto(base+'#/formula')
        expect(page.locator('.fc-review-list button')).to_have_count(6)
        unit=COURSES[0]
        page.goto(base+'#/formula?unit='+unit['id'])
        page.get_by_role('button',name='开始隔日复查').click()
        for dimension in ['relation','calculation','transfer']:
            q=next(q for q in unit['questions'] if q['phase']=='review' and q['dimension']==dimension)
            answer(page,q)
            page.get_by_role('button',name='继续检验').click()
        expect(page.locator('.fc-status')).to_have_text('已巩固')
        # Curated practice works even when global subject is one, and returns to its course.
        page.get_by_role('button',name='去题库定向练 1 题').click()
        expect(page.get_by_text('在2014年12月31日',exact=False)).to_be_visible()
        page.get_by_role('button',name='完成本轮').click()
        expect(page.locator('.fc-status')).to_have_text('已巩固')
        # Formula directory retained; historical practice cannot award new mastery.
        page.goto(base+'#/formula?mode=reference')
        expect(page.locator('.formula-row')).to_have_count(8)
        page.locator('.formula-row').first.click()
        assert page.locator('.formula-quiz').count()==0
        page.get_by_role('button',name='返回微课堂').click()
        # A failed local transaction must surface a retry, never an endless saving indicator.
        page.goto(base+'#/formula?unit=discount')
        page.get_by_role('button',name='开始隔日复查').click()
        page.evaluate("""() => { const orig=IDBObjectStore.prototype.put; window.restorePut=()=>{IDBObjectStore.prototype.put=orig}; IDBObjectStore.prototype.put=function(){if(this.name==='kv')throw new DOMException('Test quota','QuotaExceededError'); return orig.apply(this,arguments)} }""")
        page.get_by_role('radio').first.check()
        expect(page.locator('.fc-save')).to_contain_text('本次进度未保存')
        page.evaluate('restorePut()')
        page.get_by_role('button',name='重试保存').click()
        wait_save(page)
        # Separate fresh learner: a wrong answer corrected after reload remains assisted.
        fresh=browser.new_context(viewport={'width':390,'height':844}, reduced_motion='reduce')
        fresh.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
        learner=fresh.new_page()
        learner.on('pageerror', lambda err: errors.append(str(err)))
        learner.goto(base+'#/formula?unit=return-rate')
        learner.get_by_role('button',name='我想直接试独立测评').click()
        q=next(q for q in COURSES[1]['questions'] if q['phase']=='assessment' and q['dimension']=='relation')
        learner.get_by_role('radio',name=next(v for v in q['options'] if v!=q['answer']),exact=True).check()
        learner.get_by_role('button',name='检查答案',exact=True).click()
        wait_save(learner)
        learner.reload()
        learner.get_by_role('radio',name=q['answer'],exact=True).check()
        learner.get_by_role('button',name='修正后再检查',exact=True).click()
        expect(learner.locator('.fc-feedback')).to_contain_text('再换一道新题')
        assert learner.locator('.fc-capabilities .done').count()==0
        learner.get_by_role('button',name='换一道新题再试').click()
        learner.get_by_role('button',name='给我一点提示').click()
        q2=next(q for q in COURSES[1]['questions'] if q['id']=='return-rate:assessment:relation:2')
        learner.get_by_role('radio',name=q2['answer'],exact=True).check()
        learner.get_by_role('button',name='检查答案',exact=True).click()
        assert learner.locator('.fc-capabilities .done').count()==0
        learner.get_by_role('button',name='换一道新题再试').click()
        q3=next(q for q in COURSES[1]['questions'] if q['id']=='return-rate:assessment:relation:3')
        answer(learner,q3)
        assert learner.locator('.fc-capabilities .done').count()==1
        fresh.close()
        assert not errors, errors
        browser.close()
        # WebKit's emulated offline reload raises an internal browser error on this runtime.
        # Validate real service-worker offline navigation separately in Chromium.
        chromium=p.chromium.launch()
        offline=chromium.new_context()
        offline.route('**/*', lambda route: route.continue_() if route.request.url.startswith(base) else route.abort())
        offline_page=offline.new_page()
        offline_page.goto(base+'#/formula?unit=compound')
        expect(offline_page.locator('.fc-scene')).to_be_visible()
        offline_page.evaluate('() => navigator.serviceWorker.ready.then(()=>true)')
        offline_page.reload()
        offline_page.wait_for_function('navigator.serviceWorker.controller !== null')
        offline.set_offline(True)
        offline_page.reload()
        expect(offline_page.locator('.fc-scene')).to_be_visible()
        offline_page.get_by_role('button',name='跟着算下一步').click()
        offline_page.locator('.fc-number-input input').fill('110')
        offline_page.get_by_role('button',name='检查答案',exact=True).click()
        expect(offline_page.locator('.fc-feedback')).to_contain_text('这一步算对了')
        wait_save(offline_page)
        offline_page.reload()
        expect(offline_page.locator('.fc-feedback')).to_contain_text('这一步算对了')
        chromium.close()

    server.shutdown()
    print('WebKit + Chromium offline: six lessons, 3-mode formulas, independent checks, restore, import/export, delayed review, scoped practice, offline and save retry passed.')

if __name__=='__main__': run()
