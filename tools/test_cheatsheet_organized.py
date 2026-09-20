#!/usr/bin/env python3
"""Controlled model responses; real planning, grouped rendering, offline HTML and dense A4 printing."""
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright
from pypdf import PdfReader
from test_notebook import APP, OUT, seed

SVG = '<svg viewBox="0 0 300 65"><rect width="300" height="65" fill="#fff"/><text x="12" y="28" font-size="16" fill="#234">条件 → 规则 → 结论</text><text x="12" y="52" font-size="14" fill="#234">保留适用范围</text></svg>'

def run():
    with sync_playwright() as p:
        for engine in ['chromium', 'webkit']:
            browser = getattr(p, engine).launch(**({'channel': 'chrome'} if engine == 'chromium' else {}))
            context = browser.new_context(viewport={'width': 1100, 'height': 900}, accept_downloads=True)
            page = context.new_page(); errors=[]; calls=[]
            page.on('pageerror', lambda e: errors.append(str(e)))
            def ai(route):
                data=json.loads(route.request.post_data_json['messages'][-1]['content'].splitlines()[-1]); calls.append(data)
                if 'plan' not in data:
                    assert data['knowledgeStructure']
                    sources=sorted(data['notes'],key=lambda n:n['id'])
                    result={'groups':[{'title': title,'topics':[{'title':f'知识点 {i+1:02d}', 'sourceIds':[sources[i]['id']], 'requirements':['保留范围','保留规则']} for i in range(start,start+6)]} for title,start in [('收益与风险基础',0),('组合与业绩评价',6),('交易与执行',12)]]}
                else:
                    items=[]
                    for t in data['plan']['topics']:
                        number=int(t['title'].split()[-1])
                        paragraphs='\n\n'.join([f'验证标记 {number:02d}-{j}：<mark data-pen="condition">同一比较口径</mark>下，保留必要条件、单位和例外；<mark data-pen="key">先识别规则，再判断结论</mark>。' for j in range(4)])
                        if number==1: paragraphs+='\n\n'+SVG+'\n\n$$R_p = w_1R_1 + w_2R_2$$'
                        if number==2: paragraphs+='\n\n| 口径 | 含义 |\n|---|---|\n| 条件 | 必须一致 |\n| 例外 | 不能省略 |'
                        if number==18: paragraphs+='\n\nFINAL-CONTENT-MARKER'
                        items.append({'topicId':t['id'],'title':t['title'],'sourceIds':t['sourceIds'],'markdown':paragraphs,'coverage':[0,1],'reviewNotes':['材料口径需确认'] if number==2 else []})
                    result={'items':items,'figures':[]}
                route.fulfill(status=200,content_type='application/json',body=json.dumps({'choices':[{'message':{'content':json.dumps(result,ensure_ascii=False)}}]}))
            page.route('https://notebook.test/chat/completions',ai)
            page.goto(APP); page.wait_for_selector('.notebook-home')
            page.evaluate("localStorage.setItem('ai-config',JSON.stringify({active:'deepseek',providers:{deepseek:{url:'https://notebook.test/chat/completions',model:'test',key:'test-only'}}}))")
            for i in reversed(range(18)):
                seed(page, {'id':f'source-{i:02d}','status':'ready','subject':'科目二','chapter':'投资风险管理','title':'最大回撤' if i%2 else '组合收益率','points':['规则与条件'],'markdown':'规则与条件','excerpt':'规则','context':'规则','createdAt':i+1,'updatedAt':i+1})
            page.evaluate("location.hash='#/cheatsheet?subject=科目二'")
            page.get_by_role('button',name='生成小抄',exact=True).click()
            page.get_by_role('button',name='查看 / 打印',exact=True).wait_for()
            assert len(calls)==4, len(calls)
            assert page.locator('.cs-review').inner_text().startswith('1 项待核对')
            page.get_by_role('button',name='保留',exact=True).click()
            with page.expect_popup() as opened: page.get_by_role('button',name='查看 / 打印',exact=True).click()
            sheet=opened.value; sheet.on('pageerror',lambda e:errors.append(str(e)))
            sheet.wait_for_selector('.entry')
            assert sheet.locator('.paper').count()==1
            assert sheet.locator('.entry').count()==18
            assert sheet.locator('.sheet-group-title').count()==3
            assert sheet.locator('.entry h3').first.inner_text().endswith('知识点 01')
            assert sheet.locator('.sheet-columns').evaluate('e=>getComputedStyle(e).columnCount')=='2'
            sheet.screenshot(path=str(OUT/f'{engine}-organized-sheet.png'))
            sheet.set_viewport_size({'width':390,'height':844})
            assert sheet.locator('.paper').count()==1
            assert sheet.locator('.entry').count()==18
            assert sheet.locator('.paper').bounding_box()['width']<=390
            sheet.screenshot(path=str(OUT/f'{engine}-organized-reading.png'))
            sheet.locator('#scale').select_option('1')
            assert sheet.locator('.paper').bounding_box()['width']>790
            sheet.locator('#scale').select_option('fit')
            with sheet.expect_download() as downloaded: sheet.get_by_role('button',name='下载 HTML').click()
            path=OUT/f'{engine}-organized.html'; downloaded.value.save_as(path)
            offline=context.new_page(); offline.goto(path.as_uri())
            offline.wait_for_selector('.entry')
            assert offline.locator('.entry').count()==18
            assert offline.locator('.paper').count()==1
            assert offline.locator('script[src],link[rel=stylesheet]').count()==0
            if engine=='chromium':
                pdf=OUT/'organized-a4.pdf'; offline.pdf(path=str(pdf),prefer_css_page_size=True,print_background=True)
                reader=PdfReader(pdf); assert len(reader.pages)>=1
                text='\n'.join(p.extract_text() for p in reader.pages)
                assert 'FINAL-CONTENT-MARKER' in text
                for i in range(18): assert f'{i+1:02d}-3' in text
                for pdfpage in reader.pages:
                    assert abs(float(pdfpage.mediabox.width)-595.28)<2
            # A single long knowledge block and long table continue without dropping rows.
            html=path.read_text()
            long_body='<div class="nb-markdown">'+''.join(f'<p>LONG-PART-{j:03d}：必要条件与结论保持对应，不能遗漏来源内容。</p>' for j in range(100))+'<table><thead><tr><th>条件</th><th>结论</th></tr></thead><tbody>'+''.join(f'<tr><td>TABLE-ROW-{j:03d}</td><td>适用范围与例外必须保留</td></tr>' for j in range(90))+'</tbody></table></div>'
            html=re.sub(r'<div class="nb-markdown">[\s\S]*?</div>',lambda _:long_body,html,count=1)
            long_path=OUT/f'{engine}-long-sheet.html'; long_path.write_text(html)
            stress=context.new_page(); stress.goto(long_path.as_uri())
            stress.wait_for_selector('.entry')
            assert stress.get_by_text('TABLE-ROW-089',exact=True).count()==1
            assert stress.get_by_text('LONG-PART-099',exact=False).count()==1
            if engine=='chromium':
                long_pdf=OUT/'organized-long-a4.pdf'; stress.pdf(path=str(long_pdf),prefer_css_page_size=True,print_background=True)
                long_reader=PdfReader(long_pdf)
                assert len(long_reader.pages)>1
                text='\n'.join(p.extract_text() for p in long_reader.pages)
                for j in range(100): assert f'LONG-PART-{j:03d}' in text
                for j in range(90): assert f'TABLE-ROW-{j:03d}' in text
            page.reload(); page.get_by_role('region',name='上次生成的小抄').wait_for()
            assert len(calls)==4
            assert not errors,errors
            browser.close(); print(engine,'organized generation, dense export and print completeness PASS',flush=True)

if __name__=='__main__': run()
