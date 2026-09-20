"""Latest practice result updates chapter accuracy and survives exit/reload."""
import json
from pathlib import Path
from urllib.parse import urlencode
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / 'dist/index.html').as_uri()
bank = json.loads((ROOT / 'src/data/questions.json').read_text())
active = [q for q in bank if q['subject'] == '科目一' and q.get('contentReview', {}).get('status') != 'pending']
chapter = active[0]['chapter']
questions = [q for q in active if q['chapter'] == chapter]
assert len(questions) >= 10
q = questions[6]
wrong = (q['answer'] + 1) % len(q['options'])
url = APP + '#/practice?' + urlencode({'scope': 'ch:' + chapter, 'order': 'seq'})

READ = '''qid => new Promise(resolve => {const r=indexedDB.open('fund-quiz');r.onsuccess=()=>{const db=r.result,req=db.transaction('records').objectStore('records').get(qid);req.onsuccess=()=>{resolve(req.result);db.close()}}})'''

def quit_practice(page):
    page.locator('.page-head-back').click()
    page.get_by_role('dialog').get_by_role('button', name='退出', exact=True).click()
    page.wait_for_selector('.practice-chapter-picker')

with sync_playwright() as p:
    for engine in ['chromium', 'webkit']:
        browser = getattr(p, engine).launch(**({'channel': 'chrome'} if engine == 'chromium' else {}))
        page = browser.new_page(viewport={'width': 390, 'height': 844})
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(APP)
        page.wait_for_selector('.notebook-home')
        records = []
        for i, item in enumerate(questions[:10]):
            correct = i < 6
            picked = item['answer'] if correct else (item['answer'] + 1) % len(item['options'])
            records.append({'qid': item['id'], 'subject': item['subject'], 'contentRevision': item.get('contentRevision', 0),
                'seen': 1, 'right': int(correct), 'wrong': int(not correct), 'wrongFlag': not correct,
                'lastCorrect': correct, 'lastPicked': picked, 'lastTs': 1})
        page.evaluate('''({records, chapter}) => new Promise(resolve => {const r=indexedDB.open('fund-quiz');r.onsuccess=()=>{
            const db=r.result,tx=db.transaction(['records','kv'],'readwrite');
            records.forEach(row=>tx.objectStore('records').put(row));
            tx.objectStore('kv').put({k:'cursor:科目一:ch:'+chapter+':seq',v:6});
            tx.objectStore('kv').put({k:'autoNext',v:false});
            tx.oncomplete=()=>{db.close();resolve()}
        }})''', {'records': records, 'chapter': chapter})
        page.goto(url)
        page.reload()
        expect(page.locator('.practice-last-result')).to_contain_text('最近一次作答 · 答错')
        page.get_by_role('button', name='重做本题', exact=True).click()
        page.locator(f'[data-pick="{q["answer"]}"]').click()
        expect(page.locator('.practice-last-result')).to_contain_text('本次作答 · 答对')
        saved = page.evaluate(READ, q['id'])
        assert saved['seen'] == 2 and saved['lastPicked'] == q['answer'] and saved['lastCorrect'] is True
        page.get_by_role('button', name='打开练习答题卡').click()
        expect(page.get_by_role('button', name='第 7 题，本轮答对', exact=True)).to_have_class('r cur')
        page.get_by_role('dialog').get_by_role('button', name='关闭', exact=True).click()
        quit_practice(page)
        expect(page.get_by_role('meter', name=chapter+'最近作答正确率', exact=True)).to_have_attribute('aria-valuenow', '70')
        page.reload()
        expect(page.locator('.practice-last-result')).to_contain_text('最近一次作答 · 答对')
        expect(page.locator(f'[data-pick="{q["answer"]}"]')).to_be_disabled()
        page.get_by_role('button', name='打开练习答题卡').click()
        expect(page.get_by_role('button', name='第 7 题，最近答对', exact=True)).to_have_class('r cur')
        page.get_by_role('dialog').get_by_role('button', name='关闭', exact=True).click()
        page.get_by_role('button', name='重做本题', exact=True).click()
        page.locator(f'[data-pick="{wrong}"]').click()
        expect(page.locator('.practice-last-result')).to_contain_text('本次作答 · 答错')
        quit_practice(page)
        expect(page.get_by_role('meter', name=chapter+'最近作答正确率', exact=True)).to_have_attribute('aria-valuenow', '60')
        page.reload()
        expect(page.locator('.practice-last-result')).to_contain_text('最近一次作答 · 答错')
        expect(page.locator(f'[data-pick="{wrong}"]')).to_have_class('opt bad')
        saved = page.evaluate(READ, q['id'])
        assert saved['seen'] == 3 and saved['right'] == 1 and saved['wrong'] == 2
        assert not errors, errors
        Path('/tmp/fund-ui').mkdir(exist_ok=True)
        page.screenshot(path=f'/tmp/fund-ui/{engine}-practice-latest.png')
        browser.close()
        print(engine, 'PASS: latest result, correct/wrong redo, chapter meter and reload', flush=True)
