/**
 * resolve — コード変換・ID接続プロバイダ
 *
 * 自然言語やエンティティ名からAPIパラメータ・IDを確定的に変換する。
 * - code_lookup: 自然言語 → APIパラメータ
 * - entity_bridge: 企業名/法人番号 → 全API横断ID
 * - area_bridge: 地域コード相互変換
 * - time_bridge: 時間表記の正規化
 */

import { createError } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';
import { searchHoujin } from './houjin.js';
import type { HoujinConfig } from './houjin.js';
import { searchCorporation } from './gbiz.js';
import type { GbizConfig } from './gbiz.js';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const areaData = require('../data/area-mapping.json') as AreaMapping;
const topicData = require('../data/topic-indicators.json') as TopicMapping;
const edinetData = require('../data/edinet-mapping.json') as EdinetMapping;

// ── Types ──

interface CityInfo {
  name: string;
  kana: string;
  type: 'designated_city' | 'core_city' | 'city' | 'ward' | 'special_ward' | 'town' | 'village';
  parentCity?: string;
}

interface PrefInfo {
  name: string;
  kana: string;
  jmaCode: string;
  estatCode: string;
  lat: number;
  lon: number;
  cities?: Record<string, CityInfo>;
}

interface ToolRef {
  tool: string;
  action: string;
  params: Record<string, string>;
  label: string;
}

interface TopicEntry {
  primary: ToolRef[];
  secondary: ToolRef[];
  estatField: string;
  keywords: string[];
}

interface AreaMapping {
  prefectures: Record<string, PrefInfo>;
  nameIndex: Record<string, string>;
  cityIndex: Record<string, string>;
}

interface TopicMapping {
  topics: Record<string, TopicEntry>;
  aliases: Record<string, string>;
}

interface EdinetMapping {
  byHoujinBangou: Record<string, string>;  // corpNum → edinetCode
  byEdinetCode: Record<string, { c: string | null; n: string; s: string | null }>;
}

const prefectures = areaData.prefectures;
const nameIndex = areaData.nameIndex;
const cityIndex = areaData.cityIndex;
const topics = topicData.topics;
const aliases = topicData.aliases;

// ── Area Resolution Helpers ──

/** 名前・コードからprefCodeを解決 */
function resolvePrefCode(input: string): string | undefined {
  const trimmed = input.trim().toLowerCase();

  // Direct prefCode match (01-47)
  if (/^\d{2}$/.test(trimmed) && prefectures[trimmed]) return trimmed;

  // jmaCode match (6 digits like 130000)
  if (/^\d{6}$/.test(trimmed)) {
    for (const [code, info] of Object.entries(prefectures)) {
      if (info.jmaCode === trimmed) return code;
    }
  }

  // estatCode match (5 digits like 13000)
  if (/^\d{5}$/.test(trimmed)) {
    for (const [code, info] of Object.entries(prefectures)) {
      if (info.estatCode === trimmed) return code;
    }
  }

  // nameIndex lookup (漢字/ひらがな/英語)
  const found = nameIndex[trimmed] || nameIndex[input.trim()];
  if (found) return found;

  // Fuzzy: try removing 都道府県 suffix
  const stripped = input.trim().replace(/[都道府県]$/, '');
  const foundStripped = nameIndex[stripped];
  if (foundStripped) return foundStripped;

  return undefined;
}

/** lat/lonから最近傍の都道府県を返す */
function nearestPref(lat: number, lon: number): string {
  let best = '13'; // fallback: 東京
  let bestDist = Infinity;
  for (const [code, info] of Object.entries(prefectures)) {
    const d = (info.lat - lat) ** 2 + (info.lon - lon) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = code;
    }
  }
  return best;
}

// ── Topic Resolution Helpers ──

/** トピック名を解決（直接一致→alias→部分一致） */
function resolveTopic(input: string): { name: string; entry: TopicEntry } | undefined {
  const trimmed = input.trim();

  // Direct match
  if (topics[trimmed]) return { name: trimmed, entry: topics[trimmed] };

  // Alias match
  const aliased = aliases[trimmed] || aliases[trimmed.toLowerCase()];
  if (aliased && topics[aliased]) return { name: aliased, entry: topics[aliased] };

  // Keyword match: scan all topics for keyword inclusion
  for (const [name, entry] of Object.entries(topics)) {
    if (entry.keywords.some(kw => trimmed.includes(kw) || kw.includes(trimmed))) {
      return { name, entry };
    }
  }

  return undefined;
}

/** クエリ文字列から地域名とトピック名を分離 */
function parseQuery(query: string): { areaHint?: string; topicHint?: string } {
  const q = query.trim();
  let areaHint: string | undefined;
  let topicHint = q;

  // Try to extract prefecture name from query
  for (const name of Object.keys(nameIndex)) {
    if (name.length >= 2 && q.includes(name)) {
      areaHint = name;
      topicHint = q.replace(name, '').replace(/[のにをはがで、。]/g, '').trim();
      break;
    }
  }

  return { areaHint, topicHint: topicHint || undefined };
}

