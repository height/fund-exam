"""Quick capture starts with a ready-to-send request and minimal controls."""
from playwright.sync_api import sync_playwright
from test_notebook import APP, select

with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome')
    page=browser.new_page(viewport={'width':390,'height':844})
    page.goto(APP);page.wait_for_selector('.notebook-home')
    page.evaluate("location.hash='#/chapters'")
    page.locator('.ch-row').first.click();page.wait_for_selector('.stem')
    select(page,'.stem',False,True)
    page.get_by_role('button',name='记笔记',exact=True).click()
    receipt=page.locator('.note-receipt')
    box=receipt.get_by_role('textbox',name='告诉 AI 怎么调整')
    assert box.input_value()=='整理这个知识点'
    assert receipt.locator('select,.note-quick-prompts,.provided-mic').count()==0
    assert receipt.get_by_role('button',name='发送',exact=True).is_enabled()
    page.screenshot(path='/tmp/fund-notebook-qa/quick-note-minimal.png')
    box.press('Enter')
    page.locator('.note-modal').wait_for()
    assert page.locator('.note-receipt').count()==0
    # No API key in this isolated profile: sending asks for configuration, never auto-saves.
    assert page.locator('.note-modal').inner_text().find('配置')>=0
    browser.close()
    print('quick capture default text, minimal controls and Enter transition passed')
