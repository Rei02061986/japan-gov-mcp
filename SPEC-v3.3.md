# japan-gov-mcp v3.3 — 仕様書

> 日本の中央省庁API統合MCPサーバー。36 APIを13ツール・78アクションで統合アクセス。
> 本ドキュメントは別AIへの共有用。パラメータ名・型・制約を正確に記述。

---

## 概要

| 項目 | 値 |
|------|-----|
| バージョン | v3.3 |
| ツール数 | 13 |
| アクション数 | 78 |
| 対応API数 | 36 |
| 内部データファイル | 7 |
| テスト数 | 663 (663 pass / 0 fail / 5 skip) |
| E2Eシナリオ | 12本 |
| ランタイム | Node.js >= 22 |
| 依存 | @modelcontextprotocol/sdk, zod |

---

## アーキテクチャ

```
┌─────────────────────────────────────────────┐
│  Tool 13: context（文脈付与・サジェスト）    │ ← 数字に意味を与え、次を提案する
├─────────────────────────────────────────────┤
│  Tool 12: join（結合・正規化）              │ ← AIに結合済みテーブルを返す
├─────────────────────────────────────────────┤
│  Tool 11: navigate（探索・推薦）            │ ← AIにデータの在処を教える
├─────────────────────────────────────────────┤
│  Tool 10: resolve（コード解決・ID接続）     │ ← AIの自然言語をAPIコードに変換
├─────────────────────────────────────────────┤
│  Tool 1-9: データ取得（36 API）             │ ← 各省庁APIからデータを取得
│  estat / stats / corporate / weather / law  │
│  geo / academic / opendata / misc           │
├─────────────────────────────────────────────┤
│  [横断] logger（リクエストログ）            │ ← 全tool callを自動記録
└─────────────────────────────────────────────┘

上位ツール（10-13）は下位ツール（1-9）のhandlerを内部直接呼出し。
HTTP経由ではないため追加レイテンシなし。
```

**推奨ワークフロー:**
1. `navigate.recommend` → 分析テーマから使うべきAPIを特定
2. `resolve.code_lookup` → 自然言語をAPIパラメータに変換
3. `resolve.area_bridge` / `resolve.time_bridge` → 地域・時間コードを各API形式に変換
4. `join.fetch_aligned` → 複数指標を一括取得・結合
5. `join.normalize` / `join.fill_gaps` → 単位統一・欠損検知
6. `context.annotate` → 結合データに歴史的位置・順位・トレンド・アラートを一括付与
7. `context.suggest` → データ文脈から次に調べるべきことを提案

---

## 全ツール・全アクション

---

### Tool 1: estat

**【政府統計e-Stat】** 全府省の統計(人口/GDP/物価/雇用/貿易等)を横断検索。70万テーブル対応。

| action | 説明 |
|--------|------|
| `search` | キーワード検索 → 統計表一覧（statsDataIdを取得） |
| `meta` | statsDataId指定 → 分類情報（次元・コード体系） |
| `data` | statsDataId指定 → 統計値データ |

**パラメータ:**

| 名前 | 型 | 必須 | 説明 |
|------|-----|------|------|
| action | `"search" \| "meta" \| "data"` | Yes | |
| q | string | search時 | 検索キーワード（例: "人口", "GDP", "消費者物価指数"） |
| years | string | No | 調査年（例: "2023"） |
| field | string | No | 統計分野コード |
| org | string | No | 作成機関コード |
| id | string | meta/data時 | 統計表ID（searchで取得したstatsDataId） |
| cdTime | string | No | 時間コードで絞込 |
| cdArea | string | No | 地域コードで絞込（例: "13000"=東京都） |
| cdCat | string | No | 分類コードで絞込 |
| limit | number | No | 取得件数（デフォルト20） |

**APIキー:** `ESTAT_APP_ID` 必須

**レスポンス整形:**
- search結果は `summarizeEstat()` で整形: `{_totalResults, _showing, _hint, tables: [{statsDataId, title, survey, org, surveyDate, cycle}]}`
- meta/dataは `smartTrim()` で切り詰め

---

### Tool 2: stats

**【統計】** GDP/CPI/失業率(dash) / 金利/マネー/物価(boj) / 特定健診(ndb)

| action | 説明 |
|--------|------|
| `dash_list` | 統計ダッシュボード指標一覧 |
| `dash_data` | 統計ダッシュボード指標データ |
| `boj_codes` | 日銀主要統計の系列コード一覧（静的、APIキー不要） |
| `boj_data` | 日銀時系列データ取得 |
| `ndb_stats` | NDB特定健診データ |
| `ndb_items` | NDB検査項目一覧 |
| `ndb_areas` | NDB地域一覧 |

**パラメータ:**

| 名前 | 型 | 必須 | 説明 |
|------|-----|------|------|
| action | enum(上記7種) | Yes | |
| code | string | dash_data/boj_data/ndb_stats時 | 指標コード/系列コード/検査項目名 |
| db | string | No | 日銀DB（FM01=金融市場, MD01=マネタリーベース, MD02=マネーストック, PR01=企業物価, PR02=サービス価格, CO=短観） |
| region | string | No | 地域コード（dash_data）/ 都道府県名（ndb_stats） |
| from | string | No | 開始（dash:時間コード, boj:YYYYMM形式） |
| to | string | No | 終了 |
| freq | string | No | 日銀頻度: D=日次, M=月次, Q=四半期, A=年次 |
| areaType | `"prefecture" \| "secondary_medical_area"` | No | NDB地域タイプ |
| gender | `"M" \| "F" \| "all"` | No | NDB性別 |
| ageGroup | string | No | NDB年齢区分（例: "40-44"） |
| limit | number | No | |

**APIキー:** dash=不要, boj=不要, ndb=不要

