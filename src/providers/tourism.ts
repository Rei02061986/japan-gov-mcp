/**
 * 観光統計プロバイダ
 * - JNTO 訪日外客数（Excel）
 * - 観光庁 宿泊旅行統計 確報（Excel）
 * - 観光庁 推移表（Excel）
 *
 * Excel ファイルはランタイムでダウンロードし ~/.japan-gov-mcp/cache/ にキャッシュ
 */

import { createError } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';
import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

// ── Cache directory ──
const CACHE_DIR = join(homedir(), '.japan-gov-mcp', 'cache', 'tourism');
function ensureCacheDir() { if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true }); }

/** Max cache age: 7 days */
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function cachedPath(filename: string): string { return join(CACHE_DIR, filename); }

function isCacheFresh(filepath: string): boolean {
  if (!existsSync(filepath)) return false;
  const stat = statSync(filepath);
  return Date.now() - stat.mtimeMs < CACHE_MAX_AGE_MS;
}

async function downloadFile(url: string, filepath: string): Promise<void> {
  const res = await fetch(url, { headers: { 'User-Agent': 'japan-gov-mcp/3.3' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  if (!res.body) throw new Error('No response body');
  ensureCacheDir();
  const ws = createWriteStream(filepath);
  await pipeline(Readable.fromWeb(res.body as any), ws);
}

async function ensureFile(url: string, cacheKey: string): Promise<string> {
  const filepath = cachedPath(cacheKey);
  if (!isCacheFresh(filepath)) {
    await downloadFile(url, filepath);
  }
  return filepath;
}

// ── Lazy XLSX import ──
let _xlsx: any = null;
async function getXlsx(): Promise<any> {
  if (!_xlsx) {
    const mod = await import('xlsx');
    _xlsx = mod.default || mod;
  }
  return _xlsx;
}

// ═══════════════════════════════════════════════
// Known Excel URLs
// ═══════════════════════════════════════════════

const JNTO_URL = 'https://www.jnto.go.jp/statistics/data/_files/20260218_1615-5.xlsx';

const KAKUHO_URLS: Record<number, string> = {
  2024: 'https://www.mlit.go.jp/kankocho/content/001905499.xlsx',
  2023: 'https://www.mlit.go.jp/kankocho/content/001750679.xlsx',
  2022: 'https://www.mlit.go.jp/kankocho/tokei_hakusyo/content/001616676.xlsx',
  2021: 'https://www.mlit.go.jp/kankocho/tokei_hakusyo/content/001488438.xlsx',
  2020: 'https://www.mlit.go.jp/kankocho/tokei_hakusyo/content/001411547.xlsx',
  2019: 'https://www.mlit.go.jp/kankocho/tokei_hakusyo/content/001350484.xlsx',
  2018: 'https://www.mlit.go.jp/kankocho/content/001295984.xlsx',
  2017: 'https://www.mlit.go.jp/kankocho/content/001247521.xlsx',
  2016: 'https://www.mlit.go.jp/kankocho/content/001190399.xlsx',
  2015: 'https://www.mlit.go.jp/kankocho/tokei_hakusyo/content/001312940.xlsx',
};

const SUIKEI_URL = 'https://www.mlit.go.jp/kankocho/content/001912060.xlsx';

// ═══════════════════════════════════════════════
// 21 nationalities in 確報 参考第1表 (columns C-X, index 2-23)
// ═══════════════════════════════════════════════

const NATIONALITIES_21 = [
  '韓国', '中国', '香港', '台湾', '米国', 'カナダ', '英国', 'ドイツ',
  'フランス', 'ロシア', 'シンガポール', 'タイ', 'マレーシア', 'インド',
  'オーストラリア', 'インドネシア', 'ベトナム', 'フィリピン', 'イタリア',
  'スペイン', 'その他',
];

// Prefecture names as they appear in the Excel (with leading space)
const PREF_NAMES: Record<string, string> = {
  '01': '北海道', '02': '青森県', '03': '岩手県', '04': '宮城県', '05': '秋田県',
  '06': '山形県', '07': '福島県', '08': '茨城県', '09': '栃木県', '10': '群馬県',
  '11': '埼玉県', '12': '千葉県', '13': '東京都', '14': '神奈川県', '15': '新潟県',
  '16': '富山県', '17': '石川県', '18': '福井県', '19': '山梨県', '20': '長野県',
  '21': '岐阜県', '22': '静岡県', '23': '愛知県', '24': '三重県', '25': '滋賀県',
  '26': '京都府', '27': '大阪府', '28': '兵庫県', '29': '奈良県', '30': '和歌山県',
  '31': '鳥取県', '32': '島根県', '33': '岡山県', '34': '広島県', '35': '山口県',
  '36': '徳島県', '37': '香川県', '38': '愛媛県', '39': '高知県', '40': '福岡県',
  '41': '佐賀県', '42': '長崎県', '43': '熊本県', '44': '大分県', '45': '宮崎県',
  '46': '鹿児島県', '47': '沖縄県',
};

// Reverse lookup: name → prefCode
const PREF_CODE_MAP = new Map<string, string>();
for (const [code, name] of Object.entries(PREF_NAMES)) {
  PREF_CODE_MAP.set(name, code);
  PREF_CODE_MAP.set(name.replace(/[都府県]$/, ''), code); // 東京, 京都 etc
  // With number prefix as in Excel: "01北海道"
  PREF_CODE_MAP.set(`${code}${name}`, code);
}
// Special cases
PREF_CODE_MAP.set('北海道', '01');

function extractPrefCode(cellValue: string): string | null {
  const trimmed = (cellValue || '').replace(/^[\s　]+/, '').trim();
  // Try "01北海道" pattern
  const m = trimmed.match(/^(\d{2})/);
  if (m) return m[1];
  // Try name match
  for (const [name, code] of PREF_CODE_MAP) {
    if (trimmed.includes(name)) return code;
  }
  return null;
}

// ═══════════════════════════════════════════════
// 1. JNTO Visitors Parser
// ═══════════════════════════════════════════════

/**
 * JNTO 訪日外客数
 * Sheets: one per year (2003-2025)
 * Structure differs between ≤2019 (data starts col B) and ≥2020 (data starts col C, col B is null)
 */
export async function getJntoVisitors(params: {
  year?: number;
  country?: string;
  yearFrom?: number;
  yearTo?: number;
}): Promise<ApiResponse> {
  try {
    const filepath = await ensureFile(JNTO_URL, 'jnto-visitors.xlsx');
    const XLSX = await getXlsx();
    const wb = XLSX.readFile(filepath);

    const yearFrom = params.yearFrom || params.year || 2020;
    const yearTo = params.yearTo || params.year || new Date().getFullYear();
    const countryFilter = params.country?.trim();

    const results: Array<{
      year: number;
      country: string;
      months: Record<string, number>;
      annual: number;
    }> = [];

    for (let y = yearFrom; y <= yearTo; y++) {
      const sheetName = String(y);
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;

      const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      if (data.length < 5) continue;

      // Detect layout: ≤2019 has data at col 1, ≥2020 at col 2
      const headerRow = data[3] || [];
      const offset = (headerRow[1] === null || headerRow[1] === undefined) ? 2 : 1;

      // Parse each country row (starting from row 4)
      for (let r = 4; r < data.length; r++) {
        const row = data[r];
        if (!row || !row[0]) continue;
        const country = String(row[0]).trim();
        if (!country || country === '' || country.startsWith('※')) continue;

        if (countryFilter && !country.includes(countryFilter)) continue;

        const months: Record<string, number> = {};
        let annual = 0;
        for (let m = 0; m < 12; m++) {
          const colIdx = offset + m * 2; // each month has value + growth rate
          const val = row[colIdx];
          if (typeof val === 'number' && val > 0) {
            months[String(m + 1).padStart(2, '0')] = val;
            annual += val;
          }
        }
        // Check for annual total in last columns
        const annualColIdx = offset + 24; // after 12 months × 2 cols
        const annualVal = row[annualColIdx];
        if (typeof annualVal === 'number' && annualVal > 0) annual = annualVal;

        if (annual > 0 || Object.keys(months).length > 0) {
          results.push({ year: y, country, months, annual });
        }
      }
    }

    return {
      success: true,
      data: {
        source: 'JNTO',
        description: '訪日外客数（国籍別・月次）',
        unit: '人',
        period: `${yearFrom}-${yearTo}`,
        count: results.length,
        records: results,
      },
      source: 'JNTO',
      timestamp: new Date().toISOString(),
    };
  } catch (e: any) {
    return createError('JNTO', e.message);
  }
}

// ═══════════════════════════════════════════════
// 2. 観光庁 確報 — 国籍別×都道府県別 宿泊者数
// ═══════════════════════════════════════════════

/**
 * 参考第1表: 国籍(21区分)×都道府県(47)×月(年計/1-12月) 外国人延べ宿泊者数
 * Data starts at row 6 (0-indexed): row 6 = national total, rows 7-53 = 47 prefectures
 * Columns: A=prefecture, B=total foreign, C-W=21 nationalities
 */
export async function getKakuhoNationality(params: {
  year: number;
  month?: number;       // 1-12, omit for annual
  prefecture?: string;  // prefCode (01-47) or name
  nationality?: string; // name from NATIONALITIES_21
}): Promise<ApiResponse> {
  const url = KAKUHO_URLS[params.year];
  if (!url) {
    return createError('観光庁/確報', `${params.year}年の確報Excelは未登録です。対応年: ${Object.keys(KAKUHO_URLS).sort().join(', ')}`);
  }

  try {
    const filepath = await ensureFile(url, `kakuho-${params.year}.xlsx`);
    const XLSX = await getXlsx();
    const wb = XLSX.readFile(filepath);

    const sheetName = params.month
      ? `参考第1表(${params.month}月)`
      : '参考第1表(年計)';
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      return createError('観光庁/確報', `シート「${sheetName}」が見つかりません`);
    }

    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Find prefecture filter
    let prefFilter: string | null = null;
    if (params.prefecture) {
      if (/^\d{2}$/.test(params.prefecture)) {
        prefFilter = params.prefecture;
      } else {
        prefFilter = PREF_CODE_MAP.get(params.prefecture) || null;
      }
    }

    // Find nationality column index
    let natIdx: number | null = null;
    if (params.nationality) {
      const idx = NATIONALITIES_21.indexOf(params.nationality);
      if (idx >= 0) natIdx = idx + 2; // columns start at index 2 (C)
    }

    const records: Array<{
      prefCode: string;
      prefecture: string;
      total: number;
      nationalities: Record<string, number>;
    }> = [];

    // Data rows: row 6 = national total, rows 7-53 = prefectures
    for (let r = 6; r < Math.min(data.length, 54); r++) {
      const row = data[r];
      if (!row || !row[0]) continue;

      const cellA = String(row[0]);
      const prefCode = extractPrefCode(cellA);
      if (!prefCode && r > 6) continue; // skip non-prefecture rows (transport bureau etc)

      // National total row (r=6) gets prefCode "00"
      const code = prefCode || '00';
      const name = code === '00' ? '全国' : (PREF_NAMES[code] || cellA.trim());

      if (prefFilter && code !== prefFilter && code !== '00') continue;

      const total = typeof row[1] === 'number' ? row[1] : 0;
      const nationalities: Record<string, number> = {};

      if (natIdx !== null) {
        // Single nationality
        const val = typeof row[natIdx] === 'number' ? row[natIdx] : 0;
        nationalities[NATIONALITIES_21[natIdx - 2]] = val;
      } else {
        // All 21 nationalities
        for (let n = 0; n < NATIONALITIES_21.length; n++) {
          const val = row[n + 2];
          if (typeof val === 'number') {
            nationalities[NATIONALITIES_21[n]] = val;
          }
        }
      }

      records.push({ prefCode: code, prefecture: name, total, nationalities });
    }

    return {
      success: true,
      data: {
        source: '観光庁 宿泊旅行統計（確報）',
        description: '国籍（21区分）別×都道府県別 外国人延べ宿泊者数（従業者数10人以上施設）',
        unit: '人泊',
        year: params.year,
        month: params.month || '年計',
        availableNationalities: NATIONALITIES_21,
        count: records.length,
        records,
      },
      source: '観光庁/確報',
      timestamp: new Date().toISOString(),
    };
  } catch (e: any) {
    return createError('観光庁/確報', e.message);
  }
}

// ═══════════════════════════════════════════════
// 3. 観光庁 推移表 — 都道府県別 外国人延べ宿泊者数(時系列)
// ═══════════════════════════════════════════════

/** Japanese era year headers → Western year */
function parseJapaneseYear(header: string): number | null {
  if (!header) return null;
  const h = String(header);
  const mHeisei = h.match(/平成(\d+)年/);
  if (mHeisei) return 1988 + parseInt(mHeisei[1]);
  const mReiwa = h.match(/令和(\d+)年/);
  if (mReiwa) return 2018 + parseInt(mReiwa[1]);
  if (h.includes('令和元年')) return 2019;
  return null;
}

/**
 * Sheet 3-1: 都道府県別 外国人延べ宿泊者数 推移表（年計）
 * Row 2: year headers (平成23年 ~ 令和7年)
 * Row 4: 全国, Rows 5-51: prefectures
 * Columns B-P: years (H23/2011 ~ R7/2025)
 */
export async function getSuikeiTrend(params: {
  prefecture?: string;  // prefCode or name
  yearFrom?: number;
  yearTo?: number;
  monthly?: boolean;    // true → sheet 3-2 (monthly)
}): Promise<ApiResponse> {
  try {
    const filepath = await ensureFile(SUIKEI_URL, 'kankocho-suikei.xlsx');
    const XLSX = await getXlsx();
    const wb = XLSX.readFile(filepath);

    const sheetName = params.monthly ? '3-2' : '3-1';
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      return createError('観光庁/推移表', `シート「${sheetName}」が見つかりません`);
    }

    const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Parse year headers from row 2
    const headerRow = data[2] || [];
    const years: number[] = [];
    const yearCols: number[] = [];
    for (let c = 1; c < headerRow.length; c++) {
      const y = parseJapaneseYear(String(headerRow[c] || ''));
      if (y) {
        years.push(y);
        yearCols.push(c);
      }
    }

    // For monthly, parse month sub-headers from row 3
    let monthHeaders: string[] = [];
    if (params.monthly) {
      const monthRow = data[3] || [];
      monthHeaders = monthRow.map((v: any) => String(v || ''));
    }

    // Prefecture filter
    let prefFilter: string | null = null;
    if (params.prefecture) {
      prefFilter = /^\d{2}$/.test(params.prefecture)
        ? params.prefecture
        : (PREF_CODE_MAP.get(params.prefecture) || null);
    }

    const yearFrom = params.yearFrom || 2011;
    const yearTo = params.yearTo || 2030;

    if (params.monthly) {
      // Monthly: columns are grouped by year (12 months per year)
      const records: Array<{ prefCode: string; prefecture: string; year: number; month: number; guestNights: number }> = [];

      for (let r = 4; r < Math.min(data.length, 52); r++) {
        const row = data[r];
        if (!row || !row[0]) continue;
        const prefCode = extractPrefCode(String(row[0]));
        if (!prefCode && r > 4) continue;
        const code = prefCode || '00';
        const name = code === '00' ? '全国' : (PREF_NAMES[code] || String(row[0]).trim());
        if (prefFilter && code !== prefFilter && code !== '00') continue;

        // Each year has 12 monthly columns starting from its base column
        for (let yi = 0; yi < years.length; yi++) {
          if (years[yi] < yearFrom || years[yi] > yearTo) continue;
          const baseCol = 1 + yi * 12; // First month column for this year
          for (let m = 0; m < 12; m++) {
            const val = row[baseCol + m];
            if (typeof val === 'number' && val > 0) {
              records.push({ prefCode: code, prefecture: name, year: years[yi], month: m + 1, guestNights: val });
            }
          }
        }
      }

      return {
        success: true,
        data: {
          source: '観光庁 宿泊旅行統計 推移表（月別）',
          description: '都道府県別 外国人延べ宿泊者数（月次推移）',
          unit: '人泊',
          count: records.length,
          records,
        },
        source: '観光庁/推移表',
        timestamp: new Date().toISOString(),
      };
    }

    // Annual
    const records: Array<{ prefCode: string; prefecture: string; timeline: Record<string, number> }> = [];

    for (let r = 4; r < Math.min(data.length, 52); r++) {
      const row = data[r];
      if (!row || !row[0]) continue;
      const prefCode = extractPrefCode(String(row[0]));
      if (!prefCode && r > 4) continue;
      const code = prefCode || '00';
      const name = code === '00' ? '全国' : (PREF_NAMES[code] || String(row[0]).trim());
      if (prefFilter && code !== prefFilter && code !== '00') continue;

      const timeline: Record<string, number> = {};
      for (let yi = 0; yi < years.length; yi++) {
        if (years[yi] < yearFrom || years[yi] > yearTo) continue;
        const val = row[yearCols[yi]];
        if (typeof val === 'number') {
          timeline[String(years[yi])] = val;
        }
      }

      if (Object.keys(timeline).length > 0) {
        records.push({ prefCode: code, prefecture: name, timeline });
      }
    }

    return {
      success: true,
      data: {
        source: '観光庁 宿泊旅行統計 推移表（年計）',
        description: '都道府県別 外国人延べ宿泊者数（年次推移）',
        unit: '人泊',
        years: years.filter(y => y >= yearFrom && y <= yearTo),
        count: records.length,
        records,
      },
      source: '観光庁/推移表',
      timestamp: new Date().toISOString(),
    };
  } catch (e: any) {
    return createError('観光庁/推移表', e.message);
  }
}

// ═══════════════════════════════════════════════
// 4. Available years/data catalog
// ═══════════════════════════════════════════════

export function getCatalog(): ApiResponse {
  return {
    success: true,
    data: {
      sources: [
        {
          id: 'jnto_visitors',
          name: 'JNTO 訪日外客数',
          unit: '人',
          granularity: '国籍×月次',
          period: '2003-2026',
          prefectureLevel: false,
          nationalityLevel: true,
          description: '日本政府観光局(JNTO)マスターExcel。60+国籍、月次。全国レベルのみ',
        },
        {
          id: 'kakuho_nationality',
          name: '観光庁 宿泊旅行統計（確報）',
          unit: '人泊',
          granularity: '国籍(21区分)×都道府県×月次',
          period: '2015-2024',
          availableYears: Object.keys(KAKUHO_URLS).map(Number).sort(),
          prefectureLevel: true,
          nationalityLevel: true,
          nationalities: NATIONALITIES_21,
          description: '観光庁の確報Excel。21国籍×47都道府県、年計+月別。従業者数10人以上施設',
        },
        {
          id: 'suikei_trend',
          name: '観光庁 宿泊旅行統計 推移表',
          unit: '人泊',
          granularity: '都道府県×年次/月次',
          period: '2011-2025',
          prefectureLevel: true,
          nationalityLevel: false,
          description: '観光庁の推移表Excel。47都道府県、外国人延べ宿泊者数合計。国籍内訳なし',
        },
      ],
    },
    source: '観光統計',
    timestamp: new Date().toISOString(),
  };
}
