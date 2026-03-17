#!/bin/bash
# PostToolUse: Edit/Write 後に TypeScript/JavaScript ファイルを自動整形

FILE_PATH="${CLAUDE_TOOL_INPUT_FILE_PATH:-}"

# ファイルパスが取得できない場合は終了
[ -z "$FILE_PATH" ] && exit 0

# TypeScript/JavaScript ファイルのみ対象
if [[ "$FILE_PATH" =~ \.(ts|tsx|js|jsx)$ ]]; then
  # プロジェクトに Prettier があれば使用
  if [ -f "node_modules/.bin/prettier" ]; then
    npx prettier --write "$FILE_PATH" 2>/dev/null
  # Biome があれば使用
  elif [ -f "node_modules/.bin/biome" ]; then
    npx biome format --write "$FILE_PATH" 2>/dev/null
  fi
fi

exit 0