// ── Time Resolution Helpers ──

/** 和暦→西暦変換テーブル */
const eraBase: Record<string, number> = {
  '令和': 2018, '平成': 1988, '昭和': 1925, '大正': 1911, '明治': 1867,
  'reiwa': 2018, 'heisei': 1988, 'showa': 1925,
};

/** 時間表記をパースして年(number)を返す */
function parseYear(input: string): number | undefined {
  const s = input.trim();

  // 西暦4桁: "2023", "2023年", "2023年度"
  const westMatch = s.match(/^(\d{4})/);
  if (westMatch) return parseInt(westMatch[1], 10);

  // 和暦: "令和5年", "R5", "平成30年"
  for (const [era, base] of Object.entries(eraBase)) {
    const re = new RegExp(`${era}(\\d{1,2})`);
    const m = s.match(re);
    if (m) return base + parseInt(m[1], 10);
  }
  // Short form: R5, H30
  const shortMatch = s.match(/^([RHSTMrhstm])(\d{1,2})/);
  if (shortMatch) {
    const map: Record<string, number> = { r: 2018, h: 1988, s: 1925, t: 1911, m: 1867 };
    const base = map[shortMatch[1].toLowerCase()];
    if (base) return base + parseInt(shortMatch[2], 10);
  }

  // FY2023
  const fyMatch = s.match(/FY(\d{4})/i);
  if (fyMatch) return parseInt(fyMatch[1], 10);

  return undefined;
}

/** e-Stat年コード生成 */
function estatYearCode(year: number): string {
  return `${year}000000`;
}

/** e-Stat月コード生成 */
function estatMonthCode(year: number, month: number): string {
  return `${year}${String(month).padStart(2, '0')}0000`;
}

/** e-Stat四半期コード生成 */
function estatQuarterCode(year: number, quarter: number): string {
  return `${year}0${quarter}0000`;
}

// ═══ Exported Functions ═══

/**
 * code_lookup: 自然言語 → APIパラメータ
 * "東京都の人口" → { area: {prefCode: "13", ...}, topic: {name: "人口", tools: [...]} }
 */
export function codeLookup(params: {
  query: string;
  source?: 'estat' | 'stats' | 'boj';
}): ApiResponse {
  const source = 'resolve/code_lookup';
  if (!params.query?.trim()) {
    return createError(source, 'query is required');
  }

  const { areaHint, topicHint } = parseQuery(params.query);
  const hints: string[] = [];

  // Resolve area
  let area: Record<string, unknown> | undefined;
  if (areaHint) {
    const prefCode = resolvePrefCode(areaHint);
    if (prefCode) {
      const info = prefectures[prefCode];
      area = {
        prefCode,
        name: info.name,
        estatCode: info.estatCode,
        jmaCode: info.jmaCode,
        lat: info.lat,
        lon: info.lon,
      };
    } else {
      hints.push(`地域「${areaHint}」を特定できませんでした`);
    }
  }

  // Resolve topic
  let topic: Record<string, unknown> | undefined;
  if (topicHint) {
    const resolved = resolveTopic(topicHint);
    if (resolved) {
      // Filter by source if specified
      let tools = [...resolved.entry.primary, ...resolved.entry.secondary];
      if (params.source) {
        const sourceToolMap: Record<string, string> = { estat: 'estat', stats: 'stats', boj: 'stats' };
        const targetTool = sourceToolMap[params.source];
        tools = tools.filter(t => t.tool === targetTool);
        if (params.source === 'boj') {
          tools = tools.filter(t => t.action.startsWith('boj_'));
        }
      }
      topic = {
        name: resolved.name,
        keywords: resolved.entry.keywords,
        estatField: resolved.entry.estatField || undefined,
        tools,
      };
    } else {
      hints.push(`トピック「${topicHint}」の事前定義が見つかりません。estat.searchで検索してください`);
    }
  }

  if (!area && !topic) {
    return createError(source, `「${params.query}」から地域もトピックも特定できませんでした。より具体的なキーワードを使ってください`);
  }

  return {
    success: true,
    data: { area, topic, hints: hints.length > 0 ? hints : undefined },
    source,
    timestamp: new Date().toISOString(),
  };
}

/**
 * entity_bridge: 企業名/法人番号 → 全API横断ID
 */
