#!/usr/bin/env node

/**
 * japan-gov-mcp — 日本政府API統合MCPサーバー
 *
 * 30+ API / 90 ツール（シナリオ複合ツール9個含む）
 * Tier 1: e-Stat, RESAS (廃止), 統計ダッシュボード, NDB, 日銀
 * Tier 2: 法人番号, gBizINFO, EDINET
 * Tier 3: 法令API
 * Tier 4: 不動産, 国交省DPF, データカタログ, G空間情報, 海外安全, 求人, 気象・防災, 学術, 科学, 国会会議録, 官公需, 海しる, ODPT
 * Tier 5 (Phase 6): PLATEAU, IRDB, 地震・津波, パブコメ, researchmap, ミラサポplus
 * Scenarios: 地域医療×経済, 労働需給, 企業情報統合, 防災リスク, 学術トレンド, 不動産×人口, 地域経済総合
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import * as estat from './providers/estat.js';
import * as resas from './providers/resas.js';
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
import * as msil from './providers/msil.js';
import * as odpt from './providers/odpt.js';
import { regionalHealthEconomy, laborDemandSupply } from './scenarios/regional-analysis.js';
import { corporateIntelligence } from './scenarios/corporate-analysis.js';
import { disasterRiskAssessment } from './scenarios/disaster-analysis.js';
import { academicTrend, academicTrendByTopics } from './scenarios/academic-analysis.js';
import { realestateDemographics } from './scenarios/realestate-analysis.js';
import { regionalEconomyFull, nationalEconomySummary } from './scenarios/economy-analysis.js';

// ── Config ──
const C = {
  estat:     { appId: process.env.ESTAT_APP_ID || '' },
  resas:     { apiKey: process.env.RESAS_API_KEY || '' },
  houjin:    { appId: process.env.HOUJIN_APP_ID || '' },
  gbiz:      { token: process.env.GBIZ_TOKEN || '' },
  edinet:    { apiKey: process.env.EDINET_API_KEY || '' },
  hellowork: { apiKey: process.env.HELLOWORK_API_KEY || '' } as HelloworkConfig,
  realestate: { apiKey: process.env.REALESTATE_API_KEY || '' } as RealEstateConfig,
  mlitDpf:   { apiKey: process.env.MLIT_DPF_API_KEY || '' } as mlitDpf.MlitDpfConfig,
  msil:      { apiKey: process.env.MSIL_API_KEY || '' } as msil.MsilConfig,
  odpt:      { apiKey: process.env.ODPT_API_KEY || '' } as odpt.OdptConfig,
};

import type { ApiResponse } from './utils/http.js';

// ── Tool Metadata ──
type ToolCategory = 'statistics' | 'law' | 'economy' | 'geospatial' | 'disaster' | 'labor' | 'academic' | 'science' | 'health' | 'government' | 'catalog' | 'deprecated';

interface ToolMetadata {
  category: ToolCategory;
  tags: string[];
  exampleQueries: string[];
}

const TOOL_METADATA: Record<string, ToolMetadata> = {
  // Statistics
  estat_search: { category: 'statistics', tags: ['population', 'labor', 'macro', 'census', 'household'], exampleQueries: ['1970年以降の都道府県別人口推移', '国家公務員の超過勤務時間の統計', '県別GDP推移データ'] },
  estat_meta: { category: 'statistics', tags: ['metadata', 'table-info'], exampleQueries: ['統計表0003410379のメタデータ取得', '国勢調査の表構造確認'] },
  estat_data: { category: 'statistics', tags: ['data-download', 'time-series'], exampleQueries: ['統計表0003410379の全データ取得', '2020年国勢調査の東京都データ'] },
  dashboard_indicators: { category: 'statistics', tags: ['macro', 'regional', 'indicator'], exampleQueries: ['統計ダッシュボードの人口系指標一覧', '地域別経済指標の検索'] },
  dashboard_data: { category: 'statistics', tags: ['time-series', 'regional'], exampleQueries: ['指標A1101の時系列データ', '東京都の失業率推移'] },

  // RESAS (deprecated)
  resas_prefectures: { category: 'deprecated', tags: ['resas', 'master'], exampleQueries: [] },
  resas_cities: { category: 'deprecated', tags: ['resas', 'master'], exampleQueries: [] },
  resas_population: { category: 'deprecated', tags: ['resas', 'population'], exampleQueries: [] },
  resas_population_pyramid: { category: 'deprecated', tags: ['resas', 'population'], exampleQueries: [] },
  resas_industry: { category: 'deprecated', tags: ['resas', 'industry'], exampleQueries: [] },
  resas_tourism: { category: 'deprecated', tags: ['resas', 'tourism'], exampleQueries: [] },
  resas_finance: { category: 'deprecated', tags: ['resas', 'finance'], exampleQueries: [] },
  resas_patents: { category: 'deprecated', tags: ['resas', 'patent'], exampleQueries: [] },

  // Economy / Corporate
  houjin_search: { category: 'economy', tags: ['corporate', 'registry', 'legal-entity'], exampleQueries: ['法人番号1234567890123の情報取得', '株式会社○○の法人情報検索', '東京都千代田区の法人一覧'] },
  gbiz_search: { category: 'economy', tags: ['corporate', 'subsidy', 'finance'], exampleQueries: ['法人番号で企業情報検索', 'トヨタ自動車の補助金情報', '東京都の製造業企業リスト'] },
  gbiz_detail: { category: 'economy', tags: ['corporate', 'subsidy', 'patent', 'procurement'], exampleQueries: ['法人番号1234567890123の補助金受給履歴', '特定企業の特許情報取得', '調達情報の詳細'] },
  edinet_documents: { category: 'economy', tags: ['finance', 'disclosure', 'securities'], exampleQueries: ['2024年1月15日の有価証券報告書一覧', '特定日の開示書類検索'] },
  realestate_transactions: { category: 'economy', tags: ['real-estate', 'transaction', 'price'], exampleQueries: ['東京都千代田区の2023年Q1不動産取引', '大阪市の土地取引価格'] },
  realestate_landprice: { category: 'economy', tags: ['real-estate', 'land-price', 'appraisal'], exampleQueries: ['東京都中央区の地価公示データ', '2024年の標準地価格'] },

  // Law
  law_search: { category: 'law', tags: ['legislation', 'regulation'], exampleQueries: ['民法の検索', '労働基準法の条文取得', '会社法施行規則'] },
  law_data: { category: 'law', tags: ['legislation', 'full-text'], exampleQueries: ['民法の全文取得', '法令番号325AC0000000089の内容'] },
  law_keyword_search: { category: 'law', tags: ['legislation', 'keyword'], exampleQueries: ['ハラスメントに関する法令検索', '環境保護関連法規の全文検索'] },

  // National Transport / Infrastructure
  mlit_dpf_search: { category: 'geospatial', tags: ['infrastructure', 'transport', 'regional'], exampleQueries: ['道路に関するデータセット検索', '国土交通省の公共交通データ'] },
  mlit_dpf_catalog: { category: 'geospatial', tags: ['infrastructure', 'catalog'], exampleQueries: ['国交省データプラットフォームのカタログ一覧'] },

  // Open Data Catalogs
  opendata_search: { category: 'catalog', tags: ['open-data', 'ckan'], exampleQueries: ['防災に関するオープンデータ検索', '自治体公開データセット一覧'] },
  opendata_detail: { category: 'catalog', tags: ['open-data', 'ckan'], exampleQueries: ['データセットIDの詳細情報取得'] },
  geospatial_search: { category: 'catalog', tags: ['geospatial', 'gis', 'map'], exampleQueries: ['G空間情報センターで地図データ検索', '衛星画像データセット検索'] },
  geospatial_dataset: { category: 'catalog', tags: ['geospatial', 'gis'], exampleQueries: ['特定地理空間データセットの詳細取得'] },
  geospatial_organizations: { category: 'catalog', tags: ['geospatial', 'organization'], exampleQueries: ['G空間情報センター提供機関一覧'] },

  // Geospatial
  gsi_geocode: { category: 'geospatial', tags: ['geocoding', 'address', 'coordinates'], exampleQueries: ['東京都千代田区霞が関1-1-1の座標取得', '住所から緯度経度変換'] },
  gsi_reverse_geocode: { category: 'geospatial', tags: ['reverse-geocoding', 'coordinates'], exampleQueries: ['緯度35.6895 経度139.6917の住所取得', '座標から住所変換'] },
  geoshape_city: { category: 'geospatial', tags: ['boundary', 'geojson', 'municipality'], exampleQueries: ['千代田区の行政区域境界GeoJSON', '市区町村コード13101の境界データ'] },
  geoshape_pref: { category: 'geospatial', tags: ['boundary', 'geojson', 'prefecture'], exampleQueries: ['東京都の都道府県境界GeoJSON', '都道府県コード13の境界データ'] },

  // Disaster / Weather
  jma_forecast: { category: 'disaster', tags: ['weather', 'forecast'], exampleQueries: ['東京都の天気予報', '地域コード130000の気象情報'] },
  jma_overview: { category: 'disaster', tags: ['weather', 'overview'], exampleQueries: ['東京都の天気概況文', '気象庁の天気解説'] },
  jma_forecast_week: { category: 'disaster', tags: ['weather', 'forecast', 'weekly'], exampleQueries: ['東京都の週間天気予報', '1週間先までの気象予測'] },
  jma_typhoon: { category: 'disaster', tags: ['weather', 'typhoon', 'disaster'], exampleQueries: ['現在接近中の台風情報', '台風進路予測'] },
  jshis_hazard: { category: 'disaster', tags: ['earthquake', 'hazard', 'risk'], exampleQueries: ['東京駅周辺の地震ハザード情報', '緯度経度から震度予測'] },
  amedas_stations: { category: 'disaster', tags: ['weather', 'observation', 'station'], exampleQueries: ['AMeDAS観測所一覧', '気象観測地点マスター'] },
  amedas_data: { category: 'disaster', tags: ['weather', 'observation', 'real-time'], exampleQueries: ['東京の現在気温・降水量', '観測所44132のリアルタイムデータ'] },
  jma_earthquake: { category: 'disaster', tags: ['earthquake', 'seismic', 'real-time'], exampleQueries: ['最近の地震情報一覧', '地震速報リスト取得'] },
  jma_tsunami: { category: 'disaster', tags: ['tsunami', 'warning', 'real-time'], exampleQueries: ['津波情報・警報一覧', '現在の津波注意報'] },
  flood_depth: { category: 'disaster', tags: ['flood', 'hazard', 'inundation'], exampleQueries: ['東京都の浸水想定深さ', '緯度経度の洪水リスク'] },
  river_level: { category: 'disaster', tags: ['river', 'flood', 'real-time'], exampleQueries: ['利根川の現在水位', 'リアルタイム河川水位情報'] },
  traffic_volume: { category: 'geospatial', tags: ['traffic', 'transport', 'jartic'], exampleQueries: ['首都高速の交通量データ', '道路交通量WFS情報'] },

  // Labor
  hellowork_search: { category: 'labor', tags: ['job', 'employment', 'vacancy'], exampleQueries: ['東京都内の介護職求人検索', '地方公務員の事務職求人', '正社員エンジニア募集情報'] },
  safety_overseas: { category: 'government', tags: ['travel', 'safety', 'foreign'], exampleQueries: ['アメリカの渡航安全情報', '中国の危険情報・感染症情報'] },

  // Academic / Research
  ndl_search: { category: 'academic', tags: ['library', 'book', 'bibliography'], exampleQueries: ['国立国会図書館で統計学の書籍検索', 'ISBN検索'] },
  jstage_search: { category: 'academic', tags: ['journal', 'paper', 'research'], exampleQueries: ['J-STAGEで機械学習の論文検索', '著者名で学術論文検索'] },
  cinii_search: { category: 'academic', tags: ['journal', 'paper', 'research'], exampleQueries: ['CiNiiで量子コンピュータの論文検索', '大学紀要の検索'] },
  japansearch_search: { category: 'academic', tags: ['culture', 'heritage', 'archive'], exampleQueries: ['ジャパンサーチで浮世絵検索', '文化財・美術作品の横断検索'] },
  agriknowledge_search: { category: 'academic', tags: ['agriculture', 'research', 'paper'], exampleQueries: ['AgriKnowledgeで稲作技術の文献検索', '農業研究成果の検索'] },
  irdb_search: { category: 'academic', tags: ['repository', 'thesis', 'research', 'open-access'], exampleQueries: ['IRDBで大学紀要・博士論文を検索', '機関リポジトリの研究成果検索'] },
  researchmap_achievements: { category: 'academic', tags: ['researcher', 'profile', 'achievements'], exampleQueries: ['研究者の業績一覧取得', '論文・受賞歴の取得'] },

  // Science / Environment
  soramame_air: { category: 'science', tags: ['environment', 'air-quality', 'pollution'], exampleQueries: ['東京都の大気汚染データ', 'PM2.5の観測値取得'] },
  geology_legend: { category: 'science', tags: ['geology', 'map', 'legend'], exampleQueries: ['地質図の凡例情報取得', '地質記号の説明'] },
  geology_at_point: { category: 'science', tags: ['geology', 'map', 'soil'], exampleQueries: ['東京駅の地質情報', '緯度経度の地層データ'] },
  jaxa_collections: { category: 'science', tags: ['satellite', 'earth-observation', 'jaxa'], exampleQueries: ['JAXA衛星データコレクション一覧', '地球観測衛星データセット'] },

  // Health / Medical
  ndb_inspection_stats: { category: 'health', tags: ['health', 'medical', 'inspection', 'statistics'], exampleQueries: ['東京都のBMI分布データ', '40-44歳男性の血圧統計', '二次医療圏別のHbA1c分布'] },
  ndb_items: { category: 'health', tags: ['health', 'medical', 'master'], exampleQueries: ['NDB検査項目一覧取得', '特定健診で取得可能な項目'] },
  ndb_areas: { category: 'health', tags: ['health', 'medical', 'master', 'regional'], exampleQueries: ['都道府県一覧取得', '二次医療圏一覧取得'] },
  ndb_range_labels: { category: 'health', tags: ['health', 'medical', 'metadata'], exampleQueries: ['BMIの範囲ラベル取得', '血圧の判定基準取得'] },
  ndb_hub_proxy: { category: 'health', tags: ['health', 'medical', 'external-mcp'], exampleQueries: ['NDB Hubで東京都のBMI分布を自然言語検索', '外部MCPエンドポイント経由でのデータ取得'] },

  // Economy / Finance (BOJ)
  boj_timeseries: { category: 'economy', tags: ['finance', 'macro', 'timeseries', 'monetary'], exampleQueries: ['M2マネーストック推移取得', 'USD/JPY為替レート時系列', '企業物価指数の推移'] },
  boj_major_statistics: { category: 'economy', tags: ['finance', 'macro', 'master'], exampleQueries: ['日銀主要統計コード一覧', 'マネタリーベース系列コード'] },

  // Government / Parliament
  kokkai_speeches: { category: 'government', tags: ['parliament', 'speech', 'debate'], exampleQueries: ['国会会議録で環境問題の発言検索', '特定議員の発言履歴'] },
  kokkai_meetings: { category: 'government', tags: ['parliament', 'meeting', 'session'], exampleQueries: ['2023年通常国会の会議一覧', '予算委員会の開催履歴'] },
  kkj_search: { category: 'government', tags: ['procurement', 'tender', 'sme'], exampleQueries: ['官公需情報で入札案件検索', '中小企業向け調達情報'] },

  // 3D City / Public Comment
  plateau_datasets: { category: 'geospatial', tags: ['3d-city', 'building', 'urban-planning', 'citygml'], exampleQueries: ['PLATEAUの東京都3D都市モデル検索', '建物LOD2データセット一覧'] },
  plateau_citygml: { category: 'geospatial', tags: ['3d-city', 'mesh', 'citygml'], exampleQueries: ['メッシュコード53394525のCityGML情報', '3D都市モデルのメッシュ検索'] },
  pubcomment_list: { category: 'government', tags: ['public-comment', 'policy', 'regulation'], exampleQueries: ['パブリックコメント意見募集中案件一覧', '環境省のパブコメ結果公示'] },
  mirasapo_search: { category: 'economy', tags: ['sme', 'case-study', 'subsidy', 'support'], exampleQueries: ['IT導入補助金の成功事例検索', '東京都の中小企業DX事例'] },
  mirasapo_detail: { category: 'economy', tags: ['sme', 'case-study', 'detail'], exampleQueries: ['事例ID指定で詳細取得'] },
  mirasapo_categories: { category: 'economy', tags: ['sme', 'master', 'category'], exampleQueries: ['業種分類マスタ取得', '支援施策カテゴリ一覧'] },
  mirasapo_regions: { category: 'economy', tags: ['sme', 'master', 'region'], exampleQueries: ['地方区分・都道府県マスタ取得'] },

  // Geospatial (MSIL / ODPT - Placeholder)
  msil_layers: { category: 'geospatial', tags: ['marine', 'ocean', 'gis', 'placeholder'], exampleQueries: ['海しる利用可能レイヤ一覧'] },
  msil_features: { category: 'geospatial', tags: ['marine', 'ocean', 'geojson', 'placeholder'], exampleQueries: ['海洋空間情報GeoJSON取得'] },
  odpt_railway_timetable: { category: 'geospatial', tags: ['transport', 'railway', 'timetable', 'placeholder'], exampleQueries: ['東京メトロ銀座線の時刻表'] },
  odpt_bus_timetable: { category: 'geospatial', tags: ['transport', 'bus', 'timetable', 'placeholder'], exampleQueries: ['都営バスの時刻表'] },

  // Scenario Tools
  scenario_regional_health_economy: { category: 'catalog', tags: ['scenario', 'composite', 'health', 'economy'], exampleQueries: ['東京都の医療統計と経済指標を一括取得', '地域の健康と経済の複合分析'] },
  scenario_labor_demand_supply: { category: 'catalog', tags: ['scenario', 'composite', 'labor', 'employment'], exampleQueries: ['都道府県の労働需給バランス分析', '求人と就業者数の比較'] },
  scenario_corporate_intelligence: { category: 'catalog', tags: ['scenario', 'composite', 'corporate', 'finance'], exampleQueries: ['トヨタ自動車の法人情報・補助金・開示書類を一括取得', '企業の総合情報調査'] },
  scenario_disaster_risk_assessment: { category: 'catalog', tags: ['scenario', 'composite', 'disaster', 'risk'], exampleQueries: ['東京都千代田区霞が関の災害リスク評価', '特定地点の地震・浸水・河川リスク'] },
  scenario_academic_trend: { category: 'catalog', tags: ['scenario', 'composite', 'academic', 'research'], exampleQueries: ['AI研究の学術トレンド分析', '環境問題の横断文献検索'] },
  scenario_academic_trend_by_topics: { category: 'catalog', tags: ['scenario', 'composite', 'academic', 'multi-topic'], exampleQueries: ['複数テーマの研究トレンド比較', 'AI・IoT・量子の分野別文献数'] },
  scenario_realestate_demographics: { category: 'catalog', tags: ['scenario', 'composite', 'realestate', 'demographics'], exampleQueries: ['東京都の不動産市場と人口動態', '地価と人口の相関分析'] },
  scenario_regional_economy_full: { category: 'catalog', tags: ['scenario', 'composite', 'economy', 'comprehensive'], exampleQueries: ['東京都の地域経済総合分析', 'GDP・産業・インフラの多角的評価'] },
  scenario_national_economy_summary: { category: 'catalog', tags: ['scenario', 'composite', 'economy', 'national'], exampleQueries: ['全国経済サマリー取得', '47都道府県の経済指標一覧'] },

  // Catalog / Meta
  gov_api_catalog: { category: 'catalog', tags: ['meta', 'api-list'], exampleQueries: ['利用可能なAPI一覧確認', 'APIキー設定状況の確認'] },
  gov_cross_search: { category: 'catalog', tags: ['meta', 'cross-search'], exampleQueries: ['複数APIで横断検索', '環境というキーワードで全API検索'] },
};

function need(name: string, val: string) {
  return val ? '' : `⚠️ ${name} が未設定です。環境変数を確認してください。`;
}
function json(o: any) { return JSON.stringify(o, null, 2); }
function txt(s: string) { return { content: [{ type: 'text' as const, text: s }] }; }

/** ApiResponseを整形してMCPレスポンスに変換 */
function formatResponse(res: ApiResponse): ReturnType<typeof txt> {
  if (!res.success) {
    return txt(`❌ エラー [${res.source}]\n${res.error}\n\n取得時刻: ${res.timestamp}`);
  }
  return txt(`✅ ${res.source}\n\n${json(res.data)}\n\n取得時刻: ${res.timestamp}`);
}

