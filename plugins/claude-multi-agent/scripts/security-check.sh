#!/bin/bash
# security-check.sh - ファイル変更時のセキュリティチェック
#
# PostToolUse: Edit|Write 後に実行
# 検出対象:
#   - ハードコードされたシークレット/トークン/パスワード
#   - 危険な eval / innerHTML 使用
#   - SQL インジェクションリスク
#   - コマンドインジェクションリスク

FILE_PATH="${CLAUDE_TOOL_INPUT_FILE_PATH:-}"

[ -z "$FILE_PATH" ] && exit 0
[ ! -f "$FILE_PATH" ] && exit 0

ISSUES=""

# 1. ハードコードされたシークレット検出
SECRET_PATTERNS=(
  'AKIA[0-9A-Z]{16}'                          # AWS Access Key
  '["\x27]sk-[a-zA-Z0-9]{20,}'                # OpenAI / Stripe secret key
  'ghp_[a-zA-Z0-9]{36}'                       # GitHub Personal Access Token
  'xoxb-[0-9]+-[0-9]+-[a-zA-Z0-9]+'          # Slack Bot Token
  'xoxp-[0-9]+-[0-9]+-[0-9]+-[a-f0-9]+'      # Slack User Token
  'password\s*[:=]\s*["\x27][^"\x27]{8,}'     # ハードコードされたパスワード
  'secret\s*[:=]\s*["\x27][^"\x27]{8,}'       # ハードコードされたシークレット
  'api[_-]?key\s*[:=]\s*["\x27][^"\x27]{8,}' # ハードコードされたAPIキー
)

for pattern in "${SECRET_PATTERNS[@]}"; do
  MATCHES=$(grep -nEi "$pattern" "$FILE_PATH" 2>/dev/null | head -5)
  if [ -n "$MATCHES" ]; then
    ISSUES="${ISSUES}\n🔑 シークレット/認証情報の可能性:\n${MATCHES}\n"
  fi
done

# 2. 危険なコード パターン検出（JS/TS）
if [[ "$FILE_PATH" =~ \.(ts|tsx|js|jsx|mjs|cjs)$ ]]; then
  # eval 使用
  EVAL_MATCHES=$(grep -n '\beval\s*(' "$FILE_PATH" 2>/dev/null)
  if [ -n "$EVAL_MATCHES" ]; then
    ISSUES="${ISSUES}\n⚠️ eval() の使用（コードインジェクションリスク）:\n${EVAL_MATCHES}\n"
  fi

  # innerHTML 使用
  INNER_MATCHES=$(grep -n '\.innerHTML\s*=' "$FILE_PATH" 2>/dev/null)
  if [ -n "$INNER_MATCHES" ]; then
    ISSUES="${ISSUES}\n⚠️ innerHTML の直接代入（XSS リスク）:\n${INNER_MATCHES}\n"
  fi

  # dangerouslySetInnerHTML
  DANGER_MATCHES=$(grep -n 'dangerouslySetInnerHTML' "$FILE_PATH" 2>/dev/null)
  if [ -n "$DANGER_MATCHES" ]; then
    ISSUES="${ISSUES}\n⚠️ dangerouslySetInnerHTML の使用（XSS リスク）:\n${DANGER_MATCHES}\n"
  fi
fi

# 3. SQL インジェクションリスク
if [[ "$FILE_PATH" =~ \.(ts|tsx|js|jsx|py|go|cs|java)$ ]]; then
  # テンプレートリテラルや文字列結合での SQL 構築
  SQL_MATCHES=$(grep -nEi '(SELECT|INSERT|UPDATE|DELETE|DROP).*(\$\{|\+\s*[a-zA-Z]|f".*\{|\.format\()' "$FILE_PATH" 2>/dev/null | head -5)
  if [ -n "$SQL_MATCHES" ]; then
    ISSUES="${ISSUES}\n💉 SQL インジェクションリスク（パラメータ化クエリを使用してください）:\n${SQL_MATCHES}\n"
  fi
done

# 4. シェルコマンドインジェクションリスク
if [[ "$FILE_PATH" =~ \.(ts|tsx|js|jsx|py)$ ]]; then
  EXEC_MATCHES=$(grep -nEi '(child_process|exec|execSync|spawn|system|subprocess|os\.popen).*(\$\{|\+\s*[a-zA-Z]|f".*\{|\.format\()' "$FILE_PATH" 2>/dev/null | head -5)
  if [ -n "$EXEC_MATCHES" ]; then
    ISSUES="${ISSUES}\n🐚 コマンドインジェクションリスク（入力をサニタイズしてください）:\n${EXEC_MATCHES}\n"
  fi
fi

# 結果出力
if [ -n "$ISSUES" ]; then
  echo "🛡️ セキュリティチェック: $(basename "$FILE_PATH")"
  echo -e "$ISSUES"
  echo "---"
  echo "上記を確認し、問題がある場合は修正してください。"
fi

# 警告のみ、ブロックはしない
exit 0
