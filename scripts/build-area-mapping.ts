#!/usr/bin/env node
/**
 * build-area-mapping.ts
 *
 * cities-source.json + wards-source.json → src/data/area-mapping.json
 * ネットワークアクセス不要。ローカルJSONのみ使用。
 *
 * Usage: npx tsx scripts/build-area-mapping.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Load sources ──

interface CitySource {
  type: string;
  code: string;       // 6-digit with check digit
  name: string;
  kana: string;
  city_code: string;
  city_name: string;
  city_kana: string;
  pref_code: string;
  pref_name: string;
  pref_kana: string;
}

interface WardSource extends CitySource {
  ward_code: string;
  ward_name: string;
  ward_kana: string;
}

const citiesSrc: CitySource[] = JSON.parse(
  readFileSync(join(__dirname, 'data/cities-source.json'), 'utf-8'),
);
const wardsSrc: WardSource[] = JSON.parse(
  readFileSync(join(__dirname, 'data/wards-source.json'), 'utf-8'),
);

// ── Load existing area-mapping (preserve prefecture data) ──

interface PrefInfo {
  name: string;
  kana: string;
  jmaCode: string;
  estatCode: string;
  lat: number;
  lon: number;
  cities?: Record<string, CityInfo>;
}

interface CityInfo {
  name: string;
  kana: string;
  type: CityType;
  parentCity?: string;  // 5-digit code of parent designated city (for wards)
}

type CityType = 'designated_city' | 'core_city' | 'city' | 'ward' | 'special_ward' | 'town' | 'village';

const existingMapping = JSON.parse(
  readFileSync(join(ROOT, 'src/data/area-mapping.json'), 'utf-8'),
);
const prefectures: Record<string, PrefInfo> = existingMapping.prefectures;

// ── Designated cities (政令指定都市) list ──
// 20 cities as of 2024
const designatedCities = new Set([
  '札幌市', '仙台市', 'さいたま市', '千葉市', '横浜市', '川崎市', '相模原市',
  '新潟市', '静岡市', '浜松市', '名古屋市', '京都市', '大阪市', '堺市',
  '神戸市', '岡山市', '広島市', '北九州市', '福岡市', '熊本市',
]);

// ── Core cities (中核市) list — 62 cities as of 2024 ──
const coreCities = new Set([
  '旭川市', '函館市', '青森市', '八戸市', '盛岡市', '秋田市', '山形市',
  'いわき市', '郡山市', '福島市', '水戸市', '宇都宮市', '前橋市', '高崎市',
  '川越市', '越谷市', '川口市', '船橋市', '柏市', '八王子市', '横須賀市',
  '富山市', '金沢市', '福井市', '甲府市', '長野市', '松本市', '岐阜市',
  '豊橋市', '岡崎市', '豊田市', '一宮市', '春日井市', '大津市', '豊中市',
  '吹田市', '高槻市', '枚方市', '東大阪市', '姫路市', '尼崎市', '明石市',
  '西宮市', '奈良市', '和歌山市', '鳥取市', '松江市', '倉敷市', '呉市',
  '福山市', '下関市', '高松市', '松山市', '高知市', '久留米市', '長崎市',
  '佐世保市', '大分市', '宮崎市', '鹿児島市', '那覇市', '中核市',
]);

// ── Tokyo special wards (特別区) ──
const tokyoSpecialWards = new Set([
  '千代田区', '中央区', '港区', '新宿区', '文京区', '台東区', '墨田区',
  '江東区', '品川区', '目黒区', '大田区', '世田谷区', '渋谷区', '中野区',
  '杉並区', '豊島区', '北区', '荒川区', '板橋区', '練馬区', '足立区',
  '葛飾区', '江戸川区',
]);

// ── Helper: 6-digit → 5-digit (drop check digit) ──
function toCode5(code6: string): string {
  return code6.slice(0, 5);
}

// ── Helper: extract prefCode (2-digit) from 5-digit city code ──
function prefCodeFromCity(code5: string): string {
  return code5.slice(0, 2);
}

// ── Helper: classify city type ──
function classifyCity(cityName: string, prefCode: string): CityType {
  if (prefCode === '13' && tokyoSpecialWards.has(cityName)) return 'special_ward';
  if (designatedCities.has(cityName)) return 'designated_city';
  if (coreCities.has(cityName)) return 'core_city';
  if (cityName.endsWith('市')) return 'city';
  if (cityName.endsWith('町')) return 'town';
  if (cityName.endsWith('村')) return 'village';
  if (cityName.endsWith('区')) return 'special_ward'; // Tokyo wards
  return 'city';
}

// ── Build city code → 5-digit parent code map (for wards) ──
const wardParentMap = new Map<string, string>(); // ward 5-digit → parent city 5-digit
for (const w of wardsSrc) {
  wardParentMap.set(toCode5(w.ward_code || w.code), toCode5(w.city_code));
}

// ── Process cities ──

const cityIndex: Record<string, string> = {};  // cityCode(5-digit) → "prefCode:cityCode"

// Collect all city 5-digit codes that are designated cities
const designatedCityCodes = new Set<string>();
for (const c of citiesSrc) {
  if (designatedCities.has(c.city_name)) {
    designatedCityCodes.add(toCode5(c.code));
  }
}

for (const c of citiesSrc) {
  const code5 = toCode5(c.code);
  const prefCode = prefCodeFromCity(code5);

  if (!prefectures[prefCode]) continue;  // safety

  if (!prefectures[prefCode].cities) {
    prefectures[prefCode].cities = {};
  }

  const cityType = classifyCity(c.city_name, prefCode);

  prefectures[prefCode].cities[code5] = {
    name: c.city_name,
    kana: c.city_kana,
    type: cityType,
  };

  // Build cityIndex: map cityCode → prefCode:cityCode
  cityIndex[code5] = code5;
}

// ── Process wards ──

for (const w of wardsSrc) {
  const code5 = toCode5(w.ward_code || w.code);
  const prefCode = prefCodeFromCity(code5);
  const parentCode5 = toCode5(w.city_code);

  if (!prefectures[prefCode]) continue;
  if (!prefectures[prefCode].cities) {
    prefectures[prefCode].cities = {};
  }

  // Determine ward type
  let wardType: CityType = 'ward';
  if (prefCode === '13' && tokyoSpecialWards.has(w.ward_name)) {
    wardType = 'special_ward';
  }

  const entry: CityInfo = {
    name: w.ward_name,
    kana: w.ward_kana,
    type: wardType,
  };
  if (designatedCityCodes.has(parentCode5)) {
    entry.parentCity = parentCode5;
  }

  prefectures[prefCode].cities[code5] = entry;
  cityIndex[code5] = code5;
}

// ── Build nameIndex (existing prefectures + new cities) ──

const nameIndex: Record<string, string> = { ...existingMapping.nameIndex };

// Normalize helper: ケ/ヶ/ヵ/が → ケ, etc.
function normalizeKe(s: string): string {
  return s.replace(/[ヶヵが]/g, 'ケ');
}

// Track duplicate city names for disambiguation
const cityNameToEntries = new Map<string, Array<{ code5: string; prefCode: string; name: string }>>();

for (const [prefCode, prefInfo] of Object.entries(prefectures)) {
  if (!prefInfo.cities) continue;
  for (const [code5, cityInfo] of Object.entries(prefInfo.cities)) {
    const key = cityInfo.name;
    if (!cityNameToEntries.has(key)) cityNameToEntries.set(key, []);
    cityNameToEntries.get(key)!.push({ code5, prefCode, name: cityInfo.name });
  }
}

for (const [prefCode, prefInfo] of Object.entries(prefectures)) {
  if (!prefInfo.cities) continue;
  for (const [code5, cityInfo] of Object.entries(prefInfo.cities)) {
    const isDuplicate = (cityNameToEntries.get(cityInfo.name)?.length ?? 0) > 1;

    if (isDuplicate) {
      // For duplicate names like 中央区, 北区, 府中市 etc.
      // Only register with prefecture prefix: "東京都中央区" → code5
      // Also register "札幌市中央区" for wards
      const prefName = prefInfo.name;
      nameIndex[`${prefName}${cityInfo.name}`] = code5;

      if (cityInfo.parentCity) {
        // Ward with parent: "札幌市中央区" → code5
        const parentInfo = prefInfo.cities[cityInfo.parentCity];
        if (parentInfo) {
          nameIndex[`${parentInfo.name}${cityInfo.name}`] = code5;
        }
      }
    } else {
      // Unique name: register directly
      nameIndex[cityInfo.name] = code5;

      // Also register kana
      if (cityInfo.kana) {
        nameIndex[cityInfo.kana] = code5;
      }

      // Register without 市/町/村 suffix (only if unique and long enough)
      const stripped = cityInfo.name.replace(/[市町村区]$/, '');
      if (stripped.length >= 2 && !nameIndex[stripped]) {
        nameIndex[stripped] = code5;
      }

      // ケ/ヶ variants
      const normalized = normalizeKe(cityInfo.name);
      if (normalized !== cityInfo.name) {
        nameIndex[normalized] = code5;
      }
    }
  }
}

// ── Stats ──

let totalCities = 0;
let totalWards = 0;
for (const pref of Object.values(prefectures)) {
  if (!pref.cities) continue;
  for (const city of Object.values(pref.cities)) {
    if (city.type === 'ward' || city.type === 'special_ward') {
      totalWards++;
    } else {
      totalCities++;
    }
  }
}

console.error(`✓ ${Object.keys(prefectures).length} prefectures`);
console.error(`✓ ${totalCities} cities + ${totalWards} wards = ${totalCities + totalWards} total`);
console.error(`✓ ${Object.keys(cityIndex).length} entries in cityIndex`);
console.error(`✓ ${Object.keys(nameIndex).length} entries in nameIndex`);

// ── Output ──

const output = {
  prefectures,
  nameIndex,
  cityIndex,
};

const outPath = join(ROOT, 'src/data/area-mapping.json');
writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
console.error(`✓ Written to ${outPath}`);

// File size
const stat = readFileSync(outPath);
console.error(`✓ File size: ${(stat.length / 1024).toFixed(0)} KB`);