// ── Server ──
const server = new McpServer({ name: 'japan-gov-mcp', version: '1.0.0' });

// ════════════════════════════════════════════════
//  Tier 1: 統計・データ基盤
// ════════════════════════════════════════════════

server.tool('estat_search',
  '【e-Stat】政府統計を横断検索。国勢調査/GDP/CPI/家計調査等、全府省の統計表をキーワード・分野・調査年で検索',
  {
    searchWord: z.string().optional().describe('検索キーワード'),
    surveyYears: z.string().optional().describe('調査年 YYYY or YYYYMM-YYYYMM'),
    statsField: z.string().optional().describe('統計分野コード 2桁:大分類 4桁:小分類'),
    statsCode: z.string().optional().describe('政府統計コード 5桁:機関 8桁:統計'),
    limit: z.number().optional().describe('取得件数（デフォルト20）'),
    lang: z.string().optional().describe('J:日本語 E:英語'),
  },
  async (p) => {
    const e = need('ESTAT_APP_ID', C.estat.appId); if (e) return txt(e);
    return formatResponse(await estat.getStatsList(C.estat, { ...p, limit: p.limit || 20 }));
  }
);

server.tool('estat_meta',
  '【e-Stat】統計表のメタ情報（項目定義・分類コード一覧）を取得',
  {
    statsDataId: z.string().describe('統計表ID'),
    lang: z.string().optional().describe('言語'),
  },
  async (p) => {
    const e = need('ESTAT_APP_ID', C.estat.appId); if (e) return txt(e);
    return formatResponse(await estat.getMetaInfo(C.estat, p));
  }
);

