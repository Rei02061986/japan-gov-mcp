/**
 * trend-analyzer — トレンド分析関数
 *
 * 時系列データの方向・速度・加速度・ピーク・谷を分析する。
 * 全関数は純粋関数。
 */

/** 時系列データ点 */
export interface TimeSeriesPoint {
  period: string;
  value: number;
}

/** トレンド分析結果 */
export interface TrendResult {
  direction: '上昇' | '下降' | '横ばい';
  duration_periods: number;
  velocity: number;
  acceleration: '加速' | '減速' | '一定';
}

/** ピーク/谷の情報 */
export interface PeakTroughInfo {
  value: number;
  period: string;
  change_pct: number;
}

/**
 * トレンド方向・持続期間・速度・加速度を分析
 * @param options.recent_n 方向判定に使う直近ポイント数（デフォルト3）
 */
export function analyzeTrend(timeSeries: TimeSeriesPoint[], options?: { recent_n?: number }): TrendResult {
  if (timeSeries.length < 2) {
    return { direction: '横ばい', duration_periods: 0, velocity: 0, acceleration: '一定' };
  }

  const sorted = [...timeSeries].sort((a, b) => a.period.localeCompare(b.period));
  const n = sorted.length;

  // Direction: based on last recent_n points (default 3)
  const recentN = Math.min(options?.recent_n ?? 3, n);
  const recent = sorted.slice(-recentN);
  const first = recent[0].value;
  const last = recent[recent.length - 1].value;
  const changePct = first !== 0 ? Math.abs((last - first) / first) : 0;

  let direction: '上昇' | '下降' | '横ばい';
  if (changePct < 0.01) {
    direction = '横ばい';
  } else {
    direction = last > first ? '上昇' : '下降';
  }

  // Duration: consecutive same-direction periods from the end
  let duration = 1;
  for (let i = n - 1; i > 0; i--) {
    const diff = sorted[i].value - sorted[i - 1].value;
    if (direction === '上昇' && diff > 0) duration++;
    else if (direction === '下降' && diff < 0) duration++;
    else break;
  }

  // Velocity: linear regression slope
  const velocity = linearSlope(sorted);

  // Acceleration: first half vs second half slope
  const mid = Math.floor(n / 2);
  let acceleration: '加速' | '減速' | '一定' = '一定';
  if (n >= 4) {
    const firstHalf = linearSlope(sorted.slice(0, mid + 1));
    const secondHalf = linearSlope(sorted.slice(mid));
    const threshold = Math.abs(velocity) * 0.2;
    const diff = Math.abs(secondHalf) - Math.abs(firstHalf);
    acceleration = diff > threshold ? '加速' : diff < -threshold ? '減速' : '一定';
  }

  return {
    direction,
    duration_periods: duration,
    velocity: round3(velocity),
    acceleration,
  };
}

/**
 * ピーク（最大値）を特定し、currentValue からの変化率を返す
 */
export function findPeak(timeSeries: TimeSeriesPoint[], currentValue: number): PeakTroughInfo {
  if (timeSeries.length === 0) return { value: currentValue, period: '?', change_pct: 0 };

  let peak = timeSeries[0];
  for (const p of timeSeries) {
    if (p.value > peak.value) peak = p;
  }

  return {
    value: peak.value,
    period: peak.period,
    change_pct: peak.value !== 0 ? round1((currentValue - peak.value) / Math.abs(peak.value) * 100) : 0,
  };
}

/**
 * 谷（最小値）を特定し、currentValue からの変化率を返す
 */
export function findTrough(timeSeries: TimeSeriesPoint[], currentValue: number): PeakTroughInfo {
  if (timeSeries.length === 0) return { value: currentValue, period: '?', change_pct: 0 };

  let trough = timeSeries[0];
  for (const p of timeSeries) {
    if (p.value < trough.value) trough = p;
  }

  return {
    value: trough.value,
    period: trough.period,
    change_pct: trough.value !== 0 ? round1((currentValue - trough.value) / Math.abs(trough.value) * 100) : 0,
  };
}

/**
 * 過去の類似パターンを探索
 * 直近の変化パターン（direction, rate）と過去区間を比較して最大maxCount件返す。
 */
export function findSimilarPatterns(
  timeSeries: TimeSeriesPoint[],
  windowSize = 3,
  maxCount = 2,
): Array<{ period_range: string; pattern: string; duration_periods: number; outcome: string }> {
  if (timeSeries.length < windowSize * 2) return [];

  const sorted = [...timeSeries].sort((a, b) => a.period.localeCompare(b.period));
  const n = sorted.length;

  // Current pattern: last windowSize points
  const currentWindow = sorted.slice(-windowSize);
  const currentRate = currentWindow.length >= 2
    ? (currentWindow[currentWindow.length - 1].value - currentWindow[0].value) / (currentWindow[0].value || 1)
    : 0;

  const results: Array<{ period_range: string; pattern: string; duration_periods: number; outcome: string; score: number }> = [];

  // Scan past windows
  for (let i = 0; i <= n - windowSize * 2; i++) {
    const pastWindow = sorted.slice(i, i + windowSize);
    const pastRate = pastWindow.length >= 2
      ? (pastWindow[pastWindow.length - 1].value - pastWindow[0].value) / (pastWindow[0].value || 1)
      : 0;

    // Similarity: rates within 50% of each other
    if (Math.abs(currentRate) > 0.005 && Math.abs(pastRate) > 0.005) {
      const ratio = pastRate / currentRate;
      if (ratio > 0.5 && ratio < 2.0) {
        // What happened next?
        const nextIdx = Math.min(i + windowSize + 2, n - 1);
        const nextValue = sorted[nextIdx].value;
        const outcome = `${round1(pastWindow[0].value)}→${round1(nextValue)}`;
        const pattern = pastRate > 0 ? '上昇局面' : '下降局面';

        results.push({
          period_range: `${pastWindow[0].period}〜${pastWindow[pastWindow.length - 1].period}`,
          pattern,
          duration_periods: windowSize,
          outcome,
          score: Math.abs(1 - ratio), // lower is more similar
        });
      }
    }
  }

  return results
    .sort((a, b) => a.score - b.score)
    .slice(0, maxCount)
    .map(({ score: _s, ...rest }) => rest);
}

// ── Internal helpers ──

function linearSlope(points: TimeSeriesPoint[]): number {
  const n = points.length;
  if (n < 2) return 0;

  const xMean = (n - 1) / 2;
  const yMean = points.reduce((s, p) => s + p.value, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (points[i].value - yMean);
    den += (i - xMean) ** 2;
  }

  return den !== 0 ? num / den : 0;
}

function round3(v: number): number { return Math.round(v * 1000) / 1000; }
function round1(v: number): number { return Math.round(v * 10) / 10; }
