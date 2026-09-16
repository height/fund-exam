#!/usr/bin/env python3
"""Isolated A4 export QA; seeded notes, no AI or user data."""
from pathlib import Path
import subprocess
import json
from playwright.sync_api import sync_playwright
from pypdf import PdfReader
from test_notebook import APP, OUT, seed

def run():
    with sync_playwright() as p:
        for engine in ['chromium','webkit']:
            browser=getattr(p,engine).launch(**({'channel':'chrome'} if engine=='chromium' else {}))
            context=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
            page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(APP);page.wait_for_selector('.notebook-home')
            calls=[]; mode={'value':'ok'}; held=[]
            def ai(route):
                if mode['value']=='fail': route.fulfill(status=503,body='unavailable'); return
                if mode['value']=='hold': held.append(route); return
                payload=route.request.post_data_json
                assert payload['thinking']=={'type':'enabled'} and payload['reasoning_effort']=='high'
                assert payload['response_format']=={'type':'json_object'}
                prompt=payload['messages'][-1]['content']
                assert 'PROMPT-QA-MARKER' in prompt
                source=json.loads(prompt.splitlines()[-1]);calls.append(source)
                result={'items':[{'sourceIds':[n['id']],'title':'AI速记 '+n['title'],'markdown':n['markdown'].replace('关键点','速记') + '\n\n<p><mark data-pen="key">核心结论</mark>；<mark data-pen="condition">适用条件</mark>；<mark data-pen="caution">注意例外</mark></p>'} for n in source['notes']]}
                response='data: '+json.dumps({'choices':[{'delta':{'content':json.dumps(result,ensure_ascii=False)}}]},ensure_ascii=False)+'\n\ndata: [DONE]\n\n'
                route.fulfill(status=200,content_type='text/event-stream',body=response)
            context.route('https://notebook.test/chat/completions',ai)
            page.evaluate("localStorage.setItem('ai-config',JSON.stringify({active:'deepseek',providers:{deepseek:{url:'https://notebook.test/chat/completions',model:'test',key:'test-only'}}}))")
            page.evaluate("location.hash='#/notebook'")
            button=page.get_by_role('button',name='小抄生成页面',exact=False)
            assert button.is_enabled()
            for i in range(45):
                note={'id':f'print-{i}','status':'ready','subject':'科目一','chapter':'基金活动的法规要求','title':f'考点 {i+1:02d} · 条件与例外','points':['完整关键条件，不删除例外。'],'markdown': '\n\n'.join([f'关键点 {i+1:02d}-{j}：保留适用条件、法定期限与边界。==例外需要单独核对==，不能忽略单位和比较基准。' for j in range(6)]),'excerpt':'测试原文','context':'测试依据','createdAt':1,'updatedAt':1,'evidence':[]}
                if i==0:note['markdown']+='\n\n| 条件 | 结论 |\n|---|---|\n| 同一时点 | 不同口径不能比较 |\n\n$$E = mc^2$$\n\n```svg\n<svg viewBox="0 0 200 40"><rect width="200" height="40" fill="#eee"/>\n\n    <text x="10" y="25">图示完整保留</text></svg>\n```'
                if i==44:note['markdown']+='\n\nFINAL-CONTENT-MARKER'
                seed(page,note)
            seed(page,{**note,'id':'review-only','status':'review','title':'SHOULD-NOT-PRINT'})
            for width in [320,375,390]:
                page.set_viewport_size({'width':width,'height':844})
                for theme in ['light','dark']:
                    page.evaluate('t=>document.documentElement.dataset.theme=t',theme)
                    page.wait_for_timeout(200)
                    assert button.locator('svg').count()==1
                    assert button.bounding_box()['height']==32
                    assert button.locator('span').evaluate('e=>e.getClientRects().length')==1
                    heading=page.locator('.page-head-copy').bounding_box()
                    assert heading['x']+heading['width']<=button.bounding_box()['x']+1
                    page.locator('.page-head').screenshot(path=str(OUT/f'{engine}-print-button-{width}-{theme}.png'))
            button.click();page.wait_for_function("location.hash === '#/cheatsheet'")
            assert len(context.pages)==1 and not calls
            assert page.get_by_role('combobox',name='Cheatsheet thinking depth').input_value()=='medium'
            page.get_by_role('combobox',name='Cheatsheet thinking depth').select_option('high')
            page.locator('.cs-prompt-editor summary').click()
            editor=page.get_by_role('textbox',name='小抄生成 Prompt')
            default_prompt=editor.input_value()
            assert 'FINAL-CONTENT-MARKER' not in default_prompt
            assert '关键点 01-0' not in default_prompt
            editor.fill(default_prompt+'\nPROMPT-QA-MARKER：表述保持准确。')
            assert page.get_by_role('button',name='生成小抄',exact=True).is_disabled()
            page.get_by_role('button',name='保存 Prompt',exact=True).click()
            page.locator('.cs-prompt-editor summary').click()
            page.get_by_role('button',name='生成小抄',exact=True).click()
            button=page.get_by_role('button',name='查看 / 打印',exact=True)
            button.wait_for()
            assert len(context.pages)==1 and len(calls)==1
            page.screenshot(path=str(OUT/f'{engine}-cheatsheet-feature-page.png'))
            with page.expect_popup() as opened:button.click()
            preview=opened.value;preview.wait_for_selector('.entry');preview.on('pageerror',lambda e:errors.append(str(e)))
            assert preview.locator('.paper .sheet-watermark').text_content().strip()=='考基宝'
            assert preview.locator('.paper .sheet-watermark img').get_attribute('src').startswith('data:image/png;base64,')
            assert preview.locator('.entry').count()==45
            assert preview.locator('.entry').evaluate_all('els=>els.every(e=>e.getClientRects().length===1)'), 'A knowledge block split across columns'
            assert '科目一' in preview.locator('.sheet-title h1').inner_text()
            assert preview.locator('.sheet-columns > .chapter').count()==0
            assert '科目一' not in preview.locator('.sheet-columns').inner_text()
            assert len(calls)==1
            colors=[preview.locator('mark[data-pen='+pen+']').first.evaluate('e=>getComputedStyle(e).color') for pen in ['key','condition','caution']]
            assert len(set(colors))==3,colors
            assert 'AI速记' not in preview.locator('.paper').inner_text()
            assert preview.locator('.sheet-columns').evaluate('e=>getComputedStyle(e).columnCount')=='2'
            assert 'SHOULD-NOT-PRINT' not in preview.locator('.paper').inner_text()
            assert preview.locator('.paper svg text').text_content()=='图示完整保留'
            assert preview.locator('math').count()==1 and preview.locator('.paper svg').count()==1
            assert preview.locator('math').evaluate("e=>![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())")
            assert preview.locator('.paper').bounding_box()['width']<=390
            layout = preview.locator('.paper').evaluate('e=>({width:e.offsetWidth,height:e.offsetHeight})')
            assert 793 <= layout['width'] <= 794
            for factor in ['1', '1.5']:
                preview.locator('#scale').select_option(factor)
                assert preview.locator('.paper').evaluate('e=>({width:e.offsetWidth,height:e.offsetHeight})') == layout
                assert abs(preview.locator('.paper').bounding_box()['width'] - layout['width'] * float(factor)) < 2
            preview.locator('#scale').select_option('fit')
            assert preview.locator('.paper').bounding_box()['width'] <= 390
            assert preview.locator('script[src],link[rel=stylesheet]').count()==0
            assert preview.locator('#columns').count()==0
            for media in ['screen','print']:
                preview.emulate_media(media=media)
                dims=preview.locator('.nb-markdown svg').first.evaluate('e=>({width:parseFloat(e.style.width),height:parseFloat(e.style.height),ratio:e.viewBox.baseVal.width/e.viewBox.baseVal.height})')
                assert dims['width']>0 and dims['height']>0
                assert abs(dims['width']/dims['height']-dims['ratio'])<0.01
            preview.emulate_media(media='screen')
            preview.screenshot(path=str(OUT/f'{engine}-print-mobile.png'))
            with preview.expect_download() as exported:preview.get_by_role('button',name='下载 HTML').click()
            html=OUT/f'{engine}-cheatsheet.html';exported.value.save_as(html)
            offline=context.new_page();offline.goto(html.as_uri());offline.wait_for_selector('.entry')
            assert offline.locator('.entry').count()==45
            assert offline.locator('.sheet-columns').evaluate('e=>getComputedStyle(e).columnCount')=='2'
            if engine=='chromium':
                pdf=OUT/'cheatsheet-a4.pdf';offline.pdf(path=str(pdf),prefer_css_page_size=True,print_background=True)
                reader=PdfReader(pdf)
                assert len(reader.pages)>1
                for sheet in reader.pages:
                    assert abs(float(sheet.mediabox.width)-595.28)<2 and abs(float(sheet.mediabox.height)-841.89)<2
                text='\n'.join(sheet.extract_text() for sheet in reader.pages)
                assert 'FINAL-CONTENT-MARKER' in text
                for i in range(45): assert f'{i+1:02d}-5' in text, i
                subprocess.run(['pdftoppm','-f','1','-singlefile','-scale-to','1400','-png',str(pdf),str(OUT/'cheatsheet-page-1')],check=True)
                print(f'A4 PDF: {len(reader.pages)} pages, all 45 notes retained')
            # Small exports balance both columns in print, preserving all three inks.
            offline.evaluate('''() => {
              document.querySelector('.sheet-columns').innerHTML = '<section class="chapter"><h2>第一章</h2><article class="entry"><h3>条件一</h3><p><mark data-pen="key">结论</mark>：保留比较基准。</p></article></section><section class="chapter"><h2>第二章</h2><article class="entry"><h3>条件二</h3><p><mark data-pen="condition">适用范围</mark>；<mark data-pen="caution">注意例外</mark>。</p></article></section>';
            }''')
            offline.emulate_media(media='print')
            offline.set_viewport_size({'width':794,'height':1123})
            offline.wait_for_timeout(100)
            offline.screenshot(path=str(OUT/f'{engine}-balanced-print.png'))
            left=offline.locator('.chapter h2').nth(0).bounding_box()
            right=offline.locator('.chapter h2').nth(1).bounding_box()
            assert right['x']>left['x']+100,(left,right)
            assert offline.locator('.sheet-columns').evaluate('e=>getComputedStyle(e).columnFill')=='balance'
            offline.screenshot(path=str(OUT/f'{engine}-balanced-print.png'))
            if engine=='chromium':
                offline.pdf(path=str(OUT/'cheatsheet-small-a4.pdf'),prefer_css_page_size=True,print_background=True)
                assert len(PdfReader(OUT/'cheatsheet-small-a4.pdf').pages)==1
            # The cached version survives reload and opens without another model call.
            def cached():
                return page.evaluate("() => new Promise(resolve=>{const r=indexedDB.open('fund-quiz');r.onsuccess=()=>{const db=r.result,q=db.transaction('kv').objectStore('kv').get('notebook-cheatsheet:last');q.onsuccess=()=>{resolve(q.result.v);db.close()}}})")
            saved=cached();assert '<!doctype html>' in saved['html'] and len(saved['notes'])==45
            page.reload();button.wait_for()
            assert 'PROMPT-QA-MARKER' in page.locator('.cs-prompt-editor textarea').input_value()
            assert 'FINAL-CONTENT-MARKER' not in page.locator('.cs-prompt-editor textarea').input_value()
            page.get_by_role('region',name='上次生成的小抄').wait_for()
            with page.expect_popup() as reopened:button.click()
            reopened.value.wait_for_selector('.entry');assert reopened.value.locator('.entry').count()==45
            with reopened.value.expect_event('close'):
                reopened.value.get_by_role('link',name='返回小抄生成页').click()
            assert '#/cheatsheet' in page.url
            assert len(calls)==1
            # A failed AI request must preserve the last successful HTML.

            mode['value']='fail'
            page_count=len(context.pages)
            page.get_by_role('button',name='重新生成',exact=True).click()
            page.get_by_role('alert').filter(has_text='生成失败').wait_for()
            assert len(context.pages)==page_count
            assert cached()==saved
            mode['value']='hold'
            page.get_by_role('button',name='重新生成',exact=True).click()
            page.get_by_role('button',name='取消生成').click()
            for route in held:
                try:route.abort()
                except Exception:pass
            page.get_by_role('alert').filter(has_text='已取消').wait_for()
            assert len(context.pages)==page_count
            assert cached()==saved
            assert not errors,errors
            browser.close();print(engine+' standalone print export passed')

if __name__=='__main__':run()
