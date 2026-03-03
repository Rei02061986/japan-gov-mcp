# japan-gov-mcp

Japanese government API integration for [MCP (Model Context Protocol)](https://modelcontextprotocol.io/).
36 APIs through 14 tools with intelligent code resolution, data joining, and contextual analysis.

> 日本の中央省庁APIを統合するMCPサーバー。36のAPIを14ツール・78アクションで操作可能。

## Features

- **14 tools / 78 actions** — government statistics (e-Stat), corporate data, weather, legislation, geospatial, academic resources, and more
- **Code resolution** — natural language "東京の出生率" auto-resolves to API parameters
- **Data joining** — multiple sources joined on time/area axis with unit normalization
- **Contextual analysis** — "this value is in the Nth percentile over the past 30 years"
- **AI suggestions** — context-aware next-step recommendations
- **1,918 municipalities + 10,669 EDINET entities** built-in static dictionaries
- **663 tests / 0 FAIL** — including Codex AI user simulation tests

## Quick Start

### Install

```bash
git clone https://github.com/Rei02061986/japan-gov-mcp.git
cd japan-gov-mcp
npm install
npm run build
```

### Environment Variables

```bash
# Required (enables core statistics features)
export ESTAT_APP_ID=your_estat_app_id    # https://www.e-stat.go.jp/api/

# Optional (enable additional APIs as needed)
export HOUJIN_APP_ID=...     # Corporate number API
export GBIZ_TOKEN=...        # gBizINFO
export EDINET_API_KEY=...    # EDINET financial filings
export MLIT_DPF_API_KEY=...  # MLIT Data Platform
export REALESTATE_API_KEY=...# Real estate information
export HELLOWORK_API_KEY=... # HelloWork job listings
```

Many tools work **without any API keys**: weather, legislation, geospatial, academic search, BOJ statistics, NDB health data, and more.

### Claude Desktop Configuration

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "japan-gov": {
      "command": "node",
      "args": ["/path/to/japan-gov-mcp/build/index.js"],
      "env": {
        "ESTAT_APP_ID": "your_estat_app_id"
      }
    }
  }
}
```

## Tools

### Data Retrieval (Tools 1-9)

| # | Tool | Description | Key APIs |
|---|------|-------------|----------|
| 1 | `estat` | Government statistics search/retrieval | e-Stat API |
| 2 | `stats` | Economic indicators, BOJ, NDB health | Statistics Dashboard, BOJ, NDB |
| 3 | `corporate` | Corporate information | Corporate Number, gBiz, EDINET |
| 4 | `weather` | Weather and disaster prevention | JMA, J-SHIS, flood/river data |
| 5 | `law` | Legislation and parliamentary records | e-Laws, Diet minutes, public comments |
| 6 | `geo` | Geospatial data | GSI geocoding, PLATEAU 3D city models |
| 7 | `academic` | Academic and cultural resources | NDL, J-STAGE, CiNii, JapanSearch |
| 8 | `opendata` | Open data catalogs | data.go.jp, G-space |
| 9 | `misc` | Other government data | Travel safety, procurement, real estate, land prices, jobs |

### Analysis Layer (Tools 10-14)

| # | Tool | Description | Key Actions |
|---|------|-------------|-------------|
| 10 | `resolve` | Code resolution and ID bridging | `code_lookup`, `entity_bridge`, `area_bridge`, `time_bridge` |
| 11 | `navigate` | Data catalog exploration | `recommend`, `schema`, `coverage` |
| 12 | `join` | Data joining and normalization | `fetch_aligned`, `normalize`, `fill_gaps` |
| 13 | `context` | Contextual analysis and suggestions | `percentile`, `peers`, `trend_context`, `annotate`, `suggest` |

## Usage Examples

### Declining Birthrate Analysis (4 steps)

```
1. navigate.recommend("少子化")
   → Recommends: birthrate, marriage rate, childcare waiting lists

2. resolve.area_bridge(all prefectures)
   → Unified area codes across APIs

3. join.fetch_aligned([birthrate, land_prices])
   → Joined table for 47 prefectures

