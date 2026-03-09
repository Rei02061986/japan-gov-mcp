#!/usr/bin/env npx tsx
/**
 * MCP Stress Test Extra — Additional 1700+ cases
 *
 * Round 2: Cross-parameter, injection hardening, combinatorial,
 * + 4 missing tools from Round 1.
 *
 * Usage:
 *   npx tsx tests/stress-test-extra.ts --batch 0     # Missing tools + e-Stat
 *   npx tsx tests/stress-test-extra.ts --batch 1     # Weather + Disaster + Geo
 *   npx tsx tests/stress-test-extra.ts --batch 2     # Academic + Science + NDB
 *   npx tsx tests/stress-test-extra.ts --batch 3     # Corporate + Infra + Scenarios
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(__dirname, '..', 'build', 'index.js');

interface TestCase {
  tool: string;
  params: Record<string, any>;
  description: string;
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
// MCP Client (same as Round 1)
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
    this.child.stderr!.on('data', () => {});
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
      clientInfo: { name: 'stress-extra', version: '1.0.0' },
    }, 1, 10000);
    this.child.stdin!.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n'
    );
    await new Promise(r => setTimeout(r, 200));
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
// Injection Payloads
// ═══════════════════════════════════════════════

const INJECTION_STRINGS = [
  // Path traversal
  '../../../etc/passwd',
  '..\\..\\..\\windows\\system32',
  // Command injection
  '$(whoami)',
  '`cat /etc/passwd`',
  '; rm -rf /',
  '| ls -la',
  // Unicode edge cases
  '\u0000',                           // null byte
  '\u200B\u200B\u200B',              // zero-width spaces
  '\uFEFF',                           // BOM
  'A\u0300',                          // combining char
  '\uD800',                           // lone surrogate (invalid)
  // Format string
  '%s%s%s%s%s',
  '%x%x%x%x',
  '${7*7}',
  '{{7*7}}',
  // JSON injection
  '{"key":"value"}',
  '["array"]',
  'true',
  'false',
  '123',
  '-1',
  // XML injection
  '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
  '<![CDATA[test]]>',
  // URL injection
  'https://evil.com',
  'javascript:alert(1)',
  'data:text/html,<h1>test</h1>',
  // Very long repetitive
  'A'.repeat(10000),
  '日'.repeat(1000),
  // Whitespace variations
  '\t\t\t',
  '\n\n\n',
  '\r\n\r\n',
  '   leading',
  'trailing   ',
  '  both  ',
  // Numeric strings
  '99999999999999999999999',
  '-99999999999999999999',
  '1e308',
  'Infinity',
  'NaN',
  '-Infinity',
  '0x1F',
  '0b1010',
  '0o777',
];

// ═══════════════════════════════════════════════
// Extra Test Case Generators
// ═══════════════════════════════════════════════

function generateInjectionCases(toolName: string, stringParams: string[], validParams: Record<string, any>): TestCase[] {
  const cases: TestCase[] = [];
  for (const param of stringParams) {
    for (const payload of INJECTION_STRINGS) {
      cases.push({
        tool: toolName,
        params: { ...validParams, [param]: payload },
        description: `r2_inject_${param}_${payload.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_')}`,
      });
    }
  }
  return cases;
}

function generateCombinatoricCases(toolName: string, params: Record<string, any[]>): TestCase[] {
  const cases: TestCase[] = [];
  const keys = Object.keys(params);

  // Pairwise: for each pair of params, test combinations
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const ki = keys[i], kj = keys[j];
      for (const vi of params[ki]) {
        for (const vj of params[kj]) {
          cases.push({
            tool: toolName,
            params: { [ki]: vi, [kj]: vj },
            description: `r2_combo_${ki}=${String(vi).slice(0, 10)}_${kj}=${String(vj).slice(0, 10)}`,
          });
        }
      }
    }
  }
  return cases;
}

// ═══════════════════════════════════════════════
// Tool-specific Extra Cases
// ═══════════════════════════════════════════════

function generateExtraCases(): Record<string, TestCase[]> {
  const all: Record<string, TestCase[]> = {};

  // ── Missing 4 tools from Round 1 ──
  all['gov_api_catalog'] = [
    { tool: 'gov_api_catalog', params: {}, description: 'r2_no_params' },
    { tool: 'gov_api_catalog', params: { category: 'statistics' }, description: 'r2_statistics' },
    { tool: 'gov_api_catalog', params: { category: 'economy' }, description: 'r2_economy' },
    { tool: 'gov_api_catalog', params: { category: 'law' }, description: 'r2_law' },
    { tool: 'gov_api_catalog', params: { category: 'geospatial' }, description: 'r2_geospatial' },
    { tool: 'gov_api_catalog', params: { category: 'disaster' }, description: 'r2_disaster' },
    { tool: 'gov_api_catalog', params: { category: 'labor' }, description: 'r2_labor' },
    { tool: 'gov_api_catalog', params: { category: 'academic' }, description: 'r2_academic' },
    { tool: 'gov_api_catalog', params: { category: 'science' }, description: 'r2_science' },
    { tool: 'gov_api_catalog', params: { category: 'health' }, description: 'r2_health' },
    { tool: 'gov_api_catalog', params: { category: 'government' }, description: 'r2_government' },
    { tool: 'gov_api_catalog', params: { category: 'catalog' }, description: 'r2_catalog' },
    { tool: 'gov_api_catalog', params: { category: 'deprecated' }, description: 'r2_deprecated' },
    { tool: 'gov_api_catalog', params: { category: 'all' }, description: 'r2_all' },
    { tool: 'gov_api_catalog', params: { includeMetadata: true }, description: 'r2_with_metadata' },
    { tool: 'gov_api_catalog', params: { category: 'statistics', includeMetadata: true }, description: 'r2_stats_meta' },
    { tool: 'gov_api_catalog', params: { includeMetadata: false }, description: 'r2_no_metadata' },
    ...INJECTION_STRINGS.slice(0, 5).map((s, i) => ({
      tool: 'gov_api_catalog',
      params: { category: s as any },
      description: `r2_inject_category_${i}`,
    })),
  ];

  all['gov_cross_search'] = [
    { tool: 'gov_cross_search', params: { query: '人口' }, description: 'r2_population' },
    { tool: 'gov_cross_search', params: { query: 'GDP' }, description: 'r2_gdp' },
    { tool: 'gov_cross_search', params: { query: '環境' }, description: 'r2_environment' },
    { tool: 'gov_cross_search', params: { query: 'トヨタ' }, description: 'r2_toyota' },
    { tool: 'gov_cross_search', params: { query: '人口', scope: ['statistics'] }, description: 'r2_scope_stats' },
    { tool: 'gov_cross_search', params: { query: '人口', scope: ['corporate'] }, description: 'r2_scope_corp' },
    { tool: 'gov_cross_search', params: { query: '人口', scope: ['regional'] }, description: 'r2_scope_regional' },
    { tool: 'gov_cross_search', params: { query: '人口', scope: ['legal'] }, description: 'r2_scope_legal' },
    { tool: 'gov_cross_search', params: { query: '人口', scope: ['all'] }, description: 'r2_scope_all' },
    { tool: 'gov_cross_search', params: { query: '人口', scope: ['statistics', 'corporate'] }, description: 'r2_multi_scope' },
    { tool: 'gov_cross_search', params: { query: '' }, description: 'r2_empty_query' },
    { tool: 'gov_cross_search', params: { query: 'x'.repeat(500) }, description: 'r2_long_query' },
    { tool: 'gov_cross_search', params: { query: '日本語テスト🇯🇵' }, description: 'r2_unicode' },
    ...INJECTION_STRINGS.slice(0, 10).map((s, i) => ({
      tool: 'gov_cross_search',
      params: { query: s },
      description: `r2_inject_${i}`,
    })),
  ];

  all['scenario_realestate_demographics'] = [
    { tool: 'scenario_realestate_demographics', params: {}, description: 'r2_no_params' },
    { tool: 'scenario_realestate_demographics', params: { prefecture: '13' }, description: 'r2_tokyo' },
    { tool: 'scenario_realestate_demographics', params: { prefecture: '27' }, description: 'r2_osaka' },
    { tool: 'scenario_realestate_demographics', params: { prefecture: '13', city: '13101' }, description: 'r2_chiyoda' },
    { tool: 'scenario_realestate_demographics', params: { prefecture: '13', year: 2023 }, description: 'r2_with_year' },
    { tool: 'scenario_realestate_demographics', params: { prefecture: '13', quarter: 1 }, description: 'r2_with_quarter' },
    { tool: 'scenario_realestate_demographics', params: { prefecture: '13', quarter: 4 }, description: 'r2_q4' },
    { tool: 'scenario_realestate_demographics', params: { prefecture: '' }, description: 'r2_empty_pref' },
    { tool: 'scenario_realestate_demographics', params: { prefecture: '99' }, description: 'r2_invalid_pref' },
    { tool: 'scenario_realestate_demographics', params: { prefecture: '13', year: -1 }, description: 'r2_negative_year' },
    { tool: 'scenario_realestate_demographics', params: { prefecture: '13', year: 99999 }, description: 'r2_huge_year' },
    { tool: 'scenario_realestate_demographics', params: { prefecture: '13', quarter: 0 }, description: 'r2_q0' },
    { tool: 'scenario_realestate_demographics', params: { prefecture: '13', quarter: 5 }, description: 'r2_q5' },
    ...INJECTION_STRINGS.slice(0, 8).map((s, i) => ({
      tool: 'scenario_realestate_demographics',
      params: { prefecture: s },
      description: `r2_inject_${i}`,
    })),
  ];

  all['scenario_regional_economy_full'] = [
    { tool: 'scenario_regional_economy_full', params: { prefectureCode: '13' }, description: 'r2_tokyo' },
    { tool: 'scenario_regional_economy_full', params: { prefectureCode: '27' }, description: 'r2_osaka' },
    { tool: 'scenario_regional_economy_full', params: { prefectureCode: '01' }, description: 'r2_hokkaido' },
    { tool: 'scenario_regional_economy_full', params: { prefectureCode: '47' }, description: 'r2_okinawa' },
    { tool: 'scenario_regional_economy_full', params: { prefectureCode: '13', year: 2023 }, description: 'r2_with_year' },
    { tool: 'scenario_regional_economy_full', params: { prefectureCode: '' }, description: 'r2_empty_code' },
    { tool: 'scenario_regional_economy_full', params: { prefectureCode: '99' }, description: 'r2_invalid_code' },
    { tool: 'scenario_regional_economy_full', params: { prefectureCode: '13', year: -1 }, description: 'r2_neg_year' },
    ...INJECTION_STRINGS.slice(0, 8).map((s, i) => ({
      tool: 'scenario_regional_economy_full',
      params: { prefectureCode: s },
      description: `r2_inject_${i}`,
    })),
  ];

  // ── Extended injection tests for key tools ──
  const toolInjectionTargets: Record<string, { params: Record<string, any>; stringFields: string[] }> = {
    estat_search: { params: { searchWord: '人口' }, stringFields: ['searchWord', 'statsField', 'statsCode'] },
    estat_data: { params: { statsDataId: '0003410379', limit: 5 }, stringFields: ['statsDataId', 'cdTime', 'cdArea'] },
    estat_browse_indicators: { params: {}, stringFields: ['keyword', 'section'] },
    estat_session_init: { params: { codes: ['35211'] }, stringFields: [] },
    law_keyword_search: { params: { keyword: '環境' }, stringFields: ['keyword'] },
    gsi_geocode: { params: { address: '東京' }, stringFields: ['address'] },
    ndl_search: { params: { query: '統計' }, stringFields: ['query'] },
    cinii_search: { params: { query: '量子' }, stringFields: ['query'] },
    japansearch_search: { params: { keyword: '浮世絵' }, stringFields: ['keyword'] },
    opendata_search: { params: { q: '防災' }, stringFields: ['q'] },
    jma_forecast: { params: { areaCode: '130000' }, stringFields: ['areaCode'] },
    geoshape_city: { params: { code: '13101' }, stringFields: ['code'] },
    geoshape_pref: { params: { prefCode: '13' }, stringFields: ['prefCode'] },
    amedas_data: { params: { pointId: '44132' }, stringFields: ['pointId'] },
    plateau_datasets: { params: {}, stringFields: ['prefecture', 'city', 'type'] },
    plateau_citygml: { params: { meshCode: '53394525' }, stringFields: ['meshCode'] },
    mirasapo_search: { params: { keywords: 'IT' }, stringFields: ['keywords', 'prefecture'] },
    ndb_inspection_stats: { params: { itemName: 'BMI' }, stringFields: ['itemName', 'prefectureName'] },
    kokkai_speeches: { params: { any: '環境' }, stringFields: ['any', 'speaker'] },
    irdb_search: { params: { query: '機械学習' }, stringFields: ['query', 'title', 'author'] },
  };

  for (const [toolName, config] of Object.entries(toolInjectionTargets)) {
    if (!all[toolName]) all[toolName] = [];
    for (const field of config.stringFields) {
      for (const payload of INJECTION_STRINGS) {
        all[toolName].push({
          tool: toolName,
          params: { ...config.params, [field]: payload },
          description: `r2_inject_${field}_${payload.slice(0, 15).replace(/[^a-zA-Z0-9]/g, '_')}`,
        });
      }
    }
  }

  // ── Combinatoric tests for multi-param tools ──
  const comboTargets: Record<string, Record<string, any[]>> = {
    estat_search: { searchWord: ['人口', '労働', 'GDP', ''], surveyYears: ['2020', '2015-2020', '', '99999'] },
    jma_forecast: { areaCode: ['130000', '270000', '010000', '', '999999', 'invalid'] },
    jshis_hazard: { lat: [35.68, 43.06, 26.33, 0, -90, 90, 91], lon: [139.69, 141.34, 127.68, 0, -180, 180, 181] },
    gsi_reverse_geocode: { lat: [35.68, 0, -90, 90, 91, -91], lon: [139.69, 0, -180, 180, 181, -181] },
    flood_depth: { lat: [35.68, 24, 46, 23, 47], lon: [139.69, 122, 154, 121, 155] },
    traffic_volume: { lat: [35.68, 34.05, 43.06], lon: [139.69, 135.50, 141.34], radius: [100, 500, 1000, 5000, 0, -1] },
    geology_at_point: { lat: [35.68, 0, 90, -90], lon: [139.69, 0, 180, -180] },
    ndb_inspection_stats: { itemName: ['BMI', 'HbA1c', '収縮期血圧'], gender: ['male', 'female', 'all'] },
    kokkai_speeches: { any: ['環境', '経済', '防衛'], nameOfHouse: ['衆議院', '参議院', '両院'] },
    estat_merger_check: { codes: [['35211'], ['14382', '10426'], ['35211', '14382', '10426', '44213', '28209']] },
    estat_check_availability: {
      metricIds: [['population'], ['establishments', 'revpar'], ['population', 'establishments', 'fiscal_strength_index']],
      granularity: ['municipality', 'prefecture', 'national'],
    },
    mirasapo_categories: { type: ['industries', 'purposes', 'services', 'specific_measures'] },
    pubcomment_list: { type: ['list', 'result'] },
    ndb_areas: { type: ['prefecture', 'secondary_medical_area'] },
  };

  for (const [toolName, paramSets] of Object.entries(comboTargets)) {
    if (!all[toolName]) all[toolName] = [];
    const combos = generateCombinatoricCases(toolName, paramSets);
    all[toolName].push(...combos);
  }

  // ── Boundary value tests for lat/lon tools ──
  const latLonTools = ['jshis_hazard', 'flood_depth', 'traffic_volume', 'gsi_reverse_geocode', 'geology_at_point'];
  const latLonBoundaries = [
    { lat: 0, lon: 0, desc: 'origin' },
    { lat: 90, lon: 180, desc: 'max_pos' },
    { lat: -90, lon: -180, desc: 'max_neg' },
    { lat: 35.6895, lon: 139.6917, desc: 'tokyo' },
    { lat: 43.0621, lon: 141.3544, desc: 'sapporo' },
    { lat: 26.3344, lon: 127.8056, desc: 'naha' },
    { lat: 34.6937, lon: 135.5023, desc: 'osaka' },
    { lat: NaN, lon: NaN, desc: 'nan' },
  ];

  for (const tool of latLonTools) {
    if (!all[tool]) all[tool] = [];
    for (const b of latLonBoundaries) {
      all[tool].push({
        tool,
        params: { lat: b.lat, lon: b.lon },
        description: `r2_boundary_${b.desc}`,
      });
    }
  }

  // ── Multi-language search tests for text-search tools ──
  const searchTools = ['ndl_search', 'jstage_search', 'cinii_search', 'japansearch_search', 'irdb_search', 'opendata_search'];
  const multiLangQueries = [
    '人工知能', 'artificial intelligence', 'AI', '機械学習', 'deep learning',
    '量子コンピュータ', 'quantum computing', '環境問題', 'climate change',
    'ロボット工学', 'バイオテクノロジー', 'ナノテクノロジー', '再生可能エネルギー',
    '自然言語処理', '画像認識', 'ブロックチェーン', 'IoT',
  ];

  for (const tool of searchTools) {
    if (!all[tool]) all[tool] = [];
    const paramName = tool === 'japansearch_search' ? 'keyword' :
                      tool === 'opendata_search' ? 'q' : 'query';
    for (const q of multiLangQueries) {
      all[tool].push({
        tool,
        params: { [paramName]: q },
        description: `r2_search_${q.slice(0, 15)}`,
      });
    }
  }

  // ── Area code variation tests for weather tools ──
  const weatherAreaCodes = [
    '010000', '020000', '030000', '040000', '050000',  // 北海道〜秋田
    '060000', '070000', '080000', '090000', '100000',
    '110000', '120000', '130000', '140000', '150000',
    '160000', '170000', '180000', '190000', '200000',
    '210000', '220000', '230000', '240000', '250000',
    '260000', '270000', '280000', '290000', '300000',
    '310000', '320000', '330000', '340000', '350000',
    '360000', '370000', '380000', '390000', '400000',
    '410000', '420000', '430000', '440000', '450000',
    '460100', '471000',  // 鹿児島本土, 沖縄本島
  ];

  for (const tool of ['jma_forecast', 'jma_overview', 'jma_forecast_week']) {
    if (!all[tool]) all[tool] = [];
    for (const code of weatherAreaCodes) {
      all[tool].push({
        tool,
        params: { areaCode: code },
        description: `r2_area_${code}`,
      });
    }
  }

  // ── SSDS indicator coverage tests ──
  const ssdsIndicators = [
    'A1101', 'A1301', 'A4101', 'A6107', 'A7601',
    'B1101', 'B1103', 'B2101', 'B3106',
    'C2108', 'C2107', 'C210801', 'C210847', 'C3401',
    'D2101', 'D2201', 'D3101', 'D3104',
  ];

  all['estat_browse_indicators'] = all['estat_browse_indicators'] || [];
  for (const ind of ssdsIndicators) {
    all['estat_browse_indicators'].push({
      tool: 'estat_browse_indicators',
      params: { keyword: ind },
      description: `r2_ssds_${ind}`,
    });
  }

  // ── Municipality code variation tests ──
  const muniCodes = [
    '01100', '02201', '04100', '11100', '12100', '13101', '13104', '13113',
    '14100', '14382', '22100', '23100', '26100', '27100', '28100', '28209',
    '33100', '34100', '35211', '40100', '43100', '44213', '46210',
  ];

  all['estat_merger_check'] = all['estat_merger_check'] || [];
  for (let i = 0; i < muniCodes.length; i += 4) {
    const batch = muniCodes.slice(i, i + 4);
    all['estat_merger_check'].push({
      tool: 'estat_merger_check',
      params: { codes: batch },
      description: `r2_muni_batch_${i}`,
    });
  }

  all['estat_check_availability'] = all['estat_check_availability'] || [];
  const metricBatches = [
    ['population', 'aging_rate', 'total_households'],
    ['establishments', 'employees', 'establishments_accom'],
    ['fiscal_strength_index', 'local_tax_per_capita'],
    ['hotel_facility_count', 'ryokan_facility_count'],
    ['birth_rate', 'death_rate'],
    ['revpar', 'occupancy_rate', 'nyuto_tax'],
  ];
  for (const batch of metricBatches) {
    for (const gran of ['municipality', 'prefecture', 'national'] as const) {
      all['estat_check_availability'].push({
        tool: 'estat_check_availability',
        params: { metricIds: batch, granularity: gran },
        description: `r2_avail_${batch[0]}_${gran}`,
      });
    }
  }

  return all;
}

// ═══════════════════════════════════════════════
// Batch Definitions (Round 2)
// ═══════════════════════════════════════════════

const R2_BATCHES = [
  // Batch 0: Missing tools + e-Stat extended
  ['gov_api_catalog', 'gov_cross_search', 'scenario_realestate_demographics', 'scenario_regional_economy_full',
   'estat_search', 'estat_data', 'estat_browse_indicators', 'estat_session_init', 'estat_merger_check', 'estat_check_availability'],
  // Batch 1: Weather + Disaster + Geo extended
  ['jma_forecast', 'jma_overview', 'jma_forecast_week', 'jshis_hazard', 'flood_depth', 'traffic_volume',
   'gsi_geocode', 'gsi_reverse_geocode', 'geology_at_point', 'geoshape_city', 'geoshape_pref', 'amedas_data',
   'plateau_datasets', 'plateau_citygml'],
  // Batch 2: Academic + Science + NDB extended
  ['ndl_search', 'jstage_search', 'cinii_search', 'japansearch_search', 'irdb_search', 'opendata_search',
   'ndb_inspection_stats', 'kokkai_speeches', 'mirasapo_search', 'mirasapo_categories',
   'ndb_areas', 'pubcomment_list'],
  // Batch 3: Corporate + remaining
  ['law_keyword_search'],
];

// ═══════════════════════════════════════════════
// Runner
// ═══════════════════════════════════════════════

async function runTests(cases: TestCase[]): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const client = new McpClient();

  try {
    await client.initialize();

    for (let i = 0; i < cases.length; i++) {
      const tc = cases[i];
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
            errorDetail: 'Timeout 15s',
          });
          process.stderr.write('T');
          continue;
        }

        const hasError = response.error !== undefined;
        const content = response.result?.content;
        const textContent = Array.isArray(content)
          ? content.map((c: any) => c.text || '').join('').slice(0, 200)
          : '';

        let responseType = 'success';
        if (hasError) responseType = 'json_rpc_error';
        else if (textContent.includes('未設定')) responseType = 'api_key_missing';
        else if (textContent.startsWith('❌')) responseType = 'tool_error';

        results.push({
          tool: tc.tool,
          description: tc.description,
          status: 'pass',
          duration_ms: elapsed,
          responseType,
          responseSnippet: hasError ? JSON.stringify(response.error).slice(0, 150) : textContent,
        });

        process.stderr.write('.');
      } catch (err: any) {
        results.push({
          tool: tc.tool,
          description: tc.description,
          status: 'crash',
          duration_ms: Date.now() - start,
          errorDetail: err.message || String(err),
        });
        process.stderr.write('X');
      }

      // Progress
      if ((i + 1) % 100 === 0) process.stderr.write(` [${i + 1}/${cases.length}]\n`);
    }
  } finally {
    client.close();
  }

  return results;
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

  const allExtra = generateExtraCases();

  // Filter by batch
  let toolsInBatch: string[];
  if (batchNum >= 0 && batchNum < R2_BATCHES.length) {
    toolsInBatch = R2_BATCHES[batchNum];
  } else {
    toolsInBatch = R2_BATCHES.flat();
  }

  // Collect cases for batch
  const cases: TestCase[] = [];
  for (const tool of toolsInBatch) {
    if (allExtra[tool]) {
      cases.push(...allExtra[tool]);
    }
  }

  process.stderr.write(`Round 2 Batch ${batchNum >= 0 ? batchNum : 'ALL'}: ${cases.length} cases for ${toolsInBatch.length} tools\n`);

  const results = await runTests(cases);

  // Analyze
  let pass = 0, fail = 0, timeout = 0, crash = 0;
  const byTool: Record<string, any> = {};
  const failures: any[] = [];

  for (const r of results) {
    if (r.status === 'pass') pass++;
    else if (r.status === 'timeout') timeout++;
    else if (r.status === 'crash') crash++;
    else fail++;

    if (!byTool[r.tool]) byTool[r.tool] = { total: 0, pass: 0, fail: 0, timeout: 0, crash: 0 };
    byTool[r.tool].total++;
    byTool[r.tool][r.status]++;

    if (r.status !== 'pass') {
      failures.push({ tool: r.tool, description: r.description, detail: r.errorDetail || r.status });
    }
  }

  const output = {
    summary: {
      batch: batchNum >= 0 ? `r2_${batchNum}` : 'r2_all',
      totalTests: results.length,
      pass, fail, timeout, crash,
      byTool,
      failures,
    },
    results,
    timestamp: new Date().toISOString(),
  };

  const outPath = outFile || `/tmp/stress-results-r2-${batchNum >= 0 ? batchNum : 'all'}.json`;
  writeFileSync(outPath, JSON.stringify(output, null, 2));

  process.stderr.write(`\n\n${'═'.repeat(50)}\n`);
  process.stderr.write(`ROUND 2 SUMMARY (Batch ${batchNum >= 0 ? batchNum : 'ALL'})\n`);
  process.stderr.write(`Total: ${results.length} | Pass: ${pass} | Fail: ${fail} | Timeout: ${timeout} | Crash: ${crash}\n`);
  process.stderr.write(`Results: ${outPath}\n`);

  for (const [t, s] of Object.entries(byTool)) {
    const st = s as any;
    const m = st.fail > 0 || st.crash > 0 ? '❌' : st.timeout > 0 ? '⏱️' : '✅';
    process.stderr.write(`  ${m} ${t}: ${st.pass}/${st.total} pass`);
    if (st.timeout > 0) process.stderr.write(`, ${st.timeout} timeout`);
    if (st.fail > 0) process.stderr.write(`, ${st.fail} fail`);
    process.stderr.write('\n');
  }

  process.exit(crash > 0 ? 2 : fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(99);
});
