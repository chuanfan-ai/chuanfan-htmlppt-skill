#!/usr/bin/env node
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {homedir, tmpdir} from 'node:os';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadPlaywright() {
  const candidates = [
    process.env.CHUANFAN_PLAYWRIGHT_PATH,
    'playwright',
    resolve(homedir(), '.codex/skills/guizang-social-card-skill/node_modules/playwright'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try { return require(candidate); } catch {}
  }
  throw new Error('未找到 Playwright；设置 CHUANFAN_PLAYWRIGHT_PATH 后重试');
}

const {chromium} = loadPlaywright();
const chromeCandidates = [
  process.env.CHUANFAN_CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);
const systemChrome = chromeCandidates.find(existsSync);
const work = mkdtempSync(resolve(tmpdir(), 'chuanfan-htmlppt-test-'));
const imageDir = resolve(work, 'images');
mkdirSync(imageDir, {recursive:true});
writeFileSync(resolve(imageDir, 'original.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#1677ff"/><text x="20" y="96" fill="white" font-size="28">TEST</text></svg>');
const uploadPng = resolve(work, 'upload.png');
writeFileSync(uploadPng, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4S8AAAAASUVORK5CYII=', 'base64'));

const slides = `
    <section class="slide light-grid" data-slide-id="slide-1" data-title="编辑器测试" data-source-order="1" data-source-section="section-01">
      <div class="cf-chrome"><span>TEST</span><span>EDITOR CONTRACT</span></div>
      <div class="cf-content cf-split equal">
        <div><p class="cf-kicker">编辑器</p><h1 class="cf-title medium">稳定编辑</h1><p id="editable" class="cf-lead">初始文字</p><p id="delete-text" class="cf-lead">待删除文字</p><a href="https://example.com/demo" target="_blank" rel="noopener noreferrer">打开案例</a></div>
        <div class="cf-stage"><img id="original-image" src="images/original.svg" alt="测试图片"></div>
      </div>
      <div class="cf-footer"><span>船帆 · AI 应用实践</span><span>01 / 02</span></div>
    </section>
    <section class="slide soft" data-slide-id="slide-2" data-title="逐字测试" data-source-order="2" data-source-section="section-02">
      <div class="cf-chrome"><span>TEST</span><span>VERBATIM</span></div>
      <div class="cf-content"><p class="cf-kicker">提示词</p><pre class="cf-prompt" data-verbatim-id="prompt-01">第一行
第二行：https://example.com/demo</pre></div>
      <div class="cf-footer"><span>船帆 · AI 应用实践</span><span>02 / 02</span></div>
    </section>`;

let template = readFileSync(resolve(root, 'assets/template-conference.html'), 'utf8');
template = template.replace('<title>[必填] 大会培训 HTMLPPT</title>', '<title>编辑器契约测试</title>');
template = template.replace('data-source-revision="template-conference-v1"', 'data-source-revision="editor-test-v1"');
template = template.replace('content="template-conference-v1"', 'content="editor-test-v1"');
template = template.replace('    <!-- SLIDES_HERE -->', slides);
writeFileSync(resolve(work, 'index.html'), template);
writeFileSync(resolve(work, 'source-manifest.json'), JSON.stringify({
  source:'editor-contract-test',
  orderedSections:[{id:'section-01',order:1},{id:'section-02',order:2}],
  verbatimBlocks:[{id:'prompt-01',text:'第一行\n第二行：https://example.com/demo'}],
  links:[{url:'https://example.com/demo',label:'打开案例'}]
}, null, 2));

const smokeSlides = `
    <section class="slide light" data-slide-id="smoke-1" data-title="第一页"><h1 id="smoke-edit">模板编辑测试</h1></section>
    <section class="slide light" data-slide-id="smoke-2" data-title="第二页"><h1>第二页</h1></section>`;
for (const [folder, templateName] of [['style-a','template.html'], ['style-b','template-swiss.html']]) {
  const targetDir = resolve(work, folder);
  mkdirSync(targetDir, {recursive:true});
  const source = readFileSync(resolve(root, 'assets', templateName), 'utf8');
  const output = source.replace(/<!-- SLIDES_HERE[\s\S]*?-->/, smokeSlides);
  assert.notEqual(output, source, `${templateName} 没有找到 SLIDES_HERE`);
  writeFileSync(resolve(targetDir, 'index.html'), output);
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolvePort(port));
    });
  });
}
async function waitForServer(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error(`本地编辑服务未启动：${url}`);
}
async function waitForFile(path) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (existsSync(path)) return;
    await new Promise(resolveWait => setTimeout(resolveWait, 100));
  }
  throw new Error(`等待文件超时：${path}`);
}
async function stateRecord(page, selector) {
  return page.evaluate(selectorValue => {
    const node = document.querySelector(selectorValue);
    const id = node.dataset.editId;
    return window.__CHUANFAN_HTMLPPT_EDITOR__.getState().pages['slide-1'].elements[id];
  }, selector);
}

