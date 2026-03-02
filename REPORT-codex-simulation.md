# Codex User Simulation Test Report

**Date**: 2026-03-02
**Test File**: `tests/e2e/codex-simulation.test.ts`
**Runtime**: Node.js `node --test`
**Duration**: ~171ms
**Result**: **25/25 PASS** (0 fail, 0 skip)

---

## Summary Table

| # | Scenario | Tests | Result | Tool Calls | Issues |
|---|----------|-------|--------|------------|--------|
| 1 | 少子化の全体像 | 4 | ALL PASS | navigate.recommend, resolve.codeLookup, context.suggest, context.annotate | None |
| 2 | 東京の経済指標に文脈をつける | 4 | ALL PASS | resolve.areaBridge, resolve.codeLookup, context.percentile, context.peers | Area code filter required matching estatCode (fixed in test) |
| 3 | CPI の歴史的位置 | 3 | ALL PASS | context.percentile (x2), context.trendContext | Trend direction depends on last 3 points (fixed test data) |
| 4 | suggest の実用性テスト | 4 | ALL PASS | navigate.recommend, context.suggest (x3) | None |
| 5 | エラー・エッジケース | 10 | ALL PASS | resolve.codeLookup, context.peers, join.fillGaps (x2), join.normalize (x2), navigate.recommend, resolve.areaBridge, context.percentile, context.suggest | None |
| **Total** | **5 scenarios** | **25** | **25 PASS** | **17 distinct calls** | **2 test data fixes** |

---

## Detailed Per-Scenario Results

### Scenario 1: 少子化の全体像

| Test | Provider Call | Assertion | Result |
|------|-------------|-----------|--------|
| 1-1 | `navigate.recommend("少子化")` | Returns birth-rate related indicators; estat or stats in recommendations; each rec has tool/label/action | PASS |
| 1-2 | `resolve.codeLookup("少子化")` | Resolves to 人口 topic via 出生 keyword match; topic has name, keywords, tools | PASS |
| 1-3 | `context.suggest(topic="少子化")` | Returns broaden/explain suggestions; narrative is non-empty | PASS |
| 1-4 | `context.annotate(birth-rate time series)` | Returns context with percentile and trend for 出生率; suggestions array present; alerts array present | PASS |

**Observations**: The `少子化` keyword correctly resolves to the `人口` topic through the keyword match system (`出生` is a keyword of `人口`). The suggest engine produces `broaden` and `explain` suggestions for single-indicator contexts.

### Scenario 2: 東京の経済指標に文脈をつける

| Test | Provider Call | Assertion | Result |
|------|-------------|-----------|--------|
| 2-1 | `resolve.areaBridge({ name: "東京都" })` | prefCode=13, name=東京都, has estatCode/jmaCode/lat/lon | PASS |
| 2-2 | `resolve.codeLookup("東京都のGDP")` | Extracts area (prefCode=13) and topic (GDP) from natural language | PASS |
| 2-3 | `context.percentile(value=600, area="13")` | Percentile >= 80 for high value; distribution/rank_description/source_meta present | PASS |
| 2-4 | `context.peers(target="13", 47-pref data)` | 47 prefectures; Tokyo rank=1 (highest value); deviation_score/percentile_in_peers/top3/bottom3 | PASS |

**Observations**: The `codeLookup` function successfully parses composite queries like "東京都のGDP" into area + topic components. The percentile function correctly filters e-Stat data by area code prefix.

### Scenario 3: CPI の歴史的位置

| Test | Provider Call | Assertion | Result |
|------|-------------|-----------|--------|
| 3-1 | `context.percentile(CPI=3.2, 30yr data)` | Percentile >= 80 (anomalously high); 30 data points; historical_comparisons present | PASS |
| 3-2 | `context.trendContext(upward CPI)` | trend.direction = "上昇"; velocity > 0; from_peak and from_trough present | PASS |
| 3-3 | `context.percentile(historical comparisons)` | 1-3 comparisons returned; each has period and numeric value | PASS |

**Observations**: The 30-year CPI distribution correctly identifies 3.2% as an extreme high value. The trend analyzer uses the last 3 data points to determine direction, so test data must be crafted with ascending final points for an "上昇" result.

### Scenario 4: suggest の実用性テスト

| Test | Provider Call | Assertion | Result |
|------|-------------|-----------|--------|
| 4-1 | `navigate.recommend` + `context.suggest` | Integrated flow: recommendations become currentIndicators for suggest; >= 1 suggestion | PASS |
| 4-2 | `context.suggest` (structure check) | Every suggestion has tool, action, params, reason, title, type, priority | PASS |
| 4-3 | `context.suggest` (tool validation) | All suggested tool names are within the 13 valid tools | PASS |
| 4-4 | `context.suggest` (count bounds) | Suggestion count is 1-5 even with many alerts | PASS |

