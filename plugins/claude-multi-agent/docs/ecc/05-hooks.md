# Hooks（自動トリガー）ガイド

> **対象リポジトリ:** everything-claude-code
> **作成日:** 2026-03-09

---

## Table of Contents

1. [Hooksとは何か](#1-hooksとは何か)
2. [hooks.json のフォーマット](#2-hooksjson-のフォーマット)
3. [フックイベント詳細](#3-フックイベント詳細)
   - [PreToolUse（6フック）](#31-pretooluse6フック)
   - [PostToolUse（7フック）](#32-posttooluse7フック)
   - [PreCompact（1フック）](#33-precompact1フック)
   - [SessionStart（1フック）](#34-sessionstart1フック)
   - [Stop（3フック）](#35-stop3フック)
   - [SessionEnd（1フック）](#36-sessionend1フック)
4. [マッチャー構文](#4-マッチャー構文)
5. [終了コードと制御フロー](#5-終了コードと制御フロー)
6. [環境変数制御](#6-環境変数制御)
7. [自作フックの書き方](#7-自作フックの書き方)
8. [TypeScript固有フック](#8-typescript固有フック)
9. [フック設計のベストプラクティス](#9-フック設計のベストプラクティス)

---

## 1. Hooksとは何か

Hooks（フック）は、Claude Code のツール実行やセッションライフサイクルに応じて**自動的に実行されるシェルコマンド**です。`hooks.json` に定義することで、外部スクリプト・コマンドを任意のタイミングで呼び出せます。

### 主なユースケース

| カテゴリ | 具体例 |
|---------|--------|
| **品質ゲート** | ファイル編集後に自動でlint・型チェックを実行 |
| **開発環境の自動化** | セッション開始時にtmux/devサーバーを自動起動 |
| **セキュリティチェック** | `console.log` の混入検出、危険コマンドの警告 |
| **学習・記録** | ツール使用の観察記録、コスト追跡、パターン抽出 |
| **状態管理** | コンテキスト圧縮前の状態保存、セッション間の継続 |

### コンポーネントとの関係

```
ユーザーアクション
  └── Claude Code
        ├── ツール呼び出し（Bash, Edit, Write...）
        │     ├── [PreToolUse フック] ← 実行前に自動トリガー
        │     │    └── ブロック可能（exit code 2）
        │     ├── ツール本体の実行
        │     └── [PostToolUse フック] ← 実行後に自動トリガー
        └── セッションライフサイクル
              ├── [SessionStart フック] ← セッション開始時
              ├── [PreCompact フック]  ← コンテキスト圧縮前
              ├── [Stop フック]        ← レスポンス完了時
              └── [SessionEnd フック]  ← セッション終了時
```

---

## 2. hooks.json のフォーマット

フック設定は `hooks/hooks.json` に記述します。スキーマは `schemas/hooks.schema.json` で定義されています。

### 基本構造

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "tool == \"Bash\"",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Bash tool will be executed'",
            "async": false,
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [],
    "SessionStart": [],
    "PreCompact": [],
    "Stop": [],
    "SessionEnd": []
  }
}
```

### フックアイテムのフィールド

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `type` | string | ✅ | `"command"` 固定 |
| `command` | string | ✅ | 実行するシェルコマンド |
| `async` | boolean | — | `true` にすると非同期実行（Claude をブロックしない） |
| `timeout` | number | — | タイムアウト秒数（デフォルト: 60秒） |

### マッチャーフィールド

`PreToolUse` と `PostToolUse` では `matcher` フィールドでフックを条件付き実行できます。

```json
{
  "matcher": "tool == \"Edit\" && tool_input.file_path matches \"\\.tsx?$\"",
  "hooks": [...]
}
```

---

## 3. フックイベント詳細

everything-claude-code の `hooks.json` には合計 **21フック**が定義されています。

```
PreToolUse   × 6
PostToolUse  × 7
PreCompact   × 1
SessionStart × 1
Stop         × 3
SessionEnd   × 1
─────────────────
合計          21フック
```

### 3.1 PreToolUse（6フック）

ツールが実行される**前**にトリガーされます。`exit code 2` でツール実行をブロックできます。

| フック名 | マッチャー | 機能 | async |
|---------|----------|------|-------|
| `auto-tmux-dev` | `tool == "Bash"` | tmuxでdevサーバーを自動起動、ディレクトリベースのセッション命名 | false |
| `tmux-reminder` | `tool == "Bash"` | 長時間コマンドへのtmux使用リマインダー | false |
| `git-push-reminder` | `tool == "Bash" && tool_input.command matches "git push"` | git push前に変更の確認を促す警告 | false |
| `doc-file-warning` | `tool == "Write"` | 非標準のドキュメントファイル作成への警告 | false |
| `suggest-compact` | `tool == "Edit\|Write"` | 論理的な区切りでの手動コンパクション提案 | false |
| `observe` | `tool == ".*"` （全ツール）| ツール使用の非同期観察記録（継続学習用） | true |

#### auto-tmux-dev の例

```json
{
  "matcher": "tool == \"Bash\"",
  "hooks": [
    {
      "type": "command",
      "command": "~/.claude/hooks/auto-tmux-dev.sh",
      "async": false,
      "timeout": 5
    }
  ]
}
```

```bash
#!/bin/bash
# auto-tmux-dev.sh の概要
# ディレクトリ名からセッション名を生成してtmuxで起動
SESSION=$(basename "$PWD")
if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  tmux new-session -d -s "$SESSION"
fi
```

#### git-push-reminder の例

```json
{
  "matcher": "tool == \"Bash\" && tool_input.command matches \"git push\"",
  "hooks": [
    {
      "type": "command",
      "command": "echo 'REMINDER: git push前にすべての変更を確認しましたか？'",
      "async": false
    }
  ]
}
```

---

### 3.2 PostToolUse（7フック）

ツールが実行された**後**にトリガーされます。フォーマット・品質チェック・通知に使います。

| フック名 | マッチャー | 機能 | async |
|---------|----------|------|-------|
| `pr-created` | `tool == "Bash"` | PR URL・レビューコマンドのログ記録 | false |
| `build-complete` | `tool == "Bash"` | バックグラウンドビルドの非同期分析 | **true** |
| `quality-gate` | `tool == "Edit\|Write\|MultiEdit"` | 編集後の非同期品質チェック | **true** |
| `format` | `tool == "Edit"` | JS/TSファイルを Biome または Prettier で自動整形 | false |
| `typecheck` | `tool == "Edit" && file_path matches "\\.tsx?$"` | TypeScript型チェック（`tsc --noEmit`） | false |
| `console-warn` | `tool == "Edit"` | `console.log` 文の検出と警告 | false |
| `observe` | `tool == ".*"` （全ツール） | ツール結果の非同期記録（継続学習用） | **true** |

#### format フックの例（Biome/Prettier自動切替）

```json
{
  "matcher": "tool == \"Edit\" && tool_input.file_path matches \"\\.(j|t)sx?$\"",
  "hooks": [
    {
      "type": "command",
      "command": "~/.claude/hooks/format.sh \"$TOOL_INPUT_FILE_PATH\"",
      "async": false,
      "timeout": 15
    }
  ]
}
```

```bash
#!/bin/bash
# format.sh
FILE="$1"
if [ -f "biome.json" ] || [ -f "biome.jsonc" ]; then
  npx biome format --write "$FILE"
elif [ -f ".prettierrc" ] || [ -f "prettier.config.js" ]; then
  npx prettier --write "$FILE"
fi
```

#### quality-gate フックの例（非同期）

```json
{
  "matcher": "tool == \"Edit\" || tool == \"Write\" || tool == \"MultiEdit\"",
  "hooks": [
    {
      "type": "command",
      "command": "~/.claude/hooks/quality-gate.sh &",
      "async": true,
      "timeout": 30
    }
  ]
}
```

---

### 3.3 PreCompact（1フック）

Claude Code がコンテキストウィンドウを**圧縮する前**にトリガーされます。

| フック名 | 機能 |
|---------|------|
| `pre-compact` | 圧縮前の現在状態・進捗・重要情報を外部ファイルに保存 |

```json
{
  "hooks": {
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/pre-compact.sh",
            "async": false,
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
# pre-compact.sh - 圧縮前の状態保存
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
SAVE_PATH="$HOME/.claude/compact-snapshots/$TIMESTAMP.md"
mkdir -p "$(dirname "$SAVE_PATH")"
# 現在の作業状況・TodoリストをSave
echo "# コンパクション前スナップショット ($TIMESTAMP)" > "$SAVE_PATH"
echo "## 作業ディレクトリ: $PWD" >> "$SAVE_PATH"
```

---

### 3.4 SessionStart（1フック）

新しいClaude Codeセッションが**開始されたとき**にトリガーされます。

| フック名 | 機能 |
|---------|------|
| `session-start` | 前回セッションのコンテキスト読み込み、パッケージマネージャー自動検出 |

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/session-start.sh",
            "async": false,
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
# session-start.sh - セッション初期化

# パッケージマネージャー検出
if [ -f "bun.lockb" ]; then
  echo "Package manager: bun"
  export PKG_MANAGER="bun"
elif [ -f "pnpm-lock.yaml" ]; then
  echo "Package manager: pnpm"
  export PKG_MANAGER="pnpm"
elif [ -f "yarn.lock" ]; then
  echo "Package manager: yarn"
  export PKG_MANAGER="yarn"
else
  echo "Package manager: npm"
  export PKG_MANAGER="npm"
fi

# 前回セッションのコンテキスト読み込み
CONTEXT_FILE="$HOME/.claude/session-context.md"
if [ -f "$CONTEXT_FILE" ]; then
  echo "--- 前回セッションのコンテキスト ---"
  cat "$CONTEXT_FILE"
fi
```

---

### 3.5 Stop（3フック）

Claude Code がレスポンスを**完了したとき**（ユーザーへの応答が終わったとき）にトリガーされます。

| フック名 | 機能 |
|---------|------|
| `check-console-log` | 変更されたすべてのファイルで `console.log` を検索・警告 |
| `session-end` | 現在のセッション状態を永続化（次回セッションへの引き継ぎ） |
| `evaluate-session` | セッション全体を分析してパターン・学習事項を抽出 |

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/check-console-log.sh",
            "async": false,
            "timeout": 10
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/session-end.sh",
            "async": true,
            "timeout": 30
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/evaluate-session.sh",
            "async": true,
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```

#### check-console-log の実装例

```bash
#!/bin/bash
# check-console-log.sh - セッション終了時のconsole.log全件監査
CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.(j|t)sx?$')

if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

FOUND=0
while IFS= read -r file; do
  if grep -n "console\.log" "$file" 2>/dev/null; then
    FOUND=1
  fi
done <<< "$CHANGED_FILES"

if [ "$FOUND" -eq 1 ]; then
  echo "WARNING: console.log が残っています。本番デプロイ前に削除してください。"
fi
```

---

### 3.6 SessionEnd（1フック）

セッションが**完全に終了するとき**にトリガーされます（Stop より後に実行）。

| フック名 | 機能 |
|---------|------|
| `session-end-marker` | ライフサイクルマーカーの記録、リソースのクリーンアップ、トークン・コストメトリクス追跡 |

```json
{
  "hooks": {
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/cost-tracker.sh",
            "async": false,
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

#### コスト追跡スクリプトの例

```bash
#!/bin/bash
# cost-tracker.sh - トークン消費とコストを記録
LOG_FILE="$HOME/.claude/cost-log.csv"

# 環境変数からトークン情報を取得（Claude Code が設定）
TOKENS_IN="${CLAUDE_INPUT_TOKENS:-0}"
TOKENS_OUT="${CLAUDE_OUTPUT_TOKENS:-0}"
SESSION_ID="${CLAUDE_SESSION_ID:-unknown}"
DATE=$(date +%Y-%m-%d)

echo "$DATE,$SESSION_ID,$TOKENS_IN,$TOKENS_OUT" >> "$LOG_FILE"
echo "Session cost recorded: input=$TOKENS_IN, output=$TOKENS_OUT"
```

---

## 4. マッチャー構文

マッチャーは `PreToolUse` と `PostToolUse` でフックを条件付き実行するために使います。

### 基本演算子

| 演算子 | 説明 | 例 |
|--------|------|-----|
| `==` | 完全一致 | `tool == "Bash"` |
| `!=` | 不一致 | `tool != "Read"` |
| `matches` | 正規表現マッチ | `tool_input.command matches "git push"` |
| `&&` | AND条件 | `tool == "Bash" && tool_input.command matches "rm"` |
| `\|\|` | OR条件 | `tool == "Edit" \|\| tool == "Write"` |

### 参照可能な変数

| 変数 | 説明 | 利用可能イベント |
|------|------|--------------|
| `tool` | ツール名（"Bash", "Edit", "Write" 等） | PreToolUse, PostToolUse |
| `tool_input.command` | Bash ツールのコマンド文字列 | Bash ツール使用時 |
| `tool_input.file_path` | Edit/Write ツールのファイルパス | Edit/Write ツール使用時 |

### マッチャー構文の実例

```javascript
// Bash ツール全体にマッチ
tool == "Bash"

// TypeScript/JavaScript ファイルの編集にマッチ
tool == "Edit" && tool_input.file_path matches "\\.tsx?$"

// git push コマンドにマッチ
tool == "Bash" && tool_input.command matches "git push"

// 危険なコマンドにマッチ（rm -rf の検出）
tool == "Bash" && tool_input.command matches "rm\\s+-rf"

// Edit または Write ツールにマッチ
tool == "Edit" || tool == "Write"

// 全ツールにマッチ（ワイルドカード）
tool matches ".*"
```

### JSON内での文字列エスケープ

JSONファイル内では、バックスラッシュと二重引用符をエスケープする必要があります。

```json
{
  "matcher": "tool == \"Bash\" && tool_input.command matches \"git push\""
}
```

```json
{
  "matcher": "tool == \"Edit\" && tool_input.file_path matches \"\\.tsx?$\""
}
```

---

## 5. 終了コードと制御フロー

フックスクリプトの終了コードによって、Claude Code の動作を制御できます。

### 終了コード一覧

| 終了コード | 意味 | 利用可能イベント |
|-----------|------|--------------|
| `0` | 成功・処理を続行 | 全イベント |
| `1` | 一般エラー（警告として記録、処理は続行） | 全イベント |
| `2` | **ブロック**（ツール実行を中止） | **PreToolUse のみ** |

### ブロックの実装例

```bash
#!/bin/bash
# dangerous-command-blocker.sh
# rm -rf / などの危険なコマンドをブロックする

COMMAND="$TOOL_INPUT_COMMAND"

# 危険なパターンを検出
if echo "$COMMAND" | grep -qE "rm\s+-rf\s+/"; then
  echo "ERROR: 危険なコマンドをブロックしました: $COMMAND"
  exit 2  # ← exit 2 でPreToolUseをブロック
fi

exit 0  # ← exit 0 で処理続行
```

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "tool == \"Bash\"",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/dangerous-command-blocker.sh",
            "async": false
          }
        ]
      }
    ]
  }
}
```

> **注意:** `exit 2` が効くのは `PreToolUse` のみです。`PostToolUse` では終了コードに関わらず処理は続行します。

---

## 6. 環境変数制御

everything-claude-code は環境変数でフックの動作をプロファイル別に制御できます。

### ECC_HOOK_PROFILE

フックの適用レベルを切り替えます。

| プロファイル | 説明 | 推奨シーン |
|-----------|------|---------|
| `minimal` | 最小限のフックのみ有効（安全チェック系のみ） | 実験・探索的作業 |
| `standard` | 標準フック有効（デフォルト） | 通常の開発作業 |
| `strict` | 全フック有効（品質チェック最大化） | 本番リリース前 |

```bash
# プロファイルを切り替えて Claude Code を起動
ECC_HOOK_PROFILE=minimal claude

# 探索作業時はminimalで起動
ECC_HOOK_PROFILE=minimal claude "この設計の問題点を分析して"

# リリース前はstrictで実行
ECC_HOOK_PROFILE=strict claude "リリース前の最終確認をして"
```

### ECC_DISABLED_HOOKS

特定のフックを名前で無効化します。カンマ区切りで複数指定できます。

```bash
# observe フックを無効化（プライバシー配慮）
ECC_DISABLED_HOOKS=observe claude

# 複数のフックを無効化
ECC_DISABLED_HOOKS=observe,evaluate-session claude

# tmux関連フックを無効化（tmux未インストール環境）
ECC_DISABLED_HOOKS=auto-tmux-dev,tmux-reminder claude
```

### 環境変数を永続化する方法

```bash
# ~/.bashrc または ~/.zshrc に追加
export ECC_HOOK_PROFILE=standard
export ECC_DISABLED_HOOKS=observe  # 学習記録フックを無効化

# プロジェクト別設定（.envrc + direnv を使用）
echo 'export ECC_HOOK_PROFILE=strict' > .envrc
direnv allow
```

### フックスクリプト内でのプロファイル参照

```bash
#!/bin/bash
# フックスクリプト内でプロファイルを確認する
PROFILE="${ECC_HOOK_PROFILE:-standard}"

case "$PROFILE" in
  minimal)
    # 最小限の処理のみ
    ;;
  strict)
    # 厳密なチェックを実行
    run_strict_checks
    ;;
  *)
    # 標準処理
    run_standard_checks
    ;;
esac
```

---

## 7. 自作フックの書き方

### ステップ1: フックスクリプトを作成

```bash
mkdir -p ~/.claude/hooks
touch ~/.claude/hooks/my-custom-hook.sh
chmod +x ~/.claude/hooks/my-custom-hook.sh
```

```bash
#!/bin/bash
# my-custom-hook.sh - カスタムフックの例
# ファイル編集後に特定のチェックを実行する

FILE_PATH="$TOOL_INPUT_FILE_PATH"

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Python ファイルの場合は flake8 を実行
if echo "$FILE_PATH" | grep -q '\.py$'; then
  if command -v flake8 &>/dev/null; then
    flake8 "$FILE_PATH"
    if [ $? -ne 0 ]; then
      echo "WARNING: flake8 エラーが検出されました: $FILE_PATH"
    fi
  fi
fi

exit 0
```

### ステップ2: hooks.json に登録

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "tool == \"Edit\" && tool_input.file_path matches \"\\.py$\"",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/my-custom-hook.sh",
            "async": false,
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

### ステップ3: 動作確認

```bash
# フックスクリプトを直接テスト
TOOL_INPUT_FILE_PATH="test.py" ~/.claude/hooks/my-custom-hook.sh
echo "Exit code: $?"
```

### フックで利用可能な環境変数

```bash
# ツール情報（PreToolUse / PostToolUse）
$TOOL_NAME              # ツール名（"Bash", "Edit", "Write" 等）
$TOOL_INPUT_COMMAND     # Bash ツールのコマンド文字列
$TOOL_INPUT_FILE_PATH   # Edit/Write ツールのファイルパス
$TOOL_INPUT_CONTENT     # Write ツールの書き込み内容

# セッション情報
$CLAUDE_SESSION_ID      # 現在のセッションID
$CLAUDE_INPUT_TOKENS    # 入力トークン数（SessionEnd で利用可能）
$CLAUDE_OUTPUT_TOKENS   # 出力トークン数（SessionEnd で利用可能）

# プロジェクト情報
$PWD                    # カレントディレクトリ
$HOME                   # ホームディレクトリ

# ECC 制御変数
$ECC_HOOK_PROFILE       # 現在のフックプロファイル
$ECC_DISABLED_HOOKS     # 無効化されているフック名（カンマ区切り）
```

### 実用的なフックパターン集

#### パターン1: ファイル保存時にテスト自動実行

```bash
#!/bin/bash
# auto-test.sh - 編集したファイルに関連するテストを自動実行
FILE="$TOOL_INPUT_FILE_PATH"
TEST_FILE="${FILE/src\//tests/}"
TEST_FILE="${TEST_FILE/.ts/.test.ts}"

if [ -f "$TEST_FILE" ]; then
  echo "関連テストを実行: $TEST_FILE"
  npx jest "$TEST_FILE" --passWithNoTests 2>&1
fi
```

#### パターン2: 機密ファイルへのアクセスをブロック

```bash
#!/bin/bash
# block-sensitive-files.sh - 機密ファイルへの書き込みをブロック（exit 2）
FILE="$TOOL_INPUT_FILE_PATH"
SENSITIVE_PATTERNS=(".env" ".aws/credentials" ".ssh/id_rsa" "secrets.json")

for pattern in "${SENSITIVE_PATTERNS[@]}"; do
  if echo "$FILE" | grep -q "$pattern"; then
    echo "BLOCKED: 機密ファイルへの書き込みをブロックしました: $FILE"
    exit 2
  fi
done

exit 0
```

#### パターン3: Slack 通知（非同期）

```bash
#!/bin/bash
# notify-slack.sh - PR作成時にSlackへ通知
COMMAND="$TOOL_INPUT_COMMAND"

if echo "$COMMAND" | grep -q "gh pr create"; then
  PR_URL=$(gh pr view --json url -q .url 2>/dev/null)
  if [ -n "$PR_URL" ]; then
    curl -s -X POST "$SLACK_WEBHOOK_URL" \
      -H 'Content-type: application/json' \
      -d "{\"text\": \"New PR created: $PR_URL\"}"
  fi
fi
```

---

## 8. TypeScript固有フック

TypeScript/JavaScript プロジェクトでは、以下のフックが特に重要です。

### 8.1 自動フォーマット（format）

ファイル編集後に Biome または Prettier で自動整形します。

```json
{
  "matcher": "tool == \"Edit\" && tool_input.file_path matches \"\\.(j|t)sx?$\"",
  "hooks": [
    {
      "type": "command",
      "command": "~/.claude/hooks/ts-format.sh",
      "async": false,
      "timeout": 15
    }
  ]
}
```

```bash
#!/bin/bash
# ts-format.sh - Biome優先、フォールバックでPrettier
FILE="$TOOL_INPUT_FILE_PATH"

if [ -z "$FILE" ]; then
  exit 0
fi

# Biome が設定されている場合は Biome を優先
if [ -f "biome.json" ] || [ -f "biome.jsonc" ]; then
  npx biome format --write "$FILE" 2>/dev/null
  echo "Biome: フォーマット完了 $FILE"
elif [ -f ".prettierrc" ] || [ -f ".prettierrc.json" ] || [ -f "prettier.config.js" ]; then
  npx prettier --write "$FILE" 2>/dev/null
  echo "Prettier: フォーマット完了 $FILE"
fi

exit 0
```

### 8.2 TypeScript型チェック（typecheck）

`.ts`/`.tsx` ファイルの編集後に型エラーを検出します。

```json
{
  "matcher": "tool == \"Edit\" && tool_input.file_path matches \"\\.tsx?$\"",
  "hooks": [
    {
      "type": "command",
      "command": "~/.claude/hooks/ts-typecheck.sh",
      "async": false,
      "timeout": 30
    }
  ]
}
```

```bash
#!/bin/bash
# ts-typecheck.sh - TypeScript型チェック
if [ -f "tsconfig.json" ]; then
  OUTPUT=$(npx tsc --noEmit 2>&1)
  EXIT_CODE=$?
  if [ $EXIT_CODE -ne 0 ]; then
    echo "TypeScript型エラー検出:"
    echo "$OUTPUT"
    # 警告として出力（ブロックはしない）
    exit 1
  fi
  echo "TypeScript: 型チェック通過"
fi

exit 0
```

### 8.3 console.log 警告（console-warn）

編集中の console.log を検出して警告します。

```json
{
  "matcher": "tool == \"Edit\" && tool_input.file_path matches \"\\.(j|t)sx?$\"",
  "hooks": [
    {
      "type": "command",
      "command": "~/.claude/hooks/console-warn.sh",
      "async": false,
      "timeout": 5
    }
  ]
}
```

```bash
#!/bin/bash
# console-warn.sh - console.log の検出と警告
FILE="$TOOL_INPUT_FILE_PATH"

if grep -n "console\.log" "$FILE" 2>/dev/null; then
  echo ""
  echo "WARNING: console.log が検出されました ($FILE)"
  echo "本番コードでは console.log の代わりにロギングライブラリを使用してください。"
fi

exit 0  # 警告のみ、ブロックはしない
```

### 8.4 セッション終了時の console.log 全件監査（Stop フック）

セッション終了時に変更したすべてのファイルを一括スキャンします。

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/hooks/ts-console-audit.sh",
            "async": false,
            "timeout": 15
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
# ts-console-audit.sh - 変更ファイル全体のconsole.log監査
echo "=== セッション終了 console.log 監査 ==="

CHANGED=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.(j|t)sx?$')

if [ -z "$CHANGED" ]; then
  echo "変更されたJS/TSファイルはありません"
  exit 0
fi

TOTAL=0
while IFS= read -r file; do
  COUNT=$(grep -c "console\.log" "$file" 2>/dev/null || echo 0)
  if [ "$COUNT" -gt 0 ]; then
    echo "  $file: $COUNT 件の console.log"
    TOTAL=$((TOTAL + COUNT))
  fi
done <<< "$CHANGED"

if [ "$TOTAL" -gt 0 ]; then
  echo ""
  echo "合計 $TOTAL 件の console.log が残っています。"
  echo "コミット前に削除または適切なロガーに置換してください。"
fi
```

---

## 9. フック設計のベストプラクティス

### 非同期を活用する

処理時間が長いフックは `async: true` にして Claude の応答をブロックしないようにします。

```json
// ❌ 重い処理を同期実行（Claudeの応答が遅くなる）
{
  "type": "command",
  "command": "npx jest --coverage",
  "async": false
}

// ✅ 重い処理は非同期実行
{
  "type": "command",
  "command": "npx jest --coverage > /tmp/test-results.log 2>&1",
  "async": true,
  "timeout": 120
}
```

### フェイルセーフ設計

フックがエラーになっても開発フローを止めないようにします。

```bash
#!/bin/bash
# フェイルセーフパターン
set +e  # エラーがあっても終了しない

# メイン処理
run_check() {
  npx eslint "$1" 2>/dev/null
}

run_check "$TOOL_INPUT_FILE_PATH"

# 常に exit 0 で終了（フック自体のエラーで作業を止めない）
exit 0
```

### 探索作業時はフックを無効化する

設計検討・実験時はフックが邪魔になることがあります。

```bash
# 探索作業時
ECC_HOOK_PROFILE=minimal claude "このアーキテクチャのトレードオフを分析して"

# または特定フックだけ無効化
ECC_DISABLED_HOOKS=format,typecheck,console-warn claude
```

### セキュリティ上の注意点

フック内で使用してはいけないコマンド（外部通信の観点）：

```bash
# ⚠️ セキュリティレビューが必要
curl      # 外部へのデータ送信リスク
wget      # 外部からのスクリプトダウンロードリスク
nc        # ネットワーク通信リスク
```

これらを使う場合は必ず `security-reviewer` エージェントによるレビューを実施してください。

---

## 参考リンク

- [04-rules.md](./04-rules.md) - Rules（コーディングルール）詳細
- [02-agents.md](./02-agents.md) - エージェントの詳細
- [Claude Code Hooks公式ドキュメント](https://docs.anthropic.com/claude-code/hooks)

---

*このドキュメントは everything-claude-code リポジトリの分析に基づいて作成されました。*
