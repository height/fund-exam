"""Wrong-book retries start unanswered without clearing historical records."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / 'dist/index.html').as_uri()
questions = [q for q in json.loads((ROOT / 'src/data/questions.json').read_text())
             if q['subject'] == '科目一' and q.get('contentReview', {}).get('status') != 'pending'][:2]
READ = '''()=>new Promise(resolve=>{const r=indexedDB.open('fund-quiz');r.onsuccess=()=>{
const db=r.result,req=db.transaction('records').objectStore('records').getAll();
req.onsuccess=()=>{resolve(req.result);db.close()}}})'''

with sync_playwright() as p:
    for engine in ['chromium', 'webkit']:
        browser = getattr(p, engine).launch(**({'channel': 'chrome'} if engine == 'chromium' else {}))
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(APP)
        page.wait_for_selector('.notebook-home')
        records = [{'qid': q['id'], 'subject': q['subject'], 'seen': 2, 'right': 0, 'wrong': 2,
                    'wrongFlag': True, 'lastCorrect': False, 'lastPicked': (q['answer'] + 1) % 4,
                    'lastTs': 1, 'contentRevision': q.get('contentRevision', 0)} for q in questions]
        page.evaluate('''records=>new Promise(resolve=>{const r=indexedDB.open('fund-quiz');r.onsuccess=()=>{
          const db=r.result,tx=db.transaction(['records','kv'],'readwrite');
          records.forEach(row=>tx.objectStore('records').put(row));
          tx.objectStore('kv').put({k:'autoNext',v:false});
          tx.oncomplete=()=>{db.close();resolve()}}})''', records)
        page.goto(APP + '#/wrong')
        page.reload()
        page.get_by_role('button', name='错题重练', exact=True).click()
        expect(page.locator('.practice-last-result')).to_have_count(0)
        expect(page.locator('.opt:enabled')).to_have_count(4)
        expect(page.locator('.practice-history-status')).to_contain_text('最近答错')
        expect(page.locator('.opt.ok, .opt.bad, .opt.sel')).to_have_count(0)
        assert {r['qid']: r for r in page.evaluate(READ)} == {r['qid']: r for r in records}
        page.get_by_role('button', name='打开练习答题卡').click()
        dialog = page.get_by_role('dialog', name='练习答题卡')
        expect(dialog).to_contain_text('本轮已答 0 题')
        expect(dialog.get_by_role('button', name='第 2 题，最近答错', exact=True)).to_be_visible()
        dialog.get_by_role('button', name='关闭', exact=True).click()
        page.locator(f'[data-pick="{questions[0]["answer"]}"]').click()
        expect(page.locator('.practice-last-result')).to_contain_text('本次作答 · 答对')
        page.get_by_role('button', name='下一题', exact=True).click()
        expect(page.locator('.opt:enabled')).to_have_count(4)
        page.get_by_role('button', name='上一题', exact=True).click()
        expect(page.locator('.practice-last-result')).to_contain_text('本次作答 · 答对')
        expect(page.locator('.opt:disabled')).to_have_count(4)
        page.get_by_role('button', name='打开练习答题卡').click()
        expect(dialog).to_contain_text('本轮已答 1 题')
        dialog.get_by_role('button', name='第 2 题，最近答错', exact=True).click()
        page.locator(f'[data-pick="{(questions[1]["answer"] + 1) % 4}"]').click()
        expect(page.locator('.practice-last-result')).to_contain_text('本次作答 · 答错')
        page.get_by_role('button', name='完成本轮', exact=True).click()
        page.goto(APP + '#/wrong')
        expect(page.get_by_text('道待消灭')).to_contain_text('1')
        page.get_by_role('button', name='错题重练', exact=True).click()
        expect(page.locator('.opt:enabled')).to_have_count(4)
        expect(page.locator('.practice-last-result')).to_have_count(0)
        saved = {r['qid']: r for r in page.evaluate(READ)}
        first, second = (saved[q['id']] for q in questions)
        assert (first['seen'], first['right'], first['wrong'], first['wrongFlag']) == (3, 1, 2, False)
        assert (second['seen'], second['right'], second['wrong'], second['wrongFlag']) == (3, 0, 3, True)
        assert not errors, errors
        browser.close()
        print(engine, 'PASS: fresh retry, sheet, navigation, repeat retry and preserved history', flush=True)
