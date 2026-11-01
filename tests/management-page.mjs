// Author: CharlesQueen
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {ROOT} from '../core.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{for(const locale of ['en','zh']){
 const page=await browser.newPage({viewport:{width:740,height:560}});
 await page.route('http://pet-manager.test/**',async route=>{const file=path.resolve(ROOT,new URL(route.request().url()).pathname.slice(1));assert.ok(file.startsWith(ROOT+path.sep));await route.fulfill({body:await fs.readFile(file),contentType:file.endsWith('.mjs')?'text/javascript':'text/html'});});
 await page.addInitScript(locale=>{window.uninstallCalls=0;window.petManager={status:async()=>({name:'Codex Desktop Pet',version:'0.2.2',installed:true,marketplaceRoot:'project checkout',locale}),open:async()=>{window.openCalled=true;},uninstall:async()=>++window.uninstallCalls===1?{cancelled:true}:{installed:false}};},locale);
 await page.goto('http://pet-manager.test/desktop/management.html');
 const button=page.getByRole('button',{name:locale==='zh'?'卸载插件':'Uninstall plugin',exact:true});await button.waitFor();assert.equal(await page.locator('#version').textContent(),'0.2.2');assert.equal(await page.locator('#state').textContent(),locale==='zh'?'已安装':'Installed');
 await page.locator('#open').click();assert.ok(await page.evaluate(()=>window.openCalled));
 await button.click();assert.equal(await page.locator('#result').textContent(),locale==='zh'?'已取消':'Cancelled');assert.ok(await button.isEnabled());
 await page.screenshot({path:path.join(ROOT,'qa/management-'+locale+'.png')});
 await button.click();assert.ok(await button.isDisabled());assert.equal(await page.evaluate(()=>window.uninstallCalls),2);
 await page.close();
}console.log('PASS: English/Chinese management status, view link, cancel and uninstall actions');}finally{await browser.close();}