**日銀主要系列コード（boj_codesで確認可能）:**
- `STRDCLUCON` — コールレート（日次）
- `DI_LARGEM` — 短観DI大企業製造業（四半期）
- `MBASE_M` — マネタリーベース（月次, DB:MD01）
- `M2_M` — マネーストック M2（月次, DB:MD02）
- `CGPI_INDEX` — 企業物価指数（月次, DB:PR01）
- `SPPI_INDEX` — サービス価格指数（月次, DB:PR02）

---

### Tool 3: corporate

**【企業情報】** 法人番号検索/企業基本・特許・調達・補助金(gBiz)/有価証券報告書(EDINET)

| action | 説明 |
|--------|------|
| `houjin` | 法人番号検索（名前or番号→企業基本情報） |
| `gbiz` | gBizINFO企業検索（名前or法人番号→基本情報、corporateNumber取得） |
| `gbiz_detail` | gBizINFO詳細（法人番号→特許/調達/補助金/財務/認証/表彰/職場） |
| `edinet` | EDINET有価証券報告書一覧（日付指定） |

**パラメータ:**

| 名前 | 型 | 必須 | 説明 |
|------|-----|------|------|
| action | enum(上記4種) | Yes | |
| name | string | No | 企業名（例: "トヨタ自動車"） |
| corpNum | string | No | 法人番号13桁（gbiz検索結果から取得） |
| address | string | No | 所在地（houjin検索で使用） |
| infoType | `"certification" \| "subsidy" \| "patent" \| "procurement" \| "finance" \| "commendation" \| "workplace"` | gbiz_detail時 | 情報種別 |
| date | string | edinet時 | 日付（YYYY-MM-DD） |
| limit | number | No | |

**APIキー:** houjin=`HOUJIN_APP_ID`, gbiz=`GBIZ_TOKEN`, edinet=`EDINET_API_KEY`

**レスポンス整形:**
- `summarizeGbiz()` で集計: patent→種別/年別集計, procurement→省庁別金額, subsidy→タイトル別件数

---

### Tool 4: weather

**【気象・防災】** 天気予報/地震/津波/浸水深/地震ハザード/交通量

| action | 説明 |
|--------|------|
| `forecast` | 天気予報（3日間） |
| `overview` | 天気概況 |
| `weekly` | 週間天気予報 |
| `typhoon` | 台風情報 |
| `amedas_st` | アメダス観測点一覧 |
| `amedas` | アメダス観測データ |
| `earthquake` | 地震一覧 |
| `tsunami` | 津波警報一覧 |
| `flood` | 浸水想定深（緯度経度指定） |
| `river` | 河川水位（観測所ID指定） |
| `hazard` | 地震ハザード（緯度経度指定） |
| `traffic` | 交通量（緯度経度指定） |

**パラメータ:**

| 名前 | 型 | 必須 | 説明 |
|------|-----|------|------|
| action | enum(上記12種) | Yes | |
| areaCode | string | forecast/overview/weekly時 | 都道府県コード6桁（例: "130000"=東京, "270000"=大阪） |
| pointId | string | amedas時 | アメダス観測点ID（例: "44132"=東京） |
| date | string | No | アメダス日付（YYYYMMDD） |
| lat | number | flood/hazard/traffic時 | 緯度 |
| lon | number | flood/hazard/traffic時 | 経度 |
| stationId | string | river時 | 河川観測所ID |
| radius | number | No | 交通量検索半径（m、デフォルト5000） |
| limit | number | No | |

**APIキー:** 全て不要

**areaCodeの例:**
- 016000=北海道, 130000=東京, 140000=神奈川, 230000=愛知, 260000=京都, 270000=大阪, 400000=福岡

---

### Tool 5: law

**【法令・国会・パブコメ】** 法律検索/国会議事録/パブリックコメント

| action | 説明 |
|--------|------|
| `search` | 法令キーワード検索 |
| `list` | 法令一覧（カテゴリ指定） |
| `fulltext` | 法令全文（lawId指定） |
| `speech` | 国会議事録 発言検索 |
| `meeting` | 国会議事録 会議一覧 |
| `pubcomment` | パブリックコメント一覧/結果 |

**パラメータ:**

| 名前 | 型 | 必須 | 説明 |
|------|-----|------|------|
| action | enum(上記6種) | Yes | |
| q | string | search/speech時 | キーワード |
| lawId | string | fulltext時 | 法令ID |
| category | number | No | 法令カテゴリ |
| speaker | string | No | 発言者名 |
| house | string | No | 院名 |
| meetingName | string | No | 委員会名（例: "国土交通委員会"） |
| from | string | No | 開始日 |
| until | string | No | 終了日 |
| limit | number | No | |
| pubType | `"list" \| "result"` | pubcomment時 | |

**APIキー:** 全て不要

**レスポンス整形:**
- `summarizeKokkai()`: 委員会別・発話者別集計、本文120字短縮

---

### Tool 6: geo

**【地理空間】** 住所⇔座標変換/行政区域境界/PLATEAU 3D都市モデル

| action | 説明 |
|--------|------|
| `geocode` | 住所 → 緯度経度 |
| `reverse` | 緯度経度 → 住所 |
| `city_geo` | 市区町村境界GeoJSON |
| `pref_geo` | 都道府県境界GeoJSON |
| `plateau` | PLATEAU 3D都市モデル検索 |
| `plateau_mesh` | PLATEAUメッシュ指定3Dデータ |

**パラメータ:**

| 名前 | 型 | 必須 | 説明 |
|------|-----|------|------|
| action | enum(上記6種) | Yes | |
| address | string | geocode時 | 住所（例: "東京都千代田区丸の内1丁目"） |
| lat | number | reverse時 | 緯度 |
| lon | number | reverse時 | 経度 |
| code | string | city_geo/plateau_mesh時 | 市区町村コード / メッシュコード |
| prefCode | string | pref_geo時 | 都道府県コード（例: "13"） |
| city | string | No | PLATEAU検索用: 市区町村名 |
| prefecture | string | No | PLATEAU検索用: 都道府県名 |
| limit | number | No | |

