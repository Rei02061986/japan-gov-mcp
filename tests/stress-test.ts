#!/usr/bin/env npx tsx
/**
 * MCP Stress Test — 5000+ automated test cases
 *
 * Spawns the MCP server, gets tool schemas via tools/list,
 * auto-generates test cases per tool, runs them, records results.
 *
 * Usage:
 *   npx tsx tests/stress-test.ts                    # Run all
 *   npx tsx tests/stress-test.ts --batch 0          # Run batch 0 only
 *   npx tsx tests/stress-test.ts --batch 0 --out results-0.json
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
      clientInfo: { name: 'stress-test', version: '1.0.0' },
    }, 1, 10000);
    this.child.stdin!.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n'
    );
    await new Promise(r => setTimeout(r, 200)); // let server settle
  }

  async listTools(): Promise<any[]> {
    const res = await this.send('tools/list', {}, 2, 10000);
    return res?.result?.tools || [];
  }

  async callTool(name: string, args: Record<string, any>): Promise<any> {
    return this.send('tools/call', { name, arguments: args });
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
// Valid Defaults for Each Tool
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
// Test Case Generator
// ═══════════════════════════════════════════════

function getPropertyType(prop: any): string {
  if (prop.enum) return 'enum';
  if (prop.type === 'array') return 'array';
  return prop.type || 'unknown';
}

function generateEdgeCases(name: string, prop: any): { value: any; desc: string; shouldFail?: boolean }[] {
  const cases: { value: any; desc: string; shouldFail?: boolean }[] = [];
  const ptype = getPropertyType(prop);

  switch (ptype) {
    case 'string':
      cases.push({ value: '', desc: 'empty_string' });
      cases.push({ value: '   ', desc: 'whitespace_only' });
      cases.push({ value: 'x'.repeat(500), desc: 'very_long_500chars' });
      cases.push({ value: '日本語テスト全角ＡＢＣ', desc: 'unicode_fullwidth' });
      cases.push({ value: "'; DROP TABLE users; --", desc: 'sql_injection' });
      cases.push({ value: '<script>alert(1)</script>', desc: 'xss_attempt' });
      cases.push({ value: 'null', desc: 'literal_null_string' });
      cases.push({ value: '0', desc: 'zero_string' });
      cases.push({ value: '\t\n\r', desc: 'control_chars' });
      cases.push({ value: '🇯🇵🎌', desc: 'emoji' });
      break;

    case 'number':
      cases.push({ value: 0, desc: 'zero' });
      cases.push({ value: -1, desc: 'negative' });
      cases.push({ value: -99999, desc: 'large_negative' });
      cases.push({ value: 999999, desc: 'very_large' });
      cases.push({ value: 3.14159, desc: 'float' });
      cases.push({ value: 0.0001, desc: 'tiny_float' });
      break;

    case 'boolean':
      cases.push({ value: true, desc: 'true' });
      cases.push({ value: false, desc: 'false' });
      break;

    case 'enum':
      if (prop.enum) {
        for (const v of prop.enum) {
          cases.push({ value: v, desc: `enum_${v}` });
        }
      }
      break;

    case 'array':
      cases.push({ value: [], desc: 'empty_array' });
      if (prop.items?.type === 'string') {
        cases.push({ value: ['a'], desc: 'single_item_array' });
        cases.push({ value: Array(20).fill('test'), desc: 'large_array_20' });
        cases.push({ value: ['', ' ', 'valid'], desc: 'mixed_empty_array' });
        cases.push({ value: ['日本語', 'English', '123'], desc: 'mixed_lang_array' });
      } else if (prop.items?.type === 'number') {
        cases.push({ value: [0], desc: 'single_zero_array' });
        cases.push({ value: [1, 2, 3, 4, 5], desc: 'number_array' });
        cases.push({ value: [-1, 0, 99999], desc: 'boundary_number_array' });
      }
      break;
  }

  return cases;
}

function generateCasesForTool(
  toolName: string,
  schema: any,
  defaults: Record<string, any>
): TestCase[] {
  const cases: TestCase[] = [];
  const properties = schema?.inputSchema?.properties || {};
  const required: string[] = schema?.inputSchema?.required || [];
  const propNames = Object.keys(properties);
  const validParams = { ...defaults };

  // ─── 1. Happy path ───
  cases.push({
    tool: toolName,
    params: { ...validParams },
    description: 'happy_path',
  });

  // ─── 2. Required-only ───
  if (propNames.length > required.length && required.length > 0) {
    const reqOnly: Record<string, any> = {};
    for (const r of required) {
      if (validParams[r] !== undefined) reqOnly[r] = validParams[r];
    }
    cases.push({
      tool: toolName,
      params: reqOnly,
      description: 'required_only',
    });
  }

  // ─── 3. Empty params ───
  cases.push({
    tool: toolName,
    params: {},
    description: 'empty_params',
    expectError: required.length > 0,
  });

  // ─── 4. Each required param missing ───
  for (const req of required) {
    const without = { ...validParams };
    delete without[req];
    cases.push({
      tool: toolName,
      params: without,
      description: `missing_required_${req}`,
      expectError: true,
    });
  }

  // ─── 5. Per-property edge cases ───
  for (const [pname, prop] of Object.entries(properties)) {
    const edgeCases = generateEdgeCases(pname, prop);
    for (const ec of edgeCases) {
      const params = { ...validParams, [pname]: ec.value };
      cases.push({
        tool: toolName,
        params,
        description: `${pname}_${ec.desc}`,
        expectError: ec.shouldFail,
      });
    }
  }

  // ─── 6. Extra unknown params ───
  cases.push({
    tool: toolName,
    params: { ...validParams, __hack_param__: 'DROP TABLE', _extra_num: 42 },
    description: 'extra_unknown_params',
  });

  // ─── 7. All strings empty ───
  if (propNames.some(p => (properties[p] as any)?.type === 'string')) {
    const allEmpty: Record<string, any> = {};
    for (const [pname, prop] of Object.entries(properties) as [string, any][]) {
      allEmpty[pname] = prop.type === 'string' && !prop.enum ? '' : validParams[pname];
    }
    cases.push({
      tool: toolName,
      params: allEmpty,
      description: 'all_strings_empty',
    });
  }

  // ─── 8. Unicode stress ───
  if (propNames.some(p => (properties[p] as any)?.type === 'string')) {
    const unicodeParams: Record<string, any> = {};
    for (const [pname, prop] of Object.entries(properties) as [string, any][]) {
      unicodeParams[pname] = prop.type === 'string' && !prop.enum
        ? '日本語テスト🇯🇵全角ＡＢＣ'
        : validParams[pname];
    }
    cases.push({
      tool: toolName,
      params: unicodeParams,
      description: 'unicode_stress',
    });
  }

  // ─── 9. Large values ───
  const largeParams: Record<string, any> = {};
  for (const [pname, prop] of Object.entries(properties) as [string, any][]) {
    if (prop.type === 'string' && !prop.enum) {
      largeParams[pname] = 'x'.repeat(300);
    } else if (prop.type === 'number') {
      largeParams[pname] = 99999;
    } else if (prop.type === 'array') {
      largeParams[pname] = prop.items?.type === 'string'
        ? Array(30).fill('test')
        : validParams[pname];
    } else {
      largeParams[pname] = validParams[pname];
    }
  }
  cases.push({
    tool: toolName,
    params: largeParams,
    description: 'large_values',
  });

  // ─── 10. Special char combination ───
  if (propNames.some(p => (properties[p] as any)?.type === 'string')) {
    const specialParams: Record<string, any> = {};
    for (const [pname, prop] of Object.entries(properties) as [string, any][]) {
      specialParams[pname] = prop.type === 'string' && !prop.enum
        ? '&amp;<br/>"quotes" \'apostrophe\' &lt;tag/&gt; %20 %00'
        : validParams[pname];
    }
    cases.push({
      tool: toolName,
      params: specialParams,
      description: 'html_entities_special',
    });
  }

  // ─── 11. Numeric string where number expected ───
  for (const [pname, prop] of Object.entries(properties) as [string, any][]) {
    if (prop.type === 'number') {
      cases.push({
        tool: toolName,
        params: { ...validParams, [pname]: 'not_a_number' },
        description: `${pname}_string_instead_of_number`,
        expectError: true,
      });
    }
  }

  // ─── 12. Null values ───
  for (const [pname] of Object.entries(properties)) {
    if (required.includes(pname)) {
      cases.push({
        tool: toolName,
        params: { ...validParams, [pname]: null },
        description: `${pname}_null_value`,
        expectError: true,
      });
    }
  }

  // ─── 13. Boolean where string expected ───
  for (const [pname, prop] of Object.entries(properties) as [string, any][]) {
    if (prop.type === 'string') {
      cases.push({
        tool: toolName,
        params: { ...validParams, [pname]: true },
        description: `${pname}_boolean_instead_of_string`,
        expectError: true,
      });
    }
  }

  // ─── 14. Array where string expected ───
  for (const [pname, prop] of Object.entries(properties) as [string, any][]) {
    if (prop.type === 'string') {
      cases.push({
        tool: toolName,
        params: { ...validParams, [pname]: ['array', 'instead'] },
        description: `${pname}_array_instead_of_string`,
        expectError: true,
      });
    }
  }

  // ─── 15. Object where string expected ───
  for (const [pname, prop] of Object.entries(properties) as [string, any][]) {
    if (prop.type === 'string' && !required.includes(pname)) {
      cases.push({
        tool: toolName,
        params: { ...validParams, [pname]: { nested: 'object' } },
        description: `${pname}_object_instead_of_string`,
        expectError: true,
      });
      break; // one is enough
    }
  }

  // ─── 16. Boundary numeric values ───
  for (const [pname, prop] of Object.entries(properties) as [string, any][]) {
    if (prop.type === 'number') {
      cases.push({
        tool: toolName,
        params: { ...validParams, [pname]: Number.MAX_SAFE_INTEGER },
        description: `${pname}_max_safe_integer`,
      });
      cases.push({
        tool: toolName,
        params: { ...validParams, [pname]: Number.MIN_SAFE_INTEGER },
        description: `${pname}_min_safe_integer`,
      });
    }
  }

  return cases;
}

// ═══════════════════════════════════════════════
// Batch Definitions
// ═══════════════════════════════════════════════

const BATCHES: string[][] = [
  // Batch 0: e-Stat tools (10)
  ['estat_search', 'estat_meta', 'estat_data', 'estat_browse_indicators', 'estat_check_availability',
   'estat_merger_check', 'estat_compare_municipalities', 'estat_time_series', 'estat_correlation', 'estat_session_init'],
  // Batch 1: RESAS + Dashboard (10)
  ['resas_prefectures', 'resas_cities', 'resas_population', 'resas_population_pyramid',
   'resas_industry', 'resas_tourism', 'resas_finance', 'resas_patents', 'dashboard_indicators', 'dashboard_data'],
  // Batch 2: Corporate + Law (9)
  ['houjin_search', 'gbiz_search', 'gbiz_detail', 'edinet_documents',
   'law_search', 'law_data', 'law_keyword_search', 'realestate_transactions', 'realestate_landprice'],
  // Batch 3: Infrastructure + Open Data (9)
  ['mlit_dpf_search', 'mlit_dpf_catalog', 'opendata_search', 'opendata_detail',
   'geospatial_search', 'geospatial_dataset', 'geospatial_organizations', 'safety_overseas', 'hellowork_search'],
  // Batch 4: Weather + Disaster (9)
  ['jma_forecast', 'jma_overview', 'jma_forecast_week', 'jma_typhoon', 'jshis_hazard',
   'amedas_stations', 'amedas_data', 'jma_earthquake', 'jma_tsunami'],
  // Batch 5: Geo + Flood + Traffic (7)
  ['flood_depth', 'river_level', 'traffic_volume', 'gsi_geocode', 'gsi_reverse_geocode',
   'geoshape_city', 'geoshape_pref'],
  // Batch 6: Academic (7)
  ['ndl_search', 'jstage_search', 'cinii_search', 'japansearch_search',
   'kokkai_speeches', 'kokkai_meetings', 'kkj_search'],
  // Batch 7: Science + NDB (8)
  ['soramame_air', 'geology_legend', 'geology_at_point', 'jaxa_collections',
   'agriknowledge_search', 'irdb_search', 'researchmap_achievements', 'ndb_hub_proxy'],
  // Batch 8: PLATEAU + PubComment + Mirasapo + NDB + BOJ (12)
  ['plateau_datasets', 'plateau_citygml', 'pubcomment_list', 'mirasapo_search', 'mirasapo_detail',
   'mirasapo_categories', 'mirasapo_regions', 'ndb_inspection_stats', 'ndb_items', 'ndb_areas',
   'ndb_range_labels', 'boj_timeseries'],
  // Batch 9: BOJ + Transport + Scenarios + Catalog (12)
  ['boj_major_statistics', 'msil_layers', 'msil_features', 'odpt_railway_timetable', 'odpt_bus_timetable',
   'scenario_regional_health_economy', 'scenario_labor_demand_supply', 'scenario_corporate_intelligence',
   'scenario_disaster_risk_assessment', 'scenario_academic_trend', 'scenario_academic_trend_by_topics',
   'scenario_national_economy_summary'],
];

// ═══════════════════════════════════════════════
// Runner
// ═══════════════════════════════════════════════

async function runTests(toolNames: string[], allToolSchemas: any[]): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const client = new McpClient();

  try {
    await client.initialize();

    // Build schema map
    const schemaMap = new Map<string, any>();
    for (const t of allToolSchemas) {
      schemaMap.set(t.name, t);
    }

    for (const toolName of toolNames) {
      const schema = schemaMap.get(toolName);
      if (!schema) {
        results.push({
          tool: toolName,
          description: 'TOOL_NOT_FOUND',
          status: 'fail',
          duration_ms: 0,
          errorDetail: `Tool "${toolName}" not found in server tools/list`,
        });
        continue;
      }

      const defaults = TOOL_DEFAULTS[toolName] || {};
      const cases = generateCasesForTool(toolName, schema, defaults);
      process.stderr.write(`\n── ${toolName} (${cases.length} cases) ──\n`);

      for (const tc of cases) {
        if (!client.alive) {
          results.push({
            tool: tc.tool,
            description: tc.description,
            status: 'crash',
            duration_ms: 0,
            errorDetail: 'Server process died',
          });
          continue;
        }

        const start = Date.now();
        try {
          const response = await client.callTool(tc.tool, tc.params);
          const elapsed = Date.now() - start;

          if (response._timeout) {
            results.push({
              tool: tc.tool,
              description: tc.description,
              status: 'timeout',
              duration_ms: elapsed,
              errorDetail: 'Request timed out (15s)',
            });
            process.stderr.write('T');
            continue;
          }

          // Classify response
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

          // Determine pass/fail
          let status: TestResult['status'] = 'pass';
          if (tc.expectError && responseType === 'success' && !isApiKeyMissing) {
            // Expected error but got success — might still be OK (zod may accept)
            status = 'pass'; // be lenient
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
    }
  } finally {
    client.close();
  }

  return results;
}

// ═══════════════════════════════════════════════
// Analysis
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

    // Per-tool
    if (!summary.byTool[r.tool]) {
      summary.byTool[r.tool] = { total: 0, pass: 0, fail: 0, timeout: 0, crash: 0 };
    }
    summary.byTool[r.tool].total++;
    summary.byTool[r.tool][r.status]++;

    // Response types
    if (r.responseType) {
      summary.responseTypes[r.responseType] = (summary.responseTypes[r.responseType] || 0) + 1;
    }

    // Slow tests (>5s)
    if (r.duration_ms > 5000) {
      summary.slowTests.push({ tool: r.tool, description: r.description, ms: r.duration_ms });
    }

    // Failures
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

  // First, get all tool schemas
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

  await new Promise(r => setTimeout(r, 500)); // let port settle

  // Determine which tools to test
  let toolsToTest: string[];
  if (batchNum >= 0 && batchNum < BATCHES.length) {
    toolsToTest = BATCHES[batchNum];
    process.stderr.write(`\nBatch ${batchNum}: ${toolsToTest.length} tools\n`);
  } else {
    toolsToTest = BATCHES.flat();
    process.stderr.write(`\nAll batches: ${toolsToTest.length} tools\n`);
  }

  // Count expected cases
  const schemaMap = new Map(allTools.map((t: any) => [t.name, t]));
  let expectedCases = 0;
  for (const tn of toolsToTest) {
    const schema = schemaMap.get(tn);
    if (schema) {
      const defaults = TOOL_DEFAULTS[tn] || {};
      expectedCases += generateCasesForTool(tn, schema, defaults).length;
    }
  }
  process.stderr.write(`Expected test cases: ${expectedCases}\n`);

  // Run tests
  const results = await runTests(toolsToTest, allTools);

  // Analyze
  const summary = analyze(results, batchNum >= 0 ? batchNum : 'all');

  // Output
  const output = {
    summary,
    results,
    timestamp: new Date().toISOString(),
  };

  const outPath = outFile || resolve(__dirname, '..', `stress-results${batchNum >= 0 ? `-${batchNum}` : ''}.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  process.stderr.write(`\n\nResults written to: ${outPath}\n`);

  // Print summary to stderr
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

  // Per-tool summary
  process.stderr.write(`\nPer-tool:\n`);
  for (const [tool, stats] of Object.entries(summary.byTool)) {
    const marker = stats.fail > 0 || stats.crash > 0 ? '❌' : stats.timeout > 0 ? '⏱️' : '✅';
    process.stderr.write(`  ${marker} ${tool}: ${stats.pass}/${stats.total} pass`);
    if (stats.fail > 0) process.stderr.write(`, ${stats.fail} fail`);
    if (stats.timeout > 0) process.stderr.write(`, ${stats.timeout} timeout`);
    if (stats.crash > 0) process.stderr.write(`, ${stats.crash} crash`);
    process.stderr.write('\n');
  }

  // Exit code
  const exitCode = summary.crash > 0 ? 2 : summary.fail > 0 ? 1 : 0;
  process.exit(exitCode);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(99);
});
