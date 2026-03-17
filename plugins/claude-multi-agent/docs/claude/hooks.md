# Hooks — Claude Code Hooks 活用ガイド

## hooks とは

Claude Code の **hooks** は、特定のイベント発生時にシェルコマンドを自動実行する仕組みである。
`.claude/settings.json` に定義し、ツール呼び出しの前後やセッションのライフサイクルに応じて、検証・ログ記録・フォーマットなどの処理を差し込める。

### 動作の流れ

```
Claude Code がツールを呼び出す
  │
  ├── PreToolUse hook 実行
  │     ├── exit 0 → 許可（続行）
  │     ├── exit 2 → ブロック（ツール実行を中止）
  │     └── stdout → ユーザーへのメッセージ
  │
  ├── ツール実行
  │
  └── PostToolUse hook 実行
        └── stdout → Claude へのフィードバック
```

hooks は stdin から JSON を受け取り、終了コードと stdout で結果を返す。

---

## フックイベント一覧

| イベント | 発火タイミング | 主な用途 |
|---------|-------------|---------|
| **PreToolUse** | ツール実行前 | コマンドの検証・ブロック |
| **PostToolUse** | ツール実行後 | 出力の加工・ログ記録 |
| **SessionStart** | セッション開始時 | 環境初期化・コンテキスト準備 |
| **SessionEnd** | セッション終了時 | ログ保存・クリーンアップ |
| **Stop** | メインエージェント停止時 | 最終処理・レポート生成 |
| **SubagentStop** | サブエージェント停止時 | メトリクス記録・結果集計 |
| **Notification** | 通知発生時 | Slack/メール通知の送信 |
| **PreCompact** | コンテキスト圧縮前 | 圧縮前の情報退避 |

### stdin に渡される JSON の例

```json
{
  "session_id": "abc123",
  "tool_name": "Bash",
  "tool_input": {
    "command": "rm -rf /tmp/test"
  }
}
```

---

## 設定方法

`.claude/settings.json` に `hooks` オブジェクトを定義する。

```jsonc
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "",           // 空文字 = 全ツールにマッチ
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/restrict-git.sh"
          }
        ]
      },
      {
        "matcher": "Bash",       // Bash ツールのみにマッチ
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/restrict-destructive.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",  // 正規表現でマッチ
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/format-output.sh"
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/init.sh",
            "timeout": 360
          }
        ]
      }
    ]
  }
}
```

### 設定のポイント

| フィールド | 説明 |
|-----------|------|
| `matcher` | ツール名の正規表現。空文字は全マッチ。`PreToolUse` / `PostToolUse` でのみ意味を持つ |
| `type` | 現時点では `"command"` のみ |
| `command` | 実行するシェルコマンド |
| `timeout` | タイムアウト（秒）。デフォルトは 60 秒 |

---

## orchestration-demo での現在の実装

本プロジェクトでは、Claude Code を開発ツールとして使う際のガードレールとして 3 つの PreToolUse hooks を設定している。

### restrict-git.sh — git 操作の制限

```bash
# git commit / git push をブロック
# 人間が手動で実行することを強制
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
if echo "$CMD" | grep -qE '^\s*git\s+(commit|push)'; then
  echo "git commit / push は手動で実行してください"
  exit 2
fi
exit 0
```

### restrict-destructive.sh — 破壊的コマンドの制限

```bash
# rm -rf をブロック
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
if echo "$CMD" | grep -qE 'rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|.*-rf)'; then
  echo "rm -rf は禁止されています"
  exit 2
fi
exit 0
```

### restrict-workdir.sh — 作業ディレクトリの制限

```bash
# CLAUDE_ALLOWED_DIR 外の操作をブロック
# 環境変数未設定の場合は制限なし
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
if [ -n "$CLAUDE_ALLOWED_DIR" ]; then
  if echo "$CMD" | grep -qE '(cd|mv|cp|rm|touch|mkdir)\s' | grep -v "$CLAUDE_ALLOWED_DIR"; then
    echo "許可されたディレクトリ外の操作はブロックされました"
    exit 2
  fi
fi
exit 0
```

---

## 想定される追加活用例

### PostToolUse: 出力の自動フォーマット

ワーカーの出力 XML を検証し、パースエラーを早期検出する。

```jsonc
// .claude/settings.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/validate-xml-output.sh"
          }
        ]
      }
    ]
  }
}
```

### SessionStart: プロジェクト初期化

セッション開始時に依存パッケージの確認や一時ディレクトリの準備を行う。

```bash
#!/bin/bash
# .claude/hooks/session-init.sh

# 依存チェック
command -v claude >/dev/null 2>&1 || {
  echo "claude CLI が見つかりません"
  exit 1
}
command -v jq >/dev/null 2>&1 || {
  echo "jq が見つかりません"
  exit 1
}

# feedback ディレクトリの確保
mkdir -p ./feedback

echo "orchestration-demo: 環境準備完了"
exit 0
```

### SessionEnd: 会話ログの自動エクスポート

セッション終了時に会話メタデータを JSONL 形式でログに追記する。

```bash
#!/bin/bash
# .claude/hooks/session-export.sh

LOG_DIR="./logs"
mkdir -p "$LOG_DIR"

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "{\"event\":\"session_end\",\"session_id\":\"$SESSION_ID\",\"timestamp\":\"$TIMESTAMP\"}" \
  >> "$LOG_DIR/sessions.jsonl"

exit 0
```

### SubagentStop: ワーカー実行メトリクスの記録

サブエージェント（ワーカー）の完了時にパフォーマンスメトリクスを記録する。

```bash
#!/bin/bash
# .claude/hooks/worker-metrics.sh

LOG_DIR="./logs"
mkdir -p "$LOG_DIR"

INPUT=$(cat)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo "{\"event\":\"subagent_stop\",\"timestamp\":\"$TIMESTAMP\",\"data\":$INPUT}" \
  >> "$LOG_DIR/worker-metrics.jsonl"

exit 0
```
## ログ基盤

hooks で生成するログは JSONL（JSON Lines）形式で統一する。

### ディレクトリ構造

```
logs/
├── sessions.jsonl          # セッション開始/終了ログ
├── worker-metrics.jsonl    # ワーカー実行メトリクス
├── tool-usage.jsonl        # ツール使用ログ
└── errors.jsonl            # エラーログ
```

### JSONL フォーマット

```jsonl
{"event":"session_start","session_id":"abc123","timestamp":"2026-03-04T10:00:00Z"}
{"event":"tool_use","tool":"Bash","command":"ls","duration_ms":50,"timestamp":"2026-03-04T10:00:05Z"}
{"event":"subagent_stop","role":"se","duration_ms":15000,"timestamp":"2026-03-04T10:00:20Z"}
{"event":"session_end","session_id":"abc123","timestamp":"2026-03-04T10:05:00Z"}
```

JSONL 形式を採用する理由:
- 1 行 1 レコードで追記が容易（`>>` リダイレクト）
- `jq` でフィルタリング・集計が可能
- 大量ログでもストリーミング処理が可能
