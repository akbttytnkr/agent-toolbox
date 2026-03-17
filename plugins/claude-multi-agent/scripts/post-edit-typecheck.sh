#!/bin/bash
# PostToolUse: Edit 後に TypeScript 型チェック（警告のみ、ブロックしない）

FILE_PATH="${CLAUDE_TOOL_INPUT_FILE_PATH:-}"

[ -z "$FILE_PATH" ] && exit 0

if [[ "$FILE_PATH" =~ \.(ts|tsx)$ ]]; then
  if [ -f "tsconfig.json" ] && [ -f "node_modules/.bin/tsc" ]; then
    ERRORS=$(npx tsc --noEmit --pretty 2>&1 | head -20)
    if [ -n "$ERRORS" ]; then
      echo "⚠️ TypeScript型チェック警告:"
      echo "$ERRORS"
    fi
  fi
fi

exit 0
