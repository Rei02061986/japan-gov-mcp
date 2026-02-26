/**
 * 学術研究トレンド分析シナリオ
 * NDL + J-STAGE + CiNii + ジャパンサーチ + AgriKnowledge 横断検索
 */

import type { ApiResponse } from '../utils/http.js';
import { createError } from '../utils/http.js';
import { searchNdl, searchJstage, searchCinii, searchJapanSearch } from '../providers/academic.js';
import { searchAgriKnowledge } from '../providers/misc.js';

/**
 * 学術研究トレンド分析 (単一キーワード)
 */
export async function academicTrend(params: {
  keyword: string;
  limit?: number;
  includeAgri?: boolean;
}): Promise<ApiResponse<unknown>> {
  const source = 'Scenario/academic_trend';

  if (!params.keyword?.trim()) {
    return createError(source, 'keyword is required');
  }

  const limit = params.limit || 5;

  try {
    const tasks = [
      searchNdl({ query: params.keyword, count: limit }).then(r => ({ db: 'NDL', ...r })),
      searchJstage({ query: params.keyword, count: limit }).then(r => ({ db: 'J-STAGE', ...r })),
      searchCinii({ query: params.keyword, count: limit }).then(r => ({ db: 'CiNii', ...r })),
      searchJapanSearch({ keyword: params.keyword, size: limit }).then(r => ({ db: 'JapanSearch', ...r })),
    ];

    if (params.includeAgri) {
      tasks.push(
        searchAgriKnowledge({ query: params.keyword, count: limit }).then(r => ({ db: 'AgriKnowledge', ...r }))
      );
    }

    const results = await Promise.allSettled(tasks);
    const data: Record<string, unknown> = { keyword: params.keyword };

    for (const r of results) {
      if (r.status === 'fulfilled') {
        const val = r.value as ApiResponse & { db: string };
        data[val.db] = val.success ? val.data : { error: val.error };
      }
    }

    return {
      success: true,
      data,
      source,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return createError(source, error instanceof Error ? error.message : String(error));
  }
}

/**
 * 分野別学術トレンド比較 (複数キーワード)
 */
export async function academicTrendByTopics(params: {
  topics: string[];
  limit?: number;
}): Promise<ApiResponse<unknown>> {
  const source = 'Scenario/academic_trend_by_topics';

  if (!params.topics || params.topics.length === 0) {
    return createError(source, 'topics array is required');
  }

  const limit = params.limit || 3;

  try {
    const topicResults = await Promise.allSettled(
      params.topics.map(async (topic) => {
        const [ndl, jstage, cinii] = await Promise.allSettled([
          searchNdl({ query: topic, count: limit }),
          searchJstage({ query: topic, count: limit }),
          searchCinii({ query: topic, count: limit }),
        ]);

        const extract = (r: PromiseSettledResult<ApiResponse>) =>
          r.status === 'fulfilled' && r.value.success ? r.value.data : null;

        return {
          topic,
          NDL: extract(ndl),
          'J-STAGE': extract(jstage),
          CiNii: extract(cinii),
        };
      })
    );

    const data = topicResults
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<{ topic: string; NDL: unknown; 'J-STAGE': unknown; CiNii: unknown }>).value);

    return {
      success: true,
      data,
      source,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return createError(source, error instanceof Error ? error.message : String(error));
  }
}