**APIキー:** 全て不要

---

### Tool 7: academic

**【学術・科学】** 書籍/論文/文化財/大気質/地質/衛星/研究者

| source | 説明 |
|--------|------|
| `ndl` | 国立国会図書館（書籍・雑誌） |
| `jstage` | J-STAGE学術論文 |
| `cinii` | CiNii Research（論文） |
| `japansearch` | ジャパンサーチ（文化財） |
| `irdb` | 機関リポジトリ（IRDB） |
| `agriknowledge` | 農林水産研究情報 |
| `air` | そらまめくん（大気質測定） |
| `geology` | 産総研地質図 |
| `jaxa` | JAXA衛星データカタログ |
| `researchmap` | researchmap研究者業績 |

**パラメータ:**

| 名前 | 型 | 必須 | 説明 |
|------|-----|------|------|
| source | enum(上記10種) | Yes | |
| q | string | 検索時 | キーワード |
| count | number | No | 取得件数 |
| title | string | No | タイトル検索（irdb用） |
| author | string | No | 著者名（irdb用） |
| prefCode | string | air時 | 都道府県コード（例: "13"） |
| lat | number | geology時 | 緯度 |
| lon | number | geology時 | 経度 |
| permalink | string | researchmap時 | 研究者パーマリンク |
| type | string | researchmap時 | 業績種別（published_papers, books等） |
| limit | number | No | |

**APIキー:** 全て不要

---

### Tool 8: opendata

**【オープンデータカタログ】** 政府/G空間/国交省DPF

| source | 説明 |
|--------|------|
| `gov` | data.go.jp（政府オープンデータカタログ、CKAN） |
| `geo` | G空間情報センター（地図・GIS） |
| `dpf` | 国交省データプラットフォーム（道路・鉄道・橋梁等） |

**パラメータ:**

| 名前 | 型 | 必須 | 説明 |
|------|-----|------|------|
| source | `"gov" \| "geo" \| "dpf"` | Yes | |
| q | string | 検索時 | キーワード |
| id | string | No | データセットID（検索結果から取得して詳細表示） |
| rows | number | No | 検索結果数 |
| limit | number | No | |

**APIキー:** dpf=`MLIT_DPF_API_KEY`、他は不要

---

### Tool 9: misc

**【その他行政】** 海外安全/入札/中小企業/不動産/地価/求人

| api | 説明 |
|-----|------|
| `safety` | 外務省海外安全情報 |
| `kkj` | 官公需（政府入札情報） |
| `mirasapo` | ミラサポplus（中小企業成功事例） |
| `mirasapo_cat` | ミラサポ カテゴリ一覧 |
| `mirasapo_region` | ミラサポ 地域一覧 |
| `realestate` | 不動産取引価格 |
| `landprice` | 公示地価 |
| `hellowork` | ハローワーク求人 |

**パラメータ:**

| 名前 | 型 | 必須 | 説明 |
|------|-----|------|------|
| api | enum(上記8種) | Yes | |
| q | string | No | 検索キーワード |
| id | string | No | ミラサポ事例ID |
| region | string | No | 海外安全: 地域コード |
| country | string | No | 海外安全: 国コード（例: "086"=中国, "410"=韓国, "840"=米国） |
| org | string | No | 官公需: 発注機関名（例: "防衛省"） |
| area | string | No | 不動産/地価: 都道府県コード（例: "13"） |
| year | string | No | 不動産/地価: 年（例: "2024"） |
| quarter | string | No | 不動産: 四半期（"1"-"4"） |
| city | string | No | 不動産/地価: 市区町村コード |
| prefCode | string | No | ハローワーク: 都道府県コード |
| employment | string | No | ハローワーク: 雇用形態 |
| catType | `"industries" \| "purposes" \| "services" \| "specific_measures"` | mirasapo_cat時 | |
| limit | number | No | |

**APIキー:** realestate/landprice=`REALESTATE_API_KEY`, hellowork=`HELLOWORK_API_KEY`、他は不要

---

### Tool 10: resolve

**【コード解決・ID接続】** 自然言語やエンティティ名からAPIパラメータ・IDを確定的に変換。
AIが直接APIを叩く際の「コード体系の壁」を解消するツール。

| action | 説明 |
|--------|------|
| `code_lookup` | 自然言語 → 地域 + トピック + APIパラメータに変換 |
| `entity_bridge` | 企業名/法人番号 → 全API横断ID変換（法人番号⇔edinetCode⇔secCode） |
| `area_bridge` | 地域コード相互変換（47都道府県 + 1,918市区町村対応） |
| `time_bridge` | 時間軸コード変換（暦年/年度/月次/四半期/和暦 → e-Stat cdTime, 日銀期間） |

**パラメータ:**

| 名前 | 型 | 必須 | 用途 | 説明 |
|------|-----|------|------|------|
| action | `"code_lookup" \| "entity_bridge" \| "area_bridge" \| "time_bridge"` | Yes | | |
| query | string | code_lookup時 | code_lookup | 自然言語クエリ（例: "東京都の人口", "大阪のGDP"） |
| source | `"estat" \| "stats" \| "boj"` | No | code_lookup | 対象API絞り込み |
| name | string | No | entity_bridge/area_bridge | 企業名 or 地域名 |
| corpNum | string | No | entity_bridge | 法人番号13桁 |
| prefCode | string | No | area_bridge | 都道府県コード2桁（"01"-"47"） |
| cityCode | string | No | area_bridge | 市区町村コード5桁（6桁チェックディジット付きも可） |
| jmaCode | string | No | area_bridge | 気象庁地域コード6桁（例: "130000"） |
| estatCode | string | No | area_bridge | e-Stat地域コード5桁（例: "13000"） |
| lat | number | No | area_bridge | 緯度（最近傍都道府県を返す） |
| lon | number | No | area_bridge | 経度 |
| from | string | time_bridge時 | time_bridge | 開始（"2020", "令和2年", "R2", "FY2020", "2020年度"） |
| to | string | No | time_bridge | 終了（省略時=from と同じ年） |
| freq | `"A" \| "Q" \| "M"` | No | time_bridge | A=年次, Q=四半期, M=月次 |
| calendar | `"fiscal" \| "calendar"` | No | time_bridge | fiscal=年度(4月始), calendar=暦年 |

