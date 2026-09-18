#!/usr/bin/env python3
"""Verify manual and timed submission only update answered question records."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
questions = json.loads((ROOT / 'src/data/questions.json').read_text())
qs = [q for q in questions if q.get('contentReview', {}).get('status') != 'pending' and q['answer'] == 0][:5]
assert len(qs) == 5

READ = '''store=>new Promise(resolve=>{const r=indexedDB.open('fund-quiz');r.onsuccess=()=>{const db=r.result;const q=db.transaction(store).objectStore(store).getAll();q.onsuccess=()=>{resolve(q.result);db.close()}}})'''
with sync_playwright() as p:
    for engine in ['chromium', 'webkit']:
        browser = getattr(p, engine).launch(**({'channel': 'chrome'} if engine == 'chromium' else {}))
        for timed in [False, True]:
            page = browser.new_page()
            page.goto((ROOT / 'dist/index.html').as_uri())
            page.wait_for_selector('.notebook-home')
            previous = [{'qid': q['id'], 'subject': q['subject'], 'seen': 2, 'right': 0 if wrong else 2, 'wrong': 2 if wrong else 0, 'wrongFlag': wrong, 'lastTs': 123, 'contentRevision': q.get('contentRevision', 0)} for q, wrong in [(qs[2], True), (qs[3], False)]]
            page.evaluate('''({qs, previous})=>new Promise(resolve=>{const r=indexedDB.open('fund-quiz');r.onsuccess=()=>{const db=r.result,tx=db.transaction(['kv','records'],'readwrite');previous.forEach(v=>tx.objectStore('records').put(v));tx.objectStore('kv').put({k:'activeExam',v:{subject:qs[0].subject,ids:qs.map(q=>q.id),answers:{[qs[0].id]:0,[qs[1].id]:1},questionRevisions:Object.fromEntries(qs.map(q=>[q.id,q.contentRevision||0])),startTs:Date.now(),endTs:Date.now()+120000,mins:2,i:0}});tx.oncomplete=()=>{db.close();resolve()}}})''', {'qs': qs, 'previous': previous})
            page.reload()
            page.wait_for_selector('.notebook-home')
            page.evaluate("location.hash='#/exam'")
            page.get_by_role('button', name='继续考试', exact=True).click()
            if timed:
                page.evaluate('''()=>{const original=Date.now;Date.now=()=>original()+180000}''')
            else:
                page.get_by_role('button', name='打开答题卡', exact=True).click()
                page.locator('.overlay').get_by_role('button', name='交卷', exact=True).click()
                expect(page.get_by_role('dialog')).to_contain_text('未作答不得分，但不会进入错题本')
                page.get_by_role('button', name='确定交卷', exact=True).click()
            page.get_by_text('模拟考成绩', exact=True).wait_for()
            records = {r['qid']: r for r in page.evaluate(READ, 'records')}
            assert records[qs[0]['id']]['right'] == 1 and not records[qs[0]['id']]['wrongFlag']
            assert records[qs[1]['id']]['wrong'] == 1 and records[qs[1]['id']]['wrongFlag']
            assert qs[4]['id'] not in records
            for old in previous: assert records[old['qid']] == old
            exam = page.evaluate(READ, 'exams')[-1]
            assert (exam['right'], exam['total'], exam['score']) == (1, 5, 20)
            page.close()
            print(engine, 'timeout' if timed else 'manual', 'PASS', flush=True)
        browser.close()