server.tool('estat_data',
  '【e-Stat】統計データ取得。時間・地域・分類で絞込可能',
  {
    statsDataId: z.string().describe('統計表ID'),
    cdTime: z.string().optional().describe('時間コード'),
    cdArea: z.string().optional().describe('地域コード'),
    cdCat01: z.string().optional().describe('分類事項01'),
    cdCat02: z.string().optional().describe('分類事項02'),
    startPosition: z.number().optional().describe('取得開始位置'),
    limit: z.number().optional().describe('取得件数（最大100000）'),
    lang: z.string().optional().describe('言語'),
  },
  async (p) => {
    const e = need('ESTAT_APP_ID', C.estat.appId); if (e) return txt(e);
    return formatResponse(await estat.getStatsData(C.estat, p));
  }
);

// ── RESAS: 2025-03-24 提供終了 (deprecated) ──
// 代替: 地域統計→estat_search/dashboard_data, 地理情報→mlit_dpf_search, 地価→realestate_landprice

server.tool('resas_prefectures',
  '【RESAS】⚠️ DEPRECATED: RESAS APIは2025-03-24に提供終了。代替: estat_search（地域統計）またはdashboard_data（統計ダッシュボード）を使用すること',
  {},
  async () => formatResponse(await resas.getPrefectures(C.resas))
);

server.tool('resas_cities',
  '【RESAS】⚠️ DEPRECATED: RESAS APIは2025-03-24に提供終了。代替: estat_search（市区町村別統計）またはmlit_dpf_search（地域データ）を使用すること',
  { prefCode: z.number().describe('都道府県コード 1-47') },
  async (p) => formatResponse(await resas.getCities(C.resas, p))
);

server.tool('resas_population',
  '【RESAS】⚠️ DEPRECATED: RESAS APIは2025-03-24に提供終了。代替: estat_search（人口統計・統計コード00200521）またはdashboard_data（人口系指標）を使用すること',
  {
    prefCode: z.number().describe('都道府県コード'),
    cityCode: z.string().describe('市区町村コード（"-"で全体）'),
  },
  async (p) => formatResponse(await resas.getPopulation(C.resas, p))
);

server.tool('resas_population_pyramid',
  '【RESAS】⚠️ DEPRECATED: RESAS APIは2025-03-24に提供終了。代替: estat_search（国勢調査・統計コード00200521）を使用すること',
  {
    prefCode: z.number().describe('都道府県コード'),
    cityCode: z.string().describe('市区町村コード'),
    yearLeft: z.number().describe('比較年（左）'),
    yearRight: z.number().describe('比較年（右）'),
  },
  async (p) => formatResponse(await resas.getPopulationPyramid(C.resas, p))
);

server.tool('resas_industry',
  '【RESAS】⚠️ DEPRECATED: RESAS APIは2025-03-24に提供終了。代替: estat_search（経済センサス・工業統計）またはmlit_dpf_search（産業データ）を使用すること',
  {
    prefCode: z.number().describe('都道府県コード'),
    cityCode: z.string().describe('市区町村コード'),
    sicCode: z.string().describe('産業大分類コード'),
    simcCode: z.string().describe('産業中分類コード'),
  },
  async (p) => formatResponse(await resas.getIndustryPower(C.resas, p))
);

server.tool('resas_tourism',
  '【RESAS】⚠️ DEPRECATED: RESAS APIは2025-03-24に提供終了。代替: estat_search（観光統計）またはjapansearch_search（文化観光情報）を使用すること',
  {
    prefCode: z.number().describe('都道府県コード'),
    purpose: z.number().optional().describe('1:観光 2:業務'),
  },
  async (p) => formatResponse(await resas.getTourismForeigners(C.resas, p))
);

