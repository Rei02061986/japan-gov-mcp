/**
 * navigate — データカタログ・探索プロバイダ
 *
 * 分析テーマからデータソースを推薦し、構造やカバレッジを事前確認する。
 * - recommend: トピック → API推薦
 * - schema: データセットの構造確認
 * - coverage: データ有無の事前確認
 */

import { createError } from '../utils/http.js';
import type { ApiResponse } from '../utils/http.js';
import * as estat from './estat.js';
import type { EStatConfig } from './estat.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const topicData = require('../data/topic-indicators.json') as TopicMapping;

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

interface TopicMapping {
  topics: Record<string, TopicEntry>;
  aliases: Record<string, string>;
}

const topics = topicData.topics;
const aliases = topicData.aliases;

/** APIキー要否マッピング */
const apiKeyMap: Record<string, { envVar: string; label: string } | null> = {
  estat: { envVar: 'ESTAT_APP_ID', label: 'e-Stat' },
  corporate: { envVar: 'GBIZ_TOKEN', label: 'gBiz (houjin/gbiz)' },
  weather: null,
  law: null,
  geo: null,
  academic: null,
  opendata: null,
  stats: null,
  misc: null,
};

/** APIキーが設定済みかチェック */
function isApiKeySet(tool: string): { required: boolean; set: boolean } {
  const mapping = apiKeyMap[tool];
  if (!mapping) return { required: false, set: true };
  return { required: true, set: !!process.env[mapping.envVar] };
}

/** トピック名を解決 */
function resolveTopic(input: string): { name: string; entry: TopicEntry } | undefined {
  const trimmed = input.trim();
  if (topics[trimmed]) return { name: trimmed, entry: topics[trimmed] };
  const aliased = aliases[trimmed] || aliases[trimmed.toLowerCase()];
  if (aliased && topics[aliased]) return { name: aliased, entry: topics[aliased] };
  for (const [name, entry] of Object.entries(topics)) {
    if (entry.keywords.some(kw => trimmed.includes(kw) || kw.includes(trimmed))) {
      return { name, entry };
    }
  }
  return undefined;
}

// ═══ recommend ═══

/**
 * トピック → 推薦APIリスト。各推薦にすぐ使えるパラメータテンプレート付き
 */
export function recommend(params: {
  topic: string;
  detailLevel?: 'quick' | 'comprehensive';
}): ApiResponse {
  const source = 'navigate/recommend';
  if (!params.topic?.trim()) {
    return createError(source, 'topic is required');
  }

  const resolved = resolveTopic(params.topic);
  if (!resolved) {
    // Fallback: suggest estat search
    return {
      success: true,
      data: {
        topic: params.topic,
        recommended: [{
          tool: 'estat',
          action: 'search',
          params: { q: params.topic },
          label: `e-Stat検索: ${params.topic}`,
          relevance: 'primary',
          ...isApiKeySet('estat'),
        }],
        hints: [`「${params.topic}」の事前定義がありません。e-Stat横断検索をお試しください`],
      },
      source,
      timestamp: new Date().toISOString(),
    };
  }

  const recommended: Array<Record<string, unknown>> = [];

  for (const tool of resolved.entry.primary) {
    const keyStatus = isApiKeySet(tool.tool);
    recommended.push({
      ...tool,
      relevance: 'primary',
      apiKeyRequired: keyStatus.required,
      apiKeySet: keyStatus.set,
    });
  }

  if (params.detailLevel !== 'quick') {
    for (const tool of resolved.entry.secondary) {
      const keyStatus = isApiKeySet(tool.tool);
      recommended.push({
        ...tool,
        relevance: 'secondary',
        apiKeyRequired: keyStatus.required,
        apiKeySet: keyStatus.set,
      });
    }
  }

  return {
    success: true,
    data: {
      topic: resolved.name,
      keywords: resolved.entry.keywords,
      recommended,
      hints: recommended.some(r => r.apiKeyRequired && !r.apiKeySet)
        ? ['一部のAPIキーが未設定です。APIキー不要の推薦を優先してください']
        : undefined,
    },
    source,
    timestamp: new Date().toISOString(),
  };
}

// ═══ schema ═══

/**
 * e-Statデータセットの構造情報を人間可読に変換
 */
