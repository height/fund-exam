#!/usr/bin/env python3
"""Selected model is isolated from global defaults and pinned across generation stages."""
import json
from playwright.sync_api import sync_playwright, expect
from test_notebook import APP, OUT, seed

with sync_playwright() as p:
    for engine, width in [('chromium',1100),('webkit',320)]:
        browser=getattr(p,engine).launch(**({'channel':'chrome'} if engine=='chromium' else {}))
        page=browser.new_page(viewport={'width':width,'height':844})
        page.goto(APP); page.wait_for_selector('.notebook-home')
        settings={'active':'deepseek','providers':{'deepseek':{'url':'https://default.test/chat/completions','model':'deepseek-v4-pro','key':'default-test-key'},'glm':{'url':'https://selected.test/chat/completions','model':'glm-5.3','key':'selected-test-key'}}}
        page.evaluate("s=>localStorage.setItem('ai-config',JSON.stringify(s))",settings)
        seed(page,{'id':'model-source','status':'ready','subject':'科目二','chapter':'固定收益投资','title':'债券价格','markdown':'其他条件不变，利率上升，债券价格下降。','points':['其他条件不变，利率上升，债券价格下降。'],'excerpt':'债券价格','context':'','createdAt':1,'updatedAt':1})
        calls=[]; fail={'value':False}
        def reply(route):
            payload=route.request.post_data_json
            assert payload['model']=='glm-5.3'
            assert route.request.headers['authorization']=='Bearer selected-test-key'
            assert payload['reasoning_effort']=='high'
            assert payload['thinking']=={'type':'enabled'}
            calls.append(payload)
            if fail['value']:
                route.fulfill(status=401,body='{}');return
            data=json.loads(payload['messages'][-1]['content'].splitlines()[-1])
            if 'plan' not in data:
                # A settings change after planning must not switch the next stage.
                page.evaluate("()=>{const s=JSON.parse(localStorage.getItem('ai-config'));s.providers.glm.model='changed';s.providers.glm.key='changed';localStorage.setItem('ai-config',JSON.stringify(s))}")
                result={'groups':[{'title':'债券','topics':[{'title':'债券价格与利率','sourceIds':['model-source'],'requirements':['保留其他条件不变']}]}]}
            else:
                t=data['plan']['topics'][0]
                result={'items':[{'topicId':t['id'],'sourceIds':t['sourceIds'],'title':t['title'],'markdown':'其他条件不变，利率上升，债券价格下降。','coverage':[0],'reviewNotes':[]}],'figures':[]}
            route.fulfill(status=200,content_type='application/json',body=json.dumps({'choices':[{'message':{'content':json.dumps(result,ensure_ascii=False)}}]}))
        page.route('https://selected.test/chat/completions',reply)
        page.route('https://default.test/**',lambda route: (_ for _ in ()).throw(AssertionError('must not use default provider')))
        page.evaluate("location.hash='#/cheatsheet?subject=科目二'")
        selector=page.get_by_role('combobox',name='小抄生成模型',exact=True)
        assert selector.input_value()==''
        assert selector.locator('option[value=zenmux]').evaluate('(option)=>option.disabled')
        selector.select_option('glm')
        thinking=page.get_by_role('combobox',name='Cheatsheet thinking depth')
        assert thinking.locator('option').all_text_contents()==['LOW','HIGH','MAX']
        thinking.select_option('high')
        assert page.evaluate("JSON.parse(localStorage.getItem('ai-config')).active")=='deepseek'
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT/f'{engine}-cheatsheet-model.png'))
        page.get_by_role('button',name='生成小抄',exact=True).click()
        page.get_by_role('button',name='保留',exact=True).wait_for()
        assert len(calls)==2
        page.get_by_role('button',name='保留',exact=True).click()
        expect(page.locator('.cs-cache-state')).to_have_text('本地已保存')
        page.evaluate("s=>localStorage.setItem('ai-config',JSON.stringify(s))",settings)
        page.reload(); selector.wait_for()
        assert selector.input_value()=='glm'
        assert thinking.input_value()=='high'
        fail['value']=True
        page.get_by_role('button',name='重新生成',exact=True).click()
        page.get_by_role('alert').filter(has_text='所选模型的 Key 无效').wait_for()
        assert page.evaluate("JSON.parse(localStorage.getItem('ai-config'))")==settings
        browser.close(); print(engine,'model selection, thinking, snapshot and 401 isolation PASS',flush=True)
