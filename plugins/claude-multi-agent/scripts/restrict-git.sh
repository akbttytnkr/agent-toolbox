#!/bin/bash
# restrict-git.sh - git commit / git push をブロック

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

if echo "$COMMAND" | grep -qE '\bgit\s+commit\b'; then
  echo "[BLOCKED] git commit は禁止されています。ユーザーに手動での実行を依頼してください。" >&2
  exit 2
fi

if echo "$COMMAND" | grep -qE '\bgit\s+push\b'; then
  echo "[BLOCKED] git push は禁止されています。ユーザーに手動での実行を依頼してください。" >&2
  exit 2
fi

exit 0
