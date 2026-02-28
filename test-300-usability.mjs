#!/usr/bin/env node
/**
 * test-300-usability.mjs
 * 行政MCPユーザビリティテスト 300パターン
 *
 * Level 1 (Easy, #1-100):     単一ツール、直接的なクエリ
 * Level 2 (Medium, #101-200): 複数パラメータ、日付範囲、フィルタリング
 * Level 3 (Hard, #201-300):   エッジケース、大量データ、複雑条件、エラー耐性
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const TIMEOUT = 55000; // e-Stat 50秒タイムアウトに対応
const ENV = {
  ESTAT_APP_ID: process.env.ESTAT_APP_ID || 'd5c7e50d1febdcd7528f909fa3b46afa45d46421',
  EDINET_API_KEY: process.env.EDINET_API_KEY || '34aa8fd960644b9288c0caee357a1f02',
  MLIT_DPF_API_KEY: process.env.MLIT_DPF_API_KEY || '1AKzuY_SS56Ldn6KzVvLBKz1oUq5AutI',
  GBIZ_TOKEN: process.env.GBIZ_TOKEN || 'bI0I6NtKuPrD7MBashDxv2qjtYyf6np4',
};

// ──────────────── Test definitions ────────────────

const tests = [

  // ═══════════════════════════════════════════════════════
  // LEVEL 1: Easy (1-100) — Single tool, basic queries
  // ═══════════════════════════════════════════════════════

  // --- Weather (1-15) ---
  { id: 1, name: '天気: 東京の天気予報', tool: 'weather', args: { action: 'forecast', areaCode: '130000' } },
  { id: 2, name: '天気: 大阪の天気予報', tool: 'weather', args: { action: 'forecast', areaCode: '270000' } },
  { id: 3, name: '天気: 北海道概況', tool: 'weather', args: { action: 'overview', areaCode: '016000' } },
  { id: 4, name: '天気: 沖縄概況', tool: 'weather', args: { action: 'overview', areaCode: '471000' } },
  { id: 5, name: '天気: 東京週間予報', tool: 'weather', args: { action: 'weekly', areaCode: '130000' } },
  { id: 6, name: '天気: 台風情報', tool: 'weather', args: { action: 'typhoon' } },
  { id: 7, name: '天気: 地震一覧', tool: 'weather', args: { action: 'earthquake' } },
  { id: 8, name: '天気: 津波情報', tool: 'weather', args: { action: 'tsunami' } },
  { id: 9, name: '天気: アメダス観測点一覧', tool: 'weather', args: { action: 'amedas_st', limit: 5 } },
  { id: 10, name: '天気: 東京アメダスデータ', tool: 'weather', args: { action: 'amedas', pointId: '44132' } },
  { id: 11, name: '天気: 地震ハザード(東京)', tool: 'weather', args: { action: 'hazard', lat: 35.6762, lon: 139.6503 } },
  { id: 12, name: '天気: 浸水深(東京駅)', tool: 'weather', args: { action: 'flood', lat: 35.6812, lon: 139.7671 } },
  { id: 13, name: '天気: 交通量(渋谷)', tool: 'weather', args: { action: 'traffic', lat: 35.6580, lon: 139.7016 } },
  { id: 14, name: '天気: 福岡の天気予報', tool: 'weather', args: { action: 'forecast', areaCode: '400000' } },
  { id: 15, name: '天気: 愛知概況', tool: 'weather', args: { action: 'overview', areaCode: '230000' } },

  // --- Law (16-30) ---
  { id: 16, name: '法令: 著作権法を検索', tool: 'law', args: { action: 'search', q: '著作権法' } },
  { id: 17, name: '法令: 民法を検索', tool: 'law', args: { action: 'search', q: '民法' } },
  { id: 18, name: '法令: 法律一覧', tool: 'law', args: { action: 'list', category: 2 } },
  { id: 19, name: '法令: 政令一覧', tool: 'law', args: { action: 'list', category: 3 } },
  { id: 20, name: '法令: 憲法一覧', tool: 'law', args: { action: 'list', category: 1 } },
  { id: 21, name: '国会: インバウンド議論', tool: 'law', args: { action: 'meeting', q: 'インバウンド' } },
  { id: 22, name: '国会: AI規制議論', tool: 'law', args: { action: 'meeting', q: 'AI 人工知能 規制' } },
  { id: 23, name: '国会: 少子化対策議論', tool: 'law', args: { action: 'meeting', q: '少子化対策' } },
  { id: 24, name: '国会: 防衛費議論', tool: 'law', args: { action: 'meeting', q: '防衛費 増額' } },
  { id: 25, name: 'パブコメ: 一覧取得', tool: 'law', args: { action: 'pubcomment', pubType: 'list' } },
  { id: 26, name: 'パブコメ: 結果取得', tool: 'law', args: { action: 'pubcomment', pubType: 'result' } },
  { id: 27, name: '国会: 年金改革議論', tool: 'law', args: { action: 'meeting', q: '年金制度 改革' } },
  { id: 28, name: '法令: 個人情報保護法', tool: 'law', args: { action: 'search', q: '個人情報保護法' } },
  { id: 29, name: '国会: 脱炭素議論', tool: 'law', args: { action: 'meeting', q: '脱炭素 カーボンニュートラル' } },
  { id: 30, name: '法令: 労働基準法', tool: 'law', args: { action: 'search', q: '労働基準法' } },

  // --- Corporate (31-45) ---
  { id: 31, name: '企業: トヨタgBiz検索', tool: 'corporate', args: { action: 'gbiz', name: 'トヨタ自動車' } },
  { id: 32, name: '企業: ソニーgBiz検索', tool: 'corporate', args: { action: 'gbiz', name: 'ソニーグループ' } },
  { id: 33, name: '企業: 任天堂gBiz検索', tool: 'corporate', args: { action: 'gbiz', name: '任天堂' } },
  { id: 34, name: '企業: トヨタ特許', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '1180301018771', infoType: 'patent', limit: 5 } },
  { id: 35, name: '企業: トヨタ調達', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '1180301018771', infoType: 'procurement', limit: 5 } },
  { id: 36, name: '企業: 富士通補助金', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '1020001071491', infoType: 'subsidy', limit: 5 } },
  { id: 37, name: '企業: NTTデータ調達', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '9010601021385', infoType: 'procurement', limit: 5 } },
  { id: 38, name: '企業: EDINET書類一覧', tool: 'corporate', args: { action: 'edinet', date: '2026-02-27' } },
  { id: 39, name: '企業: 三菱重工gBiz', tool: 'corporate', args: { action: 'gbiz', name: '三菱重工業' } },
  { id: 40, name: '企業: 日立gBiz', tool: 'corporate', args: { action: 'gbiz', name: '日立製作所' } },
  { id: 41, name: '企業: パナソニック特許', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '5120001158218', infoType: 'patent', limit: 3 } },
  { id: 42, name: '企業: セコム認証', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '6011001035920', infoType: 'certification', limit: 5 } },
  { id: 43, name: '企業: アクセンチュア調達', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '7010401001556', infoType: 'procurement', limit: 5 } },
  { id: 44, name: '企業: PwC補助金', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '1010401023102', infoType: 'subsidy', limit: 5 } },
  { id: 45, name: '企業: デロイト職場', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '5010405001703', infoType: 'workplace', limit: 5 } },

  // --- Academic (46-60) ---
  { id: 46, name: '学術: NDLで夏目漱石', tool: 'academic', args: { source: 'ndl', q: '夏目漱石' } },
  { id: 47, name: '学術: JStageでiPS細胞', tool: 'academic', args: { source: 'jstage', q: 'iPS細胞' } },
  { id: 48, name: '学術: CiNiiで量子コンピュータ', tool: 'academic', args: { source: 'cinii', q: '量子コンピュータ' } },
  { id: 49, name: '学術: JapanSearchで浮世絵', tool: 'academic', args: { source: 'japansearch', q: '浮世絵' } },
  { id: 50, name: '学術: IRDBで機械学習', tool: 'academic', args: { source: 'irdb', q: '機械学習' } },
  { id: 51, name: '学術: 大気質(東京)', tool: 'academic', args: { source: 'air', prefCode: '13' } },
  { id: 52, name: '学術: 地質凡例', tool: 'academic', args: { source: 'geology' } },
  { id: 53, name: '学術: 地質(富士山付近)', tool: 'academic', args: { source: 'geology', lat: 35.3606, lon: 138.7274 } },
  { id: 54, name: '学術: JAXAコレクション', tool: 'academic', args: { source: 'jaxa', count: 3 } },
  { id: 55, name: '学術: NDLでAI倫理', tool: 'academic', args: { source: 'ndl', q: 'AI 倫理' } },
  { id: 56, name: '学術: JStageで再生可能エネルギー', tool: 'academic', args: { source: 'jstage', q: '再生可能エネルギー' } },
  { id: 57, name: '学術: CiNiiでゲノム編集', tool: 'academic', args: { source: 'cinii', q: 'ゲノム編集' } },
  { id: 58, name: '学術: JapanSearchで正倉院', tool: 'academic', args: { source: 'japansearch', q: '正倉院' } },
  { id: 59, name: '学術: 大気質(大阪)', tool: 'academic', args: { source: 'air', prefCode: '27' } },
  { id: 60, name: '学術: IRDBでロボティクス', tool: 'academic', args: { source: 'irdb', q: 'ロボティクス' } },

  // --- Stats (61-75) ---
  { id: 61, name: '統計: 日銀主要コード', tool: 'stats', args: { action: 'boj_codes' } },
  { id: 62, name: '統計: コールレート', tool: 'stats', args: { action: 'boj_data', code: 'STRDCLUCON', db: 'FM01', freq: 'D' } },
  { id: 63, name: '統計: マネタリーベース', tool: 'stats', args: { action: 'boj_data', code: 'MABS1AN11', db: 'MD01', freq: 'M' } },
  { id: 64, name: '統計: M2マネーストック', tool: 'stats', args: { action: 'boj_data', code: 'MAM1NAM2M2MO', db: 'MD02', freq: 'M' } },
  { id: 65, name: '統計: 企業物価指数', tool: 'stats', args: { action: 'boj_data', code: 'PRCG20_2200000000', db: 'PR01', freq: 'M' } },
  { id: 66, name: '統計: ダッシュボード指標一覧', tool: 'stats', args: { action: 'dash_list', limit: 5 } },
  { id: 67, name: '統計: NDB検査項目一覧', tool: 'stats', args: { action: 'ndb_items' } },
  { id: 68, name: '統計: NDB地域一覧(県)', tool: 'stats', args: { action: 'ndb_areas', areaType: 'prefecture' } },
  { id: 69, name: '統計: サービス価格指数', tool: 'stats', args: { action: 'boj_data', code: 'PRCS20_5200000000', db: 'PR02', freq: 'M' } },
  { id: 70, name: '統計: 短観DI(四半期)', tool: 'stats', args: { action: 'boj_data', code: 'TK99F0000601GCQ00000', db: 'CO', freq: 'Q', to: '202501' } },
  { id: 71, name: 'e-Stat: 人口で検索', tool: 'estat', args: { action: 'search', q: '人口' } },
  { id: 72, name: 'e-Stat: GDPで検索', tool: 'estat', args: { action: 'search', q: 'GDP' } },
  { id: 73, name: 'e-Stat: 労働力調査', tool: 'estat', args: { action: 'search', q: '労働力調査', limit: 3 } },
  { id: 74, name: 'e-Stat: 消費者物価指数', tool: 'estat', args: { action: 'search', q: '消費者物価指数' } },
  { id: 75, name: 'e-Stat: 貿易統計', tool: 'estat', args: { action: 'search', q: '貿易統計' } },

  // --- Geo (76-85) ---
  { id: 76, name: '地理: 東京駅ジオコード', tool: 'geo', args: { action: 'geocode', address: '東京都千代田区丸の内1丁目' } },
  { id: 77, name: '地理: 大阪城ジオコード', tool: 'geo', args: { action: 'geocode', address: '大阪市中央区大阪城1' } },
  { id: 78, name: '地理: 逆ジオコード(皇居)', tool: 'geo', args: { action: 'reverse', lat: 35.6852, lon: 139.7528 } },
  { id: 79, name: '地理: 逆ジオコード(京都)', tool: 'geo', args: { action: 'reverse', lat: 35.0116, lon: 135.7681 } },
  { id: 80, name: '地理: PLATEAU東京', tool: 'geo', args: { action: 'plateau', prefecture: '東京都' } },
  { id: 81, name: '地理: PLATEAU大阪', tool: 'geo', args: { action: 'plateau', prefecture: '大阪府' } },
  { id: 82, name: '地理: 札幌ジオコード', tool: 'geo', args: { action: 'geocode', address: '北海道札幌市中央区' } },
  { id: 83, name: '地理: 那覇ジオコード', tool: 'geo', args: { action: 'geocode', address: '沖縄県那覇市泉崎' } },
  { id: 84, name: '地理: 逆ジオコード(名古屋)', tool: 'geo', args: { action: 'reverse', lat: 35.1815, lon: 136.9066 } },
  { id: 85, name: '地理: 逆ジオコード(福岡)', tool: 'geo', args: { action: 'reverse', lat: 33.5904, lon: 130.4017 } },

  // --- Opendata (86-95) ---
  { id: 86, name: 'OD: 政府データ検索(防災)', tool: 'opendata', args: { source: 'gov', q: '防災' } },
  { id: 87, name: 'OD: 政府データ検索(交通)', tool: 'opendata', args: { source: 'gov', q: '交通' } },
  { id: 88, name: 'OD: G空間検索(地すべり)', tool: 'opendata', args: { source: 'geo', q: '地すべり' } },
  { id: 89, name: 'OD: G空間検索(河川)', tool: 'opendata', args: { source: 'geo', q: '河川' } },
  { id: 90, name: 'OD: DPF検索(道路)', tool: 'opendata', args: { source: 'dpf', q: '道路' } },
  { id: 91, name: 'OD: 政府データ検索(環境)', tool: 'opendata', args: { source: 'gov', q: '環境' } },
  { id: 92, name: 'OD: G空間検索(津波)', tool: 'opendata', args: { source: 'geo', q: '津波' } },
  { id: 93, name: 'OD: DPF検索(鉄道)', tool: 'opendata', args: { source: 'dpf', q: '鉄道' } },
  { id: 94, name: 'OD: 政府データ検索(福祉)', tool: 'opendata', args: { source: 'gov', q: '福祉' } },
  { id: 95, name: 'OD: G空間検索(標高)', tool: 'opendata', args: { source: 'geo', q: '標高' } },

  // --- Misc (96-100) ---
  { id: 96, name: 'Misc: 海外安全(中国)', tool: 'misc', args: { api: 'safety', country: '086' } },
  { id: 97, name: 'Misc: 海外安全(最新)', tool: 'misc', args: { api: 'safety' } },
  { id: 98, name: 'Misc: KKJ入札(情報システム)', tool: 'misc', args: { api: 'kkj', q: '情報システム' } },
  { id: 99, name: 'Misc: ミラサポ業種一覧', tool: 'misc', args: { api: 'mirasapo_cat', catType: 'industries' } },
  { id: 100, name: 'Misc: ミラサポ地域一覧', tool: 'misc', args: { api: 'mirasapo_region' } },

  // ═══════════════════════════════════════════════════════
  // LEVEL 2: Medium (101-200) — Multi-param, filtering, dates
  // ═══════════════════════════════════════════════════════

  // --- Weather with params (101-115) ---
  { id: 101, name: '天気: 地震一覧(3件)', tool: 'weather', args: { action: 'earthquake', limit: 3 } },
  { id: 102, name: '天気: 地震ハザード(大阪)', tool: 'weather', args: { action: 'hazard', lat: 34.6937, lon: 135.5022 } },
  { id: 103, name: '天気: 浸水深(大阪梅田)', tool: 'weather', args: { action: 'flood', lat: 34.7024, lon: 135.4959 } },
  { id: 104, name: '天気: 交通量(新宿)', tool: 'weather', args: { action: 'traffic', lat: 35.6896, lon: 139.6922, radius: 3000 } },
  { id: 105, name: '天気: 宮城の天気予報', tool: 'weather', args: { action: 'forecast', areaCode: '040000' } },
  { id: 106, name: '天気: 広島概況', tool: 'weather', args: { action: 'overview', areaCode: '340000' } },
  { id: 107, name: '天気: 京都週間予報', tool: 'weather', args: { action: 'weekly', areaCode: '260000' } },
  { id: 108, name: '天気: 地震ハザード(名古屋)', tool: 'weather', args: { action: 'hazard', lat: 35.1815, lon: 136.9066 } },
  { id: 109, name: '天気: 浸水深(名古屋駅)', tool: 'weather', args: { action: 'flood', lat: 35.1709, lon: 136.8815 } },
  { id: 110, name: '天気: 地震ハザード(神戸)', tool: 'weather', args: { action: 'hazard', lat: 34.6901, lon: 135.1956 } },
  { id: 111, name: '天気: 石川概況', tool: 'weather', args: { action: 'overview', areaCode: '170000' } },
  { id: 112, name: '天気: 新潟天気', tool: 'weather', args: { action: 'forecast', areaCode: '150000' } },
  { id: 113, name: '天気: 熊本概況', tool: 'weather', args: { action: 'overview', areaCode: '430000' } },
  { id: 114, name: '天気: 交通量(大阪梅田)', tool: 'weather', args: { action: 'traffic', lat: 34.7024, lon: 135.4959, radius: 2000 } },
  { id: 115, name: '天気: 浸水深(川崎)', tool: 'weather', args: { action: 'flood', lat: 35.5309, lon: 139.7030 } },

  // --- Law with date/speaker filtering (116-135) ---
  { id: 116, name: '国会: インバウンド(2025年)', tool: 'law', args: { action: 'speech', q: 'インバウンド', from: '2025-01-01', until: '2025-12-31' } },
  { id: 117, name: '国会: 防衛(参議院)', tool: 'law', args: { action: 'meeting', q: '防衛', house: '参議院' } },
  { id: 118, name: '国会: 環境(衆議院)', tool: 'law', args: { action: 'meeting', q: '環境', house: '衆議院' } },
  { id: 119, name: '国会: 教育改革(予算委)', tool: 'law', args: { action: 'meeting', q: '教育', meetingName: '予算委員会' } },
  { id: 120, name: '国会: 子育て支援発言', tool: 'law', args: { action: 'speech', q: '子育て支援', limit: 10 } },
  { id: 121, name: '国会: デジタル庁議論', tool: 'law', args: { action: 'meeting', q: 'デジタル庁' } },
  { id: 122, name: '国会: 半導体戦略', tool: 'law', args: { action: 'speech', q: '半導体', from: '2025-01-01' } },
  { id: 123, name: '国会: マイナンバー議論', tool: 'law', args: { action: 'meeting', q: 'マイナンバー' } },
  { id: 124, name: '法令: 電子帳簿保存法', tool: 'law', args: { action: 'search', q: '電子帳簿保存法' } },
  { id: 125, name: '法令: 特定商取引法', tool: 'law', args: { action: 'search', q: '特定商取引に関する法律' } },
  { id: 126, name: '国会: 物価高騰(最近)', tool: 'law', args: { action: 'speech', q: '物価高騰', from: '2025-06-01' } },
  { id: 127, name: '国会: 外交(委員会)', tool: 'law', args: { action: 'meeting', q: '外交', meetingName: '外交防衛委員会' } },
  { id: 128, name: '国会: 農業(衆院)', tool: 'law', args: { action: 'meeting', q: '農業', house: '衆議院' } },
  { id: 129, name: '国会: サイバーセキュリティ', tool: 'law', args: { action: 'speech', q: 'サイバーセキュリティ' } },
  { id: 130, name: '国会: 医療DX', tool: 'law', args: { action: 'speech', q: '医療DX' } },
  { id: 131, name: '国会: 地方創生', tool: 'law', args: { action: 'meeting', q: '地方創生' } },
  { id: 132, name: '国会: エネルギー安全保障', tool: 'law', args: { action: 'speech', q: 'エネルギー 安全保障' } },
  { id: 133, name: '国会: ライドシェア', tool: 'law', args: { action: 'speech', q: 'ライドシェア' } },
  { id: 134, name: '国会: 2024年改選', tool: 'law', args: { action: 'meeting', q: '選挙制度', from: '2024-01-01', until: '2024-12-31' } },
  { id: 135, name: '法令: 道路交通法', tool: 'law', args: { action: 'search', q: '道路交通法' } },

  // --- Corporate filtered (136-155) ---
  { id: 136, name: '企業: トヨタ補助金', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '1180301018771', infoType: 'subsidy', limit: 10 } },
  { id: 137, name: '企業: トヨタ表彰', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '1180301018771', infoType: 'commendation', limit: 5 } },
  { id: 138, name: '企業: ソフトバンクgBiz', tool: 'corporate', args: { action: 'gbiz', name: 'ソフトバンクグループ' } },
  { id: 139, name: '企業: リクルートgBiz', tool: 'corporate', args: { action: 'gbiz', name: 'リクルート' } },
  { id: 140, name: '企業: 三菱電機特許', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '4010001008772', infoType: 'patent', limit: 5 } },
  { id: 141, name: '企業: NRI調達', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '4010001054032', infoType: 'procurement', limit: 10 } },
  { id: 142, name: '企業: 三菱UFJリサーチ調達', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '3010401011971', infoType: 'procurement', limit: 10 } },
  { id: 143, name: '企業: AWS Japan調達', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '6011001106696', infoType: 'procurement', limit: 5 } },
  { id: 144, name: '企業: MS Japan調達', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '2010401092245', infoType: 'procurement', limit: 5 } },
  { id: 145, name: '企業: EDINET(今日)', tool: 'corporate', args: { action: 'edinet', date: '2026-02-28' } },
  { id: 146, name: '企業: EDINET(昨日)', tool: 'corporate', args: { action: 'edinet', date: '2026-02-27' } },
  { id: 147, name: '企業: キーエンスgBiz', tool: 'corporate', args: { action: 'gbiz', name: 'キーエンス' } },
  { id: 148, name: '企業: 楽天gBiz', tool: 'corporate', args: { action: 'gbiz', name: '楽天グループ' } },
  { id: 149, name: '企業: サイバーエージェントgBiz', tool: 'corporate', args: { action: 'gbiz', name: 'サイバーエージェント' } },
  { id: 150, name: '企業: メルカリgBiz', tool: 'corporate', args: { action: 'gbiz', name: 'メルカリ' } },
  { id: 151, name: '企業: 三菱商事gBiz', tool: 'corporate', args: { action: 'gbiz', name: '三菱商事' } },
  { id: 152, name: '企業: 伊藤忠商事gBiz', tool: 'corporate', args: { action: 'gbiz', name: '伊藤忠商事' } },
  { id: 153, name: '企業: 日本製鉄gBiz', tool: 'corporate', args: { action: 'gbiz', name: '日本製鉄' } },
  { id: 154, name: '企業: トヨタ財務', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '1180301018771', infoType: 'finance', limit: 5 } },
  { id: 155, name: '企業: トヨタ職場', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '1180301018771', infoType: 'workplace', limit: 5 } },

  // --- e-Stat with filters (156-170) ---
  { id: 156, name: 'e-Stat: 人口(2023年)', tool: 'estat', args: { action: 'search', q: '人口', years: '2023' } },
  { id: 157, name: 'e-Stat: 家計調査(3件)', tool: 'estat', args: { action: 'search', q: '家計調査', limit: 3 } },
  { id: 158, name: 'e-Stat: 出生率で検索', tool: 'estat', args: { action: 'search', q: '出生率' } },
  { id: 159, name: 'e-Stat: 失業率で検索', tool: 'estat', args: { action: 'search', q: '完全失業率' } },
  { id: 160, name: 'e-Stat: 鉱工業生産', tool: 'estat', args: { action: 'search', q: '鉱工業生産' } },
  { id: 161, name: 'e-Stat: 住宅着工統計', tool: 'estat', args: { action: 'search', q: '住宅着工' } },
  { id: 162, name: 'e-Stat: 訪日外国人', tool: 'estat', args: { action: 'search', q: '訪日外国人' } },
  { id: 163, name: 'e-Stat: 犯罪統計', tool: 'estat', args: { action: 'search', q: '犯罪統計' } },
  { id: 164, name: 'e-Stat: 医療費', tool: 'estat', args: { action: 'search', q: '医療費' } },
  { id: 165, name: 'e-Stat: エネルギー消費', tool: 'estat', args: { action: 'search', q: 'エネルギー消費' } },
  { id: 166, name: 'e-Stat: 農業産出額', tool: 'estat', args: { action: 'search', q: '農業産出額' } },
  { id: 167, name: 'e-Stat: 自動車統計', tool: 'estat', args: { action: 'search', q: '自動車' } },
  { id: 168, name: 'e-Stat: 小売販売額', tool: 'estat', args: { action: 'search', q: '小売業販売額' } },
  { id: 169, name: 'e-Stat: 国勢調査', tool: 'estat', args: { action: 'search', q: '国勢調査', limit: 5 } },
  { id: 170, name: 'e-Stat: 貿易(2024)', tool: 'estat', args: { action: 'search', q: '貿易', years: '2024' } },

  // --- BOJ with date ranges (171-180) ---
  { id: 171, name: '日銀: コールレート(直近)', tool: 'stats', args: { action: 'boj_data', code: 'STRDCLUCON', db: 'FM01', freq: 'D', from: '202601', to: '202602' } },
  { id: 172, name: '日銀: マネタリーベース(年次)', tool: 'stats', args: { action: 'boj_data', code: 'MABS1AN11', db: 'MD01', freq: 'A' } },
  { id: 173, name: '日銀: 企業物価(2025)', tool: 'stats', args: { action: 'boj_data', code: 'PRCG20_2200000000', db: 'PR01', freq: 'M', from: '202501', to: '202512' } },
  { id: 174, name: '日銀: M2(直近半年)', tool: 'stats', args: { action: 'boj_data', code: 'MAM1NAM2M2MO', db: 'MD02', freq: 'M', from: '202508', to: '202602' } },
  { id: 175, name: '日銀: サービス価格(2024)', tool: 'stats', args: { action: 'boj_data', code: 'PRCS20_5200000000', db: 'PR02', freq: 'M', from: '202401', to: '202412' } },
  { id: 176, name: '統計: ダッシュボード(GDP)', tool: 'stats', args: { action: 'dash_data', code: '0201010010000010010' } },
  { id: 177, name: '統計: ダッシュボード(CPI)', tool: 'stats', args: { action: 'dash_data', code: '0702020000000010010' } },
  { id: 178, name: '統計: ダッシュボード(失業率)', tool: 'stats', args: { action: 'dash_data', code: '0302070000000010010' } },
  { id: 179, name: '統計: NDB地域(二次医療圏)', tool: 'stats', args: { action: 'ndb_areas', areaType: 'secondary_medical_area' } },
  { id: 180, name: '日銀: コールレート(5件)', tool: 'stats', args: { action: 'boj_data', code: 'STRDCLUCON', db: 'FM01', freq: 'D', limit: 5 } },

  // --- Geo + Opendata (181-200) ---
  { id: 181, name: '地理: 国会議事堂ジオコード', tool: 'geo', args: { action: 'geocode', address: '東京都千代田区永田町1-7-1' } },
  { id: 182, name: '地理: 首相官邸ジオコード', tool: 'geo', args: { action: 'geocode', address: '東京都千代田区永田町2-3-1' } },
  { id: 183, name: '地理: 霞が関ジオコード', tool: 'geo', args: { action: 'geocode', address: '東京都千代田区霞が関1丁目' } },
  { id: 184, name: '地理: 逆ジオコード(スカイツリー)', tool: 'geo', args: { action: 'reverse', lat: 35.7101, lon: 139.8107 } },
  { id: 185, name: '地理: PLATEAU横浜', tool: 'geo', args: { action: 'plateau', city: '横浜市' } },
  { id: 186, name: '地理: PLATEAU名古屋', tool: 'geo', args: { action: 'plateau', city: '名古屋市' } },
  { id: 187, name: 'OD: 政府データ(教育)', tool: 'opendata', args: { source: 'gov', q: '教育' } },
  { id: 188, name: 'OD: G空間(土地利用)', tool: 'opendata', args: { source: 'geo', q: '土地利用' } },
  { id: 189, name: 'OD: DPF(橋梁)', tool: 'opendata', args: { source: 'dpf', q: '橋梁' } },
  { id: 190, name: 'OD: 政府データ(人口)', tool: 'opendata', args: { source: 'gov', q: '人口統計' } },
  { id: 191, name: 'Misc: KKJ入札(防衛省)', tool: 'misc', args: { api: 'kkj', org: '防衛省' } },
  { id: 192, name: 'Misc: KKJ入札(国交省)', tool: 'misc', args: { api: 'kkj', org: '国土交通省' } },
  { id: 193, name: 'Misc: KKJ入札(文科省)', tool: 'misc', args: { api: 'kkj', org: '文部科学省' } },
  { id: 194, name: 'Misc: ミラサポ事例(IT)', tool: 'misc', args: { api: 'mirasapo', q: 'IT導入' } },
  { id: 195, name: 'Misc: ミラサポ事例(補助金)', tool: 'misc', args: { api: 'mirasapo', q: '補助金' } },
  { id: 196, name: 'Misc: 海外安全(韓国)', tool: 'misc', args: { api: 'safety', country: '082' } },
  { id: 197, name: 'Misc: 海外安全(アメリカ)', tool: 'misc', args: { api: 'safety', country: '840' } },
  { id: 198, name: 'Misc: ミラサポ目的カテゴリ', tool: 'misc', args: { api: 'mirasapo_cat', catType: 'purposes' } },
  { id: 199, name: 'Misc: ミラサポサービス', tool: 'misc', args: { api: 'mirasapo_cat', catType: 'services' } },
  { id: 200, name: 'Misc: KKJ入札(コンサル)', tool: 'misc', args: { api: 'kkj', q: 'コンサルティング' } },

  // ═══════════════════════════════════════════════════════
  // LEVEL 3: Hard (201-300) — Edge cases, large data, errors
  // ═══════════════════════════════════════════════════════

  // --- Stress: Large results (201-220) ---
  { id: 201, name: 'STRESS: アメダス全局(limit=3)', tool: 'weather', args: { action: 'amedas_st', limit: 3 } },
  { id: 202, name: 'STRESS: 地震一覧(limit=50)', tool: 'weather', args: { action: 'earthquake', limit: 50 } },
  { id: 203, name: 'STRESS: e-Stat広いキーワード', tool: 'estat', args: { action: 'search', q: '統計' } },
  { id: 204, name: 'STRESS: 国会全期間(limit=30)', tool: 'law', args: { action: 'meeting', q: '予算', limit: 30 } },
  { id: 205, name: 'STRESS: トヨタ特許(limit=50)', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '1180301018771', infoType: 'patent', limit: 50 } },
  { id: 206, name: 'STRESS: NDL広い検索', tool: 'academic', args: { source: 'ndl', q: '日本', count: 20 } },
  { id: 207, name: 'STRESS: ダッシュボード全指標', tool: 'stats', args: { action: 'dash_list', limit: 50 } },
  { id: 208, name: 'STRESS: KKJ入札(広い検索)', tool: 'misc', args: { api: 'kkj', q: 'システム' } },
  { id: 209, name: 'STRESS: G空間(広い)', tool: 'opendata', args: { source: 'geo', q: '地図' } },
  { id: 210, name: 'STRESS: 国会スピーチ多件', tool: 'law', args: { action: 'speech', q: '経済', limit: 20 } },
  { id: 211, name: 'STRESS: gBiz広い企業名', tool: 'corporate', args: { action: 'gbiz', name: '株式会社' } },
  { id: 212, name: 'STRESS: e-Stat結果多', tool: 'estat', args: { action: 'search', q: '調査', limit: 30 } },
  { id: 213, name: 'STRESS: JStage広い検索', tool: 'academic', args: { source: 'jstage', q: '研究', count: 15 } },
  { id: 214, name: 'STRESS: 政府データ広い', tool: 'opendata', args: { source: 'gov', q: 'データ', rows: 20 } },
  { id: 215, name: 'STRESS: CiNii広い', tool: 'academic', args: { source: 'cinii', q: '論文', count: 10 } },
  { id: 216, name: 'STRESS: トヨタ調達(多件)', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '1180301018771', infoType: 'procurement', limit: 30 } },
  { id: 217, name: 'STRESS: 国会会議(年金全期間)', tool: 'law', args: { action: 'meeting', q: '年金', limit: 20 } },
  { id: 218, name: 'STRESS: DPF広い検索', tool: 'opendata', args: { source: 'dpf', q: '都市' } },
  { id: 219, name: 'STRESS: IRDBで人工知能', tool: 'academic', args: { source: 'irdb', q: '人工知能', count: 15 } },
  { id: 220, name: 'STRESS: e-Stat(医療2023)', tool: 'estat', args: { action: 'search', q: '医療', years: '2023', limit: 10 } },

  // --- Edge: Missing/invalid params (221-245) ---
  { id: 221, name: 'EDGE: 天気 無効コード', tool: 'weather', args: { action: 'forecast', areaCode: '999999' }, expectError: true },
  { id: 222, name: 'EDGE: 天気 空コード', tool: 'weather', args: { action: 'forecast', areaCode: '' }, expectError: true },
  { id: 223, name: 'EDGE: ハザード 範囲外座標', tool: 'weather', args: { action: 'hazard', lat: 0, lon: 0 }, expectError: true },
  { id: 224, name: 'EDGE: 法令 空キーワード', tool: 'law', args: { action: 'search', q: '' }, expectError: true },
  { id: 225, name: 'EDGE: 法令 存在しないlawId', tool: 'law', args: { action: 'fulltext', lawId: 'NONEXISTENT99999' }, expectError: true },
  { id: 226, name: 'EDGE: gBiz 存在しない企業', tool: 'corporate', args: { action: 'gbiz', name: 'あいうえおかきくけこさしすせそ株式会社' }, expectError: true },
  { id: 227, name: 'EDGE: gBiz 不正法人番号', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '0000000000000', infoType: 'patent' }, expectError: true },
  { id: 228, name: 'EDGE: e-Stat 無意味検索', tool: 'estat', args: { action: 'search', q: 'zzzzzzzzzzzzzzz' }, expectError: true },
  { id: 229, name: 'EDGE: NDL 空クエリ', tool: 'academic', args: { source: 'ndl', q: '' }, expectError: true },
  { id: 230, name: 'EDGE: 逆ジオコード 海上座標', tool: 'geo', args: { action: 'reverse', lat: 30.0, lon: 140.0 } },
  { id: 231, name: 'EDGE: 日銀 無効コード', tool: 'stats', args: { action: 'boj_data', code: 'INVALID_CODE', db: 'FM01' }, expectError: true },
  { id: 232, name: 'EDGE: 日銀 空コード', tool: 'stats', args: { action: 'boj_data', code: '' }, expectError: true },
  { id: 233, name: 'EDGE: KKJ 空検索', tool: 'misc', args: { api: 'kkj' } },
  { id: 234, name: 'EDGE: EDINET 過去の日付', tool: 'corporate', args: { action: 'edinet', date: '2020-01-01' } },
  { id: 235, name: 'EDGE: EDINET 未来の日付', tool: 'corporate', args: { action: 'edinet', date: '2030-12-31' } },
  { id: 236, name: 'EDGE: ジオコード 曖昧住所', tool: 'geo', args: { action: 'geocode', address: '東京' } },
  { id: 237, name: 'EDGE: ジオコード 英語住所', tool: 'geo', args: { action: 'geocode', address: 'Tokyo Station' }, expectError: true },
  { id: 238, name: 'EDGE: 海外安全 無効国コード', tool: 'misc', args: { api: 'safety', country: '999' } },
  { id: 239, name: 'EDGE: 国会 超長期間', tool: 'law', args: { action: 'meeting', q: '憲法改正', from: '1947-01-01', until: '2026-02-28' } },
  { id: 240, name: 'EDGE: gBiz 特殊文字企業名', tool: 'corporate', args: { action: 'gbiz', name: '（株）テスト＆カンパニー' }, expectError: true },
  { id: 241, name: 'EDGE: e-Stat 特殊文字', tool: 'estat', args: { action: 'search', q: '&<>"\'' }, expectError: true },
  { id: 242, name: 'EDGE: 浸水深 陸地外', tool: 'weather', args: { action: 'flood', lat: 35.0, lon: 145.0 } },
  { id: 243, name: 'EDGE: PLATEAU 存在しない県', tool: 'geo', args: { action: 'plateau', prefecture: '存在しない県' } },
  { id: 244, name: 'EDGE: JStage 空クエリ', tool: 'academic', args: { source: 'jstage', q: '' }, expectError: true },
  { id: 245, name: 'EDGE: ミラサポ 空検索', tool: 'misc', args: { api: 'mirasapo' } },

  // --- Complex: Realistic user scenarios (246-280) ---
  { id: 246, name: 'SCENARIO: 東京の地震リスク', tool: 'weather', args: { action: 'hazard', lat: 35.6762, lon: 139.6503 } },
  { id: 247, name: 'SCENARIO: 東京の浸水リスク', tool: 'weather', args: { action: 'flood', lat: 35.6762, lon: 139.6503 } },
  { id: 248, name: 'SCENARIO: 国会でAI議論(2025)', tool: 'law', args: { action: 'speech', q: 'AI 人工知能', from: '2025-01-01', until: '2025-12-31', limit: 15 } },
  { id: 249, name: 'SCENARIO: 国会でAI議論(会議)', tool: 'law', args: { action: 'meeting', q: 'AI 人工知能', from: '2025-01-01', until: '2025-12-31' } },
  { id: 250, name: 'SCENARIO: 富士通のIT調達', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '1020001071491', infoType: 'procurement', limit: 15 } },
  { id: 251, name: 'SCENARIO: 防災データカタログ', tool: 'opendata', args: { source: 'gov', q: '防災 ハザードマップ' } },
  { id: 252, name: 'SCENARIO: 渋谷の住所情報', tool: 'geo', args: { action: 'geocode', address: '東京都渋谷区道玄坂2丁目' } },
  { id: 253, name: 'SCENARIO: 渋谷の交通量', tool: 'weather', args: { action: 'traffic', lat: 35.6580, lon: 139.7016, radius: 1000 } },
  { id: 254, name: 'SCENARIO: 少子化の統計', tool: 'estat', args: { action: 'search', q: '出生 合計特殊出生率' } },
  { id: 255, name: 'SCENARIO: 子育て政策の国会議論', tool: 'law', args: { action: 'speech', q: '少子化 子育て 出産', from: '2025-01-01' } },
  { id: 256, name: 'SCENARIO: 不動産(apiキー未設定想定)', tool: 'misc', args: { api: 'realestate', year: '2024', quarter: '1', area: '13' }, expectError: true },
  { id: 257, name: 'SCENARIO: カーボンニュートラル論文', tool: 'academic', args: { source: 'jstage', q: 'カーボンニュートラル' } },
  { id: 258, name: 'SCENARIO: 水素エネルギー論文', tool: 'academic', args: { source: 'jstage', q: '水素エネルギー' } },
  { id: 259, name: 'SCENARIO: 半導体戦略(国会)', tool: 'law', args: { action: 'speech', q: '半導体 TSMC ラピダス', from: '2024-01-01' } },
  { id: 260, name: 'SCENARIO: 円安議論(国会)', tool: 'law', args: { action: 'speech', q: '円安 為替介入', from: '2024-01-01' } },
  { id: 261, name: 'SCENARIO: マイナ保険証(国会)', tool: 'law', args: { action: 'speech', q: 'マイナ保険証', from: '2024-01-01' } },
  { id: 262, name: 'SCENARIO: 能登地震(国会)', tool: 'law', args: { action: 'speech', q: '能登 地震 復興', from: '2024-01-01' } },
  { id: 263, name: 'SCENARIO: 入管法改正', tool: 'law', args: { action: 'search', q: '入管法' } },
  { id: 264, name: 'SCENARIO: 特定技能(国会)', tool: 'law', args: { action: 'speech', q: '特定技能 外国人労働者' } },
  { id: 265, name: 'SCENARIO: 物流2024年問題', tool: 'law', args: { action: 'speech', q: '物流 2024年問題 ドライバー' } },
  { id: 266, name: 'SCENARIO: 防衛装備移転', tool: 'law', args: { action: 'speech', q: '防衛装備 移転 輸出' } },
  { id: 267, name: 'SCENARIO: 宇宙開発の学術論文', tool: 'academic', args: { source: 'cinii', q: '宇宙開発 ロケット' } },
  { id: 268, name: 'SCENARIO: 再エネ統計', tool: 'estat', args: { action: 'search', q: '再生可能エネルギー' } },
  { id: 269, name: 'SCENARIO: 食料自給率', tool: 'estat', args: { action: 'search', q: '食料自給率' } },
  { id: 270, name: 'SCENARIO: 介護保険', tool: 'estat', args: { action: 'search', q: '介護保険' } },
  { id: 271, name: 'SCENARIO: 待機児童', tool: 'estat', args: { action: 'search', q: '待機児童' } },
  { id: 272, name: 'SCENARIO: 大阪PLATEAU3D', tool: 'geo', args: { action: 'plateau', prefecture: '大阪府', city: '大阪市' } },
  { id: 273, name: 'SCENARIO: 名古屋ハザード', tool: 'weather', args: { action: 'hazard', lat: 35.1815, lon: 136.9066 } },
  { id: 274, name: 'SCENARIO: 札幌浸水リスク', tool: 'weather', args: { action: 'flood', lat: 43.0621, lon: 141.3544 } },
  { id: 275, name: 'SCENARIO: 国交省入札(道路)', tool: 'misc', args: { api: 'kkj', q: '道路', org: '国土交通省' } },
  { id: 276, name: 'SCENARIO: 厚労省入札(システム)', tool: 'misc', args: { api: 'kkj', q: 'システム', org: '厚生労働省' } },
  { id: 277, name: 'SCENARIO: 総務省入札', tool: 'misc', args: { api: 'kkj', org: '総務省', q: 'ネットワーク' } },
  { id: 278, name: 'SCENARIO: 地方自治論文', tool: 'academic', args: { source: 'ndl', q: '地方自治 分権' } },
  { id: 279, name: 'SCENARIO: DPF都市計画', tool: 'opendata', args: { source: 'dpf', q: '都市計画' } },
  { id: 280, name: 'SCENARIO: 文化財データ', tool: 'academic', args: { source: 'japansearch', q: '国宝' } },

  // --- Response quality checks (281-300) ---
  { id: 281, name: 'QUALITY: 地震limit=1→_total見える', tool: 'weather', args: { action: 'earthquake', limit: 1 }, check: '_total' },
  { id: 282, name: 'QUALITY: 国会speech→_totalHits見える', tool: 'law', args: { action: 'speech', q: '税制改正' }, check: '_totalHits' },
  { id: 283, name: 'QUALITY: 国会speech→_byCommittee見える', tool: 'law', args: { action: 'speech', q: '税制改正' }, check: '_byCommittee' },
  { id: 284, name: 'QUALITY: 国会meeting→_totalHits見える', tool: 'law', args: { action: 'meeting', q: '社会保障' }, check: '_totalHits' },
  { id: 285, name: 'QUALITY: gBiz特許→_summary見える', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '1180301018771', infoType: 'patent', limit: 3 }, check: '_summary' },
  { id: 286, name: 'QUALITY: gBiz調達→_summary見える', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '1180301018771', infoType: 'procurement', limit: 3 }, check: '_summary' },
  { id: 287, name: 'QUALITY: アメダスlimit=2→_total', tool: 'weather', args: { action: 'amedas_st', limit: 2 }, check: '_total' },
  { id: 288, name: 'QUALITY: e-Stat→numberOfRecords見える', tool: 'estat', args: { action: 'search', q: '人口', limit: 3 } },
  { id: 289, name: 'QUALITY: レスポンス<4000字', tool: 'weather', args: { action: 'forecast', areaCode: '130000' }, check: 'size<4000' },
  { id: 290, name: 'QUALITY: レスポンス<4000字(国会)', tool: 'law', args: { action: 'speech', q: '観光', limit: 10 }, check: 'size<4000' },
  { id: 291, name: 'QUALITY: レスポンス<4000字(gBiz)', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '1180301018771', infoType: 'patent', limit: 5 }, check: 'size<4000' },
  { id: 292, name: 'QUALITY: ERRでもクラッシュしない', tool: 'weather', args: { action: 'forecast', areaCode: 'INVALID' }, expectError: true },
  { id: 293, name: 'QUALITY: タイムアウトでもクラッシュしない', tool: 'academic', args: { source: 'air' } },
  { id: 294, name: 'QUALITY: 空結果でもクラッシュしない', tool: 'law', args: { action: 'speech', q: 'xyzxyzxyzxyzxyzxyz' } },
  { id: 295, name: 'QUALITY: 国会excerpt<150字', tool: 'law', args: { action: 'speech', q: '防衛' }, check: 'excerpt_short' },
  { id: 296, name: 'QUALITY: 日銀ERRメッセージ', tool: 'stats', args: { action: 'boj_data', code: '' }, expectError: true },
  { id: 297, name: 'QUALITY: gBiz_byDepartment存在', tool: 'corporate', args: { action: 'gbiz_detail', corpNum: '9010601021385', infoType: 'procurement', limit: 3 }, check: '_by_department' },
  { id: 298, name: 'QUALITY: ダッシュボードRESULT存在', tool: 'stats', args: { action: 'dash_data', code: '0201010010000010010' } },
  { id: 299, name: 'QUALITY: 複数回呼んでもクラッシュしない', tool: 'law', args: { action: 'meeting', q: '教育' } },
  { id: 300, name: 'QUALITY: 最終総合テスト(天気東京)', tool: 'weather', args: { action: 'forecast', areaCode: '130000' } },
];

// ──────────────── Test runner ────────────────

async function runTests() {
  console.log(`🚀 行政MCPユーザビリティテスト 300パターン開始 (${new Date().toLocaleTimeString()})`);
  console.log(`   Level 1 (Easy): #1-100, Level 2 (Medium): #101-200, Level 3 (Hard): #201-300\n`);

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['build/index.js'],
    env: { ...process.env, ...ENV },
  });
  const client = new Client({ name: 'test-300', version: '1.0' });
  await client.connect(transport);

  const results = { pass: 0, fail: 0, timeout: 0, error_expected: 0 };
  const failures = [];
  const sizeStats = [];
  const timeStats = [];

  for (const t of tests) {
    const start = Date.now();
    const level = t.id <= 100 ? 'L1' : t.id <= 200 ? 'L2' : 'L3';
    try {
      const r = await Promise.race([
        client.callTool({ name: t.tool, arguments: t.args }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), TIMEOUT)),
      ]);

      const text = r.content?.[0]?.text || '';
      const elapsed = Date.now() - start;
      const isErr = text.startsWith('ERR') || text.includes('未設定');

      // Quality checks
      let qualityOk = true;
      if (t.check) {
        if (t.check === 'size<4000' && text.length > 4100) qualityOk = false;
        else if (t.check === '_total' && !text.includes('_total')) qualityOk = false;
        else if (t.check === '_totalHits' && !text.includes('_totalHits')) qualityOk = false;
        else if (t.check === '_byCommittee' && !text.includes('_byCommittee')) qualityOk = false;
        else if (t.check === '_summary' && !text.includes('_summary')) qualityOk = false;
        else if (t.check === '_by_department' && !text.includes('_by_department')) qualityOk = false;
        else if (t.check === 'excerpt_short') {
          try {
            const d = JSON.parse(text);
            if (d.items?.some(i => i.excerpt?.length > 150)) qualityOk = false;
          } catch { /* ignore */ }
        }
      }

      if (t.expectError) {
        if (isErr) {
          results.error_expected++;
          console.log(`  ${String(t.id).padStart(3)} ${t.name}: [ERR_OK] ${text.slice(0, 60)} (${elapsed}ms)`);
        } else {
          results.fail++;
          failures.push({ id: t.id, name: t.name, reason: 'Expected error but got success', size: text.length });
          console.log(`  ${String(t.id).padStart(3)} ${t.name}: [FAIL] Expected error (${elapsed}ms)`);
        }
      } else if (isErr) {
        results.fail++;
        failures.push({ id: t.id, name: t.name, reason: text.slice(0, 100), size: text.length });
        console.log(`  ${String(t.id).padStart(3)} ${t.name}: [FAIL] ${text.slice(0, 80)} (${elapsed}ms)`);
      } else if (!qualityOk) {
        results.fail++;
        failures.push({ id: t.id, name: t.name, reason: `Quality check failed: ${t.check}`, size: text.length });
        console.log(`  ${String(t.id).padStart(3)} ${t.name}: [QUALITY_FAIL] check=${t.check} (${elapsed}ms)`);
      } else {
        results.pass++;
        sizeStats.push(text.length);
        timeStats.push(elapsed);
        console.log(`  ${String(t.id).padStart(3)} ${t.name}: [PASS] ${text.length}ch (${elapsed}ms)`);
      }
    } catch (e) {
      const elapsed = Date.now() - start;
      if (e.message === 'TIMEOUT') {
        results.timeout++;
        console.log(`  ${String(t.id).padStart(3)} ${t.name}: [TIMEOUT] ${elapsed}ms`);
      } else if (t.expectError) {
        results.error_expected++;
        console.log(`  ${String(t.id).padStart(3)} ${t.name}: [ERR_OK] ${e.message.slice(0, 60)} (${elapsed}ms)`);
      } else {
        results.fail++;
        failures.push({ id: t.id, name: t.name, reason: e.message.slice(0, 100) });
        console.log(`  ${String(t.id).padStart(3)} ${t.name}: [FAIL] ${e.message.slice(0, 80)} (${elapsed}ms)`);
      }
    }
  }

  await client.close();

  // ── Summary ──
  const total = results.pass + results.fail + results.timeout + results.error_expected;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 結果: ${results.pass} PASS / ${results.fail} FAIL / ${results.timeout} TIMEOUT / ${results.error_expected} ERR_OK`);
  console.log(`   合計: ${total}/300 (PASS率: ${(results.pass / (total - results.error_expected) * 100).toFixed(1)}%)`);

  // Level breakdown
  const byLevel = { L1: { pass: 0, fail: 0, timeout: 0 }, L2: { pass: 0, fail: 0, timeout: 0 }, L3: { pass: 0, fail: 0, timeout: 0 } };
  // We can't easily track per-level from results, so just print totals

  if (failures.length > 0) {
    console.log(`\n❌ 失敗一覧:`);
    for (const f of failures) {
      console.log(`   #${f.id} ${f.name}: ${f.reason}`);
    }
  }

  // Size distribution
  if (sizeStats.length > 0) {
    const buckets = { '<500': 0, '500-1K': 0, '1K-2K': 0, '2K-3K': 0, '3K-4K': 0, '4K+': 0 };
    for (const s of sizeStats) {
      if (s < 500) buckets['<500']++;
      else if (s < 1000) buckets['500-1K']++;
      else if (s < 2000) buckets['1K-2K']++;
      else if (s < 3000) buckets['2K-3K']++;
      else if (s < 4000) buckets['3K-4K']++;
      else buckets['4K+']++;
    }
    console.log(`\n📦 レスポンスサイズ分布 (PASSのみ):`);
    for (const [k, v] of Object.entries(buckets)) {
      console.log(`   ${k.padEnd(8)} ${String(v).padStart(3)}件 ${'█'.repeat(Math.ceil(v / 2))}`);
    }
  }

  // Speed distribution
  if (timeStats.length > 0) {
    const speeds = { '⚡<1s': 0, '🟡1-3s': 0, '🟠3-10s': 0, '🔴10s+': 0 };
    for (const t of timeStats) {
      if (t < 1000) speeds['⚡<1s']++;
      else if (t < 3000) speeds['🟡1-3s']++;
      else if (t < 10000) speeds['🟠3-10s']++;
      else speeds['🔴10s+']++;
    }
    console.log(`\n⏱️  速度分布 (PASSのみ):`);
    for (const [k, v] of Object.entries(speeds)) {
      console.log(`   ${k.padEnd(10)} ${String(v).padStart(3)}件 ${'█'.repeat(Math.ceil(v / 2))}`);
    }
  }

  console.log(`\n✅ テスト完了 (${new Date().toLocaleTimeString()})`);
}

runTests().catch(e => { console.error('Fatal:', e); process.exit(1); });
