#!/usr/bin/env node
// Fails if anything that should not reach customers is still in the build. Run before every production deploy.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../src', import.meta.url).pathname;
const BAD = [/\.example\b/i, /replace (with|it)/i, /template outline/i, /\[Define/i, /\[Add /i, /sample testimonials/i, /for layout\. Replace/i];
const hits = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(f)) { const t = readFileSync(p, 'utf8'); BAD.forEach((re) => { if (re.test(t)) hits.push(`${p.replace(root, 'src')}: matches ${re}`); }); }
  }
})(root);

const env = (k) => (process.env[k] ?? '').trim();
const missing = ['NEXT_PUBLIC_SUPPORT_EMAIL', 'NEXT_PUBLIC_SUPPORT_PHONE', 'NEXT_PUBLIC_COMPANY_ADDRESS', 'NEXT_PUBLIC_ODPC_REG'].filter((k) => !env(k));
const warn = [];
if (env('NEXT_PUBLIC_SHOW_SAMPLE_CONTENT') === '1') warn.push('NEXT_PUBLIC_SHOW_SAMPLE_CONTENT=1: demo profiles are visible to the public.');
if (env('NEXT_PUBLIC_LEGAL_REVIEWED') !== '1') warn.push('Terms and Privacy have not been confirmed as reviewed by counsel (set NEXT_PUBLIC_LEGAL_REVIEWED=1 once they have).');

if (hits.length) console.error('Placeholder text found:\n  ' + hits.join('\n  '));
if (missing.length) console.error('Missing company details:\n  ' + missing.join('\n  '));
if (warn.length) console.error('Warnings:\n  ' + warn.join('\n  '));
if (hits.length || missing.length) process.exit(1);
console.log(warn.length ? 'Launch check passed with warnings.' : 'Launch check passed.');
