#!/usr/bin/env python3
"""Isolated browser QA: modal, conversational edits, evidence, persistence. Mock AI only."""
import json
from playwright.sync_api import sync_playwright
from test_notebook import APP, OUT, notes, seed, select, wait_notes


def run():
    with sync_playwright() as p:
        for engine, mobile in [('chromium', False), ('webkit', True)]:
            browser = getattr(p, engine).launch(**({'channel': 'chrome'} if engine == 'chromium' else {}))
            context = browser.new_context(viewport={'width': 390 if mobile else 1100, 'height': 844}, has_touch=mobile, is_mobile=mobile)
            page = context.new_page(); errors = []; requests = []; waiting = []; mode = {'value': 'edit'}
            page.on('pageerror', lambda e: errors.append(str(e)))
            def ai(route):
                content = route.request.post_data_json['messages'][-1]['content']
                materials = [json.loads(line) for line in content.splitlines() if line.startswith('{')]
                source = materials[0]; requests.append(materials)
                if mode['value']=='hold': waiting.append(route); return
                basis = source['evidenceContext']; quote = basis.split('\n')[0] or basis
                note = {'subject': source['sourceSubject'], 'chapter': source['sourceChapter'], 'title': '修改后的学习考点', 'points': [quote], 'evidence': [quote], 'needsReview': False}
                if len(materials) > 1:
                    if mode['value'] == 'fail': route.fulfill(status=503,body='unavailable'); return
                    if mode['value'] == 'question': result = {'reply': '这里需要保留适用条件，避免误解。', 'note': None}
                    else:
                        note['title'] = '对话调整后的考点'
                        note['formula'] = {'expression': '资产 = 负债 + 所有者权益', 'symbols': [], 'condition': '同一时点', 'evidence': basis}
                        note['diagram'] = {'kind':'compare','title':'两个条件','nodes':[{'id':'a','label':'条件一','evidence':basis},{'id':'b','label':'条件二','evidence':basis}],'edges':[]}
                        result = {'reply': '已调整标题，保留完整条件，并提供公式和图示预览。', 'note': note}
                else: result = note
                response = 'data: ' + json.dumps({'choices':[{'delta':{'content':json.dumps(result, ensure_ascii=False)}}]}, ensure_ascii=False) + '\n\ndata: [DONE]\n\n'
                route.fulfill(status=200,content_type='text/event-stream',body=response)
            context.route('https://notebook.test/chat/completions', ai)
            page.goto(APP); page.wait_for_selector('.notebook-home')
            page.evaluate("localStorage.setItem('ai-config',JSON.stringify({active:'deepseek',providers:{deepseek:{url:'https://notebook.test/chat/completions',model:'test',key:'test-only'}}}))")
            page.evaluate("location.hash='#/chapters'"); page.wait_for_selector('.ch-row'); page.locator('.ch-row').first.click(); page.wait_for_selector('.stem')
            select(page, '.stem', mobile, True)
            selected = page.locator('.sel-tip').get_attribute('data-term')
            page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedSelection=text}}})")
            page.get_by_role('button',name='复制',exact=True).click()
            page.get_by_text('已复制',exact=True).wait_for()
            assert page.evaluate('window.copiedSelection').strip().replace('\n',' ') == selected
            assert notes(page)==[] and requests==[]
            select(page, '.stem', mobile, True); page.get_by_role('button',name='记笔记',exact=True).click()
            page.get_by_text('新建笔记 · 尚未保存',exact=True).wait_for()
            assert notes(page)==[] and requests==[]
            page.get_by_role('button',name='放弃这次摘录',exact=True).click()
            assert notes(page)==[]
            select(page, '.stem', mobile, True); page.get_by_role('button',name='记笔记',exact=True).click()
            receipt=page.get_by_role('region',name='摘录反馈')
            receipt.get_by_role('button',name='图解说明',exact=True).click()
            assert '图示' in receipt.get_by_role('textbox',name='告诉 AI 怎么调整').input_value()
            assert requests==[] and notes(page)==[]
            receipt_input=receipt.get_by_role('textbox',name='告诉 AI 怎么调整')
            receipt_input.fill('第一行')
            height1=receipt_input.bounding_box()['height']
            receipt_input.fill('第一行\n第二行')
            assert receipt_input.bounding_box()['height'] > height1
            receipt_input.fill('第一行\n第二行\n第三行')
            height3=receipt_input.bounding_box()['height']
            receipt_input.fill('第一行\n第二行\n第三行\n第四行')
            assert abs(receipt_input.bounding_box()['height']-height3)<1
            assert receipt_input.evaluate('e=>getComputedStyle(e).overflowY')=='auto'
            receipt_input.fill('短句')
            assert abs(receipt_input.bounding_box()['height']-height1)<1
            receipt.get_by_role('textbox',name='告诉 AI 怎么调整').fill('只记判断方法，保留例外')
            url=page.url; stem=page.locator('.stem').inner_text(); y=page.evaluate('scrollY')
            receipt.get_by_role('button',name='发送',exact=True).click()
            page.get_by_role('dialog',name='新建笔记',exact=True).wait_for()
            page.get_by_role('button',name='加入笔记本',exact=True).wait_for()
            assert notes(page)==[] and len(requests)==1
            page.get_by_role('textbox',name='告诉 AI 怎么调整').fill('收起后保留的补充')
            page.get_by_role('button',name='收起笔记浮层',exact=True).click()
            assert not page.locator('#root').evaluate('e=>e.inert')
            assert page.get_by_role('textbox',name='告诉 AI 怎么调整').input_value()=='收起后保留的补充'
            assert notes(page)==[] and len(requests)==1
            collapsed_input=page.get_by_role('textbox',name='告诉 AI 怎么调整')
            collapsed_input.fill('第一行\n第二行\n第三行\n第四行')
            assert collapsed_input.evaluate('e=>e.scrollHeight>e.clientHeight')
            assert collapsed_input.evaluate('e=>e.clientHeight <= parseFloat(getComputedStyle(e).lineHeight)*3+3')
            page.screenshot(path=str(OUT/f'{engine}-three-line-input.png'))
            collapsed_input.fill('收起后保留的补充')
            page.screenshot(path=str(OUT/f'{engine}-collapsed-note.png'))
            page.get_by_role('button',name='展开笔记浮层',exact=True).click()
            assert page.locator('#root').evaluate('e=>e.inert')
            assert page.locator('.nb-proposal').is_visible()
            page.get_by_role('textbox',name='告诉 AI 怎么调整').fill('')
            assert requests[0][-1]['conversation'][0]['text']=='只记判断方法，保留例外'
            assert requests[0][-1]['selectedExcerpt']
            page.get_by_role('tab',name='选中原文',exact=True).click()
            assert page.locator('.nb-selected-excerpt').inner_text()
            page.get_by_role('tab',name='待保存',exact=False).click()
            page.get_by_role('button',name='加入笔记本',exact=True).click(); wait_notes(page,1,'ready')
            original=notes(page)[0]
            modal=page.get_by_role('dialog',name='编辑笔记',exact=True);modal.wait_for()
            assert page.url == url and page.locator('#root').evaluate('e=>e.inert')
            assert modal.locator('input,select').count() == 0
            chat = page.get_by_role('textbox',name='告诉 AI 怎么调整')
            if mobile:
                for width, height in [(320,568),(390,400),(390,844)]:
                    page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
                    send_box=page.get_by_role('button',name='发送',exact=True).bounding_box()
                    assert send_box['y'] >= 0 and send_box['y']+send_box['height'] <= height, send_box
                    assert page.locator('.note-modal').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
                    page.screenshot(path=str(OUT / f'mobile-composer-{width}-{height}.png'))
            page.get_by_role('button', name='语音输入', exact=True).click()
            page.get_by_text('尽请期待', exact=True).wait_for()
            page.screenshot(path=str(OUT / f'{engine}-chat-reference.png'))
            mode['value']='hold';chat.fill('检查等待体验');page.get_by_role('button',name='发送',exact=True).click()
            page.locator('.chat-pixel-grid').wait_for()
            assert page.locator('.chat-pixel-grid i').count()==9
            first_elapsed=page.locator('.chat-work-elapsed').inner_text()
            page.wait_for_timeout(250)
            assert page.locator('.chat-work-elapsed').inner_text()!=first_elapsed
            page.locator('.chat-work-status summary').click()
            assert page.get_by_text('正在等待模型返回内容，可随时停止。',exact=True).is_visible()
            for theme in ['light','dark']:
                page.evaluate('t=>document.documentElement.dataset.theme=t',theme)
                page.wait_for_timeout(250)
                page.screenshot(path=str(OUT/f'{engine}-chat-loading-{theme}.png'))
            page.emulate_media(reduced_motion='reduce')
            assert page.locator('.chat-pixel-grid i').first.evaluate('e=>getComputedStyle(e).animationName')=='none'
            page.emulate_media(reduced_motion='no-preference')
            page.get_by_role('button',name='停止生成').click()
            page.wait_for_function("!document.querySelector('.chat-pixel-grid')")
            assert chat.input_value()=='检查等待体验'
            for held in waiting:
                try: held.abort()
                except Exception: pass
            waiting.clear()
            # A controllable browser stream proves text appears before response completion.
            page.evaluate("""() => {
              window.originalNoteFetch = window.fetch;
              window.fetch = (url, options) => {
                if (!String(url).includes('notebook.test')) return window.originalNoteFetch(url, options);
                return Promise.resolve(new Response(new ReadableStream({start(controller) {
                  window.noteStream = controller;
                  options.signal.addEventListener('abort', () => controller.error(new DOMException('Stopped', 'AbortError')), {once:true});
                }}), {headers:{'Content-Type':'text/event-stream'}}));
              };
              window.pushNoteChunk = text => window.noteStream.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:text}}]})+'\\n\\n'));
            }""")
            chat.fill('检查实时回复'); page.get_by_role('button',name='发送',exact=True).click()
            page.wait_for_function('!!window.noteStream')
            page.evaluate('text=>window.pushNoteChunk(text)', '{"reply":"先保留适用条件，')
            page.get_by_label('正在回复',exact=True).wait_for()
            assert '先保留适用条件，' in page.locator('.chat-stream-text').inner_text()
            assert not page.locator('.nb-proposal').count() and notes(page)[0]==original
            page.evaluate('text=>window.pushNoteChunk(text)', '再删除重复。\\n例如：同一时点的资产关系。","note":')
            page.wait_for_function("document.querySelector('.chat-stream-text').textContent.includes('资产关系')")
            assert 'note' not in page.locator('.chat-stream-text').inner_text()
            for theme in ['light','dark']:
                page.evaluate('t=>document.documentElement.dataset.theme=t',theme)
                page.wait_for_timeout(250)
                page.screenshot(path=str(OUT/f'{engine}-streaming-text-{theme}.png'))
            page.evaluate("() => {window.pushNoteChunk('null}'); window.noteStream.close()}")
            page.wait_for_function("!document.querySelector('.chat-stream-caret')")
            assert page.get_by_text('先保留适用条件，再删除重复。\n例如：同一时点的资产关系。',exact=True).is_visible()
            assert notes(page)[0]==original
            # Stopping a partially received answer keeps text, never creates a proposal.
            page.evaluate('window.noteStream=null')
            chat.fill('检查中途停止');page.get_by_role('button',name='发送',exact=True).click()
            page.wait_for_function('!!window.noteStream')
            page.evaluate('text=>window.pushNoteChunk(text)', '{"reply":"这是一段未完成的回复')
            page.locator('.chat-stream-text').wait_for()
            page.get_by_role('button',name='停止生成').click()
            page.get_by_text('回复未完成 · 未应用修改',exact=True).wait_for()
            assert page.get_by_text('这是一段未完成的回复',exact=True).is_visible()
            assert notes(page)[0]==original and not page.locator('.nb-proposal').count()
            page.evaluate('() => { window.fetch=window.originalNoteFetch }')
            mode['value'] = 'question'; chat.fill('为什么需要这个条件？'); page.get_by_role('button',name='发送',exact=True).click()
            page.get_by_text('这里需要保留适用条件，避免误解。',exact=True).wait_for(); assert not page.locator('.nb-proposal').count()
            assert notes(page)[0]['title'] == original['title'], (original, notes(page), requests)
            mode['value'] = 'edit'; chat.fill('修改标题，保留条件，加入合适的公式和图示'); page.get_by_role('button',name='发送',exact=True).click()
            page.get_by_role('button',name='保存修改',exact=True).wait_for()
            assert page.locator('.nb-proposal svg').count() == 1
            assert page.get_by_role('tab', name='修改中', exact=False).get_attribute('aria-selected') == 'true'
            chat.fill('切换时保留的输入')
            page.get_by_role('tab', name='原笔记', exact=True).click()
            assert not page.locator('.nb-proposal').is_visible()
            assert chat.input_value() == '切换时保留的输入'
            page.get_by_role('tab', name='修改中', exact=False).click()
            assert page.locator('.nb-proposal').is_visible()
            assert page.locator('.nb-document .nb-proposal').count() == 1
            assert page.get_by_role('button', name='发送', exact=True).bounding_box()['y'] < page.viewport_size['height']
            page.screenshot(path=str(OUT / f'{engine}-compact-workspace.png'))
            assert notes(page)[0]['title'] == original['title'], (original, notes(page), requests)
            chat.fill('继续说明符号'); page.get_by_role('button',name='发送',exact=True).click(); page.get_by_role('button',name='保存修改',exact=True).wait_for(state='visible'); page.wait_for_timeout(200)
            assert len(requests[-1][-1]['conversation']) >= 5
            assert requests[-1][-1]['currentTitle'] == '对话调整后的考点'
            page.get_by_role('button',name='关闭笔记浮层').click(); page.get_by_role('alertdialog').wait_for()
            page.get_by_role('button',name='继续编辑',exact=True).click(); assert page.locator('.nb-proposal').count() == 1
            page.get_by_role('button',name='保存修改',exact=True).click(); page.wait_for_function("!document.querySelector('.nb-proposal')")
            assert notes(page)[0]['title'] == '对话调整后的考点'
            assert notes(page)[0]['createdAt'] == original['createdAt'] and notes(page)[0]['captures'] == original['captures']
            mode['value'] = 'fail'; chat.fill('保留这条失败的输入'); page.get_by_role('button',name='发送',exact=True).click(); page.get_by_role('alert').wait_for()
            assert chat.input_value() == '保留这条失败的输入'
            # Light and dark styles, no horizontal overflow.
            for theme in ['light','dark']:
                page.evaluate("t=>document.documentElement.dataset.theme=t",theme)
                page.screenshot(path=str(OUT / f'{engine}-dialog-{theme}.png'))
                assert page.locator('.note-modal').evaluate('e=>e.scrollWidth<=e.clientWidth+1')
                assert page.locator('.nb-chat-compose').evaluate('e=>getComputedStyle(e).backgroundColor') != 'rgba(0, 0, 0, 0)'
            page.keyboard.press('Escape'); page.get_by_role('alertdialog').wait_for(); page.get_by_role('button',name='放弃并关闭').click()
            page.wait_for_function("!document.querySelector('.note-modal')")
            assert page.url == url and page.locator('.stem').inner_text() == stem
            assert abs(page.evaluate('scrollY') - y) < 2
            assert not page.locator('#root').evaluate('e=>e.inert')
            # Deep links and notebook timeline both open the same floating view.
            page.evaluate("id=>location.hash='#/notebook?note='+id+'&edit=1'",original['id']); page.get_by_role('dialog',name='编辑笔记',exact=True).wait_for()
            page.get_by_role('button',name='关闭笔记浮层').click()
            page.get_by_role('tab',name='时间索引',exact=True).click(); page.locator('.nb-index-entry').first.click(); page.get_by_role('dialog',name='笔记详情',exact=True).wait_for()
            page.keyboard.press('Tab'); assert page.locator('.note-modal').evaluate('e=>e.contains(document.activeElement)')
            page.keyboard.press('Escape'); assert not page.locator('.note-modal').count()
            # A generic Markdown note renders identically in cards and the shared modal.
            rich = dict(original, id='markdown-fixture', title='Markdown 富文本笔记', status='ready', markdown='## 条件与公式\n\n==保留适用条件==，<mark data-pen="key">核心结论</mark>；<mark data-pen="caution">注意例外</mark>。**重点**与 `符号`。\n\n- 条件一\n- 条件二\n\n| 对象 | 条件 |\n| --- | --- |\n| A | 完整 |\n\n$$\\frac{a}{b}=\\sqrt{x}$$\n\n![图片说明](https://notebook.test/note.png)\n\n```svg\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60"><title>关系图</title><rect width="200" height="60" fill="#dce5f6"/><text x="20" y="35">条件 → 判断</text><script>window.noteAttack=1</script><image href="https://notebook.test/evil.svg"/><foreignObject><div>不应出现</div></foreignObject></svg>\n```\n\n<img src="x" onerror="window.noteAttack=1"><script>window.noteAttack=1</script>')
            context.route('https://notebook.test/note.png', lambda r: r.fulfill(status=200,content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><rect width="100" height="40" fill="steelblue"/></svg>'))
            seed(page, rich)
            page.evaluate("location.hash='#/notebook?note=markdown-fixture'")
            page.get_by_role('dialog',name='笔记详情',exact=True).wait_for()
            rendered = page.locator('.note-modal .nb-markdown')
            assert rendered.locator('mark').first.inner_text() == '保留适用条件'
            assert rendered.locator('math mfrac').count() == 1
            assert rendered.locator('svg').count() == 1 and rendered.locator('table').count() == 1
            assert rendered.locator('img[alt="图片说明"]').count() == 1
            assert rendered.locator('script,foreignObject,[onerror],svg [href]').count() == 0
            assert not page.evaluate('window.noteAttack || false')
            for theme in ['light','dark']:
                page.evaluate('t=>document.documentElement.dataset.theme=t',theme)
                assert rendered.locator('mark[data-pen=key]').count()==1
                colors=rendered.locator('mark').evaluate_all('els=>els.map(e=>getComputedStyle(e).color)')
                assert len(set(colors))==3
                page.screenshot(path=str(OUT / f'{engine}-three-pens-{theme}.png'))
            page.screenshot(path=str(OUT / f'{engine}-markdown.png'))
            page.reload();page.get_by_role('dialog',name='笔记详情',exact=True).wait_for()
            assert page.locator('.note-modal .nb-markdown math').count() == 1
            if mobile:
                page.get_by_role('button',name='关闭笔记浮层').click()
                for i in range(6):
                    seed(page,dict(original,id=f'density-{i}',title=f'复习考点 {i+1}',points=['先核对适用条件，保留必要例外。'*8],status='ready'))
                page.evaluate("location.hash='#/notebook'")
                page.get_by_role('tab',name='章节精华',exact=True).click()
                for width in [320,390]:
                    page.set_viewport_size({'width':width,'height':844})
                    page.wait_for_timeout(100)
                    assert page.locator('.nb-note-list').first.bounding_box()['y'] < 300
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
                    assert page.get_by_role('combobox',name='筛选笔记章节',exact=True).is_visible()
                    page.screenshot(path=str(OUT / f'notebook-portrait-{width}.png'))
                page.get_by_role('combobox',name='筛选笔记章节',exact=True).select_option(original['subject']+':'+original['chapter'])
                page.locator('.nb-mobile-preview').first.click()
                page.get_by_role('dialog',name='笔记详情',exact=True).wait_for()
                page.get_by_role('button',name='关闭笔记浮层').click()
            assert not errors, errors
            print(engine, 'dialog/chat/persistence/return/deep-link QA passed')
            context.close(); browser.close()

if __name__ == '__main__': run()
