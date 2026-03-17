#!/bin/bash
# restrict-workdir.sh - 作業ディレクトリ外の操作をブロック
#
# 環境変数:
#   CLAUDE_ALLOWED_DIR - 作業を許可するディレクトリ（未設定の場合はチェックしない）

if [ -z "$CLAUDE_ALLOWED_DIR" ]; then
  exit 0
fi

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')
ALLOWED_DIR_RESOLVED=$(realpath "$CLAUDE_ALLOWED_DIR" 2>/dev/null || echo "$CLAUDE_ALLOWED_DIR")

# cd コマンドで許可外に移動しようとしていないか
if echo "$COMMAND" | grep -qE '\bcd\s+'; then
  CD_TARGET=$(echo "$COMMAND" | grep -oP '\bcd\s+\K[^\s;&|]+' | head -1)
  if [ -n "$CD_TARGET" ]; then
    CD_RESOLVED=$(realpath "$CD_TARGET" 2>/dev/null || echo "$CD_TARGET")
    if [[ "$CD_RESOLVED" != "$ALLOWED_DIR_RESOLVED"* ]]; then
      echo "[BLOCKED] 作業ディレクトリ外への移動は禁止されています。許可ディレクトリ: $CLAUDE_ALLOWED_DIR" >&2
      exit 2
    fi
  fi
fi

# ファイル操作コマンド（mv, cp, rm, touch, mkdir）が許可外を対象としていないか
for cmd_pattern in '\bmv\b' '\bcp\b' '\brm\b' '\btouch\b' '\bmkdir\b'; do
  if echo "$COMMAND" | grep -qE "$cmd_pattern"; then
    PATHS=$(echo "$COMMAND" | grep -oP '(?:^|\s)/[^\s;&|]+' || true)
    for filepath in $PATHS; do
      FILE_RESOLVED=$(realpath "$filepath" 2>/dev/null || echo "$filepath")
      if [[ "$FILE_RESOLVED" != "$ALLOWED_DIR_RESOLVED"* ]]; then
        echo "[BLOCKED] 許可ディレクトリ外のファイル操作は禁止されています: $filepath (許可: $CLAUDE_ALLOWED_DIR)" >&2
        exit 2
      fi
    done
  fi
done

exit 0
