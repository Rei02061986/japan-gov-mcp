---
name: codex-write
description: OpenAI Codex CLIで実装・修正・テスト作成を実行（書き込み可能）。 トリガー: "codexで実装して", "codexに書かせて", "/codex-write"
user_invocable: true
---

# Codex 書き込み可能 Skill

OpenAI Codex CLI を使って実装・修正・テスト作成タスクを実行します。
ファイルの作成・変更が可能です。

## 使い方

ユーザーの指示内容を `$ARGUMENTS` として Codex に渡します。

## 実行前チェック

実行前に必ず `git status` で現在の状態を確認してください。

## 実行

```bash
codex exec --full-auto --cd "$PROJECT_DIR" "$ARGUMENTS"
```

ここで `$PROJECT_DIR` は現在の作業ディレクトリです。

## 実行後チェック

実行後に必ず以下を確認してください：
1. `git diff` で変更内容を確認
2. `npm run typecheck` で型チェック
3. `npm test` でテスト実行

## 注意事項

- ファイル変更が可能なため、実行後は必ず差分を確認
- 意図しない変更があれば `git checkout` で戻す
- 大きな変更の場合は事前にブランチを切ることを推奨
