---
name: codex
description: OpenAI Codex CLIでコードレビュー・分析・調査を実行（読み取り専用）。 トリガー: "codex", "レビューして", "分析して", "/codex"
user_invocable: true
---

# Codex 読み取り専用 Skill

OpenAI Codex CLI を使ってコードレビュー・分析・調査タスクを実行します。
サンドボックスは read-only で、ファイル変更は行いません。

## 使い方

ユーザーの指示内容を `$ARGUMENTS` として Codex に渡します。

## 実行

```bash
codex exec --full-auto --sandbox read-only --cd "$PROJECT_DIR" "$ARGUMENTS"
```

ここで `$PROJECT_DIR` は現在の作業ディレクトリです。

## 注意事項

- 読み取り専用のため、ファイル変更・作成は不可
- レビュー結果や分析結果はそのまま出力される
- 長時間かかる場合は進捗が表示される
