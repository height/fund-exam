"""Touch-mode notes keep native selection/context menus; reading selection stays custom."""
from playwright.sync_api import sync_playwright
from test_notebook import APP, seed

with sync_playwright() as p:
    for engine in ['chromium', 'webkit']:
        browser = getattr(p, engine).launch(**({'channel': 'chrome'} if engine == 'chromium' else {}))
        page = browser.new_page(viewport={'width':390,'height':844}, has_touch=True, is_mobile=True)
        page.goto(APP)
        page.wait_for_selector('.notebook-home')
        seed(page, {'id':'native-selection','status':'ready','subject':'科目二','chapter':'固定收益投资','title':'原生选择测试','points':['保留条件和例外'],'markdown':'保留条件和例外，可以选中复制。','excerpt':'保留条件和例外','context':'保留条件和例外','createdAt':1,'updatedAt':1,'evidence':[]})
        page.evaluate("location.hash='#/notebook'")
        page.locator('#note-native-selection').click()
        content=page.locator('.note-modal .nb-markdown p').first
        content.wait_for()
        assert page.locator('html').get_attribute('data-custom-selection') is not None
        assert content.evaluate("e=>getComputedStyle(e).getPropertyValue('-webkit-user-select') || getComputedStyle(e).userSelect") == 'text'
        content.evaluate('''e=>{const r=document.createRange();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r);document.dispatchEvent(new Event('selectionchange'))}''')
        page.wait_for_timeout(450)
        assert page.evaluate('getSelection().toString()') == '保留条件和例外，可以选中复制。'
        assert page.locator('.sel-tip').count()==0
        assert content.evaluate("e=>e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))")
        page.evaluate("getSelection().removeAllRanges()")
        page.get_by_role('button',name='对话编辑',exact=True).click()
        for height in [844, 560]:
            page.set_viewport_size({'width':390,'height':height})
            page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
            doc=page.locator('.nb-document').bounding_box()
            chat=page.locator('.provided-chat').bounding_box()
            assert abs(chat['height']-doc['height']) < 2, (doc,chat)
            composer=page.locator('.provided-composer').bounding_box()
            assert composer['y']+composer['height'] <= height
        page.set_viewport_size({'width':390,'height':844})
        page.screenshot(path='/tmp/fund-notebook-qa/'+engine+'-edit-layout.png')
        page.get_by_role('textbox',name='告诉 AI 怎么调整').fill('请整理')
        page.get_by_role('button',name='关闭笔记浮层').click()
        alert=page.get_by_role('alertdialog')
        alert.wait_for()
        assert page.locator('.note-modal-content').evaluate('e=>getComputedStyle(e).isolation')=='isolate'
        for width,height in [(390,844),(320,480)]:
            page.set_viewport_size({'width':width,'height':height})
            box=alert.bounding_box()
            assert box['x']>=0 and box['x']+box['width']<=width
            assert box['y']>=0 and box['y']+box['height']<=height
            assert page.get_by_role('button',name='继续编辑',exact=True).is_visible()
            page.screenshot(path=f'/tmp/fund-notebook-qa/{engine}-confirm-{width}.png')
        page.get_by_role('button',name='继续编辑',exact=True).click()
        assert alert.count()==0
        print(engine, 'native selection, editor layout and confirmation overlay passed')
        browser.close()