**APIキー:** 基本不要（entity_bridgeでhoujin/gbiz呼出し時のみ各キー要）

**code_lookup レスポンス例:**
```json
{
  "area": {"prefCode":"13", "name":"東京都", "estatCode":"13000", "jmaCode":"130000"},
  "topic": {"name":"人口", "tools":[{"tool":"estat","action":"search","params":{"q":"人口推計"},"label":"人口推計（総務省）"}]},
  "hints": []
}
```

**entity_bridge レスポンス例:**
```json
{
  "corporateNumber": "1180301018771",
  "edinetCode": "E02144",
  "secCode": "72030",
  "houjin": {"corporateNumber":"1180301018771", "name":"トヨタ自動車株式会社", "address":"愛知県豊田市..."},
  "gbiz": {"corporateNumber":"1180301018771", "name":"トヨタ自動車株式会社", "status":"存続中"}
}
```

**area_bridge レスポンス（都道府県レベル）:**
```json
{"prefCode":"13", "name":"東京都", "kana":"とうきょうと", "jmaCode":"130000", "estatCode":"13000", "lat":35.68, "lon":139.69}
```

**area_bridge レスポンス（市区町村レベル）:**
```json
{"prefCode":"13", "cityCode":"13101", "prefName":"東京都", "cityName":"千代田区", "cityKana":"ちよだく", "cityType":"special_ward", "jmaCode":"130000", "estatCode":"13000", "lat":35.68, "lon":139.69}
```

**area_bridge 重複名ルール:**
- 中央区/北区/港区/南区/西区/東区/緑区 など複数自治体に存在する名前は直接解決不可
- 都道府県プレフィックス付き（"東京都中央区"）または市プレフィックス付き（"札幌市中央区"）で解決
- ユニークな名前（"千代田区", "八王子市"）は直接解決可

**area_bridge 対応市区町村タイプ:**
- `designated_city` — 政令指定都市（20市: 札幌/仙台/さいたま/千葉/横浜/川崎/相模原/新潟/静岡/浜松/名古屋/京都/大阪/堺/神戸/岡山/広島/北九州/福岡/熊本）
- `core_city` — 中核市（62市）
- `city` — 一般市
- `ward` — 政令指定都市の区（parentCity付き）
- `special_ward` — 東京23特別区
- `town` — 町
- `village` — 村

**time_bridge レスポンス例:**
```json
{
  "fromYear":2020, "toYear":2024, "freq":"A", "calendar":"calendar",
  "years":[2020,2021,2022,2023,2024],
  "labels":["2020年","2021年","2022年","2023年","2024年"],
  "estatCdTime":"2020000000-2024000000",
  "bojPeriod":{"from":"202001","to":"202412"}
}
```

**time_bridge 和暦対応:** 令和(R)=2018+N, 平成(H)=1988+N, 昭和(S)=1925+N

---

### Tool 11: navigate

**【データ探索・推薦】** 分析テーマから最適なデータソースを推薦し、データセットの構造やカバレッジを事前確認。
AIが「70万テーブルからどれを使えばいいか」を判断するためのツール。

| action | 説明 |
|--------|------|
| `recommend` | 分析テーマ → 最適データソースリストを推薦（primary/secondary/context で重要度付き） |
| `schema` | データセットの構造を人間/AI可読な形で返す（次元・時間範囲・地域レベル・レコード数） |
| `coverage` | トピック × 地域のデータ有無マップ（feasibility判定: full/partial/insufficient） |

**パラメータ:**

| 名前 | 型 | 必須 | 用途 | 説明 |
|------|-----|------|------|------|
| action | `"recommend" \| "schema" \| "coverage"` | Yes | | |
| topic | string | recommend/coverage時 | recommend/coverage | トピック名（例: "人口", "GDP", "物価", "雇用", "少子化"） |
| detailLevel | `"quick" \| "comprehensive"` | No | recommend | quick=primaryのみ, comprehensive=全推薦 |
| schemaSource | string | schema時 | schema | データソース（現在は"estat"のみ対応） |
| id | string | schema時 | schema | statsDataId |
| area | string | No | coverage | 地域名（例: "東京都", "北海道"） |

**APIキー:** recommend/coverage=不要（辞書ベース）, schema=`ESTAT_APP_ID`（内部でestat.meta呼出し）

**recommend レスポンス例:**
```json
{
  "topic": "人口",
  "keywords": ["人口", "世帯", "人口動態"],
  "recommended": [
    {"tool":"estat", "action":"search", "params":{"q":"人口推計"}, "label":"人口推計（総務省）", "relevance":"primary", "apiKeyRequired":true, "apiKeySet":false},
    {"tool":"stats", "action":"dash_data", "params":{"code":"A1101"}, "label":"人口総数（ダッシュボード）", "relevance":"primary", "apiKeyRequired":false, "apiKeySet":true}
  ]
}
```

**対応トピック（31テーマ + エイリアス）:**
人口, GDP, 物価, 雇用, 貿易, 財政, 金融, 鉱工業, 住宅, 教育, 医療, 福祉, 少子化, 高齢化, 観光, 農業, 環境, 企業, 気象, 防災, 交通, 法令, 地理, 学術, 文化, 海外安全, 入札, 中小企業, エネルギー, 犯罪, 賃金, 消費

