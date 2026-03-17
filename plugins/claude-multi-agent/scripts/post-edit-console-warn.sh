#!/bin/bash
# PostToolUse: Edit 後に console.log の存在を警告

FILE_PATH="${CLAUDE_TOOL_INPUT_FILE_PATH:-}"

[ -z "$FILE_PATH" ] && exit 0

if [[ "$FILE_PATH" =~ \.(ts|tsx|js|jsx)$ ]]; then
  MATCHES=$(grep -n "console\.log" "$FILE_PATH" 2>/dev/null)
  if [ -n "$MATCHES" ]; then
    echo "⚠️ console.log detected in $FILE_PATH — remove before committing:"
    echo "$MATCHES"
  fi
fi

exit 0
