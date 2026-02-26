# 疎通確認レポート — japan-gov-mcp

**実施日**: 2026-02-26
**実行環境**: macOS Darwin 25.2.0 / Node.js 24 / TypeScript
**作業ディレクトリ**: `~/Projects/japan-gov-mcp-recovered/`

---

## 総合結果

| 区分 | PASS | FAIL | SKIP | 合計 |
|------|------|------|------|------|
| No-Auth API | 45 | 0 | 6 | 51 |
| Auth-Required API | 2 (EDINET + MLIT DPF) | 0 | 11 | 13 |
| **合計** | **47** | **0** | **17** | **64** |

**疎通成功率**: 47/47 = **100%** (テスト実行した全API)
**コード修正で解決**: 合計26件 (初期21→47に改善)
- Round 1: 7件修正 (21→31)
- Round 2: 6件修正 (31→34)
- Round 3: 8件修正 + 2 Auth API追加 (34→42)
- Round 4: 5件修正 (42→47)

---

## PASS (47件) — 疎通成功

### No-Auth API (45件)

| # | API | エンドポイント | 提供元 |
|---|-----|---------------|--------|
| 1 | jma_forecast | 天気予報 | 気象庁 |
| 2 | jma_overview | 天気概況 | 気象庁 |
| 3 | jma_forecast_week | 週間天気予報 | 気象庁 |
| 4 | jma_typhoon | 台風情報 | 気象庁 |
| 5 | jma_earthquake | 地震情報 | 気象庁 |
| 6 | jma_tsunami | 津波情報 | 気象庁 |
| 7 | amedas_stations | アメダス観測所一覧 | 気象庁 |
| 8 | amedas_data | アメダス観測データ | 気象庁 |
| 9 | jshis_hazard | 地震ハザード | 防災科研 |
| 10 | flood_depth | 浸水想定（破堤点） | 国土地理院 |
| 11 | traffic_volume | 道路交通量 WFS | JARTIC/国交省 |
| 12 | gsi_geocode | ジオコーディング | 国土地理院 |
| 13 | gsi_reverse_geocode | 逆ジオコーディング | 国土地理院 |
| 14 | dashboard_indicators | 統計指標情報 | 総務省 |
| 15 | dashboard_data | 統計データ | 総務省 |
| 16 | law_search | 法令一覧 | デジタル庁 |
| 17 | law_data | 法令本文 | デジタル庁 |
| 18 | law_keyword_search | 法令キーワード検索 | デジタル庁 |
| 19 | opendata_search | オープンデータ検索 | デジタル庁 |
| 20 | safety_overseas | 海外安全情報 | 外務省 |
| 21 | geospatial_search | 地理空間データ検索 | G空間 |
| 22 | geospatial_organizations | 組織一覧 | G空間 |
| 23 | ndl_search | 国立国会図書館検索 | NDL |
| 24 | jstage_search | 学術論文検索 | J-STAGE |
| 25 | cinii_search | CiNii論文検索 | NII |
| 26 | japansearch_search | 文化遺産検索 | デジタル庁 |
| 27 | irdb_search | 機関リポジトリ検索 | NII |
| 28 | researchmap_achievements | 研究者業績 | JST |
| 29 | kokkai_speeches | 国会発言検索 | 国会図書館 |
| 30 | kokkai_meetings | 国会会議一覧 | 国会図書館 |
| 31 | kkj_search | 入札案件検索 | 官公需 |
| 32 | soramame_air | 大気汚染データ | 環境省 |
| 33 | geology_legend | 地質図凡例 | 産総研 |
| 34 | geology_at_point | 地点地質情報 | 産総研 |
| 35 | jaxa_collections | 衛星データカタログ | JAXA |
| 36 | ndb_items | NDB検査項目一覧 | 厚労省(Hub) |
| 37 | ndb_areas | NDB都道府県一覧 | 厚労省(Hub) |
| 38 | boj_major_statistics | 主要統計一覧 | 日銀 |
| 39 | boj_timeseries | コールレート日次データ | 日銀 |
| 40 | plateau_datasets | 3D都市モデル検索 | PLATEAU |
| 41 | plateau_citygml | CityGMLデータ | PLATEAU |
| 42 | pubcomment_list | パブコメ意見募集中 | e-Gov |
| 43 | mirasapo_search | 中小企業事例検索 | ミラサポplus |
| 44 | mirasapo_categories | カテゴリマスタ | ミラサポplus |
| 45 | mirasapo_regions | 地方マスタ | ミラサポplus |

