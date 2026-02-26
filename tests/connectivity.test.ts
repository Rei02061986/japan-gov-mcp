/**
 * 全API疎通テスト — japan-gov-mcp
 *
 * 各プロバイダーの実エンドポイントに対して最小限のリクエストを送信し、
 * 疎通可能かどうかを確認する。
 *
 * 実行: node --test tests/connectivity.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── Providers (import from build/) ──
import * as estat from '../build/providers/estat.js';
import * as resas from '../build/providers/resas.js';
import * as houjin from '../build/providers/houjin.js';
import * as gbiz from '../build/providers/gbiz.js';
import * as edinet from '../build/providers/edinet.js';
import * as geospatial from '../build/providers/geospatial.js';
import * as geoshape from '../build/providers/geoshape.js';
import {
  searchLaws, getLawData, searchLawsByKeyword,
  getDashboardIndicators, getDashboardData,
  getRealEstateTransactions, getLandPrice,
  searchDatasets, getDatasetDetail,
  getSafetyInfo, searchJobs, searchAgriKnowledge,
} from '../build/providers/misc.js';
import type { HelloworkConfig, RealEstateConfig } from '../build/providers/misc.js';
import {
  getForecast, getForecastOverview, getSeismicHazard,
  getAmedasStations, getAmedasData, getForecastWeekly, getTyphoonInfo,
  getEarthquakeList, getTsunamiList,
} from '../build/providers/weather.js';
import { geocode, reverseGeocode } from '../build/providers/geo.js';
import { searchNdl, searchJstage, searchJapanSearch, searchCinii, searchIrdb } from '../build/providers/academic.js';
import { searchPlateauDatasets, getPlateauCitygml } from '../build/providers/plateau.js';
import { getPublicComments } from '../build/providers/pubcomment.js';
import { getResearcherAchievements } from '../build/providers/researchmap.js';
import * as mirasapo from '../build/providers/mirasapo.js';
import { getAirQuality, getGeologyLegend, getGeologyAtPoint, getJaxaCollections } from '../build/providers/science.js';
import { searchKokkaiSpeeches, searchKokkaiMeetings } from '../build/providers/kokkai.js';
import { searchKkj } from '../build/providers/kkj.js';
import * as mlitDpf from '../build/providers/mlit-dpf.js';
import * as disaster from '../build/providers/disaster.js';
import * as ndb from '../build/providers/ndb.js';
import * as boj from '../build/providers/boj.js';
import * as msil from '../build/providers/msil.js';
import * as odpt from '../build/providers/odpt.js';

// ── Results Tracker ──
const results: { api: string; endpoint: string; status: 'PASS' | 'FAIL' | 'SKIP'; detail: string }[] = [];

function track(api: string, endpoint: string, status: 'PASS' | 'FAIL' | 'SKIP', detail: string) {
  results.push({ api, endpoint, status, detail });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
  console.error(`${icon} [${api}] ${endpoint}: ${detail}`);
}

// ═══════════════════════════════════════════════
// Group 1: APIキー不要 (No Auth Required)
// ═══════════════════════════════════════════════

describe('Group 1: No-Auth APIs', { timeout: 300000 }, () => {

  // ── 気象庁 (JMA) ──
  it('jma_forecast — 東京の天気予報', async () => {
    const res = await getForecast({ areaCode: '130000' });
    track('気象庁', 'jma_forecast', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('jma_overview — 東京の天気概況', async () => {
    const res = await getForecastOverview({ areaCode: '130000' });
    track('気象庁', 'jma_overview', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('jma_forecast_week — 東京の週間予報', async () => {
    const res = await getForecastWeekly({ areaCode: '130000' });
    track('気象庁', 'jma_forecast_week', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('jma_typhoon — 台風情報', async () => {
    const res = await getTyphoonInfo();
    track('気象庁', 'jma_typhoon', res.success ? 'PASS' : 'FAIL', res.success ? 'OK (no typhoon = valid)' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('jma_earthquake — 地震情報', async () => {
    const res = await getEarthquakeList();
    track('気象庁', 'jma_earthquake', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('jma_tsunami — 津波情報', async () => {
    const res = await getTsunamiList();
    track('気象庁', 'jma_tsunami', res.success ? 'PASS' : 'FAIL', res.success ? 'OK (no tsunami = valid)' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('amedas_stations — アメダス観測所一覧', async () => {
    const res = await getAmedasStations();
    track('気象庁', 'amedas_stations', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('amedas_data — 東京アメダスデータ', async () => {
    const res = await getAmedasData({ pointId: '44132' });
    track('気象庁', 'amedas_data', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── 防災科研 J-SHIS ──
  it('jshis_hazard — 東京駅の地震ハザード', async () => {
    const res = await getSeismicHazard({ lat: 35.6812, lon: 139.7671 });
    track('防災科研', 'jshis_hazard', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── 浸水ナビ ──
  it('flood_depth — 東京駅の浸水想定', async () => {
    const res = await disaster.getFloodDepth({ lat: 35.6812, lon: 139.7671 });
    track('国土地理院', 'flood_depth', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── 河川水位 ──
  it('river_level — 河川水位', async () => {
    const res = await disaster.getRiverLevel({ stationId: '0021300400015' });
    track('国交省', 'river_level', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── 交通量 ──
  it('traffic_volume — 東京の交通量', async () => {
    const res = await disaster.getTrafficVolume({ lat: 35.6812, lon: 139.7671 });
    track('国交省', 'traffic_volume', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── 国土地理院 ジオコーディング ──
  it('gsi_geocode — 住所→座標', async () => {
    const res = await geocode({ address: '東京都千代田区霞が関' });
    track('国土地理院', 'gsi_geocode', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('gsi_reverse_geocode — 座標→住所', async () => {
    const res = await reverseGeocode({ lat: 35.6762, lon: 139.7503 });
    track('国土地理院', 'gsi_reverse_geocode', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── Geoshape ──
  it('geoshape_city — 千代田区境界', async () => {
    const res = await geoshape.getCityBoundary({ code: '13101' });
    track('Geoshape', 'geoshape_city', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('geoshape_pref — 東京都境界', async () => {
    const res = await geoshape.getPrefBoundary({ prefCode: '13' });
    track('Geoshape', 'geoshape_pref', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── 統計ダッシュボード ──
  it('dashboard_indicators — 指標一覧', async () => {
    const res = await getDashboardIndicators({});
    track('統計ダッシュボード', 'dashboard_indicators', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('dashboard_data — 人口系指標データ', async () => {
    const res = await getDashboardData({ indicatorCode: 'A1101' });
    track('統計ダッシュボード', 'dashboard_data', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── 法令API V2 ──
  it('law_search — 法令一覧', async () => {
    const res = await searchLaws({ category: 2, limit: 3 });
    track('法令API', 'law_search', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('law_data — 民法本文', async () => {
    const res = await getLawData({ lawId: '129AC0000000089' });
    track('法令API', 'law_data', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('law_keyword_search — キーワード検索', async () => {
    const res = await searchLawsByKeyword({ keyword: '環境', limit: 3 });
    track('法令API', 'law_keyword_search', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── データカタログ (CKAN) ──
  it('opendata_search — オープンデータ検索', async () => {
    const res = await searchDatasets({ q: '防災', rows: 3 });
    track('データカタログ', 'opendata_search', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── 海外安全情報 ──
  it('safety_overseas — インドの安全情報', async () => {
    const res = await getSafetyInfo({ countryCode: '0091' });
    track('外務省', 'safety_overseas', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── G空間情報センター ──
  it('geospatial_search — 地理空間データ検索', async () => {
    const res = await geospatial.searchGeospatial({ q: '地図', rows: 3 });
    track('G空間', 'geospatial_search', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('geospatial_organizations — 組織一覧', async () => {
    const res = await geospatial.listGeospatialOrganizations();
    track('G空間', 'geospatial_organizations', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── 国立国会図書館 (NDL) ──
  it('ndl_search — 書籍検索', async () => {
    const res = await searchNdl({ query: '統計学', count: 3 });
    track('NDL', 'ndl_search', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── J-STAGE ──
  it('jstage_search — 学術論文検索', async () => {
    const res = await searchJstage({ query: '機械学習', count: 3 });
    track('J-STAGE', 'jstage_search', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── CiNii Research ──
  it('cinii_search — CiNii論文検索', async () => {
    const res = await searchCinii({ query: '量子コンピュータ', count: 3 });
    track('CiNii', 'cinii_search', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── ジャパンサーチ ──
  it('japansearch_search — 文化遺産検索', async () => {
    const res = await searchJapanSearch({ keyword: '浮世絵', size: 3 });
    track('ジャパンサーチ', 'japansearch_search', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── IRDB ──
  it('irdb_search — 機関リポジトリ検索', async () => {
    const res = await searchIrdb({ query: '環境問題', count: 3 });
    track('IRDB', 'irdb_search', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── AgriKnowledge ──
  it('agriknowledge_search — 農業技術検索', async () => {
    const res = await searchAgriKnowledge({ query: '稲作', count: 3 });
    track('AgriKnowledge', 'agriknowledge_search', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── researchmap ──
  it('researchmap_achievements — 研究者業績', async () => {
    const res = await getResearcherAchievements({ permalink: 'SatoshiMatsuokaHPC', achievementType: 'published_papers', limit: 3 });
    track('researchmap', 'researchmap_achievements', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── 国会会議録 ──
  it('kokkai_speeches — 国会発言検索', async () => {
    const res = await searchKokkaiSpeeches({ any: '環境問題', maximumRecords: 3 });
    track('国会会議録', 'kokkai_speeches', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('kokkai_meetings — 国会会議一覧', async () => {
    const res = await searchKokkaiMeetings({ any: '予算', maximumRecords: 3 });
    track('国会会議録', 'kokkai_meetings', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── 官公需情報 ──
  it('kkj_search — 入札案件検索', async () => {
    const res = await searchKkj({ Query: 'IT', Count: 3 });
    track('官公需', 'kkj_search', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── 環境省 そらまめくん ──
  it('soramame_air — 大気汚染データ', async () => {
    const res = await getAirQuality({});
    track('環境省', 'soramame_air', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── 産総研 地質図 ──
  it('geology_legend — 地質凡例', async () => {
    const res = await getGeologyLegend();
    track('産総研', 'geology_legend', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('geology_at_point — 東京駅の地質', async () => {
    const res = await getGeologyAtPoint({ lat: 35.6812, lon: 139.7671 });
    track('産総研', 'geology_at_point', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── JAXA ──
  it('jaxa_collections — 衛星データ一覧', async () => {
    const res = await getJaxaCollections({ limit: 3 });
    track('JAXA', 'jaxa_collections', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── NDBオープンデータ ──
  it('ndb_items — 検査項目一覧', async () => {
    const res = await ndb.getItems();
    track('NDB', 'ndb_items', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('ndb_areas — 都道府県一覧', async () => {
    const res = await ndb.getAreas({ type: 'prefecture' });
    track('NDB', 'ndb_areas', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('ndb_range_labels — BMI範囲ラベル', async () => {
    const res = await ndb.getRangeLabels({ itemName: 'BMI' });
    track('NDB', 'ndb_range_labels', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('ndb_inspection_stats — BMI統計データ', async () => {
    const res = await ndb.getInspectionStats({ itemName: 'BMI', prefectureName: '東京都' });
    track('NDB', 'ndb_inspection_stats', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── 日本銀行 ──
  it('boj_major_statistics — 主要統計一覧', async () => {
    const res = await boj.getMajorStatistics();
    track('日銀', 'boj_major_statistics', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('boj_timeseries — M2マネーストック', async () => {
    const res = await boj.getTimeSeriesData({ seriesCode: "MD02'MAAMAG", frequency: 'MM' });
    track('日銀', 'boj_timeseries', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── PLATEAU ──
  it('plateau_datasets — 3D都市モデル検索', async () => {
    const res = await searchPlateauDatasets({ prefecture: '東京都' });
    track('PLATEAU', 'plateau_datasets', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('plateau_citygml — メッシュコードCityGML', async () => {
    const res = await getPlateauCitygml({ meshCode: '53394525' });
    track('PLATEAU', 'plateau_citygml', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── パブリックコメント ──
  it('pubcomment_list — 意見募集中一覧', async () => {
    const res = await getPublicComments({ type: 'list' });
    track('e-Gov', 'pubcomment_list', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── ミラサポplus ──
  it('mirasapo_search — 中小企業事例検索', async () => {
    const res = await mirasapo.searchCaseStudies({ keywords: 'DX', limit: 3 });
    track('ミラサポ', 'mirasapo_search', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('mirasapo_categories — カテゴリマスタ', async () => {
    const res = await mirasapo.getCategories({ type: 'industries' });
    track('ミラサポ', 'mirasapo_categories', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('mirasapo_regions — 地方マスタ', async () => {
    const res = await mirasapo.getRegions();
    track('ミラサポ', 'mirasapo_regions', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });
});

// ═══════════════════════════════════════════════
// Group 2: APIキー必要 (Auth Required)
// ═══════════════════════════════════════════════

describe('Group 2: Auth-Required APIs', { timeout: 60000 }, () => {

  const ESTAT_APP_ID = process.env.ESTAT_APP_ID || '';
  const RESAS_API_KEY = process.env.RESAS_API_KEY || '';
  const HOUJIN_APP_ID = process.env.HOUJIN_APP_ID || '';
  const GBIZ_TOKEN = process.env.GBIZ_TOKEN || '';
  const EDINET_API_KEY = process.env.EDINET_API_KEY || '';
  const HELLOWORK_API_KEY = process.env.HELLOWORK_API_KEY || '';
  const REALESTATE_API_KEY = process.env.REALESTATE_API_KEY || '';
  const MLIT_DPF_API_KEY = process.env.MLIT_DPF_API_KEY || '';
  const MSIL_API_KEY = process.env.MSIL_API_KEY || '';
  const ODPT_API_KEY = process.env.ODPT_API_KEY || '';

  // ── e-Stat ──
  it('estat_search — 統計検索', async () => {
    if (!ESTAT_APP_ID) { track('e-Stat', 'estat_search', 'SKIP', 'ESTAT_APP_ID未設定'); return; }
    const res = await estat.getStatsList({ appId: ESTAT_APP_ID }, { searchWord: '人口', limit: 3 });
    track('e-Stat', 'estat_search', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('estat_meta — 統計メタ情報', async () => {
    if (!ESTAT_APP_ID) { track('e-Stat', 'estat_meta', 'SKIP', 'ESTAT_APP_ID未設定'); return; }
    const res = await estat.getMetaInfo({ appId: ESTAT_APP_ID }, { statsDataId: '0003410379' });
    track('e-Stat', 'estat_meta', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('estat_data — 統計データ取得', async () => {
    if (!ESTAT_APP_ID) { track('e-Stat', 'estat_data', 'SKIP', 'ESTAT_APP_ID未設定'); return; }
    const res = await estat.getStatsData({ appId: ESTAT_APP_ID }, { statsDataId: '0003410379', limit: 5 });
    track('e-Stat', 'estat_data', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── RESAS (deprecated) ──
  it('resas_prefectures — RESAS都道府県 (deprecated)', async () => {
    const res = await resas.getPrefectures({ apiKey: RESAS_API_KEY });
    // RESAS is deprecated, expect error
    track('RESAS', 'resas_prefectures', 'SKIP', 'RESAS API deprecated (2025-03-24 終了)');
  });

  // ── 法人番号 ──
  it('houjin_search — 法人検索', async () => {
    if (!HOUJIN_APP_ID) { track('法人番号', 'houjin_search', 'SKIP', 'HOUJIN_APP_ID未設定'); return; }
    const res = await houjin.searchHoujin({ appId: HOUJIN_APP_ID }, { name: 'トヨタ' });
    track('法人番号', 'houjin_search', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── gBizINFO ──
  it('gbiz_search — gBiz法人検索', async () => {
    if (!GBIZ_TOKEN) { track('gBizINFO', 'gbiz_search', 'SKIP', 'GBIZ_TOKEN未設定'); return; }
    const res = await gbiz.searchCorporation({ token: GBIZ_TOKEN }, { name: 'トヨタ' });
    track('gBizINFO', 'gbiz_search', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── EDINET ──
  it('edinet_documents — EDINET開示書類', async () => {
    if (!EDINET_API_KEY) { track('EDINET', 'edinet_documents', 'SKIP', 'EDINET_API_KEY未設定'); return; }
    const res = await edinet.getDocumentList({ apiKey: EDINET_API_KEY }, { date: '2024-01-15' });
    track('EDINET', 'edinet_documents', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── ハローワーク ──
  it('hellowork_search — 求人検索', async () => {
    if (!HELLOWORK_API_KEY) { track('ハローワーク', 'hellowork_search', 'SKIP', 'HELLOWORK_API_KEY未設定'); return; }
    const res = await searchJobs({ apiKey: HELLOWORK_API_KEY } as HelloworkConfig, { keyword: '介護' });
    track('ハローワーク', 'hellowork_search', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── 不動産情報 ──
  it('realestate_transactions — 不動産取引', async () => {
    if (!REALESTATE_API_KEY) { track('不動産', 'realestate_transactions', 'SKIP', 'REALESTATE_API_KEY未設定'); return; }
    const res = await getRealEstateTransactions({ apiKey: REALESTATE_API_KEY } as RealEstateConfig, { year: '20231', quarter: '20231', area: '13' });
    track('不動産', 'realestate_transactions', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  it('realestate_landprice — 地価公示', async () => {
    if (!REALESTATE_API_KEY) { track('不動産', 'realestate_landprice', 'SKIP', 'REALESTATE_API_KEY未設定'); return; }
    const res = await getLandPrice({ apiKey: REALESTATE_API_KEY } as RealEstateConfig, { year: '2023', area: '13' });
    track('不動産', 'realestate_landprice', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── 国交省DPF ──
  it('mlit_dpf_search — 国交省データ検索', async () => {
    if (!MLIT_DPF_API_KEY) { track('国交省DPF', 'mlit_dpf_search', 'SKIP', 'MLIT_DPF_API_KEY未設定'); return; }
    const res = await mlitDpf.searchMlitDpf({ apiKey: MLIT_DPF_API_KEY } as mlitDpf.MlitDpfConfig, { term: '橋梁', size: 3 });
    track('国交省DPF', 'mlit_dpf_search', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── 海しる (MSIL) ──
  it('msil_layers — 海しるレイヤ', async () => {
    if (!MSIL_API_KEY) { track('海しる', 'msil_layers', 'SKIP', 'MSIL_API_KEY未設定'); return; }
    const res = await msil.getLayers({ apiKey: MSIL_API_KEY } as msil.MsilConfig);
    track('海しる', 'msil_layers', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });

  // ── ODPT ──
  it('odpt_railway — ODPT鉄道時刻表', async () => {
    if (!ODPT_API_KEY) { track('ODPT', 'odpt_railway', 'SKIP', 'ODPT_API_KEY未設定'); return; }
    const res = await odpt.getRailwayTimetable({}, { apiKey: ODPT_API_KEY } as odpt.OdptConfig);
    track('ODPT', 'odpt_railway', res.success ? 'PASS' : 'FAIL', res.success ? 'OK' : res.error!);
    assert.ok(res.success, res.error);
  });
});

// ── Final Report ──
describe('Connectivity Summary', () => {
  it('print results', () => {
    console.error('\n' + '='.repeat(70));
    console.error('  全API疎通テスト結果サマリー');
    console.error('='.repeat(70));

    const pass = results.filter(r => r.status === 'PASS');
    const fail = results.filter(r => r.status === 'FAIL');
    const skip = results.filter(r => r.status === 'SKIP');

    console.error(`\n✅ PASS: ${pass.length}  ❌ FAIL: ${fail.length}  ⏭️ SKIP: ${skip.length}  合計: ${results.length}\n`);

    if (fail.length > 0) {
      console.error('── 失敗したAPI ──');
      fail.forEach(r => console.error(`  ❌ [${r.api}] ${r.endpoint}: ${r.detail}`));
    }

    if (skip.length > 0) {
      console.error('\n── スキップ（APIキー未設定/非推奨）──');
      skip.forEach(r => console.error(`  ⏭️ [${r.api}] ${r.endpoint}: ${r.detail}`));
    }

    console.error('\n── 成功したAPI ──');
    pass.forEach(r => console.error(`  ✅ [${r.api}] ${r.endpoint}`));

    console.error('\n' + '='.repeat(70));
  });
});