server.tool('resas_finance',
  '【RESAS】⚠️ DEPRECATED: RESAS APIは2025-03-24に提供終了。代替: dashboard_data（地方財政指標）またはestat_search（地方財政統計）を使用すること',
  {
    prefCode: z.number().describe('都道府県コード'),
    cityCode: z.string().describe('市区町村コード'),
    matter: z.number().describe('1:歳入 2:歳出 3:目的別歳出'),
  },
  async (p) => formatResponse(await resas.getMunicipalFinance(C.resas, p))
);

server.tool('resas_patents',
  '【RESAS】⚠️ DEPRECATED: RESAS APIは2025-03-24に提供終了。代替: jstage_search（学術特許検索）またはcinii_search（CiNii特許情報）を使用すること',
  {
    prefCode: z.number().describe('都道府県コード'),
    cityCode: z.string().describe('市区町村コード'),
  },
  async (p) => formatResponse(await resas.getPatents(C.resas, p))
);

server.tool('dashboard_indicators',
  '【統計ダッシュボード】約6,000系列の統計指標を検索（登録不要）',
  { indicatorCode: z.string().optional().describe('指標コード') },
  async (p) => formatResponse(await getDashboardIndicators(p))
);

server.tool('dashboard_data',
  '【統計ダッシュボード】指標の時系列×地域データ取得（登録不要）',
  {
    indicatorCode: z.string().describe('指標コード'),
    regionCode: z.string().optional().describe('地域コード'),
    timeCdFrom: z.string().optional().describe('開始時点'),
    timeCdTo: z.string().optional().describe('終了時点'),
  },
  async (p) => formatResponse(await getDashboardData(p))
);

// ════════════════════════════════════════════════
//  Tier 2: 法人・企業・金融
// ════════════════════════════════════════════════

server.tool('houjin_search',
  '【国税庁】法人番号検索。法人番号13桁 or 法人名・所在地で検索。法人番号・商号・所在地等の基本情報を取得（HOUJIN_APP_ID必須）',
  {
    name: z.string().optional().describe('法人名（部分一致）'),
    number: z.string().optional().describe('法人番号（13桁）'),
    address: z.string().optional().describe('所在地（部分一致）'),
    kind: z.string().optional().describe('01:国機関 02:地公体 03:登記法人 04:外国会社'),
    history: z.boolean().optional().describe('true: 変更履歴も含める（法人番号検索時のみ有効）'),
  },
  async (p) => {
    const e = need('HOUJIN_APP_ID', C.houjin.appId); if (e) return txt(e);
    return formatResponse(await houjin.searchHoujin(C.houjin, p));
  }
);

server.tool('gbiz_search',
  '【gBizINFO/経産省】法人の横断情報検索。法人番号または法人名・都道府県で企業情報を検索。name/corporateNumberのいずれか必須（GBIZ_TOKEN必須）',
  {
    name: z.string().optional().describe('法人名（部分一致）'),
    corporateNumber: z.string().optional().describe('法人番号13桁'),
    prefectureCode: z.string().optional().describe('都道府県コード'),
    page: z.number().optional().describe('ページ番号'),
  },
  async (p) => {
    const e = need('GBIZ_TOKEN', C.gbiz.token); if (e) return txt(e);
    return formatResponse(await gbiz.searchCorporation(C.gbiz, p));
  }
);

server.tool('gbiz_detail',
  '【gBizINFO/経産省】法人番号で詳細情報取得。届出認定・補助金・特許・調達・財務・表彰・職場情報の7種別（GBIZ_TOKEN必須）',
  {
    corporateNumber: z.string().describe('法人番号13桁'),
    infoType: z.enum([
      'certification', 'subsidy', 'patent', 'procurement',
      'finance', 'commendation', 'workplace'
    ]).describe('情報種別: certification=届出認定 subsidy=補助金 patent=特許 procurement=調達 finance=財務 commendation=表彰 workplace=職場'),
  },
  async (p) => {
    const e = need('GBIZ_TOKEN', C.gbiz.token); if (e) return txt(e);
    const fn: Record<string, (c: gbiz.GbizConfig, n: string) => Promise<any>> = {
      certification: gbiz.getCertification, subsidy: gbiz.getSubsidy,
      patent: gbiz.getPatent, procurement: gbiz.getProcurement,
      finance: gbiz.getFinance, commendation: gbiz.getCommendation,
      workplace: gbiz.getWorkplace,
    };
    return formatResponse(await fn[p.infoType](C.gbiz, p.corporateNumber));
  }
);

server.tool('edinet_documents',
  '【EDINET/金融庁】指定日の開示書類一覧（有報/四半報等）',
  {
    date: z.string().describe('YYYY-MM-DD'),
    type: z.number().optional().describe('1:メタのみ 2:書類一覧+メタ'),
  },
  async (p) => {
    const e = need('EDINET_API_KEY', C.edinet.apiKey); if (e) return txt(e);
    return formatResponse(await edinet.getDocumentList(C.edinet, p));
  }
);

// ════════════════════════════════════════════════
//  Tier 3: 法令
// ════════════════════════════════════════════════

server.tool('law_search',
  '【法令API V2】法令一覧取得（JSON, APIキー不要）',
  {
    category: z.number().optional().describe('1:憲法 2:法律 3:政令 4:勅令 5:府省令 6:規則'),
    offset: z.number().optional().describe('取得開始オフセット（デフォルト0）'),
    limit: z.number().optional().describe('取得件数（デフォルト20）'),
  },
  async (p) => formatResponse(await searchLaws(p))
);

server.tool('law_data',
  '【法令API V2】法令本文取得（JSON, APIキー不要）',
  {
    lawId: z.string().describe('法令ID or 法令番号 (例: 129AC0000000089)'),
  },
  async (p) => formatResponse(await getLawData(p))
);

server.tool('law_keyword_search',
  '【法令API V2】キーワードで法令を検索（APIキー不要）',
  {
    keyword: z.string().describe('検索キーワード'),
    offset: z.number().optional().describe('取得開始オフセット（デフォルト0）'),
    limit: z.number().optional().describe('取得件数（デフォルト20）'),
  },
  async (p) => formatResponse(await searchLawsByKeyword(p))
);

// ════════════════════════════════════════════════
//  Tier 4: セクター別
// ════════════════════════════════════════════════

server.tool('realestate_transactions',
  '【国土交通省】不動産取引価格情報（APIキー必要）',
  {
    year: z.string().describe('開始 YYYYQ (20231=2023年Q1)'),
    quarter: z.string().describe('終了 YYYYQ'),
    area: z.string().optional().describe('都道府県コード'),
    city: z.string().optional().describe('市区町村コード'),
  },
  async (p) => {
    const e = need('REALESTATE_API_KEY', C.realestate.apiKey); if (e) return txt(e);
    return formatResponse(await getRealEstateTransactions(C.realestate, p));
  }
);

server.tool('realestate_landprice',
  '【国土交通省】地価公示・地価調査（APIキー必要）',
  {
    year: z.string().describe('年 YYYY'),
    area: z.string().optional().describe('都道府県コード'),
    city: z.string().optional().describe('市区町村コード'),
  },
  async (p) => {
    const e = need('REALESTATE_API_KEY', C.realestate.apiKey); if (e) return txt(e);
    return formatResponse(await getLandPrice(C.realestate, p));
  }
);

server.tool('mlit_dpf_search',
  '【国交省DPF】インフラデータ横断検索（橋梁・道路・河川等）',
  {
    term: z.string().describe('検索キーワード'),
    first: z.number().optional().describe('開始位置（デフォルト0）'),
    size: z.number().optional().describe('取得件数（デフォルト10、最大100）'),
  },
  async (p) => {
    const e = need('MLIT_DPF_API_KEY', C.mlitDpf.apiKey); if (e) return txt(e);
    return formatResponse(await mlitDpf.searchMlitDpf(C.mlitDpf, p));
  }
);

server.tool('mlit_dpf_catalog',
  '【国交省DPF】データカタログ詳細取得',
  {
    id: z.string().describe('カタログID'),
  },
  async (p) => {
    const e = need('MLIT_DPF_API_KEY', C.mlitDpf.apiKey); if (e) return txt(e);
    return formatResponse(await mlitDpf.getMlitDpfCatalog(C.mlitDpf, p));
  }
);

server.tool('opendata_search',
  '【デジタル庁】data.go.jp オープンデータ横断検索（APIキー不要）',
  {
    q: z.string().optional().describe('検索クエリ'),
    fq: z.string().optional().describe('フィルタ（CKAN形式）'),
    rows: z.number().optional().describe('取得件数'),
  },
  async (p) => formatResponse(await searchDatasets(p))
);

server.tool('opendata_detail',
  '【デジタル庁】オープンデータ詳細・ダウンロードURL',
  { id: z.string().describe('データセットID') },
  async (p) => formatResponse(await getDatasetDetail(p))
);

