#!/usr/bin/env npx tsx
/**
 * MCP Stress Test R3 — 1000 targeted test cases
 *
 * Usage:
 *   npx tsx tests/stress-test-r3.ts                    # Run all batches
 *   npx tsx tests/stress-test-r3.ts --batch 0          # Run batch 0 only
 *   npx tsx tests/stress-test-r3.ts --batch 0 --out results-0.json
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(__dirname, '..', 'build', 'index.js');

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

interface TestCase {
  tool: string;
  params: Record<string, any>;
  description: string;
  expectError?: boolean;
}

interface TestResult {
  tool: string;
  description: string;
  status: 'pass' | 'fail' | 'timeout' | 'crash';
  duration_ms: number;
  responseType?: string;
  responseSnippet?: string;
  errorDetail?: string;
}

// ═══════════════════════════════════════════════
// MCP Client
// ═══════════════════════════════════════════════

class McpClient {
  private child: ChildProcess;
  private buffer = '';
  private nextId = 10;
  private resolvers = new Map<number, { resolve: (v: any) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor() {
    this.child = spawn('node', [SERVER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'test' },
    });
    this.child.stdout!.on('data', (chunk: Buffer) => this.onData(chunk));
    this.child.stderr!.on('data', () => {}); // suppress
    this.child.on('error', (err) => console.error('Server error:', err));
  }

  private onData(chunk: Buffer) {
    this.buffer += chunk.toString();
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && this.resolvers.has(msg.id)) {
          const { resolve, timer } = this.resolvers.get(msg.id)!;
          clearTimeout(timer);
          this.resolvers.delete(msg.id);
          resolve(msg);
        }
      } catch {}
    }
  }

  send(method: string, params: any = {}, id?: number, timeoutMs = 15000): Promise<any> {
    const useId = id ?? this.nextId++;
    return new Promise((res) => {
      const timer = setTimeout(() => {
        this.resolvers.delete(useId);
        res({ _timeout: true, id: useId });
      }, timeoutMs);
      this.resolvers.set(useId, { resolve: res, timer });
      this.child.stdin!.write(
        JSON.stringify({ jsonrpc: '2.0', method, params, id: useId }) + '\n'
      );
    });
  }

  async initialize(): Promise<void> {
    await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'stress-test-r3', version: '1.0.0' },
    }, 1, 10000);
    this.child.stdin!.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n'
    );
    await new Promise(r => setTimeout(r, 200));
  }

  async listTools(): Promise<any[]> {
    const res = await this.send('tools/list', {}, 2, 10000);
    return res?.result?.tools || [];
  }

  async callTool(name: string, args: Record<string, any>, timeoutMs: number): Promise<any> {
    return this.send('tools/call', { name, arguments: args }, undefined, timeoutMs);
  }

  close() {
    for (const [, { resolve, timer }] of this.resolvers) {
      clearTimeout(timer);
      resolve({ _timeout: true });
    }
    this.resolvers.clear();
    try { this.child.kill(); } catch {}
  }

  get alive() { return !this.child.killed; }
}

// ═══════════════════════════════════════════════
// Valid Defaults for Each Tool (copied from stress-test.ts)
// ═══════════════════════════════════════════════

const TOOL_DEFAULTS: Record<string, Record<string, any>> = {
  // e-Stat
  estat_search: { searchWord: '人口' },
  estat_meta: { statsDataId: '0003410379' },
  estat_data: { statsDataId: '0003410379', limit: 5 },
  estat_browse_indicators: {},
  estat_check_availability: { metricIds: ['population', 'establishments'] },
  estat_merger_check: { codes: ['35211', '14382'] },
  estat_compare_municipalities: { codes: ['35211', '14382'], indicators: ['A1101'] },
  estat_time_series: { code: '35211', indicators: ['A1101'], yearFrom: 2015, yearTo: 2020 },
  estat_correlation: {
    data: [
      { code: '35211', name: '長門市', aging_rate: 0.38, fiscal: 0.25 },
      { code: '14382', name: '箱根町', aging_rate: 0.35, fiscal: 0.45 },
    ],
    metricKeys: ['aging_rate', 'fiscal'],
  },
  estat_session_init: { codes: ['35211'] },

  // RESAS (deprecated)
  resas_prefectures: {},
  resas_cities: { prefCode: 13 },
  resas_population: { prefCode: 13, cityCode: '-' },
  resas_population_pyramid: { prefCode: 13, cityCode: '-', yearLeft: 2015, yearRight: 2020 },
  resas_industry: { prefCode: 13, cityCode: '-', sicCode: 'A', simcCode: '01' },
  resas_tourism: { prefCode: 13 },
  resas_finance: { prefCode: 13, cityCode: '-', matter: 1 },
  resas_patents: { prefCode: 13, cityCode: '-' },

  // Dashboard
  dashboard_indicators: {},
  dashboard_data: { indicatorCode: 'A1101' },

  // Corporate
  houjin_search: { name: 'トヨタ' },
  gbiz_search: { name: 'トヨタ' },
  gbiz_detail: { corporateNumber: '2180001022768', infoType: 'finance' },
  edinet_documents: { date: '2024-01-15' },

  // Law
  law_search: {},
  law_data: { lawId: '129AC0000000089' },
  law_keyword_search: { keyword: '環境' },

  // Real Estate
  realestate_transactions: { year: '20231', quarter: '20234' },
  realestate_landprice: { year: '2023' },

  // Infrastructure
  mlit_dpf_search: { term: '橋梁' },
  mlit_dpf_catalog: { id: 'test-catalog-id' },

  // Open Data
  opendata_search: { q: '防災' },
  opendata_detail: { id: 'test-dataset-id' },

  // Geospatial
  geospatial_search: { q: '地図' },
  geospatial_dataset: { id: 'test-dataset' },
  geospatial_organizations: {},

  // Safety
  safety_overseas: { regionCode: '10' },

  // Labor
  hellowork_search: { keyword: '事務' },

  // Weather / Disaster
  jma_forecast: { areaCode: '130000' },
  jma_overview: { areaCode: '130000' },
  jma_forecast_week: { areaCode: '130000' },
  jma_typhoon: {},
  jshis_hazard: { lat: 35.6895, lon: 139.6917 },
  amedas_stations: {},
  amedas_data: { pointId: '44132' },
  jma_earthquake: {},
  jma_tsunami: {},
  flood_depth: { lat: 35.6895, lon: 139.6917 },
  river_level: { stationId: '305011283309020' },
  traffic_volume: { lat: 35.6895, lon: 139.6917 },

  // Geo
  gsi_geocode: { address: '東京都千代田区霞が関1-1-1' },
  gsi_reverse_geocode: { lat: 35.6895, lon: 139.6917 },
  geoshape_city: { code: '13101' },
  geoshape_pref: { prefCode: '13' },

  // Academic
  ndl_search: { query: '統計学' },
  jstage_search: { query: '機械学習' },
  cinii_search: { query: '量子コンピュータ' },
  japansearch_search: { keyword: '浮世絵' },
  kokkai_speeches: { any: '環境' },
  kokkai_meetings: { any: '予算' },
  kkj_search: { Query: '情報システム' },

  // Science
  soramame_air: {},
  geology_legend: {},
  geology_at_point: { lat: 35.6895, lon: 139.6917 },
  jaxa_collections: {},
  agriknowledge_search: { query: '稲作' },
  irdb_search: { query: '機械学習' },
  researchmap_achievements: { permalink: 'SatoshiMatsuokaHPC', achievementType: 'published_papers' },

  // PLATEAU / PubComment
  plateau_datasets: {},
  plateau_citygml: { meshCode: '53394525' },
  pubcomment_list: {},

  // Mirasapo
  mirasapo_search: { keywords: 'IT導入' },
  mirasapo_detail: { id: '1' },
  mirasapo_categories: { type: 'industries' },
  mirasapo_regions: {},

  // NDB
  ndb_inspection_stats: { itemName: 'BMI' },
  ndb_items: {},
  ndb_areas: {},
  ndb_range_labels: { itemName: 'BMI' },
  ndb_hub_proxy: { query: 'BMI分布' },

  // BOJ
  boj_timeseries: { seriesCode: "MD02'MAAMAG" },
  boj_major_statistics: {},

  // MSIL / ODPT
  msil_layers: {},
  msil_features: { layerId: 'test-layer' },
  odpt_railway_timetable: {},
  odpt_bus_timetable: {},

  // Scenarios
  scenario_regional_health_economy: { prefectureCode: '13' },
  scenario_labor_demand_supply: { prefectureCode: '13' },
  scenario_corporate_intelligence: { companyName: 'トヨタ' },
  scenario_disaster_risk_assessment: { address: '東京都千代田区霞が関' },
  scenario_academic_trend: { keyword: 'AI', limit: 2 },
  scenario_academic_trend_by_topics: { topics: ['AI', '機械学習'], limit: 1 },
  scenario_realestate_demographics: { prefecture: '13' },
  scenario_regional_economy_full: { prefectureCode: '13' },
  scenario_national_economy_summary: {},

  // Catalog
  gov_api_catalog: {},
  gov_cross_search: { query: '人口' },
};

// ═══════════════════════════════════════════════
// R3 Case Generation (exactly 1000 cases)
// ═══════════════════════════════════════════════

function cloneDefaults(tool: string, override: Record<string, any>): Record<string, any> {
  return { ...(TOOL_DEFAULTS[tool] || {}), ...override };
}

function category1Realistic(): TestCase[] {
  const cases: TestCase[] = [];

  const cities = ['横浜市', '大阪市', '名古屋市', '札幌市', '福岡市', '京都市', '神戸市', '仙台市', '広島市', '北九州市'];
  const citySuffixes = ['人口推移', '年齢階級別人口', '世帯数', '転入転出'];
  for (const city of cities) {
    for (const suffix of citySuffixes) {
      cases.push({
        tool: 'estat_search',
        params: cloneDefaults('estat_search', { searchWord: `${city} ${suffix}` }),
        description: `cat1_realistic_population_${city}_${suffix}`,
      });
    }
  }

  const legalTerms = ['労働基準', '個人情報保護', '消費税', '建築基準', '道路交通', '会社法', '知的財産', '独占禁止', '景品表示', '下請法', '金融商品取引', '食品衛生', '電気通信事業', '著作権', '民法'];
  const legalModifiers = ['改正', '罰則', '施行令', 'ガイドライン', '判例'];
  for (let i = 0; i < 25; i++) {
    const term = legalTerms[i % legalTerms.length];
    const mod = legalModifiers[i % legalModifiers.length];
    cases.push({
      tool: 'law_keyword_search',
      params: cloneDefaults('law_keyword_search', { keyword: `${term} ${mod}` }),
      description: `cat1_realistic_law_${term}_${mod}_${i}`,
    });
  }

  const prefectureAreaCodes = [
    '010000', '020000', '030000', '040000', '050000', '060000', '070000', '080000', '090000', '100000',
    '110000', '120000', '130000', '140000', '150000', '160000', '170000', '180000', '190000', '200000',
    '210000', '220000', '230000', '240000', '250000', '260000', '270000', '280000', '290000', '300000',
    '310000', '320000', '330000', '340000', '350000', '360000', '370000', '380000', '390000', '400000',
    '410000', '420000', '430000', '440000', '450000', '460100', '471000',
  ];
  for (const areaCode of prefectureAreaCodes) {
    cases.push({
      tool: 'jma_forecast',
      params: cloneDefaults('jma_forecast', { areaCode }),
      description: `cat1_realistic_weather_pref_${areaCode}`,
    });
  }

  const researchTopics = [
    'AI', '量子コンピュータ', '再生可能エネルギー', '半導体', 'ロボティクス',
    'カーボンニュートラル', '創薬', '核融合', '自然言語処理', '材料科学',
  ];
  for (const topic of researchTopics) {
    cases.push({
      tool: 'jstage_search',
      params: cloneDefaults('jstage_search', { query: topic, count: 10, start: 1 }),
      description: `cat1_realistic_academic_jstage_${topic}`,
    });
    cases.push({
      tool: 'ndl_search',
      params: cloneDefaults('ndl_search', { query: topic }),
      description: `cat1_realistic_academic_ndl_${topic}`,
    });
    cases.push({
      tool: 'cinii_search',
      params: cloneDefaults('cinii_search', { query: topic }),
      description: `cat1_realistic_academic_cinii_${topic}`,
    });
  }

  const companies = ['Sony', 'Honda', 'Panasonic', 'Toyota', 'NTT', 'SoftBank', 'Mitsubishi', 'Hitachi', 'Rakuten', 'Fast Retailing'];
  for (const company of companies) {
    cases.push({
      tool: 'scenario_corporate_intelligence',
      params: cloneDefaults('scenario_corporate_intelligence', { companyName: company }),
      description: `cat1_realistic_corporate_scenario_${company}`,
    });
    cases.push({
      tool: 'gbiz_search',
      params: cloneDefaults('gbiz_search', { name: company }),
      description: `cat1_realistic_corporate_gbiz_${company}`,
    });
  }

  const addresses = [
    '東京都新宿区西新宿2-8-1', '大阪府大阪市北区中之島1-3-20', '愛知県名古屋市中区三の丸3-1-1',
    '北海道札幌市中央区北1条西2丁目', '福岡県福岡市中央区天神1-8-1', '京都府京都市中京区寺町通御池上る',
    '兵庫県神戸市中央区加納町6-5-1', '宮城県仙台市青葉区本町3-8-1', '広島県広島市中区基町10-52', '神奈川県横浜市中区港町1-1',
  ];
  const riskModes = ['洪水', '土砂災害'];
  for (const addr of addresses) {
    for (const mode of riskModes) {
      cases.push({
        tool: 'scenario_disaster_risk_assessment',
        params: cloneDefaults('scenario_disaster_risk_assessment', { address: `${addr} ${mode}` }),
        description: `cat1_realistic_disaster_${mode}_${addr}`,
      });
    }
  }

  const landPrefs = ['01', '13', '14', '23', '26', '27', '28', '34', '40'];
  const landYears = ['2021', '2022'];
  for (const pref of landPrefs) {
    for (const year of landYears) {
      cases.push({
        tool: 'realestate_landprice',
        params: cloneDefaults('realestate_landprice', { year, area: pref }),
        description: `cat1_realistic_landprice_pref${pref}_year${year}`,
      });
    }
  }

  if (cases.length !== 200) {
    throw new Error(`Category1 count mismatch: ${cases.length}`);
  }
  return cases;
}

function category2Combinatorial(): TestCase[] {
  const cases: TestCase[] = [];

  const estatLimits = [1, 5, 10, 50, 100];
  const estatTableIds = ['0003410379', '0003286095', '0003421111', '0003100010', '0003348420', '0003000001'];
  for (const statsDataId of estatTableIds) {
    for (const limit of estatLimits) {
      cases.push({
        tool: 'estat_data',
        params: cloneDefaults('estat_data', { statsDataId, limit }),
        description: `cat2_combo_estat_data_table${statsDataId}_limit${limit}`,
      });
    }
  }

  const jstageQueries = ['AI', '量子', '再エネ', '半導体', '宇宙', '医療DX', '防災', '都市計画', '教育工学', '生体工学'];
  const jstageCounts = [5, 10, 20];
  const jstageStarts = [1, 11];
  for (const query of jstageQueries) {
    for (const count of jstageCounts) {
      for (const start of jstageStarts) {
        cases.push({
          tool: 'jstage_search',
          params: cloneDefaults('jstage_search', { query, count, start }),
          description: `cat2_combo_jstage_${query}_count${count}_start${start}`,
        });
      }
    }
  }

  const years = ['20201', '20211', '20221', '20231', '20241'];
  const areas = ['13', '27', '40', '01'];
  const cities = ['13101', '27127', '40130'];
  for (const year of years) {
    for (const area of areas) {
      for (const city of cities) {
        cases.push({
          tool: 'realestate_transactions',
          params: cloneDefaults('realestate_transactions', { year, area, city, quarter: '20234' }),
          description: `cat2_combo_realestate_year${year}_area${area}_city${city}`,
        });
      }
    }
  }

  const companyNames = ['トヨタ', 'ソニー', 'ホンダ', '日立', 'パナソニック', '三菱電機', 'NTT', '楽天', 'KDDI', 'ファナック'];
  const companyPrefs = ['13', '14', '23', '27', '40'];
  const industries = ['製造業', '情報通信業', '卸売業'];
  let gbizCount = 0;
  for (const name of companyNames) {
    for (const prefecture of companyPrefs) {
      for (const industry of industries) {
        if (gbizCount >= 50) break;
        gbizCount++;
        cases.push({
          tool: 'gbiz_search',
          params: cloneDefaults('gbiz_search', { name, prefecture, industry }),
          description: `cat2_combo_gbiz_${name}_pref${prefecture}_${industry}_${gbizCount}`,
        });
      }
      if (gbizCount >= 50) break;
    }
    if (gbizCount >= 50) break;
  }

  const speakers = ['岸田文雄', '石破茂', '菅義偉', '河野太郎', '上川陽子', '加藤勝信', '茂木敏充', '玉木雄一郎'];
  const ranges = [
    { from: '2020-01-01', to: '2020-12-31' },
    { from: '2021-01-01', to: '2021-12-31' },
    { from: '2022-01-01', to: '2022-12-31' },
    { from: '2023-01-01', to: '2023-12-31' },
    { from: '2024-01-01', to: '2024-12-31' },
  ];
  const anys = ['予算', '防衛', '少子化'];
  let kokkaiCount = 0;
  for (const speaker of speakers) {
    for (const range of ranges) {
      for (const any of anys) {
        if (kokkaiCount >= 40) break;
        kokkaiCount++;
        cases.push({
          tool: 'kokkai_speeches',
          params: cloneDefaults('kokkai_speeches', { speaker, from: range.from, to: range.to, any }),
          description: `cat2_combo_kokkai_${speaker}_${range.from}_${any}_${kokkaiCount}`,
        });
      }
      if (kokkaiCount >= 40) break;
    }
    if (kokkaiCount >= 40) break;
  }

  const prefCodes = Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, '0'));
  const scenarioTools = ['scenario_regional_health_economy', 'scenario_labor_demand_supply'];
  let scenarioCount = 0;
  for (const tool of scenarioTools) {
    for (const prefectureCode of prefCodes) {
      if (scenarioCount >= 60) break;
      scenarioCount++;
      cases.push({
        tool,
        params: cloneDefaults(tool, { prefectureCode }),
        description: `cat2_combo_${tool}_pref${prefectureCode}`,
      });
    }
    if (scenarioCount >= 60) break;
  }

  if (cases.length !== 300) {
    throw new Error(`Category2 count mismatch: ${cases.length}`);
  }
  return cases;
}

function category3Boundary(): TestCase[] {
  const cases: TestCase[] = [];

  const strTargets: Array<{ tool: string; field: string; base: Record<string, any>; max: number }> = [
    { tool: 'estat_search', field: 'searchWord', base: {}, max: 128 },
    { tool: 'law_keyword_search', field: 'keyword', base: {}, max: 128 },
    { tool: 'jstage_search', field: 'query', base: { count: 10, start: 1 }, max: 128 },
    { tool: 'gbiz_search', field: 'name', base: {}, max: 128 },
    { tool: 'gsi_geocode', field: 'address', base: {}, max: 256 },
    { tool: 'scenario_corporate_intelligence', field: 'companyName', base: {}, max: 128 },
    { tool: 'scenario_disaster_risk_assessment', field: 'address', base: {}, max: 256 },
    { tool: 'gov_cross_search', field: 'query', base: {}, max: 128 },
    { tool: 'mlit_dpf_search', field: 'term', base: {}, max: 128 },
    { tool: 'ndb_hub_proxy', field: 'query', base: {}, max: 128 },
  ];
  const lengthOffsets = [-1, 0, 1, 31, 32, 63, 64, 127];
  for (const target of strTargets) {
    for (const offset of lengthOffsets) {
      const len = Math.max(0, Math.min(target.max, offset < 0 ? target.max + offset : offset));
      cases.push({
        tool: target.tool,
        params: cloneDefaults(target.tool, { ...target.base, [target.field]: 'あ'.repeat(len) }),
        description: `cat3_boundary_string_${target.tool}_${target.field}_len${len}`,
      });
    }
  }

  const numStatsIds = ['0003410379', '0003286095', '0003421111', '0003348420', '0003000001'];
  const numLimits = [1, 2, 4, 5, 9, 10, 49, 50, 99, 100];
  for (const statsDataId of numStatsIds) {
    for (const limit of numLimits) {
      cases.push({
        tool: 'estat_data',
        params: cloneDefaults('estat_data', { statsDataId, limit }),
        description: `cat3_boundary_number_estat_data_${statsDataId}_limit${limit}`,
      });
    }
  }

  const boundaryCoords: Array<{ lat: number; lon: number }> = [
    { lat: 20.0, lon: 122.0 }, { lat: 20.0, lon: 154.0 }, { lat: 46.0, lon: 122.0 }, { lat: 46.0, lon: 154.0 },
    { lat: 20.1, lon: 122.1 }, { lat: 45.9, lon: 153.9 }, { lat: 33.0, lon: 130.0 }, { lat: 35.0, lon: 135.0 },
    { lat: 24.0, lon: 123.0 }, { lat: 44.0, lon: 142.0 }, { lat: 26.2, lon: 127.7 }, { lat: 43.1, lon: 141.3 },
    { lat: 35.6895, lon: 139.6917 }, { lat: 34.6937, lon: 135.5023 }, { lat: 43.0621, lon: 141.3544 },
    { lat: 33.5902, lon: 130.4017 }, { lat: 38.2682, lon: 140.8694 }, { lat: 34.3853, lon: 132.4553 },
    { lat: 31.5966, lon: 130.5571 }, { lat: 36.2048, lon: 138.2529 },
  ];
  for (const coord of boundaryCoords) {
    cases.push({
      tool: 'jshis_hazard',
      params: cloneDefaults('jshis_hazard', coord),
      description: `cat3_boundary_geo_jshis_lat${coord.lat}_lon${coord.lon}`,
    });
    cases.push({
      tool: 'flood_depth',
      params: cloneDefaults('flood_depth', coord),
      description: `cat3_boundary_geo_flood_lat${coord.lat}_lon${coord.lon}`,
    });
  }

  const dates = [
    '2024-01-01', '2024-02-29', '2023-02-29', '2024-12-31', '2024-00-01',
    '2024-13-01', '2024-01-00', '2024-01-32', '20240101', '24-01-01',
    '2024/01/01', '2024.01.01', '2024-1-1', '0000-01-01', '9999-12-31',
    '2024-06-15T00:00:00Z', ' 2024-01-01 ', '', '   ', 'not-a-date',
  ];
  for (const date of dates) {
    cases.push({
      tool: 'edinet_documents',
      params: cloneDefaults('edinet_documents', { date }),
      description: `cat3_boundary_date_edinet_${JSON.stringify(date)}`,
      expectError: date === '' || date.trim() === '' || date.includes('/') || date.includes('not-a-date') || date === '2023-02-29',
    });
  }

  const optionalStringValues = ['', ' ', '\t', '\n', '  環境  '];
  for (const value of optionalStringValues) {
    cases.push({
      tool: 'law_keyword_search',
      params: cloneDefaults('law_keyword_search', { keyword: value }),
      description: `cat3_boundary_optional_law_keyword_${JSON.stringify(value)}`,
    });
    cases.push({
      tool: 'gsi_geocode',
      params: cloneDefaults('gsi_geocode', { address: value }),
      description: `cat3_boundary_optional_geocode_address_${JSON.stringify(value)}`,
    });
  }

  if (cases.length !== 200) {
    throw new Error(`Category3 count mismatch: ${cases.length}`);
  }
  return cases;
}

function category4SequenceState(): TestCase[] {
  const cases: TestCase[] = [];

  const searchTerms = ['横浜市 人口', '大阪市 人口', '名古屋市 人口', '札幌市 人口', '福岡市 人口', '京都市 人口', '神戸市 人口', '仙台市 人口', '広島市 人口', '北九州市 人口'];
  const chainStatsIds = ['0003410379', '0003286095'];
  for (const term of searchTerms) {
    for (const statsDataId of chainStatsIds) {
      cases.push({
        tool: 'estat_search',
        params: cloneDefaults('estat_search', { searchWord: term }),
        description: `cat4_seq_estat_search_${term}_${statsDataId}`,
      });
      cases.push({
        tool: 'estat_meta',
        params: cloneDefaults('estat_meta', { statsDataId }),
        description: `cat4_seq_estat_meta_after_search_${term}_${statsDataId}`,
      });
      cases.push({
        tool: 'estat_data',
        params: cloneDefaults('estat_data', { statsDataId, limit: 5 }),
        description: `cat4_seq_estat_data_after_meta_${term}_${statsDataId}`,
      });
    }
  }

  const addresses = [
    '東京都千代田区霞が関1-1-1', '大阪府大阪市北区中之島1-3-20', '北海道札幌市中央区北1条西2丁目',
    '福岡県福岡市中央区天神1-8-1', '愛知県名古屋市中区三の丸3-1-1', '京都府京都市中京区寺町通御池上る',
    '兵庫県神戸市中央区加納町6-5-1', '宮城県仙台市青葉区本町3-8-1', '広島県広島市中区基町10-52', '神奈川県横浜市中区港町1-1',
  ];
  const coords = [
    { lat: 35.6895, lon: 139.6917 }, { lat: 34.6937, lon: 135.5023 }, { lat: 43.0621, lon: 141.3544 },
    { lat: 33.5902, lon: 130.4017 }, { lat: 35.1815, lon: 136.9066 }, { lat: 35.0116, lon: 135.7681 },
    { lat: 34.6901, lon: 135.1955 }, { lat: 38.2682, lon: 140.8694 }, { lat: 34.3853, lon: 132.4553 }, { lat: 35.4437, lon: 139.6380 },
  ];
  for (let i = 0; i < addresses.length; i++) {
    cases.push({
      tool: 'gsi_geocode',
      params: cloneDefaults('gsi_geocode', { address: addresses[i] }),
      description: `cat4_seq_geocode_step1_${i}_${addresses[i]}`,
    });
    cases.push({
      tool: 'flood_depth',
      params: cloneDefaults('flood_depth', coords[i]),
      description: `cat4_seq_flood_step2_${i}_lat${coords[i].lat}_lon${coords[i].lon}`,
    });
  }

  const indicatorSets = [
    ['population'], ['establishments'], ['population', 'establishments'], ['taxable_income'], ['population', 'taxable_income'],
  ];
  for (let i = 0; i < indicatorSets.length; i++) {
    cases.push({
      tool: 'estat_browse_indicators',
      params: cloneDefaults('estat_browse_indicators', {}),
      description: `cat4_seq_indicator_browse_${i}`,
    });
    cases.push({
      tool: 'estat_check_availability',
      params: cloneDefaults('estat_check_availability', { metricIds: indicatorSets[i] }),
      description: `cat4_seq_indicator_check_${i}_${indicatorSets[i].join('-')}`,
    });
    cases.push({
      tool: 'estat_compare_municipalities',
      params: cloneDefaults('estat_compare_municipalities', { codes: ['13101', '27127'], indicators: ['A1101'] }),
      description: `cat4_seq_indicator_compare_${i}`,
    });
  }

  for (let i = 1; i <= 5; i++) {
    cases.push({
      tool: 'jma_typhoon',
      params: cloneDefaults('jma_typhoon', {}),
      description: `cat4_state_rapid_repeat_jma_typhoon_call${i}`,
    });
  }

  if (cases.length !== 100) {
    throw new Error(`Category4 count mismatch: ${cases.length}`);
  }
  return cases;
}

function category5CrossTool(): TestCase[] {
  const cases: TestCase[] = [];

  const geoQueries = [
    { address: '東京都千代田区霞が関1-1-1', lat: 35.6895, lon: 139.6917 },
    { address: '大阪府大阪市北区中之島1-3-20', lat: 34.6937, lon: 135.5023 },
    { address: '北海道札幌市中央区北1条西2丁目', lat: 43.0621, lon: 141.3544 },
    { address: '福岡県福岡市中央区天神1-8-1', lat: 33.5902, lon: 130.4017 },
    { address: '愛知県名古屋市中区三の丸3-1-1', lat: 35.1815, lon: 136.9066 },
    { address: '京都府京都市中京区寺町通御池上る', lat: 35.0116, lon: 135.7681 },
    { address: '兵庫県神戸市中央区加納町6-5-1', lat: 34.6901, lon: 135.1955 },
    { address: '宮城県仙台市青葉区本町3-8-1', lat: 38.2682, lon: 140.8694 },
    { address: '広島県広島市中区基町10-52', lat: 34.3853, lon: 132.4553 },
  ];
  for (const geo of geoQueries) {
    cases.push({
      tool: 'gsi_geocode',
      params: cloneDefaults('gsi_geocode', { address: geo.address }),
      description: `cat5_cross_geo_gsi_geocode_${geo.address}`,
    });
    cases.push({
      tool: 'flood_depth',
      params: cloneDefaults('flood_depth', { lat: geo.lat, lon: geo.lon }),
      description: `cat5_cross_geo_flood_depth_lat${geo.lat}_lon${geo.lon}`,
    });
    cases.push({
      tool: 'jshis_hazard',
      params: cloneDefaults('jshis_hazard', { lat: geo.lat, lon: geo.lon }),
      description: `cat5_cross_geo_jshis_hazard_lat${geo.lat}_lon${geo.lon}`,
    });
    cases.push({
      tool: 'traffic_volume',
      params: cloneDefaults('traffic_volume', { lat: geo.lat, lon: geo.lon }),
      description: `cat5_cross_geo_traffic_volume_lat${geo.lat}_lon${geo.lon}`,
    });
  }

  const corporateTargets = [
    { name: 'トヨタ', corporateNumber: '1180301018771' },
    { name: 'ソニーグループ', corporateNumber: '4010401067252' },
    { name: '本田技研工業', corporateNumber: '7010401027573' },
    { name: 'パナソニック', corporateNumber: '5120001158219' },
    { name: '日立製作所', corporateNumber: '7010001008844' },
    { name: 'NTT', corporateNumber: '9010001061460' },
    { name: '楽天グループ', corporateNumber: '9010701020592' },
    { name: '三菱電機', corporateNumber: '4010001008772' },
  ];
  for (const corp of corporateTargets) {
    cases.push({
      tool: 'houjin_search',
      params: cloneDefaults('houjin_search', { name: corp.name }),
      description: `cat5_cross_corp_houjin_search_${corp.name}`,
    });
    cases.push({
      tool: 'gbiz_search',
      params: cloneDefaults('gbiz_search', { name: corp.name }),
      description: `cat5_cross_corp_gbiz_search_${corp.name}`,
    });
    cases.push({
      tool: 'gbiz_detail',
      params: cloneDefaults('gbiz_detail', { corporateNumber: corp.corporateNumber, infoType: 'finance' }),
      description: `cat5_cross_corp_gbiz_detail_${corp.name}_${corp.corporateNumber}`,
    });
    cases.push({
      tool: 'scenario_corporate_intelligence',
      params: cloneDefaults('scenario_corporate_intelligence', { companyName: corp.name }),
      description: `cat5_cross_corp_scenario_${corp.name}`,
    });
  }

  const keywords = ['AI', '量子コンピュータ', '再生可能エネルギー', '半導体', 'バイオインフォマティクス', 'ロボティクス', '宇宙工学', 'データサイエンス'];
  for (const keyword of keywords) {
    cases.push({
      tool: 'ndl_search',
      params: cloneDefaults('ndl_search', { query: keyword }),
      description: `cat5_cross_academic_ndl_${keyword}`,
    });
    cases.push({
      tool: 'jstage_search',
      params: cloneDefaults('jstage_search', { query: keyword, count: 10, start: 1 }),
      description: `cat5_cross_academic_jstage_${keyword}`,
    });
    cases.push({
      tool: 'cinii_search',
      params: cloneDefaults('cinii_search', { query: keyword }),
      description: `cat5_cross_academic_cinii_${keyword}`,
    });
    cases.push({
      tool: 'irdb_search',
      params: cloneDefaults('irdb_search', { query: keyword }),
      description: `cat5_cross_academic_irdb_${keyword}`,
    });
  }

  if (cases.length !== 100) {
    throw new Error(`Category5 count mismatch: ${cases.length}`);
  }
  return cases;
}

function category6Adversarial(): TestCase[] {
  const cases: TestCase[] = [];

  const patterns: Array<{ label: string; value: any; expectError?: boolean }> = [
    { label: 'unicode_nfd_combining', value: 'e\u0301cole 統計' },
    { label: 'unicode_nfkc_homoglyph', value: 'раураl ソニー' },
    { label: 'unicode_mixed_script', value: 'AІ人工知能' },
    { label: 'proto_pollution_json', value: '{"__proto__":{"polluted":true}}', expectError: true },
    { label: 'proto_constructor', value: '{"constructor":{"prototype":{"polluted":1}}}', expectError: true },
    { label: 'redos_nested_quantifier', value: '^(a+)+$aaaaaaaaaaaaaaaaaaaaaaaaaaaa!' },
    { label: 'redos_alternation', value: '(a|aa)+$aaaaaaaaaaaaaaaaaaaaaaaaaaaa!' },
    { label: 'http_header_crlf', value: 'Tokyo\r\nX-Injected: yes', expectError: true },
    { label: 'graphql_injection', value: 'query { __schema { types { name } } }', expectError: true },
    { label: 'json_in_string_nesting', value: '{"x":"{\\"y\\":{\\"z\\":[1,2,3]}}"}' },
    { label: 'rtl_override', value: 'abc\u202Etxt.exe' },
    { label: 'lri_pdi_confusables', value: '\u2066admin\u2069=1' },
    { label: 'null_byte', value: 'normal\u0000suffix', expectError: true },
    { label: 'line_separator', value: 'alpha\u2028beta' },
    { label: 'paragraph_separator', value: 'alpha\u2029beta' },
    { label: 'emoji_zwj_sequence', value: '👩‍💻👨‍🔬データ' },
    { label: 'escaped_unicode_obfuscation', value: '\\u0073\\u0065\\u006c\\u0065\\u0063\\u0074' },
    { label: 'urlencoded_crlf', value: '%0d%0aX-Test:1', expectError: true },
    { label: 'double_json_array', value: '[[[[{"a":"b"}]]]]' },
    { label: 'deep_braces', value: '{{{{{{{{{{payload}}}}}}}}}}' },
  ];

  const targetFields: Array<{ tool: string; field: string; base?: Record<string, any> }> = [
    { tool: 'estat_search', field: 'searchWord' },
    { tool: 'law_keyword_search', field: 'keyword' },
    { tool: 'jstage_search', field: 'query', base: { count: 10, start: 1 } },
    { tool: 'gbiz_search', field: 'name' },
    { tool: 'gsi_geocode', field: 'address' },
    { tool: 'mlit_dpf_search', field: 'term' },
    { tool: 'opendata_search', field: 'q' },
    { tool: 'scenario_corporate_intelligence', field: 'companyName' },
    { tool: 'scenario_disaster_risk_assessment', field: 'address' },
    { tool: 'gov_cross_search', field: 'query' },
  ];

  for (const pattern of patterns) {
    for (const target of targetFields) {
      cases.push({
        tool: target.tool,
        params: cloneDefaults(target.tool, { ...(target.base || {}), [target.field]: pattern.value }),
        description: `cat6_adversarial_${pattern.label}_${target.tool}_${target.field}`,
        expectError: pattern.expectError,
      });
    }
  }

  if (cases.length !== 200) {
    throw new Error(`Category6 pre-trim count mismatch: ${cases.length}`);
  }

  return cases.slice(0, 100);
}

function generateR3Cases(): TestCase[] {
  const all = [
    ...category1Realistic(),
    ...category2Combinatorial(),
    ...category3Boundary(),
    ...category4SequenceState(),
    ...category5CrossTool(),
    ...category6Adversarial(),
  ];
  if (all.length !== 1000) {
    throw new Error(`R3 total case count mismatch: ${all.length}`);
  }
  return all;
}

function makeBatches(cases: TestCase[], batchSize = 200): TestCase[][] {
  const batches: TestCase[][] = [];
  for (let i = 0; i < cases.length; i += batchSize) {
    batches.push(cases.slice(i, i + batchSize));
  }
  return batches;
}

function isScenarioTool(toolName: string): boolean {
  return toolName.startsWith('scenario_');
}

// ═══════════════════════════════════════════════
// Runner
// ═══════════════════════════════════════════════

async function runTests(testCases: TestCase[], toolNamesAvailable: Set<string>): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const client = new McpClient();

  try {
    await client.initialize();

    process.stderr.write(`Running ${testCases.length} cases...\n`);

    for (const tc of testCases) {
      if (!toolNamesAvailable.has(tc.tool)) {
        results.push({
          tool: tc.tool,
          description: tc.description,
          status: 'fail',
          duration_ms: 0,
          errorDetail: `Tool "${tc.tool}" not found in server tools/list`,
        });
        process.stderr.write('F');
        continue;
      }

      if (!client.alive) {
        results.push({
          tool: tc.tool,
          description: tc.description,
          status: 'crash',
          duration_ms: 0,
          errorDetail: 'Server process died',
        });
        process.stderr.write('X');
        continue;
      }

      const timeoutMs = isScenarioTool(tc.tool) ? 60000 : 20000;
      const start = Date.now();

      try {
        const response = await client.callTool(tc.tool, tc.params, timeoutMs);
        const elapsed = Date.now() - start;

        if (response._timeout) {
          results.push({
            tool: tc.tool,
            description: tc.description,
            status: 'timeout',
            duration_ms: elapsed,
            errorDetail: `Request timed out (${Math.round(timeoutMs / 1000)}s)`,
          });
          process.stderr.write('T');
          continue;
        }

        const hasError = response.error !== undefined;
        const content = response.result?.content;
        const isToolError = response.result?.isError === true;
        const textContent = Array.isArray(content)
          ? content.map((c: any) => c.text || '').join('')
          : '';
        const isApiKeyMissing = textContent.includes('未設定');
        const isErrorResponse = textContent.startsWith('❌') || isToolError;

        let responseType = 'success';
        if (hasError) responseType = 'json_rpc_error';
        else if (isApiKeyMissing) responseType = 'api_key_missing';
        else if (isErrorResponse) responseType = 'tool_error';

        let status: TestResult['status'] = 'pass';
        if (tc.expectError && responseType === 'success' && !isApiKeyMissing) {
          status = 'pass';
        }

        const snippet = textContent.length > 200
          ? textContent.slice(0, 200) + '...'
          : textContent;

        results.push({
          tool: tc.tool,
          description: tc.description,
          status,
          duration_ms: elapsed,
          responseType,
          responseSnippet: hasError
            ? JSON.stringify(response.error).slice(0, 200)
            : snippet,
        });

        process.stderr.write(status === 'pass' ? '.' : 'F');
      } catch (err: any) {
        const elapsed = Date.now() - start;
        results.push({
          tool: tc.tool,
          description: tc.description,
          status: 'crash',
          duration_ms: elapsed,
          errorDetail: err.message || String(err),
        });
        process.stderr.write('X');
      }
    }
  } finally {
    client.close();
  }

  return results;
}

// ═══════════════════════════════════════════════
// Analysis (copied format)
// ═══════════════════════════════════════════════

interface BatchSummary {
  batch: number | 'all';
  totalTests: number;
  pass: number;
  fail: number;
  timeout: number;
  crash: number;
  byTool: Record<string, { total: number; pass: number; fail: number; timeout: number; crash: number }>;
  responseTypes: Record<string, number>;
  slowTests: { tool: string; description: string; ms: number }[];
  failures: { tool: string; description: string; detail: string }[];
  avgDuration_ms: number;
}

function analyze(results: TestResult[], batchNum: number | 'all'): BatchSummary {
  const summary: BatchSummary = {
    batch: batchNum,
    totalTests: results.length,
    pass: 0, fail: 0, timeout: 0, crash: 0,
    byTool: {},
    responseTypes: {},
    slowTests: [],
    failures: [],
    avgDuration_ms: 0,
  };

  let totalDuration = 0;
  for (const r of results) {
    summary[r.status]++;
    totalDuration += r.duration_ms;

    if (!summary.byTool[r.tool]) {
      summary.byTool[r.tool] = { total: 0, pass: 0, fail: 0, timeout: 0, crash: 0 };
    }
    summary.byTool[r.tool].total++;
    summary.byTool[r.tool][r.status]++;

    if (r.responseType) {
      summary.responseTypes[r.responseType] = (summary.responseTypes[r.responseType] || 0) + 1;
    }

    if (r.duration_ms > 5000) {
      summary.slowTests.push({ tool: r.tool, description: r.description, ms: r.duration_ms });
    }

    if (r.status !== 'pass') {
      summary.failures.push({
        tool: r.tool,
        description: r.description,
        detail: r.errorDetail || r.responseSnippet || r.status,
      });
    }
  }

  summary.avgDuration_ms = results.length > 0 ? Math.round(totalDuration / results.length) : 0;
  summary.slowTests.sort((a, b) => b.ms - a.ms);

  return summary;
}

// ═══════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const batchIdx = args.indexOf('--batch');
  const outIdx = args.indexOf('--out');
  const batchNum = batchIdx >= 0 ? parseInt(args[batchIdx + 1], 10) : -1;
  const outFile = outIdx >= 0 ? args[outIdx + 1] : null;

  const allCases = generateR3Cases();
  const batches = makeBatches(allCases, 200);

  process.stderr.write('Starting MCP server for schema discovery...\n');
  const schemaClient = new McpClient();
  let allTools: any[];
  try {
    await schemaClient.initialize();
    allTools = await schemaClient.listTools();
    process.stderr.write(`Found ${allTools.length} tools\n`);
  } finally {
    schemaClient.close();
  }

  await new Promise(r => setTimeout(r, 500));

  let casesToRun: TestCase[];
  if (batchNum >= 0 && batchNum < batches.length) {
    casesToRun = batches[batchNum];
    process.stderr.write(`\nBatch ${batchNum}: ${casesToRun.length} cases\n`);
  } else {
    casesToRun = allCases;
    process.stderr.write(`\nAll batches: ${casesToRun.length} cases\n`);
  }

  process.stderr.write(`Generated test cases: ${allCases.length}\n`);
  process.stderr.write(`Expected test cases to run: ${casesToRun.length}\n`);

  const toolNamesAvailable = new Set(allTools.map((t: any) => t.name));
  const results = await runTests(casesToRun, toolNamesAvailable);

  const summary = analyze(results, batchNum >= 0 ? batchNum : 'all');

  const output = {
    summary,
    results,
    timestamp: new Date().toISOString(),
  };

  const outPath = outFile || resolve(__dirname, '..', `stress-results-r3${batchNum >= 0 ? `-${batchNum}` : ''}.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  process.stderr.write(`\n\nResults written to: ${outPath}\n`);

  process.stderr.write(`\n${'═'.repeat(60)}\n`);
  process.stderr.write(`STRESS TEST SUMMARY (Batch ${summary.batch})\n`);
  process.stderr.write(`${'═'.repeat(60)}\n`);
  process.stderr.write(`Total:   ${summary.totalTests}\n`);
  process.stderr.write(`Pass:    ${summary.pass}\n`);
  process.stderr.write(`Fail:    ${summary.fail}\n`);
  process.stderr.write(`Timeout: ${summary.timeout}\n`);
  process.stderr.write(`Crash:   ${summary.crash}\n`);
  process.stderr.write(`Avg ms:  ${summary.avgDuration_ms}\n`);
  process.stderr.write(`\nResponse types:\n`);
  for (const [type, count] of Object.entries(summary.responseTypes)) {
    process.stderr.write(`  ${type}: ${count}\n`);
  }
  if (summary.failures.length > 0) {
    process.stderr.write(`\nFailures (${summary.failures.length}):\n`);
    for (const f of summary.failures.slice(0, 20)) {
      process.stderr.write(`  ${f.tool}/${f.description}: ${f.detail.slice(0, 100)}\n`);
    }
    if (summary.failures.length > 20) {
      process.stderr.write(`  ... and ${summary.failures.length - 20} more\n`);
    }
  }
  if (summary.slowTests.length > 0) {
    process.stderr.write(`\nSlow tests (>5s, top 10):\n`);
    for (const s of summary.slowTests.slice(0, 10)) {
      process.stderr.write(`  ${s.tool}/${s.description}: ${s.ms}ms\n`);
    }
  }

  process.stderr.write(`\nPer-tool:\n`);
  for (const [tool, stats] of Object.entries(summary.byTool)) {
    const marker = stats.fail > 0 || stats.crash > 0 ? '❌' : stats.timeout > 0 ? '⏱️' : '✅';
    process.stderr.write(`  ${marker} ${tool}: ${stats.pass}/${stats.total} pass`);
    if (stats.fail > 0) process.stderr.write(`, ${stats.fail} fail`);
    if (stats.timeout > 0) process.stderr.write(`, ${stats.timeout} timeout`);
    if (stats.crash > 0) process.stderr.write(`, ${stats.crash} crash`);
    process.stderr.write('\n');
  }

  const exitCode = summary.crash > 0 ? 2 : summary.fail > 0 ? 1 : 0;
  process.exit(exitCode);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(99);
});
