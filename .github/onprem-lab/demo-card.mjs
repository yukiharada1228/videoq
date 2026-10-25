// A code-rendered title card; all text and fonts stay on this Mac.
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
const output=resolve(process.argv[2]);
const escape=text=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext({viewport:{width:960,height:540},deviceScaleFactor:1,offline:true});
  const page=await context.newPage();
  await page.setContent(`<html lang="ja"><meta charset="utf-8"><style>body{margin:0;background:#14273a;color:white;font-family:"Hiragino Sans",sans-serif;padding:48px 55px;box-sizing:border-box}h1{font-size:42px;margin:0 0 40px}pre{font-family:inherit;font-size:29px;line-height:1.35;white-space:pre-wrap;margin:0}</style><h1>${escape(readFileSync(join(output,'title.txt'),'utf8'))}</h1><pre>${escape(readFileSync(join(output,'card.txt'),'utf8'))}</pre></html>`);
  await page.screenshot({path:join(output,'card.png')});
} finally {await browser.close();}
