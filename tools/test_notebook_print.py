#!/usr/bin/env python3
"""Isolated A4 export QA; seeded notes, no AI or user data."""
from pathlib import Path
import subprocess
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
            page.evaluate("location.hash='#/notebook'")
            button=page.get_by_role('button',name='生成 A4 小抄',exact=False)
            assert button.is_disabled()
            for i in range(45):
                note={'id':f'print-{i}','status':'ready','subject':'科目一','chapter':'基金活动的法规要求','title':f'考点 {i+1:02d} · 条件与例外','points':['完整关键条件，不删除例外。'],'markdown': '\n\n'.join([f'关键点 {i+1:02d}-{j}：保留适用条件、法定期限与边界。==例外需要单独核对==，不能忽略单位和比较基准。' for j in range(6)]),'excerpt':'测试原文','context':'测试依据','createdAt':1,'updatedAt':1,'evidence':[]}
                if i==0:note['markdown']+='\n\n| 条件 | 结论 |\n|---|---|\n| 同一时点 | 不同口径不能比较 |\n\n$$E = mc^2$$\n\n```svg\n<svg viewBox="0 0 200 40"><rect width="200" height="40" fill="#eee"/><text x="10" y="25">图示完整保留</text></svg>\n```'
                if i==44:note['markdown']+='\n\nFINAL-CONTENT-MARKER'
                seed(page,note)
            seed(page,{**note,'id':'review-only','status':'review','title':'SHOULD-NOT-PRINT'})
            with page.expect_popup() as opened:button.click()
            preview=opened.value;preview.wait_for_selector('.entry');preview.on('pageerror',lambda e:errors.append(str(e)))
            assert preview.locator('.entry').count()==45
            assert 'SHOULD-NOT-PRINT' not in preview.locator('.paper').inner_text()
            assert preview.locator('math').count()==1 and preview.locator('.paper svg').count()==1
            assert preview.locator('math').evaluate("e=>![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())")
            assert preview.locator('.paper').bounding_box()['width']<=390
            assert preview.locator('script[src],link[rel=stylesheet]').count()==0
            preview.screenshot(path=str(OUT/f'{engine}-print-mobile.png'))
            with preview.expect_download() as exported:preview.get_by_role('button',name='下载 HTML').click()
            html=OUT/f'{engine}-cheatsheet.html';exported.value.save_as(html)
            offline=context.new_page();offline.goto(html.as_uri());offline.wait_for_selector('.entry')
            assert offline.locator('.entry').count()==45
            offline.locator('#columns').select_option('2')
            assert offline.locator('.sheet-columns').evaluate('e=>getComputedStyle(e).columnCount')=='2'
            offline.locator('#columns').select_option('3')
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
            assert not errors,errors
            browser.close();print(engine+' standalone print export passed')

if __name__=='__main__':run()
