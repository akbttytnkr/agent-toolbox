#!/bin/bash
# restrict-destructive.sh - 破壊的コマンド（rm -rf 等）をブロック

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

if echo "$COMMAND" | grep -qE '\brm\s+.*-[a-zA-Z]*r[a-zA-Z]*f|\brm\s+.*-[a-zA-Z]*f[a-zA-Z]*r|\brm\s+-rf\b|\brm\s+-fr\b'; then
  echo "[BLOCKED] rm -rf は禁止されています。ファイル削除が必要な場合はユーザーに確認してください。" >&2
  exit 2
fi

exit 0