const port = await freePort();
const serviceUrl = `http://127.0.0.1:${port}`;
const server = spawn('python3', [resolve(root, 'scripts/local-edit-server.py'), '--deck-dir', work, '--host', '127.0.0.1', '--port', String(port)], {
  stdio:['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', chunk => { serverLog += chunk.toString(); });
server.stderr.on('data', chunk => { serverLog += chunk.toString(); });
let browser;

try {
  await waitForServer(`${serviceUrl}/__chuanfan_htmlppt_editor__/config`);
  const validator = spawnSync(process.execPath, [resolve(root, 'scripts/validate-deck.mjs'), resolve(work, 'index.html'), '--manifest', resolve(work, 'source-manifest.json')], {encoding:'utf8'});
  assert.equal(validator.status, 0, validator.stderr || validator.stdout);

  browser = await chromium.launch({headless:true, ...(systemChrome ? {executablePath:systemChrome} : {})});
  const context = await browser.newContext({viewport:{width:1440,height:900}});
  await context.addInitScript(url => localStorage.setItem('chuanfan-htmlppt-editor-service-url', url), serviceUrl);
  const page = await context.newPage();
  const browserLog = [];
  page.on('console', message => browserLog.push(`console:${message.type()}:${message.text()}`));
  page.on('pageerror', error => browserLog.push(`pageerror:${error.message}`));
  page.on('dialog', dialog => dialog.accept());
  await page.goto(`${serviceUrl}/index.html#1`, {waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.__CHUANFAN_HTMLPPT_EDITOR__?.ready);
  await page.waitForTimeout(650);

  // 演示模式正常翻页。
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(650);
  assert.equal(new URL(page.url()).hash, '#2');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(650);
  assert.equal(new URL(page.url()).hash, '#1');

  // 编辑模式只能由按钮退出，E/方向键/空格都不能翻页。
  await page.locator('[data-action="edit"]').click();
  assert.equal(await page.evaluate(() => window.__CHUANFAN_HTMLPPT_EDITOR__.isEditing()), true);
  await page.locator('#editable').click();
  await page.keyboard.press('End');
  await page.keyboard.type('E');
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => window.__CHUANFAN_HTMLPPT_EDITOR__.isEditing()), true);
  assert.equal(new URL(page.url()).hash, '#1');

  // 字号、品牌色、单行、拖动和缩放。
  await page.locator('[data-color="#1677ff"]').click();
  await page.locator('[data-action="nowrap"]').click();
  const beforeFont = parseFloat(await page.locator('#editable').evaluate(node => getComputedStyle(node).fontSize));
  await page.locator('[data-action="font-up"]').click();
  const afterFont = parseFloat(await page.locator('#editable').evaluate(node => getComputedStyle(node).fontSize));
  assert(afterFont > beforeFont);
  assert.equal(await page.locator('#editable').evaluate(node => getComputedStyle(node).whiteSpace), 'nowrap');
  assert.equal(await page.locator('#editable').evaluate(node => getComputedStyle(node).color), 'rgb(22, 119, 255)');

  const move = page.locator('.cf-selection-box.active .cf-move-handle');
  let box = await move.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + 75, box.y + 42); await page.mouse.up();
  assert.notEqual((await stateRecord(page, '#editable')).dx, 0);
  const resize = page.locator('.cf-selection-box.active .cf-resize-handle');
  box = await resize.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + 55, box.y + 40); await page.mouse.up();
  assert((await stateRecord(page, '#editable')).scale > 1);

  // 新增文本透明，新增图片真实落盘。
  await page.locator('[data-action="add-text"]').click();
  const addedText = page.locator('.cf-overlay-item .cf-overlay-text').last();
  assert.equal(await addedText.evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)');
  await page.locator('[data-action="delete"]').click();
  assert.equal(await page.locator('.cf-overlay-item .cf-overlay-text').count(), 0);

  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('[data-action="add-image"]').click();
  const chooser = await chooserPromise;
  await chooser.setFiles(uploadPng);
  await page.waitForTimeout(1800);
  const uploadedCount = await page.locator('.cf-overlay-image[src*="images/user-edits/"]').count();
  if (!uploadedCount) {
    const debug = await page.evaluate(() => ({
      service:localStorage.getItem('chuanfan-htmlppt-editor-service-url'),
      status:document.querySelector('.cf-service-status')?.textContent,
      toast:document.querySelector('.cf-editor-toast')?.textContent,
      files:document.querySelector('.cf-image-input')?.files?.length,
      editing:window.__CHUANFAN_HTMLPPT_EDITOR__?.isEditing(),
    }));
    throw new Error(`新增图片失败 ${JSON.stringify(debug)}\n${browserLog.join('\n')}\n${serverLog}`);
  }
  const uploadedSrc = await page.locator('.cf-overlay-image').last().getAttribute('src');
  await waitForFile(resolve(work, uploadedSrc));
  await page.locator('[data-action="delete"]').click();
  assert.equal(await page.locator('.cf-overlay-image').count(), 0);

  // 原始文本和原始图片都可删除。
  await page.locator('#delete-text').click();
  await page.locator('[data-action="delete"]').click();
  assert.equal(await page.locator('#delete-text').evaluate(node => getComputedStyle(node).display), 'none');
  await page.locator('#original-image').click();
  await page.locator('[data-action="delete"]').click();
  assert.equal(await page.locator('#original-image').evaluate(node => getComputedStyle(node).display), 'none');

  const secondChooserPromise = page.waitForEvent('filechooser');
  await page.locator('[data-action="add-image"]').click();
  const secondChooser = await secondChooserPromise;
  await secondChooser.setFiles(uploadPng);
  await page.waitForSelector('.cf-overlay-image[src*="images/user-edits/"]');

  // 保存、状态原子落盘与刷新恢复。
  await page.locator('[data-action="save"]').click();
  const statePath = resolve(work, 'htmlppt-user-state.json');
  await waitForFile(statePath);
  const diskState = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.equal(diskState.format, 'chuanfan-htmlppt-state');
  assert.equal(diskState.schema, 4);
  assert((diskState.history.page['slide-1'] || []).length >= 1);

  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (/chuanfan-htmlppt-(current|saved|history)-v4/.test(key)) localStorage.removeItem(key);
    }
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(() => window.__CHUANFAN_HTMLPPT_EDITOR__?.ready);
  assert.equal(await page.locator('#delete-text').evaluate(node => getComputedStyle(node).display), 'none');
  assert.equal(await page.locator('#original-image').evaluate(node => getComputedStyle(node).display), 'none');
  assert.equal(await page.locator('.cf-overlay-image[src*="images/user-edits/"]').count(), 1);

  // 当前页历史、整套备份、重置和恢复原稿语义。
  await page.locator('[data-action="backup"]').click();
  await page.locator('[data-action="history"]').click();
  assert.equal(await page.locator('[data-tab="page"]').textContent(), '当前页历史');
  await page.locator('[data-tab="deck"]').click();
  assert((await page.locator('.cf-history-item').count()) >= 1);
  await page.locator('[data-panel-action="close-history"]').click();
  await page.locator('[data-action="edit"]').click();
  await page.locator('[data-action="reset-page"]').click();
  assert.notEqual(await page.locator('#delete-text').evaluate(node => getComputedStyle(node).display), 'none');
  assert.notEqual(await page.locator('#original-image').evaluate(node => getComputedStyle(node).display), 'none');
  await page.locator('#delete-text').click();
  await page.locator('[data-action="delete"]').click();
  await page.locator('[data-action="restore-original"]').click();
  assert.notEqual(await page.locator('#delete-text').evaluate(node => getComputedStyle(node).display), 'none');
  assert((await page.evaluate(() => window.__CHUANFAN_HTMLPPT_EDITOR__.getHistory().deck.length)) >= 2);

  // 三种常见分辨率下，画布、导航和编辑工具栏不出视口。
  for (const viewport of [{width:1920,height:1080},{width:1440,height:900},{width:1366,height:768}]) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => {
      const slide = document.querySelector('.slide').getBoundingClientRect();
      const nav = document.querySelector('#nav').getBoundingClientRect();
      const toolbar = document.querySelector('.cf-editor-toolbar').getBoundingClientRect();
      const chromeRight = document.querySelector('.cf-chrome')?.lastElementChild?.getBoundingClientRect();
      return {slide, nav, toolbar, chromeRight, width:innerWidth, height:innerHeight};
    });
    assert(Math.abs(layout.slide.width - viewport.width) < 2);
    assert(Math.abs(layout.slide.height - viewport.height) < 2);
    assert(layout.nav.right <= viewport.width && layout.nav.top >= 0);
    assert(layout.toolbar.left >= 0 && layout.toolbar.right <= viewport.width + 1 && layout.toolbar.bottom <= viewport.height + 1);
    assert(!layout.chromeRight || layout.chromeRight.right <= layout.nav.left - 8, '右上栏目文字与导航重叠');
  }

  // 风格 A/B 与风格 C 共用同一键盘隔离契约。
  for (const folder of ['style-a', 'style-b']) {
    const smoke = await context.newPage();
    await smoke.goto(`${serviceUrl}/${folder}/index.html#1`, {waitUntil:'domcontentloaded'});
    await smoke.waitForFunction(() => window.__CHUANFAN_HTMLPPT_EDITOR__?.ready);
    await smoke.waitForTimeout(700);
    await smoke.locator('[data-action="edit"]').click();
    await smoke.locator('#smoke-edit').click();
    await smoke.keyboard.press('End');
    await smoke.keyboard.type('E');
    await smoke.keyboard.press('Space');
    await smoke.keyboard.press('ArrowRight');
    assert.equal(await smoke.evaluate(() => window.__currentSlideIndex), 0, `${folder} 编辑态发生翻页`);
    assert.equal(await smoke.evaluate(() => window.__CHUANFAN_HTMLPPT_EDITOR__.isEditing()), true, `${folder} 输入 E 后退出编辑`);
    await smoke.locator('[data-action="edit"]').click();
    await smoke.keyboard.press('ArrowRight');
    await smoke.waitForTimeout(700);
    assert.equal(await smoke.evaluate(() => window.__currentSlideIndex), 1, `${folder} 演示态无法翻页`);
    await smoke.close();
  }

  if (process.env.KEEP_HTMLPPT_TEST_FIXTURE === '1') {
    if (await page.evaluate(() => window.__CHUANFAN_HTMLPPT_EDITOR__.isEditing())) {
      await page.locator('[data-action="edit"]').click();
    }
    assert.equal(await page.locator('.cf-editor-toolbar').evaluate(node => node.scrollLeft), 0, '退出编辑后工具栏没有回到起点');
    await page.setViewportSize({width:1920,height:1080});
    await page.evaluate(() => window.__htmlPptGoToSlide(0));
    await page.waitForTimeout(700);
    await page.screenshot({path:resolve(work, 'qa-slide-1-1920x1080.png')});
    await page.evaluate(() => window.__htmlPptGoToSlide(1));
    await page.waitForTimeout(700);
    await page.screenshot({path:resolve(work, 'qa-slide-2-1920x1080.png')});
  }

  console.log(`PASS editor-contract · fixture=${work}`);
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await new Promise(resolveWait => setTimeout(resolveWait, 150));
  if (process.env.KEEP_HTMLPPT_TEST_FIXTURE !== '1') rmSync(work, {recursive:true, force:true});
}
