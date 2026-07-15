#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) {
  console.log('Usage: node scripts/validate-deck.mjs <index.html> [--manifest source-manifest.json]');
  process.exit(args.length ? 0 : 2);
}

const htmlPath = resolve(args[0]);
const manifestFlag = args.indexOf('--manifest');
const manifestPath = manifestFlag >= 0 ? resolve(args[manifestFlag + 1] || '') : null;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(htmlPath, 'utf8');
const failures = [];
const notes = [];

function fail(message) { failures.push(message); }
function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function attr(attrs, name) {
  const match = attrs.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? decodeEntities(match[2]) : '';
}
function decodeEntities(value) {
  const named = {amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:'\u00a0'};
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_all, entity) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? _all;
    const hex = entity[1].toLowerCase() === 'x';
    return String.fromCodePoint(parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10));
  });
}
function textContent(fragment) {
  return decodeEntities(fragment
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p\s*>\s*<p\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ''));
}
function compareOrder(left, right) {
  const a = String(left).split('.').map(Number);
  const b = String(right).split('.').map(Number);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

const slideTags = [...html.matchAll(/<section\b([^>]*\bclass\s*=\s*(["'])[^"']*\bslide\b[^"']*\2[^>]*)>/gi)];
if (!slideTags.length) fail('没有找到 .slide 页面');
const slideIds = slideTags.map(match => attr(match[1], 'data-slide-id')).filter(Boolean);
if (slideIds.length !== slideTags.length) fail('每个 .slide 都必须有 data-slide-id');
if (new Set(slideIds).size !== slideIds.length) fail('data-slide-id 存在重复值');
const titles = slideTags.map(match => attr(match[1], 'data-title')).filter(Boolean);
if (titles.length !== slideTags.length) fail('每个 .slide 都必须有 data-title');

if (!/HTMLPPT_EDITOR_CORE_CSS_START sha256=([a-f0-9]{16})/.test(html)) fail('缺少统一编辑器 CSS 标记');
if (!/HTMLPPT_EDITOR_CORE_JS_START sha256=([a-f0-9]{16})/.test(html)) fail('缺少统一编辑器 JS 标记');
const cssHash = sha256(readFileSync(resolve(root, 'assets/editor-core.css'), 'utf8')).slice(0, 16);
const jsHash = sha256(readFileSync(resolve(root, 'assets/editor-core.js'), 'utf8')).slice(0, 16);
if (!html.includes(`HTMLPPT_EDITOR_CORE_CSS_START sha256=${cssHash}`)) fail('编辑器 CSS 与核心文件不同步');
if (!html.includes(`HTMLPPT_EDITOR_CORE_JS_START sha256=${jsHash}`)) fail('编辑器 JS 与核心文件不同步');
if (!html.includes('__htmlPptEditorShouldYield')) fail('翻页键盘监听缺少编辑态隔离');
if (!html.includes('__htmlPptEditorActive')) fail('滚轮/触屏监听缺少编辑态隔离');
if (/localStorage\.removeItem\s*\(/.test(html)) fail('发现直接清空 localStorage 的实现');
if (!html.includes('__CHUANFAN_HTMLPPT_EDITOR__')) fail('统一编辑器没有暴露就绪状态');

const hrefs = [];
for (const match of html.matchAll(/<a\b([^>]*)>/gi)) {
  const attrs = match[1];
  const href = attr(attrs, 'href');
  if (!href) continue;
  hrefs.push(href);
  if (/^javascript:/i.test(href)) fail(`禁止 javascript: 链接：${href}`);
  if (/^https?:\/\//i.test(href)) {
    if (attr(attrs, 'target') !== '_blank') fail(`外部链接缺少 target="_blank"：${href}`);
    const rel = attr(attrs, 'rel').toLowerCase().split(/\s+/);
    if (!rel.includes('noopener') || !rel.includes('noreferrer')) fail(`外部链接缺少安全 rel：${href}`);
  }
}

for (const match of html.matchAll(/<video\b([^>]*)>/gi)) {
  if (!/\bcontrols\b/i.test(match[1])) fail('视频缺少 controls');
}

let manifest = null;
if (manifestPath) {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const orders = slideTags.map(match => attr(match[1], 'data-source-order')).filter(Boolean);
  if (!orders.length) fail('提供了来源清单，但页面没有 data-source-order');
  for (let index = 1; index < orders.length; index += 1) {
    if (compareOrder(orders[index - 1], orders[index]) > 0) {
      fail(`来源顺序倒置：${orders[index - 1]} → ${orders[index]}`);
      break;
    }
  }
  const expectedRoots = (manifest.orderedSections || []).map(item => String(item.order));
  if (expectedRoots.length) {
    const actualRoots = [...new Set(orders.map(order => String(order).split('.')[0]))];
    const missing = expectedRoots.filter(order => !actualRoots.includes(order));
    if (missing.length) fail(`缺少来源章节顺序：${missing.join(', ')}`);
  }

  const verbatimMap = new Map();
  const verbatimPattern = /<([a-z][a-z0-9:-]*)\b([^>]*\bdata-verbatim-id\s*=\s*(["'])([^"']+)\3[^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  for (const match of html.matchAll(verbatimPattern)) {
    verbatimMap.set(match[4], textContent(match[5]));
  }
  for (const block of manifest.verbatimBlocks || []) {
    if (!verbatimMap.has(block.id)) {
      fail(`缺少逐字块：${block.id}`);
      continue;
    }
    const actual = verbatimMap.get(block.id);
    if (typeof block.text === 'string' && actual !== block.text) fail(`逐字块内容变化：${block.id}`);
    if (block.sha256 && sha256(actual) !== block.sha256) fail(`逐字块哈希不一致：${block.id}`);
  }
  for (const link of manifest.links || []) {
    if (!hrefs.includes(link.url)) fail(`原文链接未转换为可点击链接：${link.url}`);
  }
}

notes.push(`${slideTags.length} 页`);
notes.push(`${hrefs.filter(href => /^https?:\/\//i.test(href)).length} 个外部链接`);
if (manifest) notes.push(`${(manifest.verbatimBlocks || []).length} 个逐字块`);

if (failures.length) {
  console.error(`FAIL ${htmlPath}`);
  failures.forEach(message => console.error(`- ${message}`));
  process.exit(1);
}
console.log(`PASS ${htmlPath} · ${notes.join(' · ')}`);