server.tool('geospatial_search',
  '【G空間情報センター】地理空間データ横断検索',
  {
    q: z.string().optional().describe('検索クエリ'),
    fq: z.string().optional().describe('フィルタ（CKAN形式）'),
    rows: z.number().optional().describe('取得件数'),
    start: z.number().optional().describe('開始位置'),
    sort: z.string().optional().describe('ソート順'),
  },
  async (p) => formatResponse(await geospatial.searchGeospatial(p))
);

server.tool('geospatial_dataset',
  '【G空間情報センター】データセット詳細',
  { id: z.string().describe('データセットID') },
  async (p) => formatResponse(await geospatial.getGeospatialDataset(p))
);

server.tool('geospatial_organizations',
  '【G空間情報センター】組織一覧',
  {},
  async () => formatResponse(await geospatial.listGeospatialOrganizations())
);

server.tool('safety_overseas',
  '【外務省】海外安全情報（XML, APIキー不要）',
  {
    regionCode: z.string().optional().describe('地域コード: 10=アジア, 20=大洋州, 30=北米, 31=欧州, 33=中南米, 40=中東, 50=アフリカ'),
    countryCode: z.string().optional().describe('国番号コード: 0086=中国, 0001=米国 等'),
  },
  async (p) => formatResponse(await getSafetyInfo(p))
);

server.tool('hellowork_search',
  '【ハローワーク/厚労省】求人情報検索。キーワード・都道府県・職種・雇用形態で求人を検索（HELLOWORK_API_KEY必須）',
  {
    keyword: z.string().optional().describe('検索キーワード（職種名・スキル等）'),
    prefCode: z.string().optional().describe('都道府県コード（例: 13=東京都）'),
    occupation: z.string().optional().describe('職種コード'),
    employment: z.string().optional().describe('1:正社員 2:パート・アルバイト'),
    page: z.number().optional().describe('ページ番号（デフォルト: 1）'),
  },
  async (p) => {
    const e = need('HELLOWORK_API_KEY', C.hellowork.apiKey); if (e) return txt(e);
    return formatResponse(await searchJobs(C.hellowork, p));
  }
);

// 文化遺産オンライン: 公開APIなし → 削除
// 文化遺産データは japansearch_search で検索可能

server.tool('jma_forecast',
  '【気象庁】天気予報取得（APIキー不要）',
  { areaCode: z.string().describe('地域コード 6桁（例: 130000=東京）') },
  async (p) => formatResponse(await getForecast(p))
);

server.tool('jma_overview',
  '【気象庁】天気概況取得（APIキー不要）',
  { areaCode: z.string().describe('地域コード 6桁（例: 130000=東京）') },
  async (p) => formatResponse(await getForecastOverview(p))
);

server.tool('jma_forecast_week',
  '【気象庁】週間天気予報（7日間）取得',
  { areaCode: z.string().describe('地域コード 6桁（例: 130000=東京）') },
  async (p) => formatResponse(await getForecastWeekly(p))
);

server.tool('jma_typhoon',
  '【気象庁】現在の台風情報・進路予報取得',
  {},
  async () => formatResponse(await getTyphoonInfo())
);

server.tool('jshis_hazard',
  '【防災科研】地震ハザード情報取得（APIキー不要）',
  {
    lat: z.number().describe('緯度 -90〜90'),
    lon: z.number().describe('経度 -180〜180'),
  },
  async (p) => formatResponse(await getSeismicHazard(p))
);

server.tool('amedas_stations',
  '【気象庁】アメダス全観測所一覧',
  {},
  async () => formatResponse(await getAmedasStations())
);

server.tool('amedas_data',
  '【気象庁】アメダス観測データ取得',
  {
    pointId: z.string().describe('観測所ID'),
    date: z.string().optional().describe('観測時刻 YYYYMMDDHH（省略時は最新）'),
  },
  async (p) => formatResponse(await getAmedasData(p))
);

server.tool('jma_earthquake',
  '【気象庁】最近の地震情報一覧取得（APIキー不要）',
  {},
  async () => formatResponse(await getEarthquakeList())
);

server.tool('jma_tsunami',
  '【気象庁】津波情報・警報一覧取得（APIキー不要）',
  {},
  async () => formatResponse(await getTsunamiList())
);

server.tool('flood_depth',
  '【浸水ナビ/国土地理院】指定座標の破堤点・最大洪水浸水深を取得。河川近くの座標で破堤シミュレーション情報が得られる',
  {
    lat: z.number().describe('緯度 24〜46'),
    lon: z.number().describe('経度 122〜154'),
  },
  async (p) => formatResponse(await disaster.getFloodDepth(p))
);

server.tool('river_level',
  '【河川水位】リアルタイム河川水位情報取得',
  {
    stationId: z.string().describe('観測所ID'),
  },
  async (p) => formatResponse(await disaster.getRiverLevel(p))
);

server.tool('traffic_volume',
  '【国交省/JARTIC】指定地点周辺の道路交通量データ取得（WFS 2.0 CSV形式）。常時観測点の1時間or5分間交通量',
  {
    lat: z.number().describe('緯度 -90〜90'),
    lon: z.number().describe('経度 -180〜180'),
    radius: z.number().optional().describe('検索半径（m、デフォルト5000）'),
    count: z.number().optional().describe('取得件数（デフォルト10）'),
    interval: z.enum(['1h', '5m']).optional().describe('集計間隔: 1h=1時間（デフォルト） 5m=5分間'),
  },
  async (p) => formatResponse(await disaster.getTrafficVolume(p))
);

server.tool('gsi_geocode',
  '【国土地理院】住所から緯度経度を検索（APIキー不要）',
  { address: z.string().describe('住所') },
  async (p) => formatResponse(await geocode(p))
);

server.tool('gsi_reverse_geocode',
  '【国土地理院】緯度経度から住所を取得（APIキー不要）',
  {
    lat: z.number().describe('緯度 -90〜90'),
    lon: z.number().describe('経度 -180〜180'),
  },
  async (p) => formatResponse(await reverseGeocode(p))
);

server.tool('geoshape_city',
  '【Geoshape】市区町村境界GeoJSON取得',
  { code: z.string().describe('行政区域コード 5桁') },
  async (p) => formatResponse(await geoshape.getCityBoundary(p))
);

server.tool('geoshape_pref',
  '【Geoshape】都道府県境界GeoJSON取得',
  { prefCode: z.string().describe('都道府県コード 2桁') },
  async (p) => formatResponse(await geoshape.getPrefBoundary(p))
);

// ABRジオコーダー: 公開APIなし（セルフホスト専用） → 削除
// 住所→緯度経度は gsi_geocode で代替

server.tool('ndl_search',
  '【国立国会図書館】書籍・雑誌・論文を横断検索（APIキー不要）',
  {
    query: z.string().describe('検索キーワード'),
    count: z.number().optional().describe('取得件数（デフォルト20）'),
  },
  async (p) => formatResponse(await searchNdl(p))
);

server.tool('jstage_search',
  '【J-STAGE】日本の学術論文を検索（APIキー不要）',
  {
    query: z.string().describe('検索キーワード'),
    count: z.number().optional().describe('取得件数（デフォルト20）'),
    start: z.number().optional().describe('開始位置（デフォルト1）'),
    pubyearfrom: z.string().optional().describe('公開年From（YYYY）'),
    pubyearto: z.string().optional().describe('公開年To（YYYY）'),
  },
  async (p) => formatResponse(await searchJstage(p))
);

server.tool('cinii_search',
  '【CiNii Research/NII】国内学術論文・研究データ横断検索',
  {
    query: z.string().describe('検索キーワード'),
    count: z.number().optional().describe('取得件数（デフォルト20）'),
  },
  async (p) => formatResponse(await searchCinii({ ...p, count: p.count || 20 }))
);

server.tool('japansearch_search',
  '【ジャパンサーチ】デジタルアーカイブ横断検索（APIキー不要）',
  {
    keyword: z.string().describe('検索キーワード'),
    size: z.number().optional().describe('取得件数（デフォルト20）'),
    from: z.number().optional().describe('開始オフセット（デフォルト0）'),
  },
  async (p) => formatResponse(await searchJapanSearch(p))
);

server.tool('kokkai_speeches',
  '【国立国会図書館】国会会議録の発言検索（本文あり, APIキー不要）',
  {
    any: z.string().optional().describe('キーワード（AND検索）'),
    speaker: z.string().optional().describe('発言者名'),
    nameOfHouse: z.string().optional().describe('院（衆議院/参議院/両院）'),
    nameOfMeeting: z.string().optional().describe('会議名'),
    from: z.string().optional().describe('開催日From（YYYY-MM-DD）'),
    until: z.string().optional().describe('開催日To（YYYY-MM-DD）'),
    maximumRecords: z.number().optional().describe('取得件数（デフォルト20）'),
    startRecord: z.number().optional().describe('開始位置（デフォルト1）'),
    recordPacking: z.string().optional().describe('レスポンス形式（json固定推奨）'),
  },
  async (p) => formatResponse(await searchKokkaiSpeeches(p))
);

