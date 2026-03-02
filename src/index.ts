#!/usr/bin/env node
/**
 * japan-gov-mcp v3.2 — 13 tools, ultra-compact
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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

// ── Response helpers ──
const MAX = 4000;

/** 配列・大オブジェクトを _total 付きで切り詰め。全データで件数が見える */
function smartTrim(d: any, limit: number, depth = 0): any {
  if (depth > 6) return Array.isArray(d) ? `[${d.length} items]` : typeof d === 'object' ? '{...}' : d;
  if (typeof d === 'string') return d.length > 300 && depth > 1 ? d.slice(0, 300) + '…' : d;
  if (Array.isArray(d)) {
    if (d.length <= limit) return d.map(i => smartTrim(i, limit, depth + 1));
    const items = d.slice(0, limit).map(i => smartTrim(i, limit, depth + 1));
    return { _total: d.length, _showing: limit, items };
  }
  if (d && typeof d === 'object') {
    const keys = Object.keys(d);
    // 大きなオブジェクト（アメダス局一覧等）もlimit件に切り詰め
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
  let s = JSON.stringify(smartTrim(r.data, limit));
  if (s.length > MAX) s = JSON.stringify(smartTrim(r.data, Math.min(limit, 10)));
  if (s.length > MAX) s = JSON.stringify(smartTrim(r.data, 5));
  if (s.length > MAX) s = JSON.stringify(smartTrim(r.data, 3));
  if (s.length > MAX) s = s.slice(0, MAX) + '…';
  return { content: [{ type: 'text' as const, text: s }] };
}

const API_TIMEOUT = 35000;
const ESTAT_TIMEOUT = 50000; // e-Statは応答が遅いことがある
async function withTimeout<T>(p: Promise<T>, label: string, ms = API_TIMEOUT): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label}: タイムアウト(${Math.round(ms/1000)}秒)。キーワードを短くするか、limitを減らして再試行してください`)), ms)),
  ]);
}

function safeOk(p: Promise<ApiResponse>, label: string, limit = 20, timeoutMs = API_TIMEOUT) {
  return withTimeout(p, label, timeoutMs).then(r => ok(r, limit)).catch((e: any) => txt(`ERR ${label}: ${e.message}`));
}

function txt(s: string) { return { content: [{ type: 'text' as const, text: s }] }; }

function chk(name: string, val: string) {
  return val ? null : txt(`${name}未設定`);
}

const server = new McpServer({ name: 'japan-gov-mcp', version: '3.2.0' });

// ── Logging middleware: 全ツール共通の1箇所で実装 ──
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
          status = e.message?.includes('タイムアウト') ? 'timeout' : 'error';
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

/** e-Stat検索結果を整形: 統計表の一覧をIDと要約で返す */
function summarizeEstat(r: ApiResponse, limit: number) {
  if (!r.success) return ok(r);
  const d = r.data as any;
  const root = d?.GET_STATS_LIST || d?.GET_STATS_DATA || d?.GET_META_INFO;
  if (!root) return ok(r, limit);

  // search結果の整形
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
    const out = { _totalResults: total, _showing: compact.length, _hint: 'statsDataIdをmeta/dataのidに指定して詳細取得', tables: compact };
    let s = JSON.stringify(out);
    if (s.length > MAX) {
      const fewer = compact.slice(0, Math.max(3, Math.floor(limit / 2)));
      s = JSON.stringify({ ...out, _showing: fewer.length, tables: fewer });
    }
    if (s.length > MAX) s = s.slice(0, MAX) + '…';
    return { content: [{ type: 'text' as const, text: s }] };
  }

  // meta/data結果はsmartTrimに任せる
  return ok(r, limit);
}

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

// ═══ 2. stats (dashboard + boj + ndb) ═══
server.tool('stats', '【統計】GDP/CPI/失業率(dash) 金利/マネー/物価(boj) 特定健診(ndb)。dashはリアルタイム経済指標、bojは日銀時系列、ndbは健診データ', {
  action: z.enum(['dash_list', 'dash_data', 'boj_codes', 'boj_data', 'ndb_stats', 'ndb_items', 'ndb_areas']).describe('dash_list:指標一覧, dash_data:指標データ, boj_codes:日銀コード一覧, boj_data:日銀時系列, ndb_stats:健診データ, ndb_items:検査項目一覧, ndb_areas:地域一覧'),
  code: z.string().optional().describe('dash_data:指標コード/boj_data:系列コード(boj_codesで確認)/ndb_stats:検査項目名(例:BMI,収縮期血圧)'),
  db: z.string().optional().describe('日銀DB(FM01=金融市場,MD01=マネタリーベース,MD02=マネーストック,PR01=企業物価,PR02=サービス価格,CO=短観)'),
  region: z.string().optional().describe('dash_data:地域コード/ndb_stats:都道府県名'),
  from: z.string().optional().describe('開始(dash:時間コード, boj:YYYYMM形式)'),
  to: z.string().optional().describe('終了(同上)'),
  freq: z.string().optional().describe('日銀頻度: D=日次,M=月次,Q=四半期,A=年次'),
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
    case 'ndb_stats': return safeOk(ndb.getInspectionStats({ itemName: p.code!, areaType: p.areaType, prefectureName: p.region, gender: p.gender, ageGroup: p.ageGroup }), 'NDB', lim);
    case 'ndb_items': return safeOk(ndb.getItems(), 'NDB', lim);
    case 'ndb_areas': return safeOk(ndb.getAreas({ type: p.areaType }), 'NDB', lim);
  }
});

// ═══ 3. corporate ═══

/** gBiz詳細データ: 大量配列は集計サマリー + limit件を返す */
function summarizeGbiz(r: ApiResponse, infoType: string, limit: number) {
  if (!r.success) return ok(r);
  const info = r.data?.['hojin-infos']?.[0];
  if (!info) return ok(r);
  const raw = info[infoType];
  if (!raw || !Array.isArray(raw)) return ok(r, limit);
  const items: any[] = raw;
  if (items.length <= limit) return ok(r, limit);

  // 集計サマリー生成
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
    summary._recent_years = Object.fromEntries(
      Object.entries(byYear).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 5)
    );
  } else if (infoType === 'procurement') {
    const byDept: Record<string, { count: number; total: number }> = {};
    for (const p of items) {
      const dept = p.government_departments || '不明';
      if (!byDept[dept]) byDept[dept] = { count: 0, total: 0 };
      byDept[dept].count++;
      byDept[dept].total += p.amount || 0;
    }
    summary._by_department = Object.fromEntries(
      Object.entries(byDept).sort((a, b) => b[1].total - a[1].total).slice(0, 10)
    );
  } else if (infoType === 'subsidy') {
    const byTitle: Record<string, number> = {};
    for (const p of items) {
      const t = p.title || '不明';
      byTitle[t] = (byTitle[t] || 0) + 1;
    }
    summary._by_title = Object.fromEntries(
      Object.entries(byTitle).sort((a, b) => b[1] - a[1]).slice(0, 10)
    );
  }

  // limit件の詳細を付加
  const sliced = items.slice(0, limit);
  const out = { ...info, [infoType]: sliced, _summary: summary };
  const rr: ApiResponse = { ...r, data: { ...r.data, 'hojin-infos': [out] } };
  return ok(rr);
}

server.tool('corporate', '【企業情報】法人番号検索(houjin)/企業基本・特許・調達・補助金(gbiz)/有価証券報告書(edinet)。gbiz_detailにはcorpNum(法人番号13桁)が必要→先にgbizで検索', {
  action: z.enum(['houjin', 'gbiz', 'gbiz_detail', 'edinet']).describe('houjin:法人番号検索, gbiz:企業名で基本情報検索→corpNum取得, gbiz_detail:corpNum指定→特許/調達/補助金等, edinet:日付指定→有価証券報告書一覧'),
  name: z.string().optional().describe('企業名(例: トヨタ自動車)'),
  corpNum: z.string().optional().describe('法人番号13桁(gbiz検索結果から取得)'),
  address: z.string().optional().describe('所在地(houjin検索で使用)'),
  infoType: z.enum(['certification', 'subsidy', 'patent', 'procurement', 'finance', 'commendation', 'workplace']).optional().describe('gbiz_detailの情報種別: certification=認証, subsidy=補助金, patent=特許, procurement=政府調達, finance=財務, commendation=表彰, workplace=職場情報'),
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

// ═══ 4. weather (気象+防災) ═══
server.tool('weather', '【気象・防災】天気予報/地震/津波/浸水深/地震ハザード/交通量。areaCode例: 130000=東京,270000=大阪,400000=福岡,016000=北海道', {
  action: z.enum(['forecast', 'overview', 'weekly', 'typhoon', 'amedas_st', 'amedas', 'earthquake', 'tsunami', 'flood', 'river', 'hazard', 'traffic']).describe('forecast:天気予報, overview:概況, weekly:週間, typhoon:台風, amedas_st:観測点一覧, amedas:観測データ, earthquake:地震一覧, tsunami:津波, flood:浸水深(緯度経度), hazard:地震ハザード(緯度経度), traffic:交通量(緯度経度)'),
  areaCode: z.string().optional().describe('都道府県コード6桁(例: 130000=東京, 270000=大阪, 140000=神奈川, 230000=愛知, 260000=京都)'),
  pointId: z.string().optional().describe('アメダス観測点ID(amedas_stで確認。例: 44132=東京)'),
  date: z.string().optional().describe('アメダス日付(YYYYMMDD)'),
  lat: z.number().optional().describe('緯度(flood/hazard/traffic用)'),
  lon: z.number().optional().describe('経度(flood/hazard/traffic用)'),
  stationId: z.string().optional().describe('河川観測所ID'),
  radius: z.number().optional().describe('交通量検索半径(m, デフォルト5000)'),
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

// ═══ 5. law (法令+国会+パブコメ) ═══

/** 国会答弁: 委員会別・発話者別に集計し、本文は短縮して多く見せる */
function summarizeKokkai(r: ApiResponse, limit: number) {
  if (!r.success) return ok(r);
  const d = r.data as any;
  const records: any[] = d?.speechRecord || d?.meetingRecord || [];
  if (!Array.isArray(records) || records.length === 0) return ok(r);

  const totalHits = d.numberOfRecords || records.length;

  // 委員会別集計
  const byMeeting: Record<string, { count: number; dates: Set<string>; speakers: Set<string> }> = {};
  const bySpeaker: Record<string, number> = {};
  for (const rec of records) {
    const m = rec.nameOfMeeting || '不明';
    if (!byMeeting[m]) byMeeting[m] = { count: 0, dates: new Set(), speakers: new Set() };
    byMeeting[m].count++;
    if (rec.date) byMeeting[m].dates.add(rec.date);
    const sp = rec.speaker || '不明';
    byMeeting[m].speakers.add(sp);
    bySpeaker[sp] = (bySpeaker[sp] || 0) + 1;
  }

  const summary: any = {
    _totalHits: totalHits,
    _showing: Math.min(limit, records.length),
    _byCommittee: Object.fromEntries(
      Object.entries(byMeeting)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([k, v]) => [k, { count: v.count, dates: [...v.dates].sort().reverse().slice(0, 3), speakers: [...v.speakers].slice(0, 5) }])
    ),
    _topSpeakers: Object.fromEntries(
      Object.entries(bySpeaker).sort((a, b) => b[1] - a[1]).slice(0, 10)
    ),
  };

  // 本文を100字に短縮して多くの件を返す
  const compact = records.slice(0, limit).map((rec: any) => ({
    date: rec.date,
    meeting: rec.nameOfMeeting,
    speaker: rec.speaker,
    group: rec.speakerGroup,
    excerpt: (rec.speech || '').replace(/\s+/g, ' ').slice(0, 120) + (rec.speech?.length > 120 ? '…' : ''),
    url: rec.speechURL || rec.meetingURL,
  }));

  let s = JSON.stringify({ ...summary, items: compact });
  if (s.length > MAX) {
    const fewer = compact.slice(0, Math.max(3, Math.floor(limit / 2)));
    s = JSON.stringify({ ...summary, _showing: fewer.length, items: fewer });
  }
  if (s.length > MAX) s = s.slice(0, MAX) + '…';
  return { content: [{ type: 'text' as const, text: s }] };
}

server.tool('law', '【法令・国会・パブコメ】法律検索/国会議事録(※まずmeetingで委員会一覧→speechで発言詳細)/パブリックコメント', {
  action: z.enum(['search', 'list', 'fulltext', 'speech', 'meeting', 'pubcomment']).describe('国会議事録はmeetingで会議一覧を先に確認し、必要ならspeechで発言詳細を取得'),
  q: z.string().optional(),
  lawId: z.string().optional(),
  category: z.number().optional(),
  speaker: z.string().optional(),
  house: z.string().optional(),
  meetingName: z.string().optional().describe('特定の委員会名で絞込(例: 国土交通委員会)'),
  from: z.string().optional(),
  until: z.string().optional(),
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

// ═══ 6. geo (地理+PLATEAU) ═══
server.tool('geo', '【地理空間】住所→座標(geocode)/座標→住所(reverse)/行政区域境界(city_geo,pref_geo)/3D都市モデルPLATEAU', {
  action: z.enum(['geocode', 'reverse', 'city_geo', 'pref_geo', 'plateau', 'plateau_mesh']).describe('geocode:住所→緯度経度, reverse:緯度経度→住所, city_geo:市区町村境界, pref_geo:都道府県境界, plateau:3D都市モデル検索, plateau_mesh:メッシュ指定3Dデータ'),
  address: z.string().optional().describe('住所(例: 東京都千代田区丸の内1丁目)'),
  lat: z.number().optional(),
  lon: z.number().optional(),
  code: z.string().optional().describe('市区町村コード(city_geo用)/メッシュコード(plateau_mesh用)'),
  prefCode: z.string().optional().describe('都道府県コード(pref_geo用, 例: 13=東京)'),
  city: z.string().optional().describe('市区町村名(plateau検索用)'),
  prefecture: z.string().optional().describe('都道府県名(plateau検索用, 例: 東京都)'),
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

// ═══ 7. academic (学術+科学+研究者) ═══
server.tool('academic', '【学術・科学】書籍(ndl)/論文(jstage,cinii)/文化財(japansearch)/機関リポ(irdb)/大気質(air)/地質(geology)/衛星(jaxa)/研究者(researchmap)', {
  source: z.enum(['ndl', 'jstage', 'cinii', 'japansearch', 'irdb', 'agriknowledge', 'air', 'geology', 'jaxa', 'researchmap']).describe('ndl:国立国会図書館, jstage:学術論文, cinii:CiNii論文, japansearch:ジャパンサーチ(文化財), irdb:機関リポジトリ, agriknowledge:農業文献, air:大気質(そらまめ), geology:地質図, jaxa:衛星データ, researchmap:研究者業績'),
  q: z.string().optional().describe('検索キーワード'),
  count: z.number().optional().describe('取得件数'),
  title: z.string().optional().describe('タイトル検索(irdb)'),
  author: z.string().optional().describe('著者名(irdb)'),
  prefCode: z.string().optional().describe('都道府県コード(air用, 例: 13=東京, 27=大阪)'),
  lat: z.number().optional().describe('緯度(geology用)'),
  lon: z.number().optional().describe('経度(geology用)'),
  permalink: z.string().optional().describe('研究者パーマリンク(researchmap用)'),
  type: z.string().optional().describe('業績種別(researchmap用: published_papers, books等)'),
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

// ═══ 8. opendata (政府/G空間/国交DPF) ═══
server.tool('opendata', '【オープンデータカタログ】政府データ(gov=data.go.jp)/地理空間データ(geo=G空間情報センター)/国交省DPF(dpf=道路・鉄道・橋梁等)', {
  source: z.enum(['gov', 'geo', 'dpf']).describe('gov:政府オープンデータカタログ, geo:G空間情報センター(地図・GIS), dpf:国交省データプラットフォーム'),
  q: z.string().optional().describe('検索キーワード'),
  id: z.string().optional().describe('データセットID(検索結果から取得して詳細表示)'),
  rows: z.number().optional().describe('検索結果数'),
  limit: z.number().optional(),
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

// ═══ 9. misc (海外安全/入札/中小企業/不動産/求人) ═══
server.tool('misc', '【その他行政】海外安全情報(safety)/官公需入札(kkj)/中小企業事例(mirasapo)/不動産取引(realestate)/公示地価(landprice)/求人(hellowork)', {
  api: z.enum(['safety', 'kkj', 'mirasapo', 'mirasapo_cat', 'mirasapo_region', 'realestate', 'landprice', 'hellowork']).describe('safety:外務省海外安全, kkj:官公需(政府入札), mirasapo:中小企業成功事例, mirasapo_cat:カテゴリ一覧, mirasapo_region:地域一覧, realestate:不動産取引価格, landprice:公示地価, hellowork:ハローワーク求人'),
  q: z.string().optional().describe('検索キーワード(kkj/mirasapo/hellowork)'),
  id: z.string().optional().describe('ミラサポ事例ID'),
  region: z.string().optional().describe('海外安全:地域コード'),
  country: z.string().optional().describe('海外安全:国コード(例: 086=中国,410=韓国,840=米国)'),
  org: z.string().optional().describe('官公需:発注機関名(例: 防衛省,国土交通省)'),
  area: z.string().optional().describe('不動産/地価:都道府県コード(例: 13=東京)'),
  year: z.string().optional().describe('不動産/地価:年(例: 2024)'),
  quarter: z.string().optional().describe('不動産取引:四半期(1-4)'),
  city: z.string().optional().describe('不動産/地価:市区町村コード'),
  prefCode: z.string().optional().describe('ハローワーク:都道府県コード'),
  employment: z.string().optional().describe('ハローワーク:雇用形態'),
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
  query: z.string().optional().describe('code_lookup用: 自然言語クエリ(例: 東京都の人口, 大阪のGDP)'),
  source: z.enum(['estat', 'stats', 'boj']).optional().describe('code_lookup用: 対象API絞り込み'),
  name: z.string().optional().describe('entity_bridge/area_bridge用: 企業名or地域名'),
  corpNum: z.string().optional().describe('entity_bridge用: 法人番号13桁'),
  prefCode: z.string().optional().describe('area_bridge用: 都道府県コード2桁'),
  cityCode: z.string().optional().describe('area_bridge用: 市区町村コード5桁'),
  jmaCode: z.string().optional().describe('area_bridge用: 気象庁地域コード6桁'),
  estatCode: z.string().optional().describe('area_bridge用: e-Stat地域コード5桁'),
  lat: z.number().optional().describe('area_bridge用: 緯度'),
  lon: z.number().optional().describe('area_bridge用: 経度'),
  from: z.string().optional().describe('time_bridge用: 開始(2020, 令和2年, FY2020等)'),
  to: z.string().optional().describe('time_bridge用: 終了'),
  freq: z.enum(['A', 'Q', 'M']).optional().describe('time_bridge用: A=年次,Q=四半期,M=月次'),
  calendar: z.enum(['fiscal', 'calendar']).optional().describe('time_bridge用: fiscal=年度(4月始),calendar=暦年'),
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
  action: z.enum(['recommend', 'schema', 'coverage']).describe('recommend:トピック→使うべきAPI推薦(パラメータ付き), schema:statsDataId→データセットの次元・時間範囲・地域レベル, coverage:トピック×地域のデータ有無確認'),
  topic: z.string().optional().describe('recommend/coverage用: トピック名(例: 人口,GDP,物価,雇用,少子化)'),
  detailLevel: z.enum(['quick', 'comprehensive']).optional().describe('recommend用: quick=主要のみ, comprehensive=全推薦'),
  schemaSource: z.string().optional().describe('schema用: データソース(現在はestatのみ対応)'),
  id: z.string().optional().describe('schema用: statsDataId'),
  area: z.string().optional().describe('coverage用: 地域名'),
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
  indicators: z.array(z.object({
    source: z.enum(['estat', 'stats', 'boj']).describe('データソース'),
    query: z.string().optional().describe('自然言語クエリ(idがない場合)'),
    id: z.string().optional().describe('statsDataId/指標コード/系列コード'),
    label: z.string().describe('出力ラベル名'),
  })).optional().describe('fetch_aligned用: 取得する指標リスト'),
  timeFrom: z.string().optional().describe('fetch_aligned用: 期間開始(2020等)'),
  timeTo: z.string().optional().describe('fetch_aligned用: 期間終了'),
  timeFreq: z.enum(['A', 'Q', 'M']).optional().describe('fetch_aligned用: 頻度'),
  prefCodes: z.array(z.string()).optional().describe('fetch_aligned用: 都道府県コード配列'),
  data: z.array(z.object({
    time: z.string().optional(),
    value: z.union([z.number(), z.string()]),
    unit: z.string().optional(),
  })).optional().describe('normalize用: データ配列'),
  rules: z.array(z.object({
    fromUnit: z.string(),
    toUnit: z.string(),
  })).optional().describe('normalize用: 変換ルール(例: {fromUnit:"千人",toUnit:"人"})'),
  records: z.array(z.object({
    time: z.string(),
    value: z.union([z.number(), z.string()]),
  })).optional().describe('fill_gaps用: 時系列レコード'),
  expectedFrom: z.string().optional().describe('fill_gaps用: 期待範囲の開始'),
  expectedTo: z.string().optional().describe('fill_gaps用: 期待範囲の終了'),
  frequency: z.enum(['year', 'month', 'quarter']).optional().describe('fill_gaps用: 頻度'),
}, async (p) => {
  switch (p.action) {
    case 'fetch_aligned': return safeOk(
      join.fetchAligned({
        indicators: p.indicators!,
        axis: {
          time: p.timeFrom ? { from: p.timeFrom, to: p.timeTo || p.timeFrom, freq: p.timeFreq } : undefined,
          area: p.prefCodes ? { prefCodes: p.prefCodes } : undefined,
        },
      }, C),
      'join/fetch', 20, ESTAT_TIMEOUT,
    );
    case 'normalize': return ok(join.normalize({ data: p.data!, rules: p.rules! }));
    case 'fill_gaps': return ok(join.fillGaps({
      records: p.records!,
      expectedRange: p.expectedFrom ? { from: p.expectedFrom, to: p.expectedTo || p.expectedFrom } : undefined,
      frequency: p.frequency,
    }));
  }
});

// ═══ 13. context ═══
server.tool('context', '【文脈付与】数値の歴史的位置(percentile)/同カテゴリ内順位・偏差値(peers)/トレンド位置(trend_context)/join結果に一括文脈付与(annotate)/次に調べるべきことを提案(suggest)', {
  action: z.enum(['percentile', 'peers', 'trend_context', 'annotate', 'suggest']).describe('percentile:過去N年分布でのパーセンタイル, peers:47都道府県内の順位・偏差値, trend_context:上昇/下降トレンドの位置, annotate:join結果に一括文脈付与, suggest:データから次の調査を提案'),
  source: z.enum(['estat', 'stats', 'boj', 'misc']).optional().describe('percentile/peers/trend用: データソース'),
  id: z.string().optional().describe('percentile/peers/trend用: statsDataId/指標コード/系列コード'),
  query: z.string().optional().describe('percentile/peers/trend/suggest用: 自然言語クエリ(例: 消費者物価指数)'),
  value: z.number().optional().describe('percentile用: 文脈を知りたい値'),
  area: z.string().optional().describe('percentile/trend用: 地域(prefCodeまたは名前)'),
  target: z.string().optional().describe('peers用: 比較対象(prefCodeまたは都道府県名)'),
  peerGroup: z.enum(['pref', 'city', 'designated_city', 'custom']).optional().describe('peers用: 比較グループ'),
  windowYears: z.number().optional().describe('percentile用: 分布に使う年数(デフォルト30)'),
  lookbackYears: z.number().optional().describe('trend用: 遡る年数(デフォルト10)'),
  recentN: z.number().optional().describe('trend用: 方向判定に使う直近ポイント数(デフォルト3, 中期=6, 長期=12)'),
  joinedData: z.record(z.unknown()).optional().describe('annotate用: join.fetch_alignedの出力をそのまま渡す'),
  depth: z.enum(['quick', 'standard', 'deep']).optional().describe('annotate用: quick=高速, standard=標準, deep=全情報'),
  topic: z.string().optional().describe('suggest用: テーマ(例: 少子化, 物価)'),
  currentIndicators: z.array(z.object({
    source: z.string(),
    id: z.string().optional(),
    query: z.string().optional(),
    label: z.string(),
  })).optional().describe('suggest用: 現在見ている指標リスト'),
  alerts: z.array(z.object({
    type: z.string(),
    indicator: z.string(),
    area: z.string().optional(),
    period: z.string().optional(),
  })).optional().describe('suggest/annotate用: 検出済みアラート'),
  areaLevel: z.enum(['pref', 'city', 'national']).optional().describe('suggest用: 地域レベル'),
  uniqueAreas: z.array(z.string()).optional().describe('suggest用: 分析対象の地域名リスト'),
}, async (p) => {
  switch (p.action) {
    case 'percentile': return safeOk(context.percentile({ source: p.source!, id: p.id, query: p.query, value: p.value!, area: p.area, window_years: p.windowYears }, { estat: C.estat }), 'context/percentile', 20, ESTAT_TIMEOUT);
    case 'peers': return safeOk(context.peers({ source: p.source!, id: p.id, query: p.query, target: p.target!, peer_group: p.peerGroup }, { estat: C.estat }), 'context/peers', 20, ESTAT_TIMEOUT);
    case 'trend_context': return safeOk(context.trendContext({ source: p.source!, id: p.id, query: p.query, area: p.area, lookback_years: p.lookbackYears, recent_n: p.recentN }, { estat: C.estat }), 'context/trend', 20, ESTAT_TIMEOUT);
    case 'annotate': return safeOk(context.annotate({ joined_data: p.joinedData as any, depth: p.depth }, { estat: C.estat }), 'context/annotate', 20, ESTAT_TIMEOUT);
    case 'suggest': return ok(context.suggest({ topic: p.topic, current_indicators: p.currentIndicators, alerts: p.alerts, area_level: p.areaLevel, unique_areas: p.uniqueAreas }));
  }
});

// ── Start ──
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('japan-gov-mcp v3.2 (13 tools)');
}
main().catch(e => { console.error('Fatal:', e); process.exit(1); });
