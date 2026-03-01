#!/usr/bin/env node
/**
 * build-edinet-mapping.ts
 *
 * edinetcode.csv → src/data/edinet-mapping.json
 * ネットワークアクセス不要。ローカルCSVのみ使用。
 *
 * Source: 金融庁 EDINET提出者コード一覧 (code4fukui/EDINET mirror)
 * Usage: npx tsx scripts/build-edinet-mapping.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Load CSV ──

const csvPath = join(__dirname, 'data/edinetcode.csv');
const raw = readFileSync(csvPath, 'utf-8');

// Remove BOM if present
const content = raw.replace(/^\uFEFF/, '');
const lines = content.split('\n').filter(line => line.trim());

// Parse header (skip first line)
const header = lines[0];
console.error(`Header: ${header.slice(0, 100)}...`);

// Columns:
// 0: EDINETコード, 1: 提出者種別, 2: 上場区分, 3: 連結の有無,
// 4: 資本金, 5: 決算日, 6: 提出者名, 7: 提出者名（英字）,
// 8: 提出者名（ヨミ）, 9: 所在地, 10: 提出者業種, 11: 証券コード,
// 12: 提出者法人番号

interface EdinetEntry {
  edinetCode: string;
  name: string;
  nameEn: string;
  type: string;      // submitter type
  listing: string;    // 上場/非上場
  industry: string;
  secCode: string | null;
}

// Minimal mapping: bidirectional lookup only
const byHoujinBangou: Record<string, string> = {};  // corpNum → edinetCode
const byEdinetCode: Record<string, { c: string | null; n: string; s: string | null }> = {};  // edinetCode → { c: corpNum, n: name, s: secCode }

let totalRows = 0;
let withCorpNum = 0;
let skippedEmpty = 0;

// CSV parsing (handles quoted fields with commas)
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

for (let i = 1; i < lines.length; i++) {
  const fields = parseCSVLine(lines[i]);
  if (fields.length < 13) continue;

  // Normalize full-width to half-width for EDINET code
  const edinetCode = fields[0].replace(/[Ａ-Ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
                              .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const submitterType = fields[1];
  const listing = fields[2];
  const name = fields[6];
  const nameEn = fields[7];
  const industry = fields[10];
  const secCode = fields[11] || null;
  const corpNum = fields[12] || null;

  if (!edinetCode || !edinetCode.startsWith('E')) {
    skippedEmpty++;
    continue;
  }

  totalRows++;

  const entry: EdinetEntry = {
    edinetCode,
    name,
    nameEn,
    type: submitterType,
    listing,
    industry,
    secCode,
  };

  // byEdinetCode: always register (minimal: corpNum, name, secCode)
  byEdinetCode[edinetCode] = {
    c: corpNum,
    n: name,
    s: secCode,
  };

  // byHoujinBangou: only when corporate number exists
  if (corpNum && corpNum.length === 13) {
    byHoujinBangou[corpNum] = edinetCode;
    withCorpNum++;
  }
}

// ── Stats ──

console.error(`✓ ${totalRows} EDINET entries parsed`);
console.error(`✓ ${withCorpNum} with corporate number (法人番号)`);
console.error(`✓ ${Object.keys(byEdinetCode).length} byEdinetCode entries`);
console.error(`✓ ${Object.keys(byHoujinBangou).length} byHoujinBangou entries`);
if (skippedEmpty > 0) console.error(`⚠ ${skippedEmpty} rows skipped (invalid EDINET code)`);

// ── Output ──

const output = {
  _meta: {
    source: 'EDINET提出者コード一覧（金融庁）',
    mirror: 'code4fukui/EDINET',
    generated: new Date().toISOString().split('T')[0],
    totalEntries: totalRows,
    withCorporateNumber: withCorpNum,
  },
  byHoujinBangou,
  byEdinetCode,
};

const outPath = join(ROOT, 'src/data/edinet-mapping.json');
writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
console.error(`✓ Written to ${outPath}`);

const stat = readFileSync(outPath);
console.error(`✓ File size: ${(stat.length / 1024).toFixed(0)} KB`);