server.tool('kokkai_meetings',
  '【国立国会図書館】国会会議録の会議一覧検索（本文なし, APIキー不要）',
  {
    any: z.string().optional().describe('キーワード（AND検索）'),
    speaker: z.string().optional().describe('発言者名'),
    nameOfHouse: z.string().optional().describe('院（衆議院/参議院/両院）'),
    nameOfMeeting: z.string().optional().describe('会議名'),
    from: z.string().optional().describe('開催日From（YYYY-MM-DD）'),
    until: z.string().optional().describe('開催日To（YYYY-MM-DD）'),
    maximumRecords: z.number().optional().describe('取得件数（デフォルト20）'),
    startRecord: z.number().optional().describe('開始位置（デフォルト1）'),
    recordPacking: z.string().optional().describe('レスポンス形式（json固定推奨）'),
  },
  async (p) => formatResponse(await searchKokkaiMeetings(p))
);

server.tool('kkj_search',
  '【中小企業庁】官公需情報ポータルの入札・調達案件検索（XML, APIキー不要）',
  {
    Query: z.string().optional().describe('キーワード'),
    Project_Name: z.string().optional().describe('入札件名'),
    Organization_Name: z.string().optional().describe('機関名'),
    CFT_Issue_Date: z.string().optional().describe('公告日（期間 YYYY-MM-DD/YYYY-MM-DD）'),
    Tender_Submission_Deadline: z.string().optional().describe('入札締切日（期間 YYYY-MM-DD/YYYY-MM-DD）'),
    Area: z.string().optional().describe('地域'),
    Count: z.number().optional().describe('取得件数（最大1000）'),
    Start: z.number().optional().describe('開始位置（デフォルト1）'),
  },
  async (p) => formatResponse(await searchKkj(p))
);

server.tool('soramame_air',
  '【環境省】大気汚染データ検索（そらまめくん）。都道府県コード指定でPM2.5・OX・NO2等の時系列データを取得（APIキー不要）',
  {
    prefCode: z.string().optional().describe('都道府県コード01-47（デフォルト: 13=東京）'),
    startYM: z.string().optional().describe('開始年月 YYYYMM（デフォルト: 今月）'),
    endYM: z.string().optional().describe('終了年月 YYYYMM'),
    stationCode: z.string().optional().describe('測定局コード（カンマ区切りで複数可）'),
    dataItems: z.string().optional().describe('データ項目（カンマ区切り: PM2_5,OX,NO2,SO2,CO,SPM,TEMP 等）'),
  },
  async (p) => formatResponse(await getAirQuality(p))
);

server.tool('geology_legend',
  '【産総研】シームレス地質図 凡例一覧（APIキー不要）',
  {},
  async () => formatResponse(await getGeologyLegend())
);

server.tool('geology_at_point',
  '【産総研】指定地点の地質情報取得（APIキー不要）',
  {
    lat: z.number().describe('緯度 -90〜90'),
    lon: z.number().describe('経度 -180〜180'),
  },
  async (p) => formatResponse(await getGeologyAtPoint(p))
);

server.tool('jaxa_collections',
  '【JAXA】衛星観測データコレクション一覧（APIキー不要）',
  { limit: z.number().optional().describe('取得件数（デフォルト20）') },
  async (p) => formatResponse(await getJaxaCollections(p))
);

server.tool('agriknowledge_search',
  '【農研機構】農業技術・試験研究成果を検索',
  {
    query: z.string().describe('検索キーワード'),
    count: z.number().optional().describe('取得件数（デフォルト20）'),
  },
  async (p) => formatResponse(await searchAgriKnowledge({ ...p, count: p.count || 20 }))
);

server.tool('irdb_search',
  '【IRDB/NII】学術機関リポジトリの研究成果（紀要・博士論文等）を横断検索（APIキー不要）',
  {
    query: z.string().optional().describe('キーワード'),
    title: z.string().optional().describe('タイトル'),
    author: z.string().optional().describe('著者名'),
    count: z.number().optional().describe('取得件数（デフォルト20）'),
  },
  async (p) => formatResponse(await searchIrdb(p))
);

server.tool('researchmap_achievements',
  '【researchmap/JST】研究者の業績情報（論文・受賞・研究分野等）取得（APIキー不要）',
  {
    permalink: z.string().describe('研究者パーマリンク（例: "SatoshiMatsuokaHPC"）'),
    achievementType: z.string().describe('業績種別: published_papers, presentations, research_projects, awards, misc, books_etc, research_areas, works'),
    limit: z.number().optional().describe('取得件数'),
    start: z.number().optional().describe('開始位置'),
  },
  async (p) => formatResponse(await getResearcherAchievements(p))
);

server.tool('plateau_datasets',
  '【PLATEAU/国交省】3D都市モデルデータセット検索。都道府県・市区町村・データ種別で絞込可能（APIキー不要）',
  {
    prefecture: z.string().optional().describe('都道府県名（例: "東京都"）'),
    city: z.string().optional().describe('市区町村名（例: "千代田区"）'),
    type: z.string().optional().describe('データ種別（例: "建築物", "道路"）'),
  },
  async (p) => formatResponse(await searchPlateauDatasets(p))
);

server.tool('plateau_citygml',
  '【PLATEAU/国交省】メッシュコード指定でCityGML 3D都市モデル情報取得（APIキー不要）',
  {
    meshCode: z.string().describe('8桁メッシュコード（例: "53394525"）'),
  },
  async (p) => formatResponse(await getPlateauCitygml(p))
);

server.tool('pubcomment_list',
  '【e-Gov】パブリックコメント（意見募集/結果公示）RSS取得（APIキー不要）',
  {
    type: z.enum(['list', 'result']).optional().describe('list=意見募集中 result=結果公示（デフォルト: list）'),
    categoryCode: z.string().optional().describe('カテゴリコード10桁（例: "0000000047"=環境保全）'),
  },
  async (p) => formatResponse(await getPublicComments(p))
);

server.tool('mirasapo_search',
  '【ミラサポplus/中小企業庁】中小企業の成功事例をキーワード・業種・地域で検索（APIキー不要）',
  {
    keywords: z.string().optional().describe('検索キーワード（例: "IT導入", "DX"）'),
    prefecture: z.string().optional().describe('都道府県名（例: "東京都"）'),
    industryCategory: z.string().optional().describe('業種カテゴリID（mirasapo_categoriesで取得）'),
    purposeCategory: z.string().optional().describe('課題カテゴリID（1:販路開拓 3:IT化 5:人材 等）'),
    sort: z.string().optional().describe('ソート: timestamp, popularity, number, update, name'),
    order: z.string().optional().describe('順序: asc or desc'),
    limit: z.number().optional().describe('取得件数（1-100, デフォルト10）'),
    offset: z.number().optional().describe('開始位置'),
  },
  async (p) => formatResponse(await mirasapo.searchCaseStudies(p))
);

server.tool('mirasapo_detail',
  '【ミラサポplus/中小企業庁】事例IDで詳細取得（背景・課題・成果・連絡先等）（APIキー不要）',
  {
    id: z.string().describe('事例ID'),
  },
  async (p) => formatResponse(await mirasapo.getCaseStudy(p))
);

server.tool('mirasapo_categories',
  '【ミラサポplus/中小企業庁】業種・課題・行政サービス・施策のカテゴリマスタ取得（APIキー不要）',
  {
    type: z.enum(['industries', 'purposes', 'services', 'specific_measures']).describe('カテゴリ種別: industries=業種 purposes=課題 services=行政サービス specific_measures=施策'),
  },
  async (p) => formatResponse(await mirasapo.getCategories(p))
);

server.tool('mirasapo_regions',
  '【ミラサポplus/中小企業庁】地方区分・都道府県マスタ取得（APIキー不要）',
  {},
  async () => formatResponse(await mirasapo.getRegions())
);

// ════════════════════════════════════════════════
//  医療・健康データ
// ════════════════════════════════════════════════

server.tool('ndb_inspection_stats',
  '【NDBオープンデータ】特定健診の検査統計データ取得（BMI・血圧・血糖等）。地域・性別・年齢で絞り込み可能（APIキー不要）',
  {
    itemName: z.string().describe('検査項目名（例: BMI, 収縮期血圧, HbA1c）'),
    areaType: z.enum(['prefecture', 'secondary_medical_area']).optional().describe('地域種別: prefecture=都道府県 secondary_medical_area=二次医療圏'),
    prefectureName: z.string().optional().describe('都道府県名（例: 東京都）'),
    areaName: z.string().optional().describe('二次医療圏名'),
    gender: z.enum(['M', 'F', 'all']).optional().describe('性別: M=男性 F=女性 all=全体'),
    ageGroup: z.string().optional().describe('年齢階級（例: 40-44, 45-49, 50-54）'),
    page: z.number().optional().describe('ページ番号'),
    perPage: z.number().optional().describe('1ページあたり件数'),
  },
  async (p) => formatResponse(await ndb.getInspectionStats(p))
);

