/**
 * percentile — パーセンタイル計算・分布統計量・ランキング
 *
 * 全関数は純粋関数。外部状態・IO なし。
 */

/** 時系列データ点 */
export interface TimeSeriesPoint {
  period: string;
  value: number;
}

/** 分布統計量 */
export interface Distribution {
  min: number;
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  max: number;
  mean: number;
  stdev: number;
  n: number;
}

/**
 * パーセンタイル計算（線形補間法）
 * value が data の分布のどこに位置するかを 0-100 で返す。
 */
export function computePercentile(value: number, data: number[]): number {
  if (data.length === 0) return 50;
  if (data.length === 1) return data[0] === value ? 50 : value > data[0] ? 100 : 0;

  const sorted = [...data].sort((a, b) => a - b);
  if (value <= sorted[0]) return 0;
  if (value >= sorted[sorted.length - 1]) return 100;

  // Count values strictly below
  let below = 0;
  for (const v of sorted) {
    if (v < value) below++;
    else break;
  }

  return Math.round((below / (sorted.length - 1)) * 100 * 10) / 10;
}

/**
 * 分布統計量を一括計算
 */
export function computeDistribution(data: number[]): Distribution {
  if (data.length === 0) {
    return { min: 0, p10: 0, p25: 0, median: 0, p75: 0, p90: 0, max: 0, mean: 0, stdev: 0, n: 0 };
  }

  const sorted = [...data].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);

  const pAt = (p: number): number => {
    if (n === 1) return sorted[0];
    const idx = (p / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };

  const r3 = (v: number) => Math.round(v * 1000) / 1000;

  return {
    min: sorted[0],
    p10: r3(pAt(10)),
    p25: r3(pAt(25)),
    median: r3(pAt(50)),
    p75: r3(pAt(75)),
    p90: r3(pAt(90)),
    max: sorted[n - 1],
    mean: r3(mean),
    stdev: r3(stdev),
    n,
  };
}

/**
 * value に近い過去の値を最大 maxCount 件抽出
 */
export function findClosestPoints(
  value: number,
  timeSeries: TimeSeriesPoint[],
  maxCount = 3,
): TimeSeriesPoint[] {
  return [...timeSeries]
    .sort((a, b) => Math.abs(a.value - value) - Math.abs(b.value - value))
    .slice(0, maxCount);
}

/**
 * 偏差値（平均50, 標準偏差10）を計算
 */
export function deviationScore(value: number, mean: number, stdev: number): number {
  if (stdev === 0) return 50;
  return Math.round((50 + 10 * (value - mean) / stdev) * 10) / 10;
}

/**
 * ランク付け。descending=true で値が大きいほど1位。
 */
export function rankItems<T>(
  items: T[],
  getValue: (item: T) => number,
  descending = true,
): Array<T & { rank: number }> {
  const sorted = [...items].sort((a, b) =>
    descending ? getValue(b) - getValue(a) : getValue(a) - getValue(b),
  );
  return sorted.map((item, i) => ({ ...item, rank: i + 1 }));
}

/**
 * ランク順位の説明文を生成
 */
export function rankDescription(value: number, data: number[], windowYears: number): string {
  const sorted = [...data].sort((a, b) => b - a);
  const rank = sorted.findIndex(v => v <= value) + 1;
  if (rank <= 0) return `過去${windowYears}年で最低付近`;
  if (rank === 1) return `過去${windowYears}年で最高`;
  if (rank === sorted.length) return `過去${windowYears}年で最低`;
  return `過去${windowYears}年で${rank}番目の高さ`;
}