**英語エイリアス:** population→人口, gdp→GDP, cpi→物価, trade→貿易, weather→気象, earthquake→防災, etc.

**辞書外テーマ:** estat.search へのフォールバック推薦を返す

---

### Tool 12: join

**【データ統合・正規化】** 複数データソースを時間軸・地域軸・単位を自動統一して結合。
AIが異なるAPIのデータを横並びで分析するための前処理ツール。

| action | 説明 |
|--------|------|
| `fetch_aligned` | 複数ソースを粒度統一して同時取得・結合（resolve→取得→正規化→結合） |
| `normalize` | 単位・スケール変換（千人→人, 百万円→億円 等） |
| `fill_gaps` | 時系列の欠損パターン検知（補完はしない、フラグのみ） |

**パラメータ:**

| 名前 | 型 | 必須 | 用途 | 説明 |
|------|-----|------|------|------|
| action | `"fetch_aligned" \| "normalize" \| "fill_gaps"` | Yes | | |
| indicators | `Array<{source, query?, id?, label}>` | fetch_aligned時 | fetch_aligned | 取得する指標リスト。source: `"estat"\|"stats"\|"boj"` |
| timeFrom | string | No | fetch_aligned | 期間開始（"2020"等） |
| timeTo | string | No | fetch_aligned | 期間終了 |
| timeFreq | `"A" \| "Q" \| "M"` | No | fetch_aligned | 頻度 |
| prefCodes | string[] | No | fetch_aligned | 都道府県コード配列 |
| data | `Array<{time?, value, unit?}>` | normalize時 | normalize | データ配列 |
| rules | `Array<{fromUnit, toUnit}>` | normalize時 | normalize | 変換ルール |
| records | `Array<{time, value}>` | fill_gaps時 | fill_gaps | 時系列レコード |
| expectedFrom | string | No | fill_gaps | 期待範囲の開始 |
| expectedTo | string | No | fill_gaps | 期待範囲の終了 |
| frequency | `"year" \| "month" \| "quarter"` | No | fill_gaps | 時系列頻度（省略時はデータから自動検出） |

**APIキー:** fetch_aligned時は取得先に依存（estat使用時は`ESTAT_APP_ID`必要等）

**部分成功:** 複数指標のうち一部が取得失敗しても、成功分のみで結果を返す。失敗指標は`warnings`に記載。

**normalize 組込み変換ルール:**
- 千人→人 (×1000), 万人→人 (×10000)
- 百万円→億円 (÷100), 千円→万円 (÷10), 百万円→兆円 (÷1000000)
- 千台→台, 千戸→戸
- NaN値は変換されず原値保持（`converted: false`）

**fill_gaps 頻度自動検出:**
- `YYYY` → year（例: "2024"）
- `YYYY-MM` → month（例: "2024-01"）
- `YYYYQn` → quarter（例: "2024Q1"）
- `YYYY-MM-DD` → day（例: "2024-01-15"）
- `frequency` を明示指定した場合はそちらを優先

**fill_gaps レスポンス例:**
```json
{
  "complete": [
    {"time":"2020","value":100,"isMissing":false},
    {"time":"2021","value":null,"isMissing":true},
    {"time":"2022","value":102,"isMissing":false}
  ],
  "gaps": ["2021"],
  "coveragePercent": 66.7
}
```

---

### Tool 13: context

**【文脈付与・サジェスト】** 数字の歴史的位置、同カテゴリ内順位、トレンド位置を返す。
`join.fetch_aligned` の結果に一括付与（annotate）するのがメインの使い方。
データ文脈から次に調べるべきことも提案する（suggest）。

| action | 説明 |
|--------|------|
| `percentile` | 過去N年の分布における位置（パーセンタイル・順位記述）。historical_comparisons にイベント注釈付き |
| `peers` | 同カテゴリ（47都道府県等）内での順位・偏差値。top3/bottom3/neighbors 付き |
| `trend_context` | トレンドの位置（山/谷からの距離、加速/減速）。`recent_n` パラメータで短期/中期切替可能 |
| `annotate` | join結果に上記3つ + suggest をまとめて一括付与。`depth` で詳細度制御。alerts（過去最高/最低/急変/外れ値/転換）を自動生成 |
| `suggest` | データ文脈から「次に調べるべきこと」を提案。各提案に tool + action + params をそのまま実行可能な形で付与。ルールベース、最大5件 |

**パラメータ:**

| 名前 | 型 | 必須 | 用途 | 説明 |
|------|-----|------|------|------|
| action | `"percentile" \| "peers" \| "trend_context" \| "annotate" \| "suggest"` | Yes | | |
| source | `"estat" \| "stats" \| "boj" \| "misc"` | percentile/peers/trend時 | percentile/peers/trend | データソース |
| id | string | No | percentile/peers/trend | statsDataId / 指標コード / 系列コード |
| query | string | No | percentile/peers/trend/suggest | 自然言語クエリ（例: "消費者物価指数"） |
| value | number | percentile時 **必須** | percentile | 文脈を知りたい値 |
| area | string | No | percentile/trend | 地域（prefCode または都道府県名）。指定時はprefCodeを使用すること（estatCodeではない） |
| target | string | peers時 **必須** | peers | 比較対象（prefCode または都道府県名） |
| peerGroup | `"pref" \| "city" \| "designated_city" \| "custom"` | No | peers | 比較グループ |
| windowYears | number | No | percentile | 分布に使う年数（デフォルト30） |
| lookbackYears | number | No | trend | 遡る年数（デフォルト10） |
| recentN | number | No | trend | 方向判定に使う直近ポイント数（デフォルト3。短期=3、中期=6、長期=12） |
| joinedData | object | annotate時 **必須** | annotate | `join.fetch_aligned` の出力をそのまま渡す |
| depth | `"quick" \| "standard" \| "deep"` | No | annotate | quick=percentileのみ, standard=+trend+suggest, deep=全情報（デフォルト: standard） |
| topic | string | No | suggest | テーマ（例: "少子化", "物価"） |
| currentIndicators | `Array<{source, id?, query?, label}>` | No | suggest | 現在見ている指標リスト |
| alerts | `Array<{type, indicator, area?, period?}>` | No | suggest/annotate | 検出済みアラート |
| areaLevel | `"pref" \| "city" \| "national"` | No | suggest | 地域レベル |
| uniqueAreas | string[] | No | suggest | 分析対象の地域名リスト |

