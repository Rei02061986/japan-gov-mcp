# CLAUDE.md — japan-gov-mcp プロジェクト指示書

## プロジェクト概要
日本の中央省庁が提供する全API（12+）を統合した MCP (Model Context Protocol) サーバー。
Claude Code がチューニング・統合管理、Codex が実装・テスト・検証を担当する。

## ディレクトリ構造
```
japan-gov-mcp/
├── CLAUDE.md              ← 今読んでいるファイル
├── .claude/skills/        ← Codex連携用Skill定義
│   ├── codex/SKILL.md     ← 読み取り専用（レビュー・分析）
│   └── codex-write/SKILL.md ← 書き込み可（実装・テスト作成）
├── .codex/                ← Codex用タスク定義ファイル
│   ├── task-001-estat-provider.md
│   ├── task-002-resas-provider.md
│   └── task-003-noauth-apis.md
├── docs/
│   ├── ARCHITECTURE.md    ← アーキテクチャ設計書
│   ├── API_CATALOG.md     ← 全API仕様カタログ
│   ├── TASK_PLAN.md       ← 実装タスク一覧・進捗管理
│   └── CODEX_TASKS.md     ← Codex タスクテンプレート集
├── src/
│   ├── index.ts           ← MCPサーバー本体（27ツール登録）
│   ├── providers/         ← 各省庁APIクライアント
│   │   ├── estat.ts       ← e-Stat (総務省)
│   │   ├── resas.ts       ← RESAS (内閣府)
│   │   ├── houjin.ts      ← 法人番号 (国税庁)
│   │   ├── gbiz.ts        ← gBizINFO (経済産業省)
│   │   ├── edinet.ts      ← EDINET (金融庁)
│   │   └── misc.ts        ← 法令API, 統計Dashboard, 不動産, etc.
│   └── utils/
│       └── http.ts        ← 共通HTTPユーティリティ
├── tests/                 ← テストファイル
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Codex CLI 連携方針

**MCP（`codex mcp-server`）は使わない。Skill（`codex exec` 直接実行）を使う。**

### MCPを使わない理由
1. **進捗が見えない**: MCP実行中はブラックボックス。Codexが何をしているか不明
2. **長時間無応答**: 複雑タスクで数十分〜1時間以上、何も表示されず待たされる
3. **タイムアウト判断不能**: 動いているのか止まっているのか分からず、中断すべきか迷う
4. **デバッグ困難**: エラーが発生しても原因の切り分けが難しい
5. **session_id使い回し**: Claude Codeが新しい話題でも古いsession_idを再利用してしまう

### Skill方式のメリット
| 項目 | MCP | Skill |
|------|-----|-------|
| 進捗の可視性 | ❌ 見えない | ✅ リアルタイム |
| 長時間タスク | ❌ 無応答 | ✅ 出力確認可能 |
| 中断判断 | ❌ 不能 | ✅ Ctrl+C可能 |
| デバッグ | ❌ ブラックボックス | ✅ エラー直接確認 |
| 呼び出し | △ プロンプト指示 | ✅ /codex で即起動 |

### 2つのSkill

**読み取り専用** `.claude/skills/codex/SKILL.md`
```bash
codex exec --full-auto --sandbox read-only --cd <dir> "<指示>"
```
用途: レビュー、分析、仕様調査、テスト計画

**書き込み可能** `.claude/skills/codex-write/SKILL.md`
```bash
codex exec --full-auto --cd <dir> "<指示>"
```
用途: 実装、テスト作成、バグ修正
⚠️ 実行前に `git status`、実行後に `git diff` で必ず確認

### 役割分担
| 役割 | 担当 | 具体的な作業 |
|------|------|-------------|
| **アーキテクト** | Claude Code | 設計判断、Provider間の統合ロジック、エラーハンドリング方針 |
| **実装者** | Codex (skill) | 個別Providerの実装、テスト作成、API仕様の検証 |
| **チューナー** | Claude Code | Codex出力のレビュー・修正、パフォーマンス最適化 |
| **検証者** | Codex (skill) | ユニットテスト実行、APIレスポンス検証、型チェック |

### 典型フロー

```
1. Claude Code: タスク選択 (.codex/task-XXX.md)
2. /codex でCodexにレビュー・調査（read-only, 進捗見える）
3. レビュー結果確認
4. /codex-write で実装委任（進捗監視、方向違いなら中断）
5. git diff → npm run typecheck → npm test → コミット
6. docs/TASK_PLAN.md のステータス更新
7. 次のタスクへ
```

## ビルド・実行コマンド

```bash
npm install           # 依存関係インストール
npm run build         # TypeScriptコンパイル
npm run typecheck     # 型チェックのみ
npm test              # テスト実行
npm run test:noauth   # キー不要APIのみテスト
npm start             # MCPサーバー起動（stdio）
npm run inspect       # MCP Inspector でGUIテスト
```

## コーディング規約

### TypeScript
- strict mode 必須
- 全関数に JSDoc コメント
- Provider は副作用なし（純粋なAPI呼び出しのみ）
- エラーは `ApiResponse<T>` 型で返す（例外を投げない）

### MCP ツール
- ツール名: `{provider}_{action}` 形式（例: `estat_search`）
- 説明文: `【{提供元}】` プレフィックス付き日本語
- Zod スキーマ: 全パラメータに `.describe()` 必須
- **stdout に絶対書かない**（stdio transport が壊れる）→ `console.error()` のみ

### テスト
- Node.js 標準 `node:test` を使用
- 各Providerに対応するテストファイルを `tests/` に配置
- APIキーなしでも動くモックテスト
- 実APIテストは `TEST_WITH_REAL_API=1` フラグで切り替え

## 環境変数

| 変数名 | API | 必須度 | 取得先 |
|--------|-----|--------|--------|
| `ESTAT_APP_ID` | e-Stat | ★★★ | https://www.e-stat.go.jp/api/ |
| `RESAS_API_KEY` | RESAS | ★★★ | https://opendata.resas-portal.go.jp/ |
| `HOUJIN_APP_ID` | 法人番号 | ★★☆ | https://www.houjin-bangou.nta.go.jp/webapi/ |
| `GBIZ_TOKEN` | gBizINFO | ★★☆ | https://info.gbiz.go.jp/hojin/api |
| `EDINET_API_KEY` | EDINET | ★★☆ | https://disclosure2.edinet-fsa.go.jp/ |
| `HELLOWORK_API_KEY` | ハローワーク | ★☆☆ | https://www.hellowork.mhlw.go.jp/ |

APIキー不要: 統計ダッシュボード, 法令API, 不動産情報ライブラリ, データカタログ, 海外安全情報, 文化遺産

## 現在の状態
- [x] プロジェクト初期構成
- [x] 全Provider雛形実装（12 API, 27ツール）
- [x] ビルド通過確認
- [x] Codex連携Skill定義
- [ ] 個別Providerの実API検証 ← 次のタスク
- [ ] テスト作成
- [ ] エラーハンドリング強化
- [ ] レスポンス整形（LLM向け最適化）
- [ ] キャッシュ層追加
- [ ] README完成・公開準備