**Observations**: The suggest engine correctly caps output at 5 suggestions. All generated suggestions reference valid tool names from the server's 13-tool registry. The rule engine fires appropriately based on context (topic, area_level, alerts).

### Scenario 5: エラー・エッジケース

| Test | Provider Call | Assertion | Result |
|------|-------------|-----------|--------|
| 5-1 | `codeLookup("存在しない統計XYZABC")` | Returns success=false with helpful error message (no crash) | PASS |
| 5-2 | `peers(target="99")` | Returns success=false (invalid prefCode) | PASS |
| 5-3 | `fillGaps(records=[])` | Returns success=false (empty input), no crash | PASS |
| 5-4 | `normalize(unknown unit: フィート→メートル)` | Success=true, values unconverted, log shows "変換ルール未定義" | PASS |
| 5-5 | `recommend(topic="")` | Returns success=false for empty input | PASS |
| 5-6 | `areaBridge(name="xxxxxxxxxxxxxx")` | Returns success=false for nonsense input | PASS |
| 5-7 | `percentile(value=undefined)` | Returns success=false (missing required param) | PASS |
| 5-8 | `fillGaps(single record)` | Success=true, 0 gaps, 100% coverage | PASS |
| 5-9 | `suggest(empty inputs)` | Success=true, empty/minimal suggestions, narrative present | PASS |
| 5-10 | `normalize(千人→人)` | Converts 5千人→5000人 correctly; converted=true; unit=人 | PASS |

**Observations**: All error paths return structured `ApiResponse` objects with `success=false` and helpful error messages. No function throws an unhandled exception. Edge cases (empty arrays, undefined values, unknown codes) are handled gracefully.

---

## Discovered Issues (Fixed During Testing)

### Issue 1: Area Code Filtering in percentile

**Symptom**: Test 2-3 failed because mock data used area code `00000` but `percentile()` with `area='13'` resolved to estatCode `13000` and filtered by prefix.

**Root Cause**: The `extractEstatTimeSeries()` function filters `row['@area'].startsWith(areaFilter)`, requiring mock data to use matching area codes.

**Fix**: Updated mock to use `makeEstatTimeSeries(2009, gdpValues, '13000')`.

**Assessment**: This is correct behavior in the production code. The filtering ensures area-specific data extraction. Test data simply needed to match.

### Issue 2: Trend Direction Depends on Last 3 Points

**Symptom**: Test 3-2 expected "上昇" but got "下降" because the test data `[..., 3.2, 3.1, 2.8]` had declining final values.

**Root Cause**: `analyzeTrend()` uses the last `min(3, n)` points to determine direction. With `[3.2, 3.1, 2.8]`, the change is negative.

**Fix**: Adjusted test data to `[..., 2.8, 3.0, 3.2]` so the last 3 points are ascending.

**Assessment**: This is intended behavior -- the trend analyzer focuses on the most recent direction. When modeling "CPI is historically rising," the final data points must reflect that.

---

## Improvement Suggestions

### 1. Trend Analysis: Window Size Configuration
The `analyzeTrend()` function hardcodes `recentN = min(3, n)` for direction detection. A configurable window for recent-direction detection would allow callers to distinguish short-term vs medium-term trends.

### 2. Area Code Validation in percentile/trendContext
When `area` is provided but the fetched data has no matching rows, the error message could suggest checking the area code format (e.g., "Pass area as prefCode '13', not estatCode '13000'").

### 3. Suggest Engine: Tool Name Validation
The suggest rules hardcode tool names like `'join'`, `'law'`, `'academic'`. A runtime validation against the actual tool registry would catch mismatches if tool names change.

### 4. fillGaps: Auto-Detect Frequency
Currently `fillGaps` defaults to `'year'` frequency. It could auto-detect from the data format (e.g., `YYYY-MM` implies monthly, `YYYY` implies yearly).

### 5. normalize: Bidirectional Conversion
The unit conversion system only supports one-way rules (e.g., `千人→人` but not `人→千人`). Adding reverse rules or auto-generating them would increase flexibility.

### 6. Error Message Consistency
Some functions return Japanese error messages, others mix Japanese and English. Standardizing to Japanese-first with English field names would improve consistency.

---

## Test Architecture

- **Mocking Strategy**: `globalThis.fetch` replacement for API calls; pure functions tested directly
- **Data Generation**: Helper functions `makeEstatTimeSeries()` and `make47PrefData()` generate realistic e-Stat response structures
- **Cleanup**: `afterEach` restores original fetch and clears cache/rate limiters
- **Coverage**: 25 tests across 5 scenarios exercising 7 provider functions (recommend, codeLookup, areaBridge, percentile, peers, trendContext, annotate, suggest, fillGaps, normalize)