export async function schema(
  params: { source: string; id: string },
  config: { estat: EStatConfig },
): Promise<ApiResponse> {
  const source = 'navigate/schema';
  if (!params.id?.trim()) {
    return createError(source, 'id is required');
  }

  if (params.source === 'estat') {
    if (!config.estat.appId) {
      return createError(source, 'ESTAT_APP_ID未設定');
    }
    const meta = await estat.getMetaInfo(config.estat, { statsDataId: params.id });
    if (!meta.success) return meta;

    const root = (meta.data as any)?.GET_META_INFO;
    if (!root) return { ...meta, data: { error: 'メタ情報の解析に失敗' } };

    const tableInf = root.TABLE_INF;
    const classInf = root.CLASS_INF?.CLASS_OBJ;

    // Parse dimensions
    const dimensions: Array<Record<string, unknown>> = [];
    const classObjs = Array.isArray(classInf) ? classInf : classInf ? [classInf] : [];
    for (const cls of classObjs) {
      const classes = cls.CLASS;
      const values = Array.isArray(classes) ? classes : classes ? [classes] : [];
      const type = cls['@id']?.includes('time') ? 'time'
        : cls['@id']?.includes('area') || cls['@id']?.includes('地域') ? 'area'
          : 'category';
      dimensions.push({
        id: cls['@id'],
        name: cls['@name'],
        type,
        count: values.length,
        samples: values.slice(0, 5).map((v: any) =>
          `${v['@code']}: ${typeof v['@name'] === 'object' ? v['@name']?.['$'] || v['@name'] : v['@name']}`
        ),
      });
    }

    // Find time range
    const timeDim = dimensions.find(d => d.type === 'time');
    const timeRange = timeDim ? {
      count: timeDim.count,
      samples: (timeDim.samples as string[]).slice(0, 3),
    } : undefined;

    // Find area level
    const areaDim = dimensions.find(d => d.type === 'area');
    const areaLevel = areaDim
      ? (areaDim.count as number) <= 1 ? 'national'
        : (areaDim.count as number) <= 48 ? 'prefecture'
          : 'city_or_below'
      : 'unknown';

    return {
      success: true,
      data: {
        statsDataId: params.id,
        title: typeof tableInf?.TITLE === 'object' ? tableInf.TITLE?.['$'] : tableInf?.TITLE,
        survey: typeof tableInf?.STAT_NAME === 'object' ? tableInf.STAT_NAME?.['$'] : tableInf?.STAT_NAME,
        org: typeof tableInf?.GOV_ORG === 'object' ? tableInf.GOV_ORG?.['$'] : tableInf?.GOV_ORG,
        updatedDate: tableInf?.UPDATED_DATE,
        dimensions,
        timeRange,
        areaLevel,
      },
      source,
      timestamp: new Date().toISOString(),
    };
  }

  // Other sources: return basic info
  return createError(source, `source="${params.source}" のスキーマ取得は未対応です。現在はestatのみ対応`);
}

// ═══ coverage ═══

/**
 * トピック × 地域のデータ有無を事前確認
 */
export function coverage(params: {
  topic?: string;
  area?: string;
}): ApiResponse {
  const source = 'navigate/coverage';
  if (!params.topic && !params.area) {
    return createError(source, 'topic or area (or both) is required');
  }

  const apis: Array<Record<string, unknown>> = [];

  if (params.topic) {
    const resolved = resolveTopic(params.topic);
    if (resolved) {
      for (const tool of [...resolved.entry.primary, ...resolved.entry.secondary]) {
        const keyStatus = isApiKeySet(tool.tool);
        apis.push({
          tool: tool.tool,
          action: tool.action,
          label: tool.label,
          available: !keyStatus.required || keyStatus.set,
          reason: keyStatus.required && !keyStatus.set ? 'APIキー未設定' : undefined,
        });
      }
    }
  }

  if (!params.topic) {
    // No topic: list all available tools
    for (const [tool, mapping] of Object.entries(apiKeyMap)) {
      const keyStatus = isApiKeySet(tool);
      apis.push({
        tool,
        label: mapping?.label || tool,
        available: !keyStatus.required || keyStatus.set,
        reason: keyStatus.required && !keyStatus.set ? `${mapping!.envVar}未設定` : undefined,
      });
    }
  }

  const available = apis.filter(a => a.available).length;
  const total = apis.length;
  const feasibility = total === 0 ? 'insufficient'
    : available === total ? 'full'
      : available >= total / 2 ? 'partial'
        : 'insufficient';

  return {
    success: true,
    data: {
      topic: params.topic,
      area: params.area,
      apis,
      feasibility,
      summary: `${available}/${total} API利用可能`,
    },
    source,
    timestamp: new Date().toISOString(),
  };
}
