#!/bin/bash
# slack-notify.sh - セッション完了時に Slack DM 通知
#
# 設定ファイル: ${CLAUDE_PLUGIN_ROOT}/.env
#   SLACK_BOT_TOKEN  — Slack Bot User OAuth Token（xoxb-...）
#   SLACK_USER_ID    — 通知先の Slack User ID（U...）
#
# フックイベント: Stop で使用（async）

INPUT=$(cat)

# .env 読み込み（プラグインルートから）
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
ENV_FILE="${PLUGIN_ROOT}/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

BOT_TOKEN="${SLACK_BOT_TOKEN:-}"
USER_ID="${SLACK_USER_ID:-}"

if [ -z "$BOT_TOKEN" ] || [ -z "$USER_ID" ]; then
  # 未設定なら何もせず正常終了
  exit 0
fi

# ツール情報を取得
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // "unknown"' 2>/dev/null)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null)
WORKING_DIR=$(pwd)
PROJECT_NAME=$(basename "$WORKING_DIR")
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# メッセージ構築
TEXT="*[${PROJECT_NAME}]* セッション完了
• 時刻: ${TIMESTAMP}
• セッション: \`${SESSION_ID}\`
• 最終ツール: \`${TOOL_NAME}\`
• ディレクトリ: \`${WORKING_DIR}\`"

# Slack chat.postMessage API で DM 送信
curl -s -X POST \
  -H "Authorization: Bearer ${BOT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg channel "$USER_ID" \
    --arg text "$TEXT" \
    '{channel: $channel, text: $text}'
  )" \
  --max-time 5 \
  "https://slack.com/api/chat.postMessage" > /dev/null 2>&1

exit 0
