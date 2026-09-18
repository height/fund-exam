#!/usr/bin/env python3
"""Build first. Verify native Return, explicit send, and 1–3-line layout in Chrome/WebKit."""
from playwright.sync_api import sync_playwright
import json
from test_notebook import APP
measure='''e=>{const c=getComputedStyle(e);return {height:e.getBoundingClientRect().height,line:parseFloat(c.lineHeight),extra:parseFloat(c.paddingTop)+parseFloat(c.paddingBottom)+parseFloat(c.borderTopWidth)+parseFloat(c.borderBottomWidth),overflow:c.overflowY,scroll:e.scrollHeight,client:e.clientHeight}}'''
with sync_playwright() as p:
 for engine in ['chromium','webkit']:
  b=getattr(p,engine).launch(**({'channel':'chrome'} if engine=='chromium' else {}))
  page=b.new_page(viewport={'width':1100,'height':844},has_touch=engine=='webkit')
  requests=[]
  def reply(route):
   requests.append(route.request.post_data_json)
   route.fulfill(status=200,content_type='application/json',body=json.dumps({'choices':[{'message':{'content':json.dumps({'reply':'请补充具体内容。','note':None},ensure_ascii=False)}}]}))
  page.route('https://notebook.test/chat/completions',reply)
  page.goto(APP+'#/notebook')
  page.evaluate("localStorage.setItem('ai-config',JSON.stringify({active:'deepseek',providers:{deepseek:{url:'https://notebook.test/chat/completions',model:'test',key:'test-only'}}}))")
  page.get_by_role('button',name='新建笔记').click()
  t=page.get_by_role('textbox',name='告诉 AI 怎么调整')
  assert page.get_by_role('button',name='语音输入').count()==0
  assert t.get_attribute('enterkeyhint')=='enter'
  for width in [1100,390]:
   page.set_viewport_size({'width':width,'height':844})
   for collapsed in [False,True]:
    if collapsed: page.get_by_role('button',name='收起笔记浮层',exact=True).click()
    for value,lines in [('',1),('一行',1),('第一行\n第二行',2),('第一行\n第二行\n第三行',3),('一\n二\n三\n四',3),('这是会自动换行的长问题。'*30,3),('短句',1),('',1)]:
     t.fill(value)
     d=t.evaluate(measure)
     button=page.get_by_role('button',name='发送',exact=True).bounding_box()
     field=t.bounding_box()
     assert button['x']>=field['x']+field['width'],(button,field)
     assert button['height']==32
     if not value:
      assert page.get_by_role('group',name='笔记输入',exact=True).bounding_box()['height']==40
     assert abs(d['height']-(d['line']*lines+d['extra']))<=1,(engine,width,collapsed,value,d)
     assert d['overflow']==('auto' if value.count('\n')>=3 or len(value)>100 else 'hidden'),(value,d)
    t.fill('第一行')
    t.press('Enter')
    t.press('a')
    d=t.evaluate(measure)
    assert abs(d['height']-(2*d['line']+d['extra']))<=1,d
    assert t.input_value()=='第一行\na'
    assert requests==[], 'Return must not send an AI request'
    t.fill('')
    print(engine,width,'collapsed' if collapsed else 'expanded','PASS',flush=True)
    if collapsed: page.get_by_role('button',name='展开笔记浮层',exact=True).click()
  t.fill('点击图标才发送')
  page.get_by_role('button',name='发送',exact=True).click()
  page.get_by_text('请补充具体内容。',exact=True).wait_for()
  assert len(requests)==1
  print(engine,'explicit send PASS',flush=True)
  b.close()