server.tool('ndb_items',
  '【NDBオープンデータ】利用可能な検査項目一覧を取得（APIキー不要）',
  {},
  async () => formatResponse(await ndb.getItems())
);

server.tool('ndb_areas',
  '【NDBオープンデータ】都道府県・二次医療圏の一覧を取得（APIキー不要）',
  {
    type: z.enum(['prefecture', 'secondary_medical_area']).optional().describe('地域種別（デフォルト: prefecture）'),
  },
  async (p) => formatResponse(await ndb.getAreas(p))
);

server.tool('ndb_range_labels',
  '【NDBオープンデータ】検査項目の値範囲ラベル取得（例: BMI「18.5未満」「18.5以上25未満」等）（APIキー不要）',
  {
    itemName: z.string().describe('検査項目名'),
    gender: z.enum(['M', 'F', 'all']).optional().describe('性別: M=男性 F=女性 all=全体'),
  },
  async (p) => formatResponse(await ndb.getRangeLabels(p))
);

// ════════════════════════════════════════════════
//  経済・金融データ（日銀）
// ════════════════════════════════════════════════

server.tool('boj_timeseries',
  '【日本銀行】時系列統計データ取得。マネーストック・物価指数・為替レート等（APIキー不要・2026/2/18開始）',
  {
    seriesCode: z.string().describe('時系列コード（例: "STRDCLUCON" = コールレート, "TK99F0000601GCQ00000" = 短観DI）'),
    db: z.string().optional().describe('データベースコード（例: FM01, CO, MD, PR）'),
    freq: z.string().optional().describe('頻度: D=日次 M=月次 Q=四半期 A=年次（デフォルト: M）'),
    startDate: z.string().optional().describe('開始年月 YYYYMM形式（デフォルト: 1年前）'),
    endDate: z.string().optional().describe('終了年月 YYYYMM形式（デフォルト: 今月）'),
    format: z.enum(['json', 'csv']).optional().describe('レスポンス形式（デフォルト: json）'),
  },
  async (p) => formatResponse(await boj.getTimeSeriesData(p))
);

server.tool('boj_major_statistics',
  '【日本銀行】主要統計一覧取得。よく使われる時系列統計のコード一覧（APIキー不要）',
  {},
  async () => formatResponse(await boj.getMajorStatistics())
);

server.tool('ndb_hub_proxy',
  '【NDB Hub】外部MCPプロキシ。NDB OpenData Hub の独自エンドポイントに自然言語クエリを送信（APIキー不要）',
  {
    query: z.string().describe('自然言語クエリ（例: "東京都のBMI分布"）'),
    prefectureCode: z.string().optional().describe('都道府県コード2桁'),
    indicator: z.string().optional().describe('指標名（例: "BMI", "HbA1c"）'),
    gender: z.enum(['M', 'F', 'all']).optional().describe('性別: M=男性 F=女性 all=全体'),
    ageClass: z.string().optional().describe('年齢階級（例: "40-44"）'),
  },
  async (p) => formatResponse(await ndb.ndbHubProxy(p))
);

// ════════════════════════════════════════════════
//  海しる・公共交通（プレースホルダ）
// ════════════════════════════════════════════════

server.tool('msil_layers',
  '【海しる/海上保安庁】利用可能レイヤ一覧取得（※APIキー登録必要・実装保留中）',
  {},
  async () => formatResponse(await msil.getLayers(C.msil))
);

server.tool('msil_features',
  '【海しる/海上保安庁】指定レイヤのGeoJSON取得（※APIキー登録必要・実装保留中）',
  {
    layerId: z.string().describe('レイヤID'),
    bbox: z.string().optional().describe('範囲指定 (lon1,lat1,lon2,lat2)'),
  },
  async (p) => formatResponse(await msil.getFeatures(p, C.msil))
);

server.tool('odpt_railway_timetable',
  '【ODPT/公共交通】鉄道時刻表取得（※APIキー登録必要・実装保留中）',
  {
    operator: z.string().optional().describe('事業者（例: "odpt.Operator:TokyoMetro"）'),
    railway: z.string().optional().describe('路線（例: "odpt.Railway:TokyoMetro.Ginza"）'),
    station: z.string().optional().describe('駅（例: "odpt.Station:TokyoMetro.Ginza.Shibuya"）'),
  },
  async (p) => formatResponse(await odpt.getRailwayTimetable(p, C.odpt))
);

server.tool('odpt_bus_timetable',
  '【ODPT/公共交通】バス時刻表取得（※APIキー登録必要・実装保留中）',
  {
    operator: z.string().optional().describe('バス事業者'),
    busroutePattern: z.string().optional().describe('バス系統'),
    busstopPole: z.string().optional().describe('バス停'),
  },
  async (p) => formatResponse(await odpt.getBusTimetable(p, C.odpt))
);

// ════════════════════════════════════════════════
//  シナリオ複合ツール
// ════════════════════════════════════════════════

server.tool('scenario_regional_health_economy',
  '【シナリオ】地域医療×マクロ経済 統合分析。NDB健診データ + 統計ダッシュボード人口 + 日銀マクロ指標を1コールで取得',
  {
    prefectureCode: z.string().describe('都道府県コード2桁（例: "13" = 東京都）'),
    year: z.number().optional().describe('分析年（省略時は最新）'),
  },
  async (p) => formatResponse(await regionalHealthEconomy(p))
);

server.tool('scenario_labor_demand_supply',
  '【シナリオ】労働市場 需給分析。ハローワーク求人 + e-Stat労働力調査を統合（APIキー必要）',
  {
    prefectureCode: z.string().describe('都道府県コード2桁'),
    occupation: z.string().optional().describe('職種キーワード（例: "看護師", "エンジニア"）'),
    appId: z.string().optional().describe('e-Stat AppID（任意）'),
  },
  async (p) => formatResponse(await laborDemandSupply(p))
);

server.tool('scenario_corporate_intelligence',
  '【シナリオ】企業情報統合分析。法人番号 + gBizINFO + EDINET を統合して企業の基本情報・補助金・開示書類を一括取得',
  {
    companyName: z.string().optional().describe('企業名（部分一致検索）'),
    corporateNumber: z.string().optional().describe('法人番号13桁（完全一致）'),
    houjinAppId: z.string().optional().describe('法人番号APIキー'),
    gbizToken: z.string().optional().describe('gBizINFO APIキー'),
    edinetApiKey: z.string().optional().describe('EDINET APIキー'),
  },
  async (p) => formatResponse(await corporateIntelligence(p))
);

server.tool('scenario_disaster_risk_assessment',
  '【シナリオ】地域防災リスク評価。住所または座標から地震ハザード・浸水深・河川水位を統合評価（APIキー不要）',
  {
    address: z.string().optional().describe('住所（例: "東京都千代田区霞が関1-1-1"）'),
    lat: z.number().optional().describe('緯度（住所の代わりに座標指定可）'),
    lon: z.number().optional().describe('経度'),
  },
  async (p) => formatResponse(await disasterRiskAssessment(p))
);

server.tool('scenario_academic_trend',
  '【シナリオ】学術研究トレンド分析。NDL + J-STAGE + CiNii + ジャパンサーチ + AgriKnowledge を横断検索（APIキー不要）',
  {
    keyword: z.string().describe('検索キーワード（例: "AI", "環境問題"）'),
    limit: z.number().optional().describe('各データベースからの取得件数（デフォルト: 5）'),
    includeAgri: z.boolean().optional().describe('農業系データベース(AgriKnowledge)も含めるか'),
  },
  async (p) => formatResponse(await academicTrend(p))
);

server.tool('scenario_academic_trend_by_topics',
  '【シナリオ】分野別学術トレンド比較。複数のキーワードで並列検索し、分野ごとの文献数を比較（APIキー不要）',
  {
    topics: z.array(z.string()).describe('分野キーワードリスト（例: ["AI", "機械学習", "深層学習"]）'),
    limit: z.number().optional().describe('各トピック・各DBからの取得件数（デフォルト: 3）'),
  },
  async (p) => formatResponse(await academicTrendByTopics(p))
);