**APIキー:** 内部で呼出す既存ツールに依存（estat使用時は `ESTAT_APP_ID` 必要等）

**percentile レスポンス例:**
```json
{
  "value": 3.2,
  "percentile": 95,
  "rank_description": "過去30年で非常に高い水準（上位5%）",
  "distribution": {"min":-0.9, "max":3.5, "mean":0.8, "median":0.5, "stdev":1.1, "n":30},
  "historical_comparisons": [
    {"period":"2014", "value":3.0, "note":"消費税8%引上げ"},
    {"period":"2019", "value":2.8}
  ],
  "source_meta": {"indicator":"消費者物価指数", "unit":"", "period_range":"1994〜2023", "data_points":30}
}
```

**peers レスポンス例:**
```json
{
  "target": {"name":"東京都", "code":"13", "value":1.04},
  "rank": 47,
  "total": 47,
  "percentile_in_peers": 2,
  "deviation_score": 28.5,
  "peer_stats": {"mean":1.42, "median":1.40, "stdev":0.15, "min":{"name":"東京都","value":1.04}, "max":{"name":"沖縄県","value":1.86}},
  "neighbors": [{"rank":46, "name":"北海道", "value":1.12}],
  "top3": [{"rank":1, "name":"沖縄県", "value":1.86}, ...],
  "bottom3": [{"rank":47, "name":"東京都", "value":1.04}, ...]
}
```

**trend_context レスポンス例:**
```json
{
  "current": {"value":3.2, "period":"2023"},
  "trend": {"direction":"上昇", "duration_periods":5, "velocity":0.45, "acceleration":"加速"},
  "from_peak": {"value":3.5, "period":"2023", "change_pct":-8.6},
  "from_trough": {"value":-0.9, "period":"2009", "change_pct":455.6},
  "similar_patterns": [{"period_range":"2013〜2015", "pattern":"消費税引上げ", "duration_periods":3, "outcome":"3.0→1.5"}],
  "source_meta": {"indicator":"消費者物価指数", "unit":"", "freq":"A"}
}
```

**annotate レスポンス例:**
```json
{
  "context": {
    "出生率": {
      "percentile": {"window_years":6, "distribution":{...}, "by_row":[{"period":"2018","value":1.42,"percentile":90}, ...]},
      "trend": {"direction":"下降", "duration_periods":6, "velocity":-0.04, "from_peak":{...}, "from_trough":{...}}
    }
  },
  "alerts": [
    {"indicator":"出生率", "type":"過去最低", "message":"出生率が過去6年で最低水準", "severity":"warning"},
    {"indicator":"出生率", "type":"急変", "message":"出生率の前期比変動が2σを超過（変動: 0.05）", "severity":"critical"}
  ],
  "suggestions": [...]
}
```

**annotate アラート種別:**

| type | 発火条件 | severity |
|------|---------|----------|
| `過去最高` | パーセンタイル ≥ 99 | warning |
| `過去最低` | パーセンタイル ≤ 1 | warning |
| `急変` | 前期比変動が 2σ 超過 | critical |
| `トレンド転換` | 前期の trend.direction と今期が異なる | info |

**suggest 提案タイプ:**

| type | 発火条件 | 例 |
|------|---------|-----|
| `deepen` | 都道府県データ + 外れ値/過去最高最低 → 市区町村深掘り | "東京都の市区町村別内訳を確認" |
| `broaden` | 単一指標 → 相関指標追加（suggest-relations.json参照） | "関連指標「婚姻率」を追加" |
| `explain` | 急変/トレンド転換 → 国会審議で原因調査 | "変動の背景を国会審議で確認" |
| `explain` | トピック指定 → 学術論文 | "関連する学術論文を検索" |
| `explain` | トピック指定 → パブリックコメント | "関連するパブリックコメントを確認" |
| `broaden` | 地域 + 地価/不動産 → 防災リスク | "地震ハザード情報を追加" |
| `external` | 地域データ → 自治体オープンデータ | "東京都のオープンデータポータルを確認" |

**suggest レスポンス例:**
```json
{
  "suggestions": [
    {
      "type": "broaden",
      "priority": "medium",
      "title": "関連指標「婚姻率」を追加",
      "reason": "出生率と強い相関が知られている",
      "tool": "join",
      "action": "fetch_aligned",
      "params": {"indicators": [{"source":"estat", "query":"婚姻 人口動態", "label":"婚姻率"}]},
      "estimated_time": "約8秒"
    }
  ],
  "narrative": "推奨: 関連指標「婚姻率」を追加（計2件の提案）"
}
```

**内部データ:**
- `historical-events.json` — 主要歴史イベント23件（バブル崩壊、消費税各引上げ、リーマンショック、東日本大震災、COVID-19等）× 影響指標カテゴリ13種
- `suggest-relations.json` — 指標間関連マップ30種（出生率↔婚姻率, 地価↔人口, GDP↔鉱工業生産 等）。strength: strong/moderate/weak

**suggest ツール名ランタイム検証:** 生成された提案のtool名が13ツールのいずれかであることを検証し、無効な名前の提案は自動除外される。

---

## 内部データファイル

