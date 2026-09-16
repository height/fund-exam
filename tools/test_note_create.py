#!/usr/bin/env python3
"""新建笔记复用对话浮层：分类、预览确认、取消、持久化及移动端。AI 使用受控响应。"""
import json
from playwright.sync_api import sync_playwright, expect
from test_notebook import APP, OUT, notes, wait_notes


def run():
    with sync_playwright() as p:
        for engine, width in [('chromium', 1100), ('webkit', 320)]:
            browser = getattr(p, engine).launch(**({'channel': 'chrome'} if engine == 'chromium' else {}))
            page = browser.new_page(viewport={'width': width, 'height': 740}, is_mobile=width == 320, has_touch=width == 320)
            errors, requests = [], []
            reply_chapter = {'value': '固定收益投资'}
            page.on('pageerror', lambda e: errors.append(str(e)))
            def ai(route):
                content = route.request.post_data_json['messages'][-1]['content']
                materials = [json.loads(line) for line in content.splitlines() if line.startswith('{')]
                source = materials[0]
                requests.append(source)
                quote = source['evidenceContext'].split('\n')[0]
                result = {'reply': '已整理，请确认后保存。', 'note': {
                    'subject': '科目一', 'chapter': reply_chapter['value'], 'title': '债券价格与利率',
                    'points': [quote], 'markdown': '**债券价格与利率**\n\n' + quote,
                    'evidence': [quote], 'needsReview': False,
                }}
                if source['selectedExcerpt'] == '最大回撤':
                    related = source['relatedKnowledge']
                    assert related and all(ref['subject'] == '科目二' for ref in related)
                    graph_quote = '最大回撤为期间先峰后谷的最大跌幅。'
                    assert graph_quote in related[0]['text']
                    result['note'] = {
                        'subject': '科目二', 'chapter': related[0]['chapter'], 'title': '最大回撤',
                        'points': [graph_quote, '收益率可以为负。'],
                        'markdown': graph_quote + '\n\n收益率可以为负。',
                        'evidence': [graph_quote, ''], 'evidenceKinds': ['graph', 'common'], 'needsReview': False,
                    }
                route.fulfill(status=200, content_type='application/json', body=json.dumps({'choices': [{'message': {'content': json.dumps(result, ensure_ascii=False)}}]}))
            page.route('https://notebook.test/chat/completions', ai)
            page.goto(APP + '#/notebook')
            page.evaluate("localStorage.setItem('ai-config',JSON.stringify({active:'deepseek',providers:{deepseek:{url:'https://notebook.test/chat/completions',model:'test',key:'test-only'}}}))")
            create = page.get_by_role('button', name='新建笔记')
            create.click()
            dialog = page.get_by_role('dialog', name='新建笔记', exact=True)
            chat = page.get_by_role('textbox', name='告诉 AI 怎么调整')
            assert chat.input_value() == ''
            assert dialog.locator('input').count() == 0
            assert dialog.get_by_label('章节', exact=True).input_value() == 'auto'
            assert page.get_by_role('button', name='发送', exact=True).is_disabled()
            assert notes(page) == [] and requests == []
            chat.fill('暂不保存的草稿')
            page.get_by_role('button', name='关闭笔记浮层').click()
            page.get_by_role('button', name='继续编辑', exact=True).click()
            assert chat.input_value() == '暂不保存的草稿'
            page.get_by_role('button', name='关闭笔记浮层').click()
            page.get_by_role('button', name='放弃并关闭', exact=True).click()
            assert notes(page) == []

            create.click()
            dialog.get_by_label('科目', exact=True).select_option('科目二')
            quote = '其他条件不变，市场利率上升时债券价格下降。'
            chat.fill(quote)
            assert dialog.evaluate('e => e.scrollWidth <= e.clientWidth + 1')
            page.screenshot(path=str(OUT / f'{engine}-create-note.png'))
            page.get_by_role('button', name='发送', exact=True).click()
            page.get_by_role('button', name='加入笔记本', exact=True).wait_for()
            assert notes(page) == []
            assert requests[-1]['sourceSubject'] == '科目二' and requests[-1]['subjectLocked']
            assert not requests[-1]['chapterLocked']
            page.get_by_role('button', name='加入笔记本', exact=True).click()
            wait_notes(page, 1, 'ready')
            saved = notes(page)[0]
            assert saved['subject'] == '科目二' and saved['chapter'] == '固定收益投资'
            assert saved['excerpt'] == quote and saved['context'] == quote
            # AI can change the chapter, but cannot switch the manually chosen subject.
            reply_chapter['value'] = '权益投资'
            chat.fill('请改归权益投资章节')
            page.get_by_role('button', name='发送', exact=True).click()
            page.get_by_role('button', name='保存修改', exact=True).click()
            page.get_by_role('tab', name='原笔记', exact=True).wait_for()
            page.wait_for_function("!document.querySelector('.nb-proposal')")
            assert notes(page)[0]['chapter'] == '权益投资' and notes(page)[0]['subject'] == '科目二'
            page.get_by_role('button', name='关闭笔记浮层').click()
            page.reload()
            page.get_by_role('button', name='债券价格与利率', exact=True).wait_for()
            assert len(notes(page)) == 1

            create.click()
            dialog.get_by_label('科目', exact=True).select_option('科目二')
            dialog.get_by_label('章节', exact=True).select_option('固定收益投资')
            chat.fill(quote)
            page.get_by_role('button', name='发送', exact=True).click()
            page.get_by_role('button', name='加入笔记本', exact=True).wait_for()
            assert requests[-1]['chapterLocked']
            assert '科目二 · 固定收益投资' in page.locator('.nb-proposal').inner_text()
            chat.fill('请改归权益投资章节')
            page.get_by_role('button', name='发送', exact=True).click()
            page.get_by_role('button', name='加入笔记本', exact=True).wait_for()
            assert not requests[-1]['chapterLocked']
            expect(page.locator('.nb-proposal')).to_contain_text('科目二 · 权益投资')
            assert len(notes(page)) == 1
            page.get_by_role('button', name='关闭笔记浮层').click()
            page.get_by_role('button', name='放弃并关闭', exact=True).click()
            # A bare term uses graph evidence and common knowledge without requiring more source material.
            create.click()
            dialog.get_by_label('科目', exact=True).select_option('科目二')
            chat.fill('最大回撤')
            page.get_by_role('button', name='发送', exact=True).click()
            page.get_by_role('button', name='加入笔记本', exact=True).wait_for()
            assert '待核对' not in page.locator('.nb-proposal').inner_text()
            page.get_by_role('button', name='依据', exact=True).click()
            expect(page.locator('.provided-chat-thread')).to_contain_text('基础通识补充')
            expect(page.locator('.provided-chat-thread')).to_contain_text('图谱 · 主动比重与下行风险')
            page.screenshot(path=str(OUT / f'{engine}-graph-note-evidence.png'))
            page.get_by_role('button', name='加入笔记本', exact=True).click()
            wait_notes(page, 2, 'ready')
            supplemented = next(n for n in notes(page) if n['title'] == '最大回撤')
            assert supplemented['chapter'] == '投资风险管理'
            assert supplemented['context'] == '最大回撤'
            assert supplemented['evidenceKinds'] == ['graph', 'common']
            assert supplemented['knowledgeRefs'][0]['title'] == '主动比重与下行风险'
            page.get_by_role('button', name='关闭笔记浮层').click()
            page.reload()
            page.get_by_role('button', name='最大回撤', exact=True).click()
            page.locator('.nb-source > summary').first.click()
            expect(page.locator('.nb-source')).to_contain_text('图谱 · 主动比重与下行风险')
            assert errors == [], errors
            browser.close()
    print('Conversational note creation passed: desktop Chromium and mobile WebKit')


if __name__ == '__main__':
    run()