server.tool('scenario_realestate_demographics',
  '【シナリオ】不動産×人口動態分析。不動産取引価格 + 地価公示 + 人口統計を統合して地域市場を分析',
  {
    prefecture: z.string().optional().describe('都道府県コード2桁（例: "13" = 東京都）'),
    city: z.string().optional().describe('市区町村コード5桁（例: "13101" = 千代田区）'),
    year: z.number().optional().describe('分析年（デフォルト: 昨年）'),
    quarter: z.number().optional().describe('四半期（1-4, デフォルト: 1）'),
    realestateApiKey: z.string().optional().describe('不動産情報APIキー'),
  },
  async (p) => formatResponse(await realestateDemographics(p))
);

server.tool('scenario_regional_economy_full',
  '【シナリオ】地域経済総合分析。統計ダッシュボードGDP + 日銀マクロ + e-Stat産業統計 + 国交省DPF を統合',
  {
    prefectureCode: z.string().describe('都道府県コード2桁（必須）'),
    year: z.number().optional().describe('分析年（省略時は最新）'),
    estatAppId: z.string().optional().describe('e-Stat AppID（産業統計取得用）'),
    mlitDpfApiKey: z.string().optional().describe('国交省DPF APIキー（インフラデータ用）'),
  },
  async (p) => formatResponse(await regionalEconomyFull(p))
);

server.tool('scenario_national_economy_summary',
  '【シナリオ】全国経済サマリー。統計ダッシュボードから全国の主要経済指標を一括取得（APIキー不要）',
  {},
  async () => formatResponse(await nationalEconomySummary())
);

// ════════════════════════════════════════════════
//  統合ツール
// ════════════════════════════════════════════════

server.tool('gov_api_catalog',
  '全API・全ツール一覧（カテゴリ・タグ・使用例付き）。どのツールが利用可能か確認',
  {
    category: z.enum(['statistics', 'law', 'economy', 'geospatial', 'disaster', 'labor', 'academic', 'science', 'health', 'government', 'catalog', 'deprecated', 'all']).optional().describe('カテゴリフィルタ'),
    includeMetadata: z.boolean().optional().describe('true: タグ・使用例も表示'),
  },
  async (p) => {
    const filterCat = p.category && p.category !== 'all' ? p.category : null;
    const showMeta = p.includeMetadata ?? false;

    const tools = Object.entries(TOOL_METADATA)
      .filter(([_, meta]) => !filterCat || meta.category === filterCat)
      .map(([name, meta]) => ({ name, ...meta }));

    let o = `# japan-gov-mcp Tool Catalog\n\n`;
    o += `📦 ${tools.length} tools${filterCat ? ` (category: ${filterCat})` : ''}\n\n`;

    if (showMeta) {
      o += `⚠️ RESAS API は 2025-03-24 に提供終了。代替: V-RESAS（民間）、e-Stat (estat_*)、統計ダッシュボード (dashboard_*)、国交省DPF (mlit_dpf_*)、地価公示 (realestate_*) を使用すること。\n\n`;
    }

    const categories = ['statistics', 'economy', 'law', 'geospatial', 'disaster', 'labor', 'academic', 'science', 'health', 'government', 'catalog', 'deprecated'] as const;
    for (const cat of categories) {
      const catTools = tools.filter(t => t.category === cat);
      if (catTools.length === 0) continue;

      o += `## ${cat.toUpperCase()} (${catTools.length})\n\n`;
      for (const tool of catTools) {
        o += `### ${tool.name}\n`;
        o += `- **Tags**: ${tool.tags.join(', ')}\n`;
        if (showMeta && tool.exampleQueries.length > 0) {
          o += `- **Examples**:\n`;
          tool.exampleQueries.forEach(q => { o += `  - ${q}\n`; });
        }
        o += `\n`;
      }
    }

    o += `\n---\n\n**API Status Summary**:\n`;
    const apis = [
      { name: 'e-Stat', key: 'ESTAT_APP_ID', ok: !!C.estat.appId },
      { name: 'RESAS (廃止)', key: 'RESAS_API_KEY', ok: false },
      { name: '法人番号', key: 'HOUJIN_APP_ID', ok: !!C.houjin.appId },
      { name: 'gBizINFO', key: 'GBIZ_TOKEN', ok: !!C.gbiz.token },
      { name: 'EDINET', key: 'EDINET_API_KEY', ok: !!C.edinet.apiKey },
      { name: 'ハローワーク', key: 'HELLOWORK_API_KEY', ok: !!C.hellowork.apiKey },
      { name: '不動産情報', key: 'REALESTATE_API_KEY', ok: !!C.realestate.apiKey },
      { name: '国交省DPF', key: 'MLIT_DPF_API_KEY', ok: !!C.mlitDpf.apiKey },
      { name: '海しる (MSIL)', key: 'MSIL_API_KEY', ok: !!C.msil.apiKey },
      { name: 'ODPT公共交通', key: 'ODPT_API_KEY', ok: !!C.odpt.apiKey },
    ];
    apis.forEach(a => { o += `- ${a.ok ? '✅' : '❌'} ${a.name} (${a.key})\n`; });

    return txt(o);
  }
);

server.tool('gov_cross_search',
  '複数APIを横断検索。企業名/地域/テーマで関連データを一括取得。メタデータベースのインテリジェントルーティング対応',
  {
    query: z.string().describe('検索クエリ'),
    scope: z.array(z.enum(['statistics', 'corporate', 'regional', 'legal', 'all']))
      .optional().describe('スコープ（statistics/corporate/regional/legal/all）※旧形式互換'),
    category: z.enum(['statistics', 'economy', 'law', 'geospatial', 'disaster', 'labor', 'academic', 'science', 'health', 'government']).optional().describe('カテゴリ指定（新形式）'),
  },
  async (p) => {
    const scope = (p.scope && p.scope.length > 0) ? p.scope : ['all'];
    const all = scope.includes('all');
    const results: Record<string, unknown> = {};
    const errors: string[] = [];
    const skipped: string[] = [];
    const tasks: Promise<void>[] = [];

    function collect(label: string, fn: () => Promise<ApiResponse>) {
      tasks.push(
        fn().then(res => {
          if (res.success) { results[label] = res.data; }
          else { errors.push(`${label}: ${res.error}`); }
        }).catch(e => { errors.push(`${label}: ${String(e)}`); })
      );
    }

    // statistics: 政府統計検索
    if (all || scope.includes('statistics')) {
      if (C.estat.appId) {
        collect('e-Stat', () => estat.getStatsList(C.estat, { searchWord: p.query, limit: 5 }));
      } else {
        skipped.push('e-Stat (ESTAT_APP_ID 未設定)');
      }
      collect('オープンデータ', () => searchDatasets({ q: p.query, rows: 5 }));
    }

    // corporate: 法人情報検索
    if (all || scope.includes('corporate')) {
      if (C.houjin.appId) {
        collect('法人番号', () => houjin.searchHoujin(C.houjin, { name: p.query }));
      } else {
        skipped.push('法人番号 (HOUJIN_APP_ID 未設定)');
      }
      if (C.gbiz.token) {
        collect('gBizINFO', () => gbiz.searchCorporation(C.gbiz, { name: p.query }));
      } else {
        skipped.push('gBizINFO (GBIZ_TOKEN 未設定)');
      }
    }

    // regional: 地域統計指標（APIキー不要）
    // 注: 統計ダッシュボードAPIはキーワード検索をサポートしないため、全指標一覧を返す
    if (all || scope.includes('regional')) {
      collect('統計ダッシュボード', () => getDashboardIndicators({}));
    }

    // legal: 法令キーワード検索（APIキー不要）
    if (all || scope.includes('legal')) {
      collect('法令検索', () => searchLawsByKeyword({ keyword: p.query, limit: 5 }));
    }

    await Promise.allSettled(tasks);

    // LLM向け整形
    const sections: string[] = [];
    sections.push(`# 横断検索: "${p.query}"\n`);
    sections.push(`スコープ: ${scope.join(', ')}`);

    const labels = Object.keys(results);
    if (labels.length > 0) {
      sections.push(`\n## 検索結果 (${labels.length}件ヒット)\n`);
      for (const label of labels) {
        sections.push(`### ${label}\n${json(results[label])}`);
      }
    } else {
      sections.push('\n該当データなし');
    }

    if (skipped.length > 0) {
      sections.push(`\n## スキップ（APIキー未設定）\n${skipped.map(s => `- ${s}`).join('\n')}`);
    }

    if (errors.length > 0) {
      sections.push(`\n## エラー\n${errors.map(e => `- ${e}`).join('\n')}`);
    }

    sections.push(`\n---\n取得時刻: ${new Date().toISOString()}`);
    return txt(sections.join('\n'));
  }
);

// ── Start ──
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('japan-gov-mcp started');
  console.error(`APIs: e-Stat=${!!C.estat.appId} RESAS=${!!C.resas.apiKey} 法人=${!!C.houjin.appId} gBiz=${!!C.gbiz.token} EDINET=${!!C.edinet.apiKey}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
