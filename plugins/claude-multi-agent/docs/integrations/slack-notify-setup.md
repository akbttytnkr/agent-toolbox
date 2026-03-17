# Slack DM 通知セットアップガイド

## 概要

Claude Code のセッション完了時に、Slack の DM で通知を受け取る仕組み。
長時間のオーケストレーション実行中にターミナルの前にいなくても、完了を把握できる。

> **関連ドキュメント**: 双方向のやり取り（質問→返信待ち）については [slack-human-in-the-loop.md](./slack-human-in-the-loop.md) を参照。

---

## 仕組み

```
Claude Code セッション完了
  → Stop フック発火
    → slack-notify.sh 実行（非同期）
      → .env から SLACK_BOT_TOKEN / SLACK_USER_ID を読み込み
        → Slack chat.postMessage API で DM 送信
```

---

## セットアップ手順

### 1. Slack App の作成

1. [Slack API](https://api.slack.com/apps) にアクセス
2. 「Create New App」→「From scratch」を選択
3. アプリ名とワークスペースを指定して作成

> 既に Slack App がある場合はスキップ。

### 2. Bot Token Scopes の設定

「OAuth & Permissions」→「Bot Token Scopes」に以下を追加:

| スコープ | 用途 |
|---------|------|
| `chat:write` | メッセージ送信 |
| `im:write` | DM 送信 |

### 3. ワークスペースにインストール

「OAuth & Permissions」→「Install to Workspace」→ 許可

インストール後に表示される **Bot User OAuth Token**（`xoxb-` で始まる）をコピー。

### 4. Slack User ID の確認

1. Slack アプリで自分のプロフィールを開く
2. 「...」→「メンバーIDをコピー」
3. `U` で始まる ID（例: `U01ABCD2EFG`）を控える

### 5. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集して実際の値を設定:

```bash
# Slack Bot 設定（slack-notify.sh で使用）
SLACK_BOT_TOKEN=xoxb-実際のトークン
SLACK_USER_ID=U実際のID
```

> `.env` は `.gitignore` に含まれているため、リポジトリにコミットされません。

---

## 動作確認

スクリプトを直接実行してテスト:

```bash
echo '{"tool_name":"test","session_id":"test-session"}' | bash scripts/slack-notify.sh
```

Slack の DM に通知が届けば成功。

---

## 通知内容

以下の情報が DM に送信される:

```
[プロジェクト名] セッション完了
• 時刻: 2026-03-17 15:30:00
• セッション: abc123
• 最終ツール: Bash
• ディレクトリ: /home/user/project
```

---

## フック設定

`hooks/hooks.json` に以下が定義済み:

```json
{
  "Stop": [
    {
      "matcher": "*",
      "hooks": [
        {
          "type": "command",
          "command": "${CLAUDE_PLUGIN_ROOT}/scripts/slack-notify.sh",
          "async": true,
          "timeout": 10
        }
      ],
      "description": "セッション完了時にSlack通知（SLACK_BOT_TOKEN 設定時のみ有効）"
    }
  ]
}
```

- `async: true` — 非同期実行のため、セッション終了をブロックしない
- `timeout: 10` — 10秒でタイムアウト
- `SLACK_BOT_TOKEN` が未設定の場合は何もせず正常終了

---

## トラブルシューティング

| 症状 | 確認ポイント |
|------|------------|
| 通知が届かない | `.env` の `SLACK_BOT_TOKEN` と `SLACK_USER_ID` が正しいか確認 |
| `not_authed` エラー | Bot Token が無効。Slack App の OAuth ページで再発行 |
| `channel_not_found` | User ID が間違っている。プロフィールからコピーし直す |
| `missing_scope` | Bot Token Scopes に `chat:write` と `im:write` を追加してアプリを再インストール |