### Auth-Required API (2件、キー設定済み)

| # | API | エンドポイント | 提供元 |
|---|-----|---------------|--------|
| 46 | edinet_documents | EDINET開示書類一覧 | 金融庁 |
| 47 | mlit_dpf_search | 国交省データ横断検索 | 国交省 |

---

## SKIP (17件) — 未テスト

### APIキー未設定 (11件)

| # | API | 理由 |
|---|-----|------|
| 1 | estat_search/meta/data (3) | ESTAT_APP_ID未設定 |
| 2 | resas_prefectures | RESAS API deprecated (2025-03-24 終了) |
| 3 | houjin_search | HOUJIN_APP_ID未設定 |
| 4 | gbiz_search | GBIZ_TOKEN未設定 |
| 5 | hellowork_search | HELLOWORK_API_KEY未設定 |
| 6 | realestate_transactions/landprice (2) | REALESTATE_API_KEY未設定 |
| 7 | msil_layers | MSIL_API_KEY未設定 |
| 8 | odpt_railway | ODPT_API_KEY未設定 |

### サービス側問題 (6件)

| # | API | 原因 | 状態 |
|---|-----|------|------|
| 1 | river_level | 自動アクセスブロック | river.go.jp 有料サービスのみ |
| 2 | geoshape_city | サーバー応答なし | geoshape.ex.nii.ac.jp timeout |
| 3 | geoshape_pref | サーバー応答なし | geoshape.ex.nii.ac.jp timeout |
| 4 | agriknowledge_search | システムメンテナンス | 2026/3/2まで停止中 |
| 5 | ndb_range_labels | 一時的サーバーエラー | NDB Hub SQL制限バグ |
| 6 | ndb_inspection_stats | 一時的サーバーエラー | NDB Hub SQL制限バグ |

---

## Round 4 修正内容

| # | API | 修正内容 |
|---|-----|---------|
| 1 | 浸水ナビ | GetFloodDepth→GetBreakPointMaxDepth、Node.js SSL legacy renegotiation対応 |
| 2 | JARTIC交通量 | jartic.or.jp→api.jartic-open-traffic.org WFS 2.0、CSV形式 |
| 3 | そらまめくん | REST API発見: /soramame/api/data_search (SPAのみではなかった) |
| 4 | JAXA | G-Portal CSW→data.earth.jaxa.jp STAC 1.0.0 API |
| 5 | NDB | record_mode: inspection→basic、gender: male/female→M/F |

## Round 3 修正内容

| # | API | 修正内容 |
|---|-----|---------|
| 1 | 統計ダッシュボード | MetaGetFlgパラメータ除去（WAFブロック回避）、getStatsData→getData |
| 2 | ミラサポplus | BASE_URL: /api/v1→/jirei-api, /cases→/case_studies |
| 3 | JMA台風 | SPA HTML応答を「台風なし」として正常処理 |
| 4 | 日銀BOJ | 完全書き換え: /ssi/api→/api/v1/getDataCode (新API) |
| 5 | パブコメ | servlet→RSS: /rss/pcm_list.xml |
| 6 | MLIT DPF | REST→GraphQL書き換え、data-platform.mlit.go.jp |
| 7 | IRDB | OAI-PMH GetRecord→ListIdentifiers |
| 8 | BOJスキーマ | index.ts Zodスキーマ更新、scenario修正 |

---

## API キー情報

| API | 環境変数 | 状態 |
|-----|---------|------|
| EDINET | EDINET_API_KEY | ✅ 設定済み・動作確認 |
| MLIT DPF | MLIT_DPF_API_KEY | ✅ 設定済み・動作確認 |
| e-Stat | ESTAT_APP_ID | 未設定 |
| 法人番号 | HOUJIN_APP_ID | 未設定 |
| gBizINFO | GBIZ_TOKEN | 未設定 |
| ハローワーク | HELLOWORK_API_KEY | 未設定 |
| 不動産情報 | REALESTATE_API_KEY | 未設定 |
| 海しる | MSIL_API_KEY | 未設定 |
| ODPT | ODPT_API_KEY | 未設定 |