export async function entityBridge(
  params: { name?: string; corporateNumber?: string },
  config: { houjin: HoujinConfig; gbiz: GbizConfig },
): Promise<ApiResponse> {
  const source = 'resolve/entity_bridge';
  if (!params.name && !params.corporateNumber) {
    return createError(source, 'name or corporateNumber is required');
  }

  const result: Record<string, unknown> = {};
  const warnings: string[] = [];

  // Step 1: If name given, search houjin first to get corporateNumber
  let corpNum = params.corporateNumber;

  if (config.houjin.appId) {
    const houjinResult = await searchHoujin(config.houjin, {
      name: params.name,
      number: params.corporateNumber,
    });
    if (houjinResult.success && houjinResult.data) {
      const corps = houjinResult.data?.corporation;
      const list = Array.isArray(corps) ? corps : corps ? [corps] : [];
      if (list.length > 0) {
        const first = list[0] as Record<string, unknown>;
        result.houjin = {
          corporateNumber: first.corporateNumber,
          name: first.name,
          address: [first.prefectureName, first.cityName, first.streetNumber].filter(Boolean).join(''),
          kind: first.kind,
        };
        if (!corpNum) corpNum = first.corporateNumber as string;
      }
    } else {
      warnings.push(`法人番号検索: ${houjinResult.error || '結果なし'}`);
    }
  } else {
    warnings.push('HOUJIN_APP_ID未設定のため法人番号検索をスキップ');
  }

  // Step 2: Search gBiz with corporateNumber or name
  if (config.gbiz.token) {
    const gbizResult = await searchCorporation(config.gbiz, {
      name: corpNum ? undefined : params.name,
      corporateNumber: corpNum,
    });
    if (gbizResult.success && gbizResult.data) {
      const infos = gbizResult.data?.['hojin-infos'];
      const list = Array.isArray(infos) ? infos : [];
      if (list.length > 0) {
        const first = list[0] as Record<string, unknown>;
        result.gbiz = {
          corporateNumber: first.corporate_number,
          name: first.name,
          status: first.status,
          dateOfEstablishment: first.date_of_establishment,
          businessSummary: first.business_summary,
        };
        if (!corpNum) corpNum = first.corporate_number as string;
      }
    } else {
      warnings.push(`gBiz検索: ${gbizResult.error || '結果なし'}`);
    }
  } else {
    warnings.push('GBIZ_TOKEN未設定のためgBiz検索をスキップ');
  }

  // Step 3: EDINET code lookup (pure function, no API call)
  let edinetCode: string | null = null;
  let edinetName: string | null = null;
  let secCode: string | null = null;

  if (corpNum && edinetData.byHoujinBangou[corpNum]) {
    edinetCode = edinetData.byHoujinBangou[corpNum];
    const entry = edinetData.byEdinetCode[edinetCode];
    if (entry) {
      edinetName = entry.n;
      secCode = entry.s;
    }
  }

  if (!result.houjin && !result.gbiz && !edinetCode) {
    return createError(source, `「${params.name || params.corporateNumber}」の企業情報が見つかりません。${warnings.join('; ')}`);
  }

  return {
    success: true,
    data: {
      corporateNumber: corpNum,
      edinetCode: edinetCode || undefined,
      secCode: secCode || undefined,
      ...result,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    source,
    timestamp: new Date().toISOString(),
  };
}

/** cityCodeから市区町村情報を解決 */
function resolveCity(code5: string): { prefCode: string; cityCode: string; city: CityInfo } | undefined {
  if (!cityIndex[code5]) return undefined;
  const prefCode = code5.slice(0, 2);
  const pref = prefectures[prefCode];
  if (!pref?.cities?.[code5]) return undefined;
  return { prefCode, cityCode: code5, city: pref.cities[code5] };
}

/** 名前から市区町村を解決（nameIndex経由） */
function resolveCityByName(name: string): { prefCode: string; cityCode: string; city: CityInfo } | undefined {
  const trimmed = name.trim();

  // Try exact nameIndex match first
  const code = nameIndex[trimmed];
  if (code && code.length === 5) {
    const resolved = resolveCity(code);
    if (resolved) return resolved;
  }

  // Try lowercase
  const codeLower = nameIndex[trimmed.toLowerCase()];
  if (codeLower && codeLower.length === 5) {
    const resolved = resolveCity(codeLower);
    if (resolved) return resolved;
  }

  return undefined;
}

/**
 * area_bridge: 地域コード相互変換
 */
export function areaBridge(params: {
  name?: string;
  prefCode?: string;
  cityCode?: string;
  jmaCode?: string;
  estatCode?: string;
  lat?: number;
  lon?: number;
}): ApiResponse {
  const source = 'resolve/area_bridge';

  // ── cityCode direct resolution ──
  if (params.cityCode) {
    const code5 = params.cityCode.length === 6 ? params.cityCode.slice(0, 5) : params.cityCode;
    const resolved = resolveCity(code5);
    if (!resolved) {
      return createError(source, `市区町村コード「${params.cityCode}」が見つかりません`);
    }
    const pref = prefectures[resolved.prefCode];
    return {
      success: true,
      data: {
        prefCode: resolved.prefCode,
        cityCode: resolved.cityCode,
        prefName: pref.name,
        cityName: resolved.city.name,
        cityKana: resolved.city.kana,
        cityType: resolved.city.type,
        parentCity: resolved.city.parentCity || undefined,
        jmaCode: pref.jmaCode,
        estatCode: pref.estatCode,
        lat: pref.lat,
        lon: pref.lon,
      },
      source,
      timestamp: new Date().toISOString(),
    };
  }

  // ── name resolution: try city first, then prefecture ──
  if (params.name) {
    const cityResult = resolveCityByName(params.name);
    if (cityResult) {
      const pref = prefectures[cityResult.prefCode];
      return {
        success: true,
        data: {
          prefCode: cityResult.prefCode,
          cityCode: cityResult.cityCode,
          prefName: pref.name,
          cityName: cityResult.city.name,
          cityKana: cityResult.city.kana,
          cityType: cityResult.city.type,
          parentCity: cityResult.city.parentCity || undefined,
          jmaCode: pref.jmaCode,
          estatCode: pref.estatCode,
          lat: pref.lat,
          lon: pref.lon,
        },
        source,
        timestamp: new Date().toISOString(),
      };
    }
  }

  // ── Prefecture-level resolution (original logic) ──
  let prefCode: string | undefined;

  if (params.prefCode) {
    prefCode = params.prefCode.padStart(2, '0');
  } else if (params.name) {
    prefCode = resolvePrefCode(params.name);
  } else if (params.jmaCode) {
    prefCode = resolvePrefCode(params.jmaCode);
  } else if (params.estatCode) {
    prefCode = resolvePrefCode(params.estatCode);
  } else if (params.lat !== undefined && params.lon !== undefined) {
    prefCode = nearestPref(params.lat, params.lon);
  }

  if (!prefCode || !prefectures[prefCode]) {
    return createError(source, '指定された地域を特定できませんでした。都道府県名・コードを確認してください');
  }

  const info = prefectures[prefCode];
  return {
    success: true,
    data: {
      prefCode,
      name: info.name,
      kana: info.kana,
      jmaCode: info.jmaCode,
      estatCode: info.estatCode,
      lat: info.lat,
      lon: info.lon,
    },
    source,
    timestamp: new Date().toISOString(),
  };
}

/**
 * time_bridge: 時間表記の正規化・各APIフォーマット変換
 */
export function timeBridge(params: {
  from: string;
  to?: string;
  freq?: 'A' | 'Q' | 'M';
  calendar?: 'fiscal' | 'calendar';
}): ApiResponse {
  const source = 'resolve/time_bridge';

  const fromYear = parseYear(params.from);
  if (!fromYear) {
    return createError(source, `「${params.from}」を年として解釈できませんでした`);
  }

  const toYear = params.to ? parseYear(params.to) : fromYear;
  if (!toYear) {
    return createError(source, `「${params.to}」を年として解釈できませんでした`);
  }

  const freq = params.freq || 'A';
  const isFiscal = params.calendar === 'fiscal';

  // Generate year list
  const years: number[] = [];
  for (let y = fromYear; y <= toYear; y++) years.push(y);

  // e-Stat cdTime
  let estatCdTime: string;
  if (freq === 'A') {
    estatCdTime = fromYear === toYear
      ? estatYearCode(fromYear)
      : `${estatYearCode(fromYear)}-${estatYearCode(toYear)}`;
  } else if (freq === 'Q') {
    const fromQ = isFiscal ? estatQuarterCode(fromYear, 1) : estatQuarterCode(fromYear, 1);
    const toQ = isFiscal ? estatQuarterCode(toYear, 4) : estatQuarterCode(toYear, 4);
    estatCdTime = `${fromQ}-${toQ}`;
  } else {
    const fromM = isFiscal ? estatMonthCode(fromYear, 4) : estatMonthCode(fromYear, 1);
    const toM = isFiscal ? estatMonthCode(toYear + 1, 3) : estatMonthCode(toYear, 12);
    estatCdTime = `${fromM}-${toM}`;
  }

  // BOJ period (YYYYMM format)
  const bojFrom = isFiscal ? `${fromYear}04` : `${fromYear}01`;
  const bojTo = isFiscal ? `${toYear + 1}03` : `${toYear}12`;

  // Labels
  const labels = years.map(y => isFiscal ? `${y}年度` : `${y}年`);

  return {
    success: true,
    data: {
      fromYear,
      toYear,
      freq,
      calendar: isFiscal ? 'fiscal' : 'calendar',
      years,
      labels,
      estatCdTime,
      bojPeriod: { from: bojFrom, to: bojTo },
    },
    source,
    timestamp: new Date().toISOString(),
  };
}