| ファイル | サイズ | 内容 |
|---------|--------|------|
| `area-mapping.json` | 447 KB | 47都道府県 + 1,918市区町村（コード相互変換、名前逆引き） |
| `edinet-mapping.json` | 1.36 MB | 10,669 EDINET提出者（6,716件法人番号双方向マップ） |
| `topic-indicators.json` | ~20 KB | 31政策テーマ → 指標マッピング + エイリアス |
| `historical-events.json` | ~3.5 KB | 主要歴史イベント23件 × 影響指標カテゴリ13種 |
| `suggest-relations.json` | ~12 KB | 指標間関連マップ30種（strength: strong/moderate/weak） |

---

## 全レスポンス共通

**ApiResponse<T> 型:**
```typescript
{
  success: boolean;
  data?: T;
  error?: string;         // 日本語メッセージ（フィールド名のみ英語）
  source: string;          // "e-Stat/search", "context/percentile" 等
  timestamp: string;       // ISO 8601
}
```

**smartTrim:**
- 配列がlimit件を超えると `{_total, _showing, items: [...]}` に変換
- 大オブジェクトもlimit件に切り詰め `{_total, _showing, entries: {...}}`
- カスケード: 20→10→5→3件で試行、4000字超過で硬切り

**エラーメッセージ:**
- 全エラーメッセージは日本語で統一
- パラメータ名等の技術識別子はそのまま英語（例: "比較する値(value)が必要です"）

---

## 内部品質機能

| 機能 | 説明 |
|------|------|
| キャッシュ | LRU + TTL (API別に設定) |
| レートリミット | TokenBucket + exponential backoff |
| タイムアウト | 通常API: 35秒, e-Stat: 50秒, そらまめくん: 45秒 |
| stdout保護 | 全ログは `console.error()` のみ（stdio transport保護） |
| リクエストログ | 全tool callをJSONL自動記録（下記参照） |

### リクエストログ基盤

全14アクション分のtool callを自動記録するJSONLログ。middleware proxyで全ツールを一括カバー。

