/**
 * japan-gov-mcp v3.3 — shared server definition
 * Used by both stdio (index.ts) and HTTP (server.ts) entry points.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import * as estat from './providers/estat.js';
import * as houjin from './providers/houjin.js';
import * as gbiz from './providers/gbiz.js';
import * as edinet from './providers/edinet.js';
import * as geospatial from './providers/geospatial.js';
import * as geoshape from './providers/geoshape.js';
import {
  searchLaws, getLawData, searchLawsByKeyword,
  getDashboardIndicators, getDashboardData,
  getRealEstateTransactions, getLandPrice,
  searchDatasets, getDatasetDetail,
  getSafetyInfo, searchJobs, searchAgriKnowledge,
} from './providers/misc.js';
import type { HelloworkConfig, RealEstateConfig } from './providers/misc.js';
import {
  getForecast, getForecastOverview, getSeismicHazard,
  getAmedasStations, getAmedasData, getForecastWeekly, getTyphoonInfo,
  getEarthquakeList, getTsunamiList,
} from './providers/weather.js';
import { geocode, reverseGeocode } from './providers/geo.js';
import { searchNdl, searchJstage, searchJapanSearch, searchCinii, searchIrdb } from './providers/academic.js';
import { searchPlateauDatasets, getPlateauCitygml } from './providers/plateau.js';
import { getPublicComments } from './providers/pubcomment.js';
import { getResearcherAchievements } from './providers/researchmap.js';
import * as mirasapo from './providers/mirasapo.js';
import { getAirQuality, getGeologyLegend, getGeologyAtPoint, getJaxaCollections } from './providers/science.js';
import { searchKokkaiSpeeches, searchKokkaiMeetings } from './providers/kokkai.js';
import { searchKkj } from './providers/kkj.js';
import * as mlitDpf from './providers/mlit-dpf.js';
import * as disaster from './providers/disaster.js';
import * as ndb from './providers/ndb.js';
import * as boj from './providers/boj.js';
import * as tourism from './providers/tourism.js';
import type { ApiResponse } from './utils/http.js';
import { logRequest } from './lib/logger.js';
import * as resolve from './providers/resolve.js';
import * as navigate from './providers/navigate.js';
import * as join from './providers/join.js';
import * as context from './providers/context.js';

// ── Config ──
const C = {
  estat:      { appId: process.env.ESTAT_APP_ID || '' },
  houjin:     { appId: process.env.HOUJIN_APP_ID || '' },
  gbiz:       { token: process.env.GBIZ_TOKEN || '' },
  edinet:     { apiKey: process.env.EDINET_API_KEY || '' },
  hellowork:  { apiKey: process.env.HELLOWORK_API_KEY || '' } as HelloworkConfig,
  realestate: { apiKey: process.env.REALESTATE_API_KEY || '' } as RealEstateConfig,
  mlitDpf:    { apiKey: process.env.MLIT_DPF_API_KEY || '' } as mlitDpf.MlitDpfConfig,
};

// ── Source attribution (利用規約に基づくクレジット表示) ──
const ATTRIBUTION: Record<string, string> = {
  'e-Stat': '出典：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）',
  'dashboard': '出典：統計ダッシュボード（https://dashboard.e-stat.go.jp/）',
  'BOJ': '出典：日本銀行時系列統計データ検索サイト（https://www.stat-search.boj.or.jp/）',
  'NDB': '出典：厚生労働省 NDBオープンデータ（https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000177182.html）',
  'houjin': '出典：国税庁法人番号公表サイト（https://www.houjin-bangou.nta.go.jp/）',
  'gBizINFO': '出典：gBizINFO（経済産業省）（https://info.gbiz.go.jp/）',
  'EDINET': '出典：EDINET閲覧（提出）サイト（https://disclosure2.edinet-fsa.go.jp/）',
  'JMA': '出典：気象庁ホームページ（https://www.jma.go.jp/）',
  'J-SHIS': '出典：J-SHIS 地震ハザードステーション（https://www.j-shis.bosai.go.jp/）',
  'flood': '出典：国土地理院ウェブサイト（https://www.gsi.go.jp/）',
  'JARTIC': '出典：JARTIC交通量データ（CC BY 4.0）（https://www.jartic-open-traffic.org/）',
  'e-Laws': '出典：e-Gov法令検索（https://laws.e-gov.go.jp/）',
  'kokkai': '出典：国立国会図書館 国会会議録検索システム（https://kokkai.ndl.go.jp/）',
  'pubcomment': '出典：e-Govパブリック・コメント（https://public-comment.e-gov.go.jp/）',
  'GSI': '出典：国土地理院ウェブサイト（https://www.gsi.go.jp/）',
  'PLATEAU': '出典：国土交通省 PLATEAU（https://www.mlit.go.jp/plateau/）',
  'geoshape': '出典：歴史的行政区域データセットβ版（CODH作成）',
  'NDL': '出典：国立国会図書館サーチ（https://ndlsearch.ndl.go.jp/）',
  'J-STAGE': '出典：J-STAGE（https://www.jstage.jst.go.jp/） Powered by J-STAGE',
  'CiNii': '出典：CiNii Research（https://cir.nii.ac.jp/）',
  'JapanSearch': '出典：ジャパンサーチ（https://jpsearch.go.jp/）',
  'data.go.jp': '出典：e-Govデータポータル（https://data.e-gov.go.jp/）',
  'G-space': '出典：G空間情報センター（https://www.geospatial.jp/）',
  'MLIT-DPF': '出典：国土交通データプラットフォーム（https://www.mlit-data.jp/）',
  'travel-safety': '出典：外務省 海外安全ホームページ（https://www.anzen.mofa.go.jp/）',
  'procurement': '出典：調達ポータル（https://www.p-portal.go.jp/）',
  'realestate': '出典：国土交通省 不動産情報ライブラリ（https://www.reinfolib.mlit.go.jp/）',
  'soramame': '出典：環境省 そらまめくん（https://soramame.env.go.jp/）',
  'GSJ': '出典：産総研 地質調査総合センター（https://www.gsj.jp/）',
  'JAXA': '出典：JAXA Earth API（https://data.earth.jaxa.jp/）',
  'AgriKnowledge': '出典：AgriKnowledge（https://agriknowledge.affrc.go.jp/）',
  'IRDB': '出典：IRDB 学術機関リポジトリデータベース（https://irdb.nii.ac.jp/）',
  'researchmap': '出典：researchmap（https://researchmap.jp/）',
  'mirasapo': '出典：ミラサポplus（https://mirasapo-plus.go.jp/）',
  'kkj': '出典：官公需情報ポータルサイト（https://www.kkj.go.jp/）',
  'hellowork': '出典：ハローワーク（https://www.hellowork.mhlw.go.jp/）',
  'JNTO': '出典：日本政府観光局(JNTO)（https://www.jnto.go.jp/statistics/）',
  '観光庁/確報': '出典：観光庁 宿泊旅行統計調査（https://www.mlit.go.jp/kankocho/siryou/toukei/shukuhakutoukei.html）',
  '観光庁/推移表': '出典：観光庁 宿泊旅行統計調査（https://www.mlit.go.jp/kankocho/siryou/toukei/shukuhakutoukei.html）',
};

// ── Response helpers ──
const MAX = 4000;

function smartTrim(d: any, limit: number, depth = 0): any {
  if (depth > 6) return Array.isArray(d) ? `[${d.length} items]` : typeof d === 'object' ? '{...}' : d;
  if (typeof d === 'string') return d.length > 300 && depth > 1 ? d.slice(0, 300) + '\u2026' : d;
  if (Array.isArray(d)) {
    if (d.length <= limit) return d.map(i => smartTrim(i, limit, depth + 1));
    const items = d.slice(0, limit).map(i => smartTrim(i, limit, depth + 1));
    return { _total: d.length, _showing: limit, items };
  }
  if (d && typeof d === 'object') {
    const keys = Object.keys(d);
    if (keys.length > limit && depth > 0) {
      const o: any = {};
      for (const k of keys.slice(0, limit)) o[k] = smartTrim(d[k], limit, depth + 1);
      return { _total: keys.length, _showing: limit, entries: o };
    }
    const o: any = {};
    for (const [k, v] of Object.entries(d)) o[k] = smartTrim(v, limit, depth + 1);
    return o;
  }
  return d;
}

function ok(r: ApiResponse, limit = 20) {
  if (!r.success) return { content: [{ type: 'text' as const, text: `ERR ${r.source}: ${r.error}` }] };
  const attr = r.source ? ATTRIBUTION[r.source] : undefined;
  let s = JSON.stringify(smartTrim(r.data, limit));
  if (s.length > MAX) s = JSON.stringify(smartTrim(r.data, Math.min(limit, 10)));
  if (s.length > MAX) s = JSON.stringify(smartTrim(r.data, 5));
  if (s.length > MAX) s = JSON.stringify(smartTrim(r.data, 3));
  if (s.length > MAX) s = s.slice(0, MAX) + '\u2026';
  if (attr) s += `\n\n${attr}`;
  return { content: [{ type: 'text' as const, text: s }] };
}

const API_TIMEOUT = 35000;
const ESTAT_TIMEOUT = 50000;
async function withTimeout<T>(p: Promise<T>, label: string, ms = API_TIMEOUT): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}: \u30bf\u30a4\u30e0\u30a2\u30a6\u30c8(${Math.round(ms/1000)}\u79d2)\u3002\u30ad\u30fc\u30ef\u30fc\u30c9\u3092\u77ed\u304f\u3059\u308b\u304b\u3001limit\u3092\u6e1b\u3089\u3057\u3066\u518d\u8a66\u884c\u3057\u3066\u304f\u3060\u3055\u3044`)), ms)),
  ]);
}

function safeOk(p: Promise<ApiResponse>, label: string, limit = 20, timeoutMs = API_TIMEOUT) {
  return withTimeout(p, label, timeoutMs).then(r => ok(r, limit)).catch((e: any) => txt(`ERR ${label}: ${e.message}`));
}

function txt(s: string) { return { content: [{ type: 'text' as const, text: s }] }; }

function chk(name: string, val: string) {
  return val ? null : txt(`${name}\u672a\u8a2d\u5b9a`);
}

// ── Summarizers ──

function summarizeEstat(r: ApiResponse, limit: number) {
  if (!r.success) return ok(r);
  const d = r.data as any;
  const root = d?.GET_STATS_LIST || d?.GET_STATS_DATA || d?.GET_META_INFO;
  if (!root) return ok(r, limit);
  const tables = root?.DATALIST_INF?.TABLE_INF;
  if (tables) {
    const arr = Array.isArray(tables) ? tables : [tables];
    const total = Number(root?.DATALIST_INF?.NUMBER) || arr.length;
    const compact = arr.slice(0, limit).map((t: any) => ({
      statsDataId: t['@id'],
      title: typeof t.TITLE === 'object' ? t.TITLE?.['$'] : t.TITLE,
      survey: typeof t.STAT_NAME === 'object' ? t.STAT_NAME?.['$'] : t.STAT_NAME,
      org: typeof t.GOV_ORG === 'object' ? t.GOV_ORG?.['$'] : t.GOV_ORG,
      surveyDate: t.SURVEY_DATE,
      updatedDate: t.UPDATED_DATE,
      cycle: t.CYCLE,
    }));
    const out = { _totalResults: total, _showing: compact.length, _hint: 'statsDataId\u3092meta/data\u306eid\u306b\u6307\u5b9a\u3057\u3066\u8a73\u7d30\u53d6\u5f97', tables: compact };
    let s = JSON.stringify(out);
    if (s.length > MAX) {
      const fewer = compact.slice(0, Math.max(3, Math.floor(limit / 2)));
      s = JSON.stringify({ ...out, _showing: fewer.length, tables: fewer });
    }
    if (s.length > MAX) s = s.slice(0, MAX) + '\u2026';
    return { content: [{ type: 'text' as const, text: s }] };
  }
  return ok(r, limit);
}

function summarizeGbiz(r: ApiResponse, infoType: string, limit: number) {
  if (!r.success) return ok(r);
  const info = r.data?.['hojin-infos']?.[0];
  if (!info) return ok(r);
  const raw = info[infoType];
  if (!raw || !Array.isArray(raw)) return ok(r, limit);
  const items: any[] = raw;
  if (items.length <= limit) return ok(r, limit);
  const summary: any = { _total: items.length, _showing: limit };
  if (infoType === 'patent') {
    const byType: Record<string, number> = {};
    const byYear: Record<string, number> = {};
    for (const p of items) {
      byType[p.patent_type] = (byType[p.patent_type] || 0) + 1;
      const y = p.application_date?.slice(0, 4);
      if (y) byYear[y] = (byYear[y] || 0) + 1;
    }
    summary._by_type = byType;
    summary._recent_years = Object.fromEntries(Object.entries(byYear).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 5));
  } else if (infoType === 'procurement') {
    const byDept: Record<string, { count: number; total: number }> = {};
    for (const p of items) {
      const dept = p.government_departments || '\u4e0d\u660e';
      if (!byDept[dept]) byDept[dept] = { count: 0, total: 0 };
      byDept[dept].count++;
      byDept[dept].total += p.amount || 0;
    }
    summary._by_department = Object.fromEntries(Object.entries(byDept).sort((a, b) => b[1].total - a[1].total).slice(0, 10));
  } else if (infoType === 'subsidy') {
    const byTitle: Record<string, number> = {};
    for (const p of items) {
      const t = p.title || '\u4e0d\u660e';
      byTitle[t] = (byTitle[t] || 0) + 1;
    }
    summary._by_title = Object.fromEntries(Object.entries(byTitle).sort((a, b) => b[1] - a[1]).slice(0, 10));
  }
  const sliced = items.slice(0, limit);
  const out = { ...info, [infoType]: sliced, _summary: summary };
  const rr: ApiResponse = { ...r, data: { ...r.data, 'hojin-infos': [out] } };
  return ok(rr);
}

function summarizeKokkai(r: ApiResponse, limit: number) {
  if (!r.success) return ok(r);
  const d = r.data as any;
  const records: any[] = d?.speechRecord || d?.meetingRecord || [];
  if (!Array.isArray(records) || records.length === 0) return ok(r);
  const totalHits = d.numberOfRecords || records.length;
  const byMeeting: Record<string, { count: number; dates: Set<string>; speakers: Set<string> }> = {};
  const bySpeaker: Record<string, number> = {};
  for (const rec of records) {
    const m = rec.nameOfMeeting || '\u4e0d\u660e';
    if (!byMeeting[m]) byMeeting[m] = { count: 0, dates: new Set(), speakers: new Set() };
    byMeeting[m].count++;
    if (rec.date) byMeeting[m].dates.add(rec.date);
    const sp = rec.speaker || '\u4e0d\u660e';
    byMeeting[m].speakers.add(sp);
    bySpeaker[sp] = (bySpeaker[sp] || 0) + 1;
  }
  const summary: any = {
    _totalHits: totalHits,
    _showing: Math.min(limit, records.length),
    _byCommittee: Object.fromEntries(
      Object.entries(byMeeting).sort((a, b) => b[1].count - a[1].count).slice(0, 10)
        .map(([k, v]) => [k, { count: v.count, dates: [...v.dates].sort().reverse().slice(0, 3), speakers: [...v.speakers].slice(0, 5) }])
    ),
    _topSpeakers: Object.fromEntries(Object.entries(bySpeaker).sort((a, b) => b[1] - a[1]).slice(0, 10)),
  };
  const compact = records.slice(0, limit).map((rec: any) => ({
    date: rec.date, meeting: rec.nameOfMeeting, speaker: rec.speaker, group: rec.speakerGroup,
    excerpt: (rec.speech || '').replace(/\s+/g, ' ').slice(0, 120) + (rec.speech?.length > 120 ? '\u2026' : ''),
    url: rec.speechURL || rec.meetingURL,
  }));
  let s = JSON.stringify({ ...summary, items: compact });
  if (s.length > MAX) {
    const fewer = compact.slice(0, Math.max(3, Math.floor(limit / 2)));
    s = JSON.stringify({ ...summary, _showing: fewer.length, items: fewer });
  }
  if (s.length > MAX) s = s.slice(0, MAX) + '\u2026';
  return { content: [{ type: 'text' as const, text: s }] };
}

// ── createServer ──

export function createServer(): McpServer {
  const server = new McpServer({ name: 'japan-gov-mcp', version: '3.4.0' });

  // Logging middleware
  {
    const _origTool = server.tool.bind(server);
    (server as any).tool = (...args: unknown[]) => {
      const toolName = args[0] as string;
      const handler = args[args.length - 1] as (p: any) => Promise<any>;
      if (typeof handler === 'function') {
        args[args.length - 1] = async (p: any) => {
          const start = Date.now();
          const action = String(p.action || p.source || p.api || '');
          let status: 'ok' | 'error' | 'timeout' = 'ok';
          let errMsg: string | null = null;
          let size = 0;
          try {
            const result = await handler(p);
            const text: string = result?.content?.[0]?.text ?? '';
            size = text.length;
            if (text.startsWith('ERR')) { status = 'error'; errMsg = text.slice(0, 200); }
            return result;
          } catch (e: any) {
            status = e.message?.includes('\u30bf\u30a4\u30e0\u30a2\u30a6\u30c8') ? 'timeout' : 'error';
            errMsg = e.message;
            throw e;
          } finally {
            logRequest({ tool: toolName, action, params: p, status, duration_ms: Date.now() - start, response_size: size, error: errMsg });
          }
        };
      }
      return (_origTool as any)(...args);
    };
  }

  // ═══ 1. estat ═══
  server.tool('estat', '【政府統計e-Stat】全府省の統計(人口/GDP/物価/雇用/貿易等)を横断検索。①search→統計表一覧(IDを取得) ②meta(id)→分類情報 ③data(id)→数値データ', {
    action: z.enum(['search', 'meta', 'data']).describe('search:キーワード検索→statsDataIdを取得, meta:ID指定→分類情報, data:ID指定→統計値'),
    q: z.string().optional().describe('検索キーワード(例: 人口, GDP, 消費者物価指数)'),
    years: z.string().optional().describe('調査年(例: 2023)'),
    field: z.string().optional().describe('統計分野コード'),
    org: z.string().optional().describe('作成機関コード'),
    id: z.string().optional().describe('統計表ID(searchで取得したstatsDataId)'),
    cdTime: z.string().optional().describe('時間コードで絞込'),
    cdArea: z.string().optional().describe('地域コードで絞込(例: 13000=東京都)'),
    cdCat: z.string().optional().describe('分類コードで絞込'),
    limit: z.number().optional().describe('取得件数(デフォルト20)'),
  }, async (p) => {
    const e = chk('ESTAT_APP_ID', C.estat.appId); if (e) return e;
    const lim = p.limit || 20;
    switch (p.action) {
      case 'search': return withTimeout(estat.getStatsList(C.estat, { searchWord: p.q, surveyYears: p.years, statsField: p.field, statsCode: p.org, limit: lim }), 'e-Stat/search', ESTAT_TIMEOUT).then(r => summarizeEstat(r, lim)).catch((e: any) => txt(`ERR e-Stat/search: ${e.message}`));
      case 'meta': return safeOk(estat.getMetaInfo(C.estat, { statsDataId: p.id! }), 'e-Stat/meta', lim, ESTAT_TIMEOUT);
      case 'data': return safeOk(estat.getStatsData(C.estat, { statsDataId: p.id!, cdTime: p.cdTime, cdArea: p.cdArea, cdCat01: p.cdCat, limit: lim }), 'e-Stat/data', lim, ESTAT_TIMEOUT);
    }
  });

  // ═══ 2. stats ═══
  server.tool('stats', '【統計】GDP/CPI/失業率(dash) 金利/マネー/物価(boj) 特定健診(ndb)。dashはリアルタイム経済指標、bojは日銀時系列、ndbは健診データ', {
    action: z.enum(['dash_list', 'dash_data', 'boj_codes', 'boj_data', 'boj_fx', 'ndb_stats', 'ndb_items', 'ndb_areas']).describe('dash_list:指標一覧, dash_data:指標データ, boj_codes:日銀コード一覧, boj_data:日銀時系列, boj_fx:為替レート(USD_JPY/EUR_JPY/EUR_USD), ndb_stats:健診データ, ndb_items:検査項目一覧, ndb_areas:地域一覧'),
    code: z.string().optional().describe('dash_data:指標コード/boj_data:系列コード(boj_codesで確認)/ndb_stats:検査項目名(例:BMI,収縮期血圧)'),
    db: z.string().optional().describe('日銀DB(FM01=金融市場,FM08=外国為替,MD01=マネタリーベース,MD02=マネーストック,PR01=企業物価,PR02=サービス価格,CO=短観)'),
    region: z.string().optional().describe('dash_data:地域コード/ndb_stats:都道府県名'),
    from: z.string().optional().describe('開始(dash:時間コード, boj:YYYYMM形式)'),
    to: z.string().optional().describe('終了(同上)'),
    freq: z.string().optional().describe('日銀頻度: D=日次,M=月次,Q=四半期,A=年次'),
    pair: z.enum(['USD_JPY', 'EUR_JPY', 'EUR_USD']).optional().describe('boj_fx:通貨ペア(EUR_JPYはクロスレート自動算出)'),
    areaType: z.enum(['prefecture', 'secondary_medical_area']).optional(),
    gender: z.enum(['M', 'F', 'all']).optional(),
    ageGroup: z.string().optional().describe('年齢区分(例: 40-44)'),
    limit: z.number().optional(),
  }, async (p) => {
    const lim = p.limit || 20;
    switch (p.action) {
      case 'dash_list': return safeOk(getDashboardIndicators({}), 'Dashboard', lim);
      case 'dash_data': return safeOk(getDashboardData({ indicatorCode: p.code!, regionCode: p.region, timeCdFrom: p.from, timeCdTo: p.to }), 'Dashboard', lim);
      case 'boj_codes': return ok(await boj.getMajorStatistics(), lim);
      case 'boj_data': return safeOk(boj.getTimeSeriesData({ seriesCode: p.code!, db: p.db, freq: p.freq, startDate: p.from, endDate: p.to }), 'BOJ', lim);
      case 'boj_fx': return safeOk(boj.getExchangeRate({ pair: p.pair || 'USD_JPY', freq: p.freq, startDate: p.from, endDate: p.to }), 'BOJ/FX', lim);
      case 'ndb_stats': return safeOk(ndb.getInspectionStats({ itemName: p.code!, areaType: p.areaType, prefectureName: p.region, gender: p.gender, ageGroup: p.ageGroup }), 'NDB', lim);
      case 'ndb_items': return safeOk(ndb.getItems(), 'NDB', lim);
      case 'ndb_areas': return safeOk(ndb.getAreas({ type: p.areaType }), 'NDB', lim);
    }
  });

  // ═══ 3. corporate ═══
  server.tool('corporate', '【企業情報】法人番号検索(houjin)/企業基本・特許・調達・補助金(gbiz)/有価証券報告書(edinet)。gbiz_detailにはcorpNum(法人番号13桁)が必要→先にgbizで検索', {
    action: z.enum(['houjin', 'gbiz', 'gbiz_detail', 'edinet']).describe('houjin:法人番号検索, gbiz:企業名で基本情報検索→corpNum取得, gbiz_detail:corpNum指定→特許/調達/補助金等, edinet:日付指定→有価証券報告書一覧'),
    name: z.string().optional().describe('企業名(例: トヨタ自動車)'),
    corpNum: z.string().optional().describe('法人番号13桁(gbiz検索結果から取得)'),
    address: z.string().optional().describe('所在地(houjin検索で使用)'),
    infoType: z.enum(['certification', 'subsidy', 'patent', 'procurement', 'finance', 'commendation', 'workplace']).optional().describe('gbiz_detailの情報種別'),
    date: z.string().optional().describe('EDINET日付(YYYY-MM-DD)'),
    limit: z.number().optional(),
  }, async (p) => {
    const lim = p.limit || 20;
    switch (p.action) {
      case 'houjin': { const e = chk('HOUJIN_APP_ID', C.houjin.appId); if (e) return e; return safeOk(houjin.searchHoujin(C.houjin, { name: p.name, number: p.corpNum, address: p.address }), '法人番号'); }
      case 'gbiz': { const e = chk('GBIZ_TOKEN', C.gbiz.token); if (e) return e; return safeOk(gbiz.searchCorporation(C.gbiz, { name: p.name, corporateNumber: p.corpNum }), 'gBiz'); }
      case 'gbiz_detail': {
        const e = chk('GBIZ_TOKEN', C.gbiz.token); if (e) return e;
        const fn: Record<string, any> = { certification: gbiz.getCertification, subsidy: gbiz.getSubsidy, patent: gbiz.getPatent, procurement: gbiz.getProcurement, finance: gbiz.getFinance, commendation: gbiz.getCommendation, workplace: gbiz.getWorkplace };
        return withTimeout(fn[p.infoType!](C.gbiz, p.corpNum!), 'gBiz').then((r: any) => summarizeGbiz(r as ApiResponse, p.infoType!, lim)).catch((e: any) => txt(`ERR gBiz: ${e.message}`));
      }
      case 'edinet': { const e = chk('EDINET_API_KEY', C.edinet.apiKey); if (e) return e; return safeOk(edinet.getDocumentList(C.edinet, { date: p.date!, type: 2 }), 'EDINET'); }
    }
  });

  // ═══ 4. weather ═══
  server.tool('weather', '【気象・防災】天気予報/地震/津波/浸水深/地震ハザード/交通量。areaCode例: 130000=東京,270000=大阪,400000=福岡,016000=北海道', {
    action: z.enum(['forecast', 'overview', 'weekly', 'typhoon', 'amedas_st', 'amedas', 'earthquake', 'tsunami', 'flood', 'river', 'hazard', 'traffic']).describe('forecast:天気予報, overview:概況, weekly:週間, typhoon:台風, amedas_st:観測点一覧, amedas:観測データ, earthquake:地震一覧, tsunami:津波, flood:浸水深(緯度経度), hazard:地震ハザード(緯度経度), traffic:交通量(緯度経度)'),
    areaCode: z.string().optional().describe('都道府県コード6桁(例: 130000=東京)'),
    pointId: z.string().optional().describe('アメダス観測点ID'),
    date: z.string().optional().describe('アメダス日付(YYYYMMDD)'),
    lat: z.number().optional(), lon: z.number().optional(),
    stationId: z.string().optional(), radius: z.number().optional(),
    limit: z.number().optional(),
  }, async (p) => {
    const lim = p.limit || 20;
    switch (p.action) {
      case 'forecast': return safeOk(getForecast({ areaCode: p.areaCode! }), '気象庁', lim);
      case 'overview': return safeOk(getForecastOverview({ areaCode: p.areaCode! }), '気象庁', lim);
      case 'weekly': return safeOk(getForecastWeekly({ areaCode: p.areaCode! }), '気象庁', lim);
      case 'typhoon': return safeOk(getTyphoonInfo(), '気象庁', lim);
      case 'amedas_st': return safeOk(getAmedasStations(), 'アメダス', lim);
      case 'amedas': return safeOk(getAmedasData({ pointId: p.pointId!, date: p.date }), 'アメダス', lim);
      case 'earthquake': return safeOk(getEarthquakeList(), '気象庁', lim);
      case 'tsunami': return safeOk(getTsunamiList(), '気象庁', lim);
      case 'flood': return safeOk(disaster.getFloodDepth({ lat: p.lat!, lon: p.lon! }), '浸水ナビ', lim);
      case 'river': return safeOk(disaster.getRiverLevel({ stationId: p.stationId! }), '河川', lim);
      case 'hazard': return safeOk(getSeismicHazard({ lat: p.lat!, lon: p.lon! }), 'ハザード', lim);
      case 'traffic': return safeOk(disaster.getTrafficVolume({ lat: p.lat!, lon: p.lon!, radius: p.radius }), 'JARTIC', lim);
    }
  });

  // ═══ 5. law ═══
  server.tool('law', '【法令・国会・パブコメ】法律検索/国会議事録(※まずmeetingで委員会一覧→speechで発言詳細)/パブリックコメント', {
    action: z.enum(['search', 'list', 'fulltext', 'speech', 'meeting', 'pubcomment']).describe('国会議事録はmeetingで会議一覧を先に確認し、必要ならspeechで発言詳細を取得'),
    q: z.string().optional(), lawId: z.string().optional(), category: z.number().optional(),
    speaker: z.string().optional(), house: z.string().optional(),
    meetingName: z.string().optional().describe('特定の委員会名で絞込'),
    from: z.string().optional(), until: z.string().optional(),
    limit: z.number().optional(),
    pubType: z.enum(['list', 'result']).optional(),
  }, async (p) => {
    const lim = p.limit || 20;
    switch (p.action) {
      case 'search': return safeOk(searchLawsByKeyword({ keyword: p.q!, limit: Math.min(lim, 20) }), '法令API', lim);
      case 'list': return safeOk(searchLaws({ category: p.category, limit: Math.min(lim, 20) }), '法令API', lim);
      case 'fulltext': return safeOk(getLawData({ lawId: p.lawId! }), '法令API', lim);
      case 'speech': return withTimeout(searchKokkaiSpeeches({ any: p.q, speaker: p.speaker, nameOfHouse: p.house, nameOfMeeting: p.meetingName, from: p.from, until: p.until, maximumRecords: Math.min(lim, 30) }), '国会').then(r => summarizeKokkai(r, lim)).catch((e: any) => txt(`ERR 国会: ${e.message}`));
      case 'meeting': return withTimeout(searchKokkaiMeetings({ any: p.q, speaker: p.speaker, nameOfHouse: p.house, nameOfMeeting: p.meetingName, from: p.from, until: p.until, maximumRecords: Math.min(lim, 30) }), '国会').then(r => summarizeKokkai(r, lim)).catch((e: any) => txt(`ERR 国会: ${e.message}`));
      case 'pubcomment': return safeOk(getPublicComments({ type: p.pubType }), 'パブコメ', lim);
    }
  });

  // ═══ 6. geo ═══
  server.tool('geo', '【地理空間】住所→座標(geocode)/座標→住所(reverse)/行政区域境界(city_geo,pref_geo)/3D都市モデルPLATEAU', {
    action: z.enum(['geocode', 'reverse', 'city_geo', 'pref_geo', 'plateau', 'plateau_mesh']).describe('geocode:住所→緯度経度, reverse:緯度経度→住所, city_geo:市区町村境界, pref_geo:都道府県境界, plateau:3D都市モデル検索, plateau_mesh:メッシュ指定3Dデータ'),
    address: z.string().optional(), lat: z.number().optional(), lon: z.number().optional(),
    code: z.string().optional(), prefCode: z.string().optional(),
    city: z.string().optional(), prefecture: z.string().optional(),
    limit: z.number().optional(),
  }, async (p) => {
    const lim = p.limit || 20;
    switch (p.action) {
      case 'geocode': return safeOk(geocode({ address: p.address! }), 'Geo', lim);
      case 'reverse': return safeOk(reverseGeocode({ lat: p.lat!, lon: p.lon! }), 'Geo', lim);
      case 'city_geo': return safeOk(geoshape.getCityBoundary({ code: p.code! }), 'Geoshape', lim);
      case 'pref_geo': return safeOk(geoshape.getPrefBoundary({ prefCode: p.prefCode! }), 'Geoshape', lim);
      case 'plateau': return safeOk(searchPlateauDatasets({ prefecture: p.prefecture, city: p.city }), 'PLATEAU', lim);
      case 'plateau_mesh': return safeOk(getPlateauCitygml({ meshCode: p.code! }), 'PLATEAU', lim);
    }
  });

  // ═══ 7. academic ═══
  server.tool('academic', '【学術・科学】書籍(ndl)/論文(jstage,cinii)/文化財(japansearch)/機関リポ(irdb)/大気質(air)/地質(geology)/衛星(jaxa)/研究者(researchmap)', {
    source: z.enum(['ndl', 'jstage', 'cinii', 'japansearch', 'irdb', 'agriknowledge', 'air', 'geology', 'jaxa', 'researchmap']).describe('ndl:国立国会図書館, jstage:学術論文, cinii:CiNii論文, japansearch:ジャパンサーチ, irdb:機関リポジトリ, agriknowledge:農業文献, air:大気質, geology:地質図, jaxa:衛星データ, researchmap:研究者業績'),
    q: z.string().optional(), count: z.number().optional(),
    title: z.string().optional(), author: z.string().optional(),
    prefCode: z.string().optional(), lat: z.number().optional(), lon: z.number().optional(),
    permalink: z.string().optional(), type: z.string().optional(),
    limit: z.number().optional(),
  }, async (p) => {
    const lim = p.limit || p.count || 20;
    const c = p.count || Math.min(lim, 20);
    switch (p.source) {
      case 'ndl': return safeOk(searchNdl({ query: p.q!, count: c }), 'NDL', lim);
      case 'jstage': return safeOk(searchJstage({ query: p.q!, count: c }), 'JStage', lim);
      case 'cinii': return safeOk(searchCinii({ query: p.q!, count: c }), 'CiNii', lim);
      case 'japansearch': return safeOk(searchJapanSearch({ keyword: p.q!, size: c }), 'JapanSearch', lim);
      case 'irdb': return safeOk(searchIrdb({ query: p.q!, title: p.title, author: p.author, count: c }), 'IRDB', lim);
      case 'agriknowledge': return safeOk(searchAgriKnowledge({ query: p.q!, count: c }), '農業研究', lim);
      case 'air': return safeOk(getAirQuality({ prefCode: p.prefCode }), 'そらまめ', lim);
      case 'geology': return (p.lat && p.lon) ? safeOk(getGeologyAtPoint({ lat: p.lat, lon: p.lon }), '地質', lim) : safeOk(getGeologyLegend(), '地質', lim);
      case 'jaxa': return safeOk(getJaxaCollections({ limit: c }), 'JAXA', lim);
      case 'researchmap': return safeOk(getResearcherAchievements({ permalink: p.permalink!, achievementType: p.type! }), 'researchmap', lim);
    }
  });

  // ═══ 8. opendata ═══
  server.tool('opendata', '【オープンデータカタログ】政府データ(gov=data.go.jp)/地理空間データ(geo=G空間情報センター)/国交省DPF(dpf=道路・鉄道・橋梁等)', {
    source: z.enum(['gov', 'geo', 'dpf']).describe('gov:政府オープンデータカタログ, geo:G空間情報センター, dpf:国交省データプラットフォーム'),
    q: z.string().optional(), id: z.string().optional(), rows: z.number().optional(), limit: z.number().optional(),
  }, async (p) => {
    const lim = p.limit || 20;
    const rows = p.rows || Math.min(lim, 20);
    if (p.id) {
      switch (p.source) {
        case 'gov': return safeOk(getDatasetDetail({ id: p.id }), 'data.go.jp', lim);
        case 'geo': return safeOk(geospatial.getGeospatialDataset({ id: p.id }), 'G空間', lim);
        case 'dpf': { const e = chk('MLIT_DPF_API_KEY', C.mlitDpf.apiKey); if (e) return e; return safeOk(mlitDpf.getMlitDpfCatalog(C.mlitDpf, { id: p.id }), 'DPF', lim); }
      }
    }
    switch (p.source) {
      case 'gov': return safeOk(searchDatasets({ q: p.q, rows }), 'data.go.jp', lim);
      case 'geo': return safeOk(geospatial.searchGeospatial({ q: p.q, rows }), 'G空間', lim);
      case 'dpf': { const e = chk('MLIT_DPF_API_KEY', C.mlitDpf.apiKey); if (e) return e; return safeOk(mlitDpf.searchMlitDpf(C.mlitDpf, { term: p.q! }), 'DPF', lim); }
    }
  });

  // ═══ 9. misc ═══
  server.tool('misc', '【その他行政】海外安全情報(safety)/官公需入札(kkj)/中小企業事例(mirasapo)/不動産取引(realestate)/公示地価(landprice)/求人(hellowork)', {
    api: z.enum(['safety', 'kkj', 'mirasapo', 'mirasapo_cat', 'mirasapo_region', 'realestate', 'landprice', 'hellowork']).describe('safety:外務省海外安全, kkj:官公需, mirasapo:中小企業事例, realestate:不動産取引, landprice:地価, hellowork:求人'),
    q: z.string().optional(), id: z.string().optional(),
    region: z.string().optional(), country: z.string().optional(), org: z.string().optional(),
    area: z.string().optional(), year: z.string().optional(), quarter: z.string().optional(),
    city: z.string().optional(), prefCode: z.string().optional(), employment: z.string().optional(),
    catType: z.enum(['industries', 'purposes', 'services', 'specific_measures']).optional(),
    limit: z.number().optional(),
  }, async (p) => {
    const lim = p.limit || 20;
    switch (p.api) {
      case 'safety': return safeOk(getSafetyInfo({ regionCode: p.region, countryCode: p.country }), '海外安全', lim);
      case 'kkj': return safeOk(searchKkj({ Query: p.q, Organization_Name: p.org, Area: p.area, Count: lim }), '官公需', lim);
      case 'mirasapo': return p.id ? safeOk(mirasapo.getCaseStudy({ id: p.id }), 'ミラサポ', lim) : safeOk(mirasapo.searchCaseStudies({ keywords: p.q, limit: lim }), 'ミラサポ', lim);
      case 'mirasapo_cat': return safeOk(mirasapo.getCategories({ type: p.catType! }), 'ミラサポ', lim);
      case 'mirasapo_region': return safeOk(mirasapo.getRegions(), 'ミラサポ', lim);
      case 'realestate': { const e = chk('REALESTATE_API_KEY', C.realestate.apiKey); if (e) return e; return safeOk(getRealEstateTransactions(C.realestate, { year: p.year!, quarter: p.quarter!, area: p.area, city: p.city }), '不動産', lim); }
      case 'landprice': { const e = chk('REALESTATE_API_KEY', C.realestate.apiKey); if (e) return e; return safeOk(getLandPrice(C.realestate, { year: p.year!, area: p.area, city: p.city }), '地価', lim); }
      case 'hellowork': { const e = chk('HELLOWORK_API_KEY', C.hellowork.apiKey); if (e) return e; return safeOk(searchJobs(C.hellowork, { keyword: p.q, prefCode: p.prefCode, employment: p.employment }), 'ハローワーク', lim); }
    }
  });

  // ═══ 10. resolve ═══
  server.tool('resolve', '【コード変換】自然言語→APIパラメータ(code_lookup)/企業ID横断(entity_bridge)/地域コード変換(area_bridge)/時間コード変換(time_bridge)', {
    action: z.enum(['code_lookup', 'entity_bridge', 'area_bridge', 'time_bridge']).describe('code_lookup:自然言語→地域+トピック+APIパラメータ, entity_bridge:企業名→法人番号+gBiz横断, area_bridge:地域コード相互変換, time_bridge:時間表記正規化'),
    query: z.string().optional(), source: z.enum(['estat', 'stats', 'boj']).optional(),
    name: z.string().optional(), corpNum: z.string().optional(),
    prefCode: z.string().optional(), cityCode: z.string().optional(),
    jmaCode: z.string().optional(), estatCode: z.string().optional(),
    lat: z.number().optional(), lon: z.number().optional(),
    from: z.string().optional(), to: z.string().optional(),
    freq: z.enum(['A', 'Q', 'M']).optional(),
    calendar: z.enum(['fiscal', 'calendar']).optional(),
  }, async (p) => {
    switch (p.action) {
      case 'code_lookup': return ok(resolve.codeLookup({ query: p.query!, source: p.source }));
      case 'entity_bridge': return safeOk(resolve.entityBridge({ name: p.name, corporateNumber: p.corpNum }, { houjin: C.houjin, gbiz: C.gbiz }), 'resolve/entity');
      case 'area_bridge': return ok(resolve.areaBridge({ name: p.name, prefCode: p.prefCode, cityCode: p.cityCode, jmaCode: p.jmaCode, estatCode: p.estatCode, lat: p.lat, lon: p.lon }));
      case 'time_bridge': return ok(resolve.timeBridge({ from: p.from!, to: p.to, freq: p.freq, calendar: p.calendar }));
    }
  });

  // ═══ 11. navigate ═══
  server.tool('navigate', '【データ探索】トピック→API推薦(recommend)/データ構造確認(schema)/データ網羅率確認(coverage)。データ分析の最初に使って最適なAPIを特定する', {
    action: z.enum(['recommend', 'schema', 'coverage']).describe('recommend:トピック→使うべきAPI推薦, schema:statsDataId→データセットの次元・時間範囲・地域レベル, coverage:トピック×地域のデータ有無確認'),
    topic: z.string().optional(), detailLevel: z.enum(['quick', 'comprehensive']).optional(),
    schemaSource: z.string().optional(), id: z.string().optional(), area: z.string().optional(),
  }, async (p) => {
    switch (p.action) {
      case 'recommend': return ok(navigate.recommend({ topic: p.topic!, detailLevel: p.detailLevel }));
      case 'schema': return safeOk(navigate.schema({ source: p.schemaSource || 'estat', id: p.id! }, { estat: C.estat }), 'navigate/schema', 20, ESTAT_TIMEOUT);
      case 'coverage': return ok(navigate.coverage({ topic: p.topic, area: p.area }));
    }
  });

  // ═══ 12. join ═══
  server.tool('join', '【データ統合】複数API一括取得(fetch_aligned)/単位変換(normalize)/時系列欠損検知(fill_gaps)。resolveで得たコードを使ってデータを結合する', {
    action: z.enum(['fetch_aligned', 'normalize', 'fill_gaps']).describe('fetch_aligned:複数指標を地域・時間軸揃えて一括取得, normalize:千人→人等の単位変換, fill_gaps:時系列の欠損検知'),
    indicators: z.array(z.object({ source: z.enum(['estat', 'stats', 'boj']), query: z.string().optional(), id: z.string().optional(), label: z.string() })).optional(),
    timeFrom: z.string().optional(), timeTo: z.string().optional(), timeFreq: z.enum(['A', 'Q', 'M']).optional(),
    prefCodes: z.array(z.string()).optional(),
    data: z.array(z.object({ time: z.string().optional(), value: z.union([z.number(), z.string()]), unit: z.string().optional() })).optional(),
    rules: z.array(z.object({ fromUnit: z.string(), toUnit: z.string() })).optional(),
    records: z.array(z.object({ time: z.string(), value: z.union([z.number(), z.string()]) })).optional(),
    expectedFrom: z.string().optional(), expectedTo: z.string().optional(),
    frequency: z.enum(['year', 'month', 'quarter']).optional(),
  }, async (p) => {
    switch (p.action) {
      case 'fetch_aligned': return safeOk(join.fetchAligned({ indicators: p.indicators!, axis: { time: p.timeFrom ? { from: p.timeFrom, to: p.timeTo || p.timeFrom, freq: p.timeFreq } : undefined, area: p.prefCodes ? { prefCodes: p.prefCodes } : undefined } }, C), 'join/fetch', 20, ESTAT_TIMEOUT);
      case 'normalize': return ok(join.normalize({ data: p.data!, rules: p.rules! }));
      case 'fill_gaps': return ok(join.fillGaps({ records: p.records!, expectedRange: p.expectedFrom ? { from: p.expectedFrom, to: p.expectedTo || p.expectedFrom } : undefined, frequency: p.frequency }));
    }
  });

  // ═══ 13. context ═══
  server.tool('context', '【文脈付与】数値の歴史的位置(percentile)/同カテゴリ内順位・偏差値(peers)/トレンド位置(trend_context)/join結果に一括文脈付与(annotate)/次に調べるべきことを提案(suggest)', {
    action: z.enum(['percentile', 'peers', 'trend_context', 'annotate', 'suggest']).describe('percentile:過去N年分布でのパーセンタイル, peers:47都道府県内の順位・偏差値, trend_context:トレンドの位置, annotate:join結果に一括文脈付与, suggest:次の調査を提案'),
    source: z.enum(['estat', 'stats', 'boj', 'misc']).optional(),
    id: z.string().optional(), query: z.string().optional(), value: z.number().optional(),
    area: z.string().optional(), target: z.string().optional(),
    peerGroup: z.enum(['pref', 'city', 'designated_city', 'custom']).optional(),
    windowYears: z.number().optional(), lookbackYears: z.number().optional(), recentN: z.number().optional(),
    joinedData: z.record(z.unknown()).optional(),
    depth: z.enum(['quick', 'standard', 'deep']).optional(),
    topic: z.string().optional(),
    currentIndicators: z.array(z.object({ source: z.string(), id: z.string().optional(), query: z.string().optional(), label: z.string() })).optional(),
    alerts: z.array(z.object({ type: z.string(), indicator: z.string(), area: z.string().optional(), period: z.string().optional() })).optional(),
    areaLevel: z.enum(['pref', 'city', 'national']).optional(),
    uniqueAreas: z.array(z.string()).optional(),
  }, async (p) => {
    switch (p.action) {
      case 'percentile': return safeOk(context.percentile({ source: p.source!, id: p.id, query: p.query, value: p.value!, area: p.area, window_years: p.windowYears }, { estat: C.estat }), 'context/percentile', 20, ESTAT_TIMEOUT);
      case 'peers': return safeOk(context.peers({ source: p.source!, id: p.id, query: p.query, target: p.target!, peer_group: p.peerGroup }, { estat: C.estat }), 'context/peers', 20, ESTAT_TIMEOUT);
      case 'trend_context': return safeOk(context.trendContext({ source: p.source!, id: p.id, query: p.query, area: p.area, lookback_years: p.lookbackYears, recent_n: p.recentN }, { estat: C.estat }), 'context/trend', 20, ESTAT_TIMEOUT);
      case 'annotate': return safeOk(context.annotate({ joined_data: p.joinedData as any, depth: p.depth }, { estat: C.estat }), 'context/annotate', 20, ESTAT_TIMEOUT);
      case 'suggest': return ok(context.suggest({ topic: p.topic, current_indicators: p.currentIndicators, alerts: p.alerts, area_level: p.areaLevel, unique_areas: p.uniqueAreas }));
    }
  });

  // ═══ 14. tourism ═══
  server.tool('tourism', '【観光統計】JNTO訪日外客数(jnto)/観光庁宿泊統計の国籍×都道府県(kakuho)/外国人宿泊推移(suikei)/データカタログ(catalog)。フランス人×京都等の分析に最適', {
    action: z.enum(['jnto', 'kakuho', 'suikei', 'catalog']).describe('jnto:JNTO訪日外客数(国籍別月次), kakuho:確報(21国籍×47都道府県), suikei:推移表(外国人宿泊時系列), catalog:利用可能データ一覧'),
    year: z.number().optional().describe('対象年(kakuho: 2015-2024, jnto: 2003-2026)'),
    yearFrom: z.number().optional().describe('開始年'),
    yearTo: z.number().optional().describe('終了年'),
    month: z.number().optional().describe('月(1-12, kakuhoで月別データ取得時)'),
    country: z.string().optional().describe('jnto: 国名フィルタ(例: フランス)'),
    prefecture: z.string().optional().describe('都道府県(コード01-47 or 名前)'),
    nationality: z.string().optional().describe('kakuho: 国籍フィルタ(例: フランス,韓国,中国,台湾,米国,英国等21区分)'),
    monthly: z.boolean().optional().describe('suikei: true=月別データ'),
    limit: z.number().optional(),
  }, async (p) => {
    const lim = p.limit || 20;
    switch (p.action) {
      case 'catalog': return ok(tourism.getCatalog());
      case 'jnto': return safeOk(tourism.getJntoVisitors({ year: p.year, country: p.country, yearFrom: p.yearFrom, yearTo: p.yearTo }), 'JNTO', lim, 60000);
      case 'kakuho': return safeOk(tourism.getKakuhoNationality({ year: p.year || 2024, month: p.month, prefecture: p.prefecture, nationality: p.nationality }), '観光庁/確報', lim, 60000);
      case 'suikei': return safeOk(tourism.getSuikeiTrend({ prefecture: p.prefecture, yearFrom: p.yearFrom, yearTo: p.yearTo, monthly: p.monthly }), '観光庁/推移表', lim, 60000);
    }
  });

  return server;
}