4. context.annotate(joined_table)
   → Tokyo: worst rank, Okinawa: #1, alerts for historic lows + next-step suggestions
```

### Cross-API Corporate Lookup

```
resolve.entity_bridge("トヨタ自動車")
→ { corporateNumber: "2180001...", edinetCode: "E02144", gbizAvailable: true }
```

### Historical Context for a Statistic

```
context.percentile({ source: "estat", indicator: "出生率", value: 1.20, area: "13" })
→ { percentile: 3.2, rank: "46/47", alert: "過去最低水準", historicalRange: "1.20-2.14" }
```

## API Coverage

### No API Key Required

| Category | APIs |
|----------|------|
| Statistics | Statistics Dashboard, BOJ Time Series, NDB Health Data |
| Weather | JMA Forecast, Typhoon, AMeDAS, J-SHIS Seismic Hazard, Flood/River |
| Legislation | e-Laws, Diet Minutes, Public Comments |
| Geospatial | GSI Geocoding, Geoshape Boundaries, PLATEAU 3D |
| Academic | NDL, J-STAGE, CiNii, JapanSearch, AgriKnowledge |
| Science | Soramame Air Quality, Geological Survey, JAXA Satellite |
| Government | Travel Safety, Diet Minutes, Procurement |
| Catalog | data.go.jp, G-Space |

### API Key Required

| API | Provider | Env Variable | Registration |
|-----|----------|-------------|--------------|
| e-Stat | Ministry of Internal Affairs | `ESTAT_APP_ID` | https://www.e-stat.go.jp/api/ |
| Corporate Number | National Tax Agency | `HOUJIN_APP_ID` | https://www.houjin-bangou.nta.go.jp/webapi/ |
| gBizINFO | METI | `GBIZ_TOKEN` | https://info.gbiz.go.jp/hojin/api |
| EDINET | FSA | `EDINET_API_KEY` | https://disclosure2.edinet-fsa.go.jp/ |
| MLIT Data Platform | MLIT | `MLIT_DPF_API_KEY` | https://www.mlit-data.jp/ |
| Real Estate | MLIT | `REALESTATE_API_KEY` | https://www.reinfolib.mlit.go.jp/ |
| HelloWork | MHLW | `HELLOWORK_API_KEY` | https://www.hellowork.mhlw.go.jp/ |

All API keys are **free** to obtain.

## Testing

```bash
npm test             # Unit tests (421)
npm run test:e2e     # E2E tests (242)
npm run test:all     # All tests (663)
```

## Logging

All tool calls are automatically logged in JSONL format.

```bash
# Most called tools
cat ~/.japan-gov-mcp/logs/*.jsonl | jq -r .tool | sort | uniq -c | sort -rn

# Errors only
cat ~/.japan-gov-mcp/logs/*.jsonl | jq 'select(.status=="error")'
```

Disable logging: `JAPAN_GOV_MCP_LOG=false`

## Specification

For the complete technical specification, see [SPEC-v3.3.md](./SPEC-v3.3.md).
Pass this file to another AI to give it full understanding of all 14 tools and 78 actions.

## Development

```bash
npm run build       # TypeScript compile
npm run typecheck   # Type check only
npm test            # Run tests
npm run inspect     # MCP Inspector GUI
```

## Data Sources and Credits

This project integrates data from the following Japanese government APIs. All data usage complies with each provider's terms of service.

### License Framework

Most Japanese government APIs use one of these standard licenses:

| License | CC BY 4.0 Compatible | Commercial Use |
|---------|:---------------------:|:--------------:|
| [政府標準利用規約（第2.0版）](https://cio.go.jp/sites/default/files/uploads/documents/opendata_nijiriyou_betten1.pdf) | Yes | Yes |
| [公共データ利用規約 PDL 1.0](https://www.digital.go.jp/en/resources/open_data/public_data_license_v1.0) | Yes | Yes |

### Required Credits

The following credit statements are required when using data from these APIs:

> **e-Stat**: このサービスは、政府統計総合窓口(e-Stat)のAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。
>
> **統計ダッシュボード**: このサービスは、統計ダッシュボードのAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。
>
> **BOJ時系列統計**: このサービスは、日本銀行時系列統計データ検索サイトのAPI機能を使用しています。サービスの内容は日本銀行によって保証されたものではありません。
>
> **法人番号**: このサービスは、国税庁法人番号システムWeb-API機能を利用して取得した情報をもとに作成しているが、サービスの内容は国税庁によって保証されたものではない。
>
> **不動産情報ライブラリ**: このサービスは、国土交通省不動産情報ライブラリのAPI機能を使用していますが、提供情報の最新性、正確性、完全性等が保証されたものではありません。
>
> **MLIT DPF**: このサービスは、国土交通データプラットフォームのAPI機能を使用していますが、最新のデータを保証するものではありません。

### Data Providers

| Provider | API | License |
|----------|-----|---------|
| 総務省 | e-Stat, 統計ダッシュボード | 政府標準利用規約2.0 / PDL 1.0 |
| 日本銀行 | BOJ時系列統計 | 独自規約 |
| 厚生労働省 | NDBオープンデータ | PDL 1.0 |
| 国税庁 | 法人番号 | 独自規約 |
| 経済産業省/デジタル庁 | gBizINFO | 政府標準利用規約2.0 |
| 金融庁 | EDINET | PDL 1.0 |
| 気象庁 | 天気予報, 地震・津波 | 政府標準利用規約2.0 |
| 防災科研 | J-SHIS | 独自規約 |
| 国土地理院 | ジオコーディング, 浸水ナビ | GSI利用規約 (CC BY互換) |
| 日本道路交通情報センター | JARTIC交通量 | CC BY 4.0 |
| デジタル庁 | e-Laws法令API | 政府標準利用規約2.0 |
| 国立国会図書館 | 国会会議録, NDLサーチ | PDL 1.0 |
| e-Gov | パブリックコメント | 政府標準利用規約2.0 |
| 国交省 | PLATEAU, 不動産, DPF | PDL 1.0 / 独自 |
| JST | J-STAGE | 独自規約 |
| NII | CiNii, IRDB, Geoshape | 独自 / CC BY 4.0 |
| 国立国会図書館/文化庁 | ジャパンサーチ | CC0 / CC BY 4.0 |
| 外務省 | 海外安全情報 | PDL 1.0 |
| 環境省 | そらまめくん | PDL 1.0 |
| 産総研 | 地質図Navi | 政府標準利用規約2.0 |
| JAXA | JAXA Earth API | 独自規約 |
| 農研機構 | AgriKnowledge | 独自規約（非営利のみ） |
| 中小企業庁 | ミラサポplus | PDL 1.0 |

For the complete terms of use analysis, see [REPORT-api-terms.md](./REPORT-api-terms.md).

## Disclaimer

- This project is **not affiliated with or endorsed by** the Japanese government or any of its agencies.
- All data is retrieved from publicly available government APIs. **Accuracy, completeness, and availability are not guaranteed.**
- Government APIs may change, rate-limit, or discontinue without notice.
- This software is provided "as is" — see [LICENSE](./LICENSE) for details.
- **Do not use government statistics as the sole basis for critical decisions** without verifying against official sources.
- Data from each API is subject to that provider's terms of use. Users of this MCP server are responsible for complying with applicable terms when using the retrieved data.

> 本プロジェクトは日本政府・各省庁とは無関係の非公式ツールです。取得データの正確性・完全性・可用性は保証しません。政府APIは予告なく変更・停止される場合があります。重要な意思決定には必ず公式情報源を確認してください。各APIのデータはそれぞれの提供元の利用規約に従います。

## License

MIT

## Contributing

Pull requests welcome. Bug reports and feature requests via Issues.

## Links

- [MCP Protocol](https://modelcontextprotocol.io/)
- [Claude Desktop](https://claude.ai/download)
- [e-Stat (Government Statistics)](https://www.e-stat.go.jp/)
- [data.go.jp (Open Data Catalog)](https://www.data.go.jp/)
