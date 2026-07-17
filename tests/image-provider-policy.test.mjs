#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policyFiles = [
  'SKILL.md',
  'references/image-prompts.md',
  'references/layouts-swiss.md',
  'references/screenshot-framing.md',
  'references/swiss-layout-lock.md'
];
const combined = policyFiles
  .map(file => `${file}\n${readFileSync(resolve(root, file), 'utf8')}`)
  .join('\n\n');

for (const forbidden of [/GPT-M\s*2\.0/i, /gpt-image-[\w.-]+/i, /OpenAI\s+image/i]) {
  assert.equal(forbidden.test(combined), false, `配图规则仍写死未授权供应商：${forbidden}`);
}

for (const required of [
  '风格 A：电子杂志',
  '风格 B：瑞士国际主义',
  '风格 C：船帆大会培训',
  '禁止静默切换到其他付费图片模型',
  'asset-manifest.json',
  'API Key 只保存在服务端'
]) {
  assert(combined.includes(required), `配图契约缺少关键规则：${required}`);
}

console.log(`PASS image-provider-policy · files=${policyFiles.length}`);
