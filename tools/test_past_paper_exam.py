#!/usr/bin/env python3
"""Verify May 2026 selection, persistence and scoring in both browser engines."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
SOURCE = '真题2026-05'
LABEL = '2026 年 5 月真题'
questions = json.loads((ROOT / 'src/data/questions.json').read_text())
by_id = {q['id']: q for q in questions}
READ = '''store=>new Promise(resolve=>{const r=indexedDB.open('fund-quiz');r.onsuccess=()=>{const db=r.result;const q=db.transaction(store).objectStore(store).getAll();q.onsuccess=()=>{resolve(q.result);db.close()}}})'''


def active(page):
    return next(x['v'] for x in page.evaluate(READ, 'kv') if x['k'] == 'activeExam')


with sync_playwright() as p:
    for engine in ['chromium', 'webkit']:
        browser = getattr(p, engine).launch(**({'channel': 'chrome'} if engine == 'chromium' else {}))
        for subject in ['科目一', '科目二']:
            context = browser.new_context(viewport={'width': 390, 'height': 844}, color_scheme='light')
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto((ROOT / 'dist/index.html').as_uri() + '#/exam')
            full = page.get_by_role('button', name='全题库模拟', exact=True)
            expect(full).to_have_attribute('aria-pressed', 'true')
            page.get_by_role('button', name=LABEL, exact=True).click()
            page.get_by_role('tab', name=subject).click()
            expect(page.get_by_role('button', name=LABEL, exact=True)).to_have_attribute('aria-pressed', 'true')
            expected = {q['id'] for q in questions if q['subject'] == subject and (q['source'] == SOURCE or any(ref['source'] == SOURCE for ref in q.get('sourceRefs', []))) and q.get('contentReview', {}).get('status') != 'pending'}
            expect(page.locator('.stats .stat').first).to_contain_text(str(len(expected)))
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            if engine == 'chromium' and subject == '科目一':
                page.screenshot(path='/tmp/fund-exam-may2026-mobile.png', full_page=True)
                page.set_viewport_size({'width': 1440, 'height': 900})
                page.screenshot(path='/tmp/fund-exam-may2026-desktop.png', full_page=True)
                page.set_viewport_size({'width': 390, 'height': 844})
            page.get_by_role('button', name='开始 2026 年 5 月真题考试', exact=True).click()
            expect(page.get_by_role('heading', name=LABEL, exact=True)).to_be_visible()
            exam = active(page)
            assert set(exam['ids']) == expected and len(exam['ids']) == len(expected)
            assert exam['source'] == SOURCE and exam['subject'] == subject
            assert exam['mins'] == round(len(expected) * 1.2)
            first = by_id[exam['ids'][0]]
            page.locator('.opt').nth(first['answer']).click()
            expect(page.get_by_role('button', name='打开答题卡', exact=True)).to_contain_text(f'1/{len(expected)}')
            assert active(page)['answers'] == {first['id']: first['answer']}, active(page)
            page.reload()
            expect(page.get_by_text(LABEL + ' · 未完成', exact=True)).to_be_visible()
            assert active(page)['answers'] == {first['id']: first['answer']}
            assert active(page)['endTs'] == exam['endTs']
            page.get_by_role('button', name='继续考试', exact=True).click()
            if subject == '科目二':
                page.evaluate('''()=>{const now=Date.now;Date.now=()=>now()+3*60*60*1000}''')
            else:
                page.get_by_role('button', name='交卷', exact=True).click()
                page.get_by_role('button', name='确定交卷', exact=True).click()
            expect(page.get_by_role('heading', name=LABEL + '成绩', exact=True)).to_be_visible()
            rec = page.evaluate(READ, 'exams')[0]
            assert (rec['source'], rec['right'], rec['total']) == (SOURCE, 1, len(expected))
            assert rec['score'] == round(100 / len(expected), 2)
            assert active(page) is None
            assert len(page.evaluate(READ, 'records')) == 1
            page.get_by_role('button', name='回首页', exact=True).click()
            expect(page.locator('.home-exams')).to_contain_text(LABEL)
            assert not errors, errors
            context.close()
            print(engine, subject, 'PASS', flush=True)
        browser.close()