**ログレコード形式:**
```json
{"ts":"2025-03-01T14:23:05.123Z", "tool":"estat", "action":"search", "params":{"q":"人口"}, "status":"ok", "duration_ms":1234, "response_size":2847, "error":null}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `ts` | string | ISO 8601 タイムスタンプ |
| `tool` | string | ツール名 |
| `action` | string | アクション名 |
| `params` | object | 入力パラメータ（APIキーは自動REDACT） |
| `status` | `"ok" \| "error" \| "timeout"` | 結果ステータス |
| `duration_ms` | number | レスポンス時間（ms） |
| `response_size` | number | レスポンス文字数 |
| `error` | string \| null | エラーメッセージ |

**特徴:**
- APIキーは自動REDACT（apikey, appid, token, key, password, secret → `[REDACTED]`）
- 日付別ファイル分割: `~/.japan-gov-mcp/logs/YYYY-MM-DD.jsonl`
- `JAPAN_GOV_MCP_LOG=false` で無効化
- `JAPAN_GOV_MCP_LOG_DIR` で保存先カスタマイズ
- 本体への性能影響: ~0.17ms/call（appendFileSync）

---

## 性能

**データ取得ツール (Tool 1-9):**
- e-Stat: 2-45秒（テーブルサイズ依存）
- 日銀: 1-3秒
- NDB: 2-5秒
- 天気予報: 0.5-2秒
- 浸水ナビ: 1-3秒（SSL legacy negotiation含む）
- JARTIC交通量: 2-5秒（WFS 2.0 CSV）
- そらまめくん: 10-20秒
- 法令API: 1-3秒
- 国会議事録: 2-5秒
- その他: 0.5-3秒

**コード解決ツール (Tool 10: resolve):**
- area_bridge: <1ms（静的JSONルックアップ）
- time_bridge: <1ms（コード生成ロジック）
- code_lookup: <1ms（辞書ヒット時）/ 2-5秒（フォールバック時）
- entity_bridge: <1ms（EDINET辞書のみ）/ 3-8秒（houjin/gbiz API呼出し時）

**探索ツール (Tool 11: navigate):**
- recommend: <1ms（辞書ヒット時）
- schema: 2-5秒（estat.meta内部呼出し）
- coverage: <1ms（辞書ベース）

**統合ツール (Tool 12: join):**
- normalize: <1ms
- fill_gaps: <1ms
- fetch_aligned: 5-30秒（指標数・地域数に依存）

**文脈付与ツール (Tool 13: context):**
- percentile: 2-10秒（過去データ取得 + 分布計算）
- peers: 2-10秒（47都道府県一括取得 + 順位計算）
- trend_context: 2-10秒（過去データ取得 + トレンド分析）
- annotate: 5-30秒（depth依存: quick 3-8s / standard 5-15s / deep 10-30s）
- suggest: <1ms（ルールベース、データ取得なし）

**ログ基盤:**
- logger overhead: ~0.17ms/call（appendFileSync）

---

## 環境変数

| 変数名 | API | 必須度 | 取得先 |
|--------|-----|--------|--------|
| `ESTAT_APP_ID` | e-Stat | ★★★ | https://www.e-stat.go.jp/api/ |
| `HOUJIN_APP_ID` | 法人番号 | ★★☆ | https://www.houjin-bangou.nta.go.jp/webapi/ |
| `GBIZ_TOKEN` | gBizINFO | ★★☆ | https://info.gbiz.go.jp/hojin/api |
| `EDINET_API_KEY` | EDINET | ★★☆ | https://disclosure2.edinet-fsa.go.jp/ |
| `REALESTATE_API_KEY` | 不動産情報ライブラリ | ★☆☆ | https://www.reinfolib.mlit.go.jp/ |
| `HELLOWORK_API_KEY` | ハローワーク | ★☆☆ | https://www.hellowork.mhlw.go.jp/ |
| `MLIT_DPF_API_KEY` | 国交省DPF | ★☆☆ | https://www.mlit-data.jp/ |
| `JAPAN_GOV_MCP_LOG` | ログ制御 | — | `"false"` でログ無効化（デフォルト: 有効） |
| `JAPAN_GOV_MCP_LOG_DIR` | ログ保存先 | — | デフォルト: `~/.japan-gov-mcp/logs/` |

**APIキー不要で使えるツール/アクション:**
stats(dash/boj/ndb), weather(全12), law(全6), geo(全6), academic(全10), opendata(gov/geo), misc(safety/kkj/mirasapo/mirasapo_cat/mirasapo_region), resolve(area_bridge/time_bridge/code_lookup), navigate(recommend/coverage), join(normalize/fill_gaps), context(suggest)

---

## Claude Desktop 設定例

```json
{
  "mcpServers": {
    "japan-gov": {
      "command": "node",
      "args": ["/path/to/japan-gov-mcp/build/index.js"],
      "env": {
        "ESTAT_APP_ID": "your_estat_app_id",
        "HOUJIN_APP_ID": "your_houjin_app_id",
        "GBIZ_TOKEN": "your_gbiz_token",
        "EDINET_API_KEY": "your_edinet_api_key"
      }
    }
  }
}
```

---

## テスト結果

```
テスト総数: 663
PASS: 663 (うち Codex模擬テスト 25)
FAIL: 0
SKIP: 5（APIキー未設定）
```

**E2Eシナリオ 12本:**

| # | シナリオ | テスト数 | 内容 |
|---|---------|----------|------|
| 1 | 少子化の地域差分析 | 7 | recommend→schema→area_bridge→time_bridge→code_lookup→fetch_aligned→coverage |
| 2 | 企業の多面調査 | 5 | entity_bridge(name/corpNum)→recommend→codeLookup |
| 3 | 地域経済比較 | 10 | 47県全areaBridge検証、lat/lon、英語名 |
| 4 | 時間コード変換 | 16 | 暦年/年度/月次/四半期/和暦/FY + エッジケース8件 |
| 5 | navigate.recommend網羅性 | 49 | 31辞書テーマ + 10辞書外フォールバック + 集計 |
| 6 | join.normalize単位変換 | 10 | 千人→人, 百万円→億円, 未知単位, 混合等 |
| 7 | join.fill_gaps欠損検知 | 9 | 中間欠損/先頭末尾/月次/四半期/完全データ |
| 8 | ロバストネス | 24 | 異常入力/フォールバック/空白/特殊文字/部分失敗 |
| 9 | 市区町村コード解決 | 63 | 1,918件全体、政令都市20市、東京特別区、重複名disambiguation |
| 10 | EDINETコード解決 | 12 | 主要企業5社、双方向マッピング整合性、統計チェック |
| 11 | context文脈付与 | 17 | percentile(3)/peers(4)/trend_context(3)/annotate(3)/suggest(4) |
| 12 | Codexユーザー模擬テスト | 25 | 5シナリオ: 少子化全体像/東京経済/CPI歴史的位置/suggest実用性/エラー耐性 |

---

## データカバレッジ: 36 API

| # | API | 省庁/提供元 | ツール | 認証 |
|---|-----|-------------|--------|------|
| 1 | e-Stat API v3.0 | 総務省 | estat | appId |
| 2 | 統計ダッシュボード | 総務省 | stats | 不要 |
| 3 | 法人番号 v4 | 国税庁 | corporate | appId |
| 4 | gBizINFO REST | 経済産業省 | corporate | token |
| 5 | EDINET API v2 | 金融庁 | corporate | apiKey |
| 6 | 法令API v1 | 総務省 | law | 不要 |
| 7 | 国会会議録API | 国会図書館 | law | 不要 |
| 8 | 気象庁天気予報 | 気象庁 | weather | 不要 |
| 9 | アメダス | 気象庁 | weather | 不要 |
| 10 | J-SHIS(地震ハザード) | 防災科研 | weather | 不要 |
| 11 | 浸水ナビ | 国土地理院 | weather | 不要 |
| 12 | JARTIC交通量 | 国交省 | weather | 不要 |
| 13 | 国土地理院ジオコーダ | 国土地理院 | geo | 不要 |
| 14 | Geoshape行政区域 | (OSS) | geo | 不要 |
| 15 | PLATEAU 3D | 国交省 | geo | 不要 |
| 16 | NDL Search | 国会図書館 | academic | 不要 |
| 17 | J-STAGE | JST | academic | 不要 |
| 18 | CiNii Research | NII | academic | 不要 |
| 19 | ジャパンサーチ | 国会図書館 | academic | 不要 |
| 20 | IRDB | NII | academic | 不要 |
| 21 | AgriKnowledge | 農林水産省 | academic | 不要 |
| 22 | そらまめくん | 環境省 | academic | 不要 |
| 23 | 産総研地質図 | 産総研 | academic | 不要 |
| 24 | JAXA G-Portal | JAXA | academic | 不要 |
| 25 | researchmap | JST | academic | 不要 |
| 26 | data.go.jp | デジタル庁 | opendata | 不要 |
| 27 | G空間情報センター | 国交省 | opendata | 不要 |
| 28 | 国交省DPF | 国交省 | opendata | apiKey |
| 29 | 海外安全情報 | 外務省 | misc | 不要 |
| 30 | 官公需ポータル | 中小企業庁 | misc | 不要 |
| 31 | ミラサポplus | 中小企業庁 | misc | 不要 |
| 32 | 不動産情報ライブラリ | 国交省 | misc | apiKey |
| 33 | ハローワーク | 厚生労働省 | misc | apiKey |
| 34 | 日銀時系列 | 日本銀行 | stats | 不要 |
| 35 | NDB特定健診 | 厚生労働省 | stats | 不要 |
| 36 | パブリックコメント | e-Gov | law | 不要 |
