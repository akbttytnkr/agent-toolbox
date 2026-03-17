# ECC知見の取り込み提案書

> **対象リポジトリ**: claude-multi-agent
> **参考元**: [everything-claude-code (ECC)](https://github.com/affaan-m/everything-claude-code)
> **作成日**: 2026-03-09

## 目次

- [1. モデル選択戦略の導入](#1-モデル選択戦略の導入)
- [2. PostToolUseフックによる品質強制](#2-posttoolusefックによる品質強制)
- [3. Rulesの常時注入](#3-rulesの常時注入)
- [4. Confidence-Based Filtering](#4-confidence-based-filtering)
- [5. 継続学習の仕組み](#5-継続学習の仕組み)

---

## 1. モデル選択戦略の導入

### 現状の課題

`src/agents.ts` および `src/team-member.ts` で全ワーカーが `claude-sonnet-4-6` 固定。

```typescript
// src/agents.ts（現状）
researcher: {
  // ...
  model: 'sonnet',
  maxTurns: 1,
},
// 全ロールが同じ
```

```typescript
// src/team-member.ts:219（現状）
model: 'claude-sonnet-4-6',
```

計画系エージェント（planner, se）もドキュメント生成（doc-updater相当）も同じモデルを使用しており、コスト効率が悪い。

### ECCの知見

| モデル | 特性 | 割り当て |
|--------|------|---------|
| **Opus** | 最高の推論能力 | 計画・設計（architect, planner） |
| **Sonnet** | 能力/コストの均衡 | 実装・レビュー（90%のタスク） |
| **Haiku** | 最速・最安（Sonnet比3倍安価） | 文書生成・単純タスク |

### 実装方針

#### Step 1: `RoleDefinition` に `model` フィールドを追加

```typescript
// src/roles.ts
export interface RoleDefinition {
  name: string
  emoji: string
  systemPrompt: string
  isDebate?: boolean
  model: 'opus' | 'sonnet' | 'haiku'  // ← 追加
}
```

#### Step 2: 各ロールにモデルを割り当て

```typescript
// src/roles.ts
export const ROLES: Record<WorkerRole, RoleDefinition> = {
  researcher: {
    name: 'リサーチャー',
    emoji: '🔍',
    model: 'sonnet',  // 調査は中程度の推論で十分
    systemPrompt: `...`,
  },
  se: {
    name: 'システムエンジニア',
    emoji: '🏗️',
    model: 'opus',  // アーキテクチャ設計は深い推論が必要
    systemPrompt: `...`,
  },
  programmer: {
    name: 'プログラマー',
    emoji: '💻',
    model: 'sonnet',  // 実装は均衡モデルで十分
    systemPrompt: `...`,
  },
  // ...
}
```

**推奨割り当て一覧:**

| ロール | 推奨モデル | 理由 |
|--------|-----------|------|
| `researcher` | sonnet | 調査・分析は中程度の推論で十分 |
| `context_loader` | haiku | 既存ファイル読み取り+要約のみ |
| `se` | opus | アーキテクチャ設計は深い推論が必要 |
| `programmer` | sonnet | 実装タスクの主力 |
| `frontend` | sonnet | UI実装 |
| `backend` | sonnet | API実装 |
| `tester` | sonnet | テスト設計 |
| `ui_ux` | sonnet | UX設計 |
| `security_red` | sonnet | 攻撃分析 |
| `security_blue` | sonnet | 防御策提案 |
| `planner_*`（全6種） | opus | 計画系は深い推論が必要 |

#### Step 3: `team-member.ts` でロール定義のモデルを使用

```typescript
// src/team-member.ts:219 付近を変更
const modelMap = {
  opus: 'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku: 'claude-haiku-4-5-20251001',
} as const

for await (const msg of query({
  prompt: userPrompt,
  options: {
    // ...
    model: modelMap[roleInfo.model],  // ← 動的にモデル選択
    // ...
  },
})) {
```

#### Step 4: `agents.ts` も同様に更新

```typescript
// src/agents.ts
export function buildAgents(): Record<string, AgentDefinition> {
  return Object.fromEntries(
    Object.entries(ROLES)
      .filter(([_, role]) => !role.isDebate)
      .map(([key, role]) => [key, {
        description: role.name,
        prompt: role.systemPrompt,
        tools: [],
        model: role.model,  // ← RoleDefinition のモデルを使用
        maxTurns: 1,
      }])
  )
}
```

### 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/roles.ts` | `RoleDefinition` に `model` フィールド追加、各ロールに値設定 |
| `src/team-member.ts` | `modelMap` 追加、`query()` のモデルを動的化 |
| `src/agents.ts` | `buildAgents()` でロールのモデルを使用 |

### 期待効果

- planner_* 6種を opus にすることで計画品質向上
- context_loader を haiku にすることでコスト約66%削減（そのロール分）
- 全体のAPI費用を推定15-25%削減（ロール構成による）

---

## 2. PostToolUseフックによる品質強制

### 現状の課題

`.claude/settings.json` のフックは3つの **制限系** PreToolUse フックのみ:

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [{ "command": "restrict-git.sh" }] },
      { "matcher": "Bash", "hooks": [{ "command": "restrict-destructive.sh" }] },
      { "matcher": "Bash", "hooks": [{ "command": "restrict-workdir.sh" }] }
    ]
  }
}
```

ワーカーがコードを書いた後の品質チェックが一切ない。LLMは指示を約20%の確率で忘れるため（ECCのchief-of-staff.mdより）、プロンプトだけでは品質を保証できない。

### ECCの知見

PostToolUseフックを使い、ツール実行後に自動で品質チェックを実行する:

- **Edit/Write 後** → Prettier/Biome 整形、TypeScript型チェック
- **Edit 後** → console.log 警告
- **Edit|Write|MultiEdit 後** → 品質ゲートチェック（非同期）

### 実装方針

#### Step 1: 品質チェックスクリプトを作成

```bash
# .claude/hooks/post-edit-format.sh
#!/bin/bash
# Edit/Write 後に TypeScript/JavaScript ファイルを自動整形

FILE_PATH="$CLAUDE_TOOL_INPUT_FILE_PATH"

# TypeScript/JavaScript ファイルのみ対象
if [[ "$FILE_PATH" =~ \.(ts|tsx|js|jsx)$ ]]; then
  # プロジェクトに Prettier があれば使用
  if command -v npx &> /dev/null && [ -f "node_modules/.bin/prettier" ]; then
    npx prettier --write "$FILE_PATH" 2>/dev/null
  fi
fi

exit 0
```

```bash
# .claude/hooks/post-edit-typecheck.sh
#!/bin/bash
# Edit 後に TypeScript 型チェック

FILE_PATH="$CLAUDE_TOOL_INPUT_FILE_PATH"

if [[ "$FILE_PATH" =~ \.(ts|tsx)$ ]]; then
  if command -v npx &> /dev/null && [ -f "tsconfig.json" ]; then
    # 型エラーがあれば警告として出力（ブロックはしない）
    npx tsc --noEmit --pretty 2>&1 | head -20
  fi
fi

exit 0
```

```bash
# .claude/hooks/post-edit-console-warn.sh
#!/bin/bash
# Edit 後に console.log の追加を警告

FILE_PATH="$CLAUDE_TOOL_INPUT_FILE_PATH"

if [[ "$FILE_PATH" =~ \.(ts|tsx|js|jsx)$ ]]; then
  if grep -n "console\.log" "$FILE_PATH" 2>/dev/null; then
    echo "⚠️ WARNING: console.log found in $FILE_PATH - remove before committing"
  fi
fi

exit 0
```

#### Step 2: settings.json にフック登録

```json
{
  "hooks": {
    "PreToolUse": [
      // ... 既存のフック
    ],
    "PostToolUse": [
      {
        "matcher": "Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/post-edit-format.sh"
          }
        ]
      },
      {
        "matcher": "Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/post-edit-typecheck.sh"
          }
        ]
      },
      {
        "matcher": "Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/post-edit-console-warn.sh"
          }
        ]
      }
    ]
  }
}
```

#### Step 3: ワーカー用の品質フックも検討

`team-member.ts` のワーカーは `bypassPermissions` モードで動作するため、settings.json のフックが適用されない可能性がある。その場合、`executeTask()` の結果に対してプログラムレベルで品質チェックを挿入する:

```typescript
// src/team-member.ts — executeTask() の末尾に追加
async function postTaskQualityCheck(
  boardDir: string,
  task: BoardTask,
  output: string,
): Promise<void> {
  // ワーカーが書いたファイルをチェック
  const writtenFiles = extractWrittenFiles(output)
  for (const file of writtenFiles) {
    if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      // TypeScript型チェック
      const { execSync } = await import('node:child_process')
      try {
        execSync(`npx tsc --noEmit --pretty 2>&1 | head -10`, {
          cwd: getWorkdir(boardDir) || process.cwd(),
          timeout: 30000,
        })
      } catch {
        // 型エラーがあればログに出力
        console.log(`  ⚠️ 型チェック警告: ${file}`)
      }
    }
  }
}
```

### 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `.claude/hooks/post-edit-format.sh` | **新規作成** — 自動整形 |
| `.claude/hooks/post-edit-typecheck.sh` | **新規作成** — 型チェック |
| `.claude/hooks/post-edit-console-warn.sh` | **新規作成** — console.log警告 |
| `.claude/settings.json` | PostToolUse フック追加 |
| `src/team-member.ts` | （オプション）プログラムレベルの品質チェック |

### 注意事項

- PostToolUse フックはブロック不可（終了コード2は PreToolUse のみ有効）
- 非同期フック（`async: true`）にすることでワーカーの実行速度に影響しない
- `bypassPermissions` モードでのフック適用有無を要検証

---

## 3. Rulesの常時注入

### 現状の課題

`src/roles.ts` の各ロールの `systemPrompt` に品質基準が埋め込まれているが:

1. ロールごとに分散しており、統一的なルール管理ができない
2. コーディングスタイル・セキュリティ・テスト基準などの横断的ルールが一元化されていない
3. プロジェクト固有のルールを追加しにくい

### ECCの知見

`rules/` ディレクトリに以下の多層構造でルールを管理:

```
rules/
├── common/           # 言語非依存（9ファイル）
│   ├── coding-style.md    # イミュータビリティ、ファイルサイズ上限800行
│   ├── testing.md         # 80%カバレッジ必須
│   ├── security.md        # コミット前8項目チェック
│   └── ...
├── typescript/       # TypeScript固有
├── python/           # Python固有
└── golang/           # Go固有
```

ルールは **常時自動注入** され、LLMが忘れようがない。

### 実装方針

#### Step 1: ルールディレクトリ構造を作成

```
rules/
├── common/
│   ├── coding-style.md      # 共通コーディングルール
│   ├── quality-standards.md  # 品質基準（カバレッジ、レビュー基準）
│   └── security.md           # セキュリティチェックリスト
└── typescript/
    ├── coding-style.md       # TS固有ルール
    └── testing.md            # TS固有テストルール
```

#### Step 2: ルール例

```markdown
<!-- rules/common/coding-style.md -->
# コーディングスタイルルール

## 必須
- ファイルサイズ: 200-400行を標準、800行を上限とする
- イミュータビリティ: オブジェクトは新規作成、ミューテーション禁止
- エラーハンドリング: 全レベルで包括的処理
- ハードコード禁止: 定数・環境変数を使用

## 命名規則
- 変数・関数: camelCase
- 型・インターフェース: PascalCase
- 定数: UPPER_SNAKE_CASE
- ファイル: kebab-case.ts
```

```markdown
<!-- rules/common/quality-standards.md -->
# 品質基準

## テスト
- 最低カバレッジ: 80%
- テスト種別: ユニット + 統合 + E2E
- TDDフロー: RED → GREEN → IMPROVE

## コードレビュー
- CRITICAL（セキュリティ）: マージ禁止
- HIGH（品質）: 慎重マージ可
- MEDIUM（パフォーマンス）: 次回対応可
- LOW（スタイル）: 任意
```

#### Step 3: `team-member.ts` でルールを自動注入

```typescript
// src/rules-loader.ts — 新規作成
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * rules/ ディレクトリからルールを読み込み、systemPromptに注入する文字列を生成
 */
export function loadRules(projectDir: string, language?: string): string {
  const rulesDir = join(projectDir, 'rules')
  if (!existsSync(rulesDir)) return ''

  const sections: string[] = []

  // 1. 共通ルールを読み込み
  const commonDir = join(rulesDir, 'common')
  if (existsSync(commonDir)) {
    for (const file of readdirSync(commonDir).filter(f => f.endsWith('.md'))) {
      const content = readFileSync(join(commonDir, file), 'utf-8')
      sections.push(content)
    }
  }

  // 2. 言語固有ルールを読み込み（指定時）
  if (language) {
    const langDir = join(rulesDir, language)
    if (existsSync(langDir)) {
      for (const file of readdirSync(langDir).filter(f => f.endsWith('.md'))) {
        const content = readFileSync(join(langDir, file), 'utf-8')
        sections.push(content)
      }
    }
  }

  if (sections.length === 0) return ''

  return `\n\n## プロジェクトルール（常時適用）\n以下のルールはすべての作業に適用されます。必ず遵守してください。\n\n${sections.join('\n\n---\n\n')}`
}
```

#### Step 4: `team-member.ts` に統合

```typescript
// src/team-member.ts — executeTask() 内
import { loadRules } from './rules-loader.js'

// systemPrompt構築時にルールを追加
const rules = loadRules(process.cwd(), 'typescript')
const systemPrompt = roleInfo.systemPrompt + teamProtocol + rules
```

### 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `rules/common/coding-style.md` | **新規作成** — 共通コーディングルール |
| `rules/common/quality-standards.md` | **新規作成** — 品質基準 |
| `rules/common/security.md` | **新規作成** — セキュリティチェックリスト |
| `rules/typescript/coding-style.md` | **新規作成** — TS固有ルール |
| `src/rules-loader.ts` | **新規作成** — ルール読み込みモジュール |
| `src/team-member.ts` | `loadRules()` を呼び出してsystemPromptに注入 |

### 設計上の注意

- ルールはsystemPromptに追加されるため、コンテキストウィンドウを消費する
- ルール合計は **2000トークン以内** に抑えることを推奨（ECCの performance.md 参照: コンテキスト最後の20%では品質低下）
- ロール別にルールのフィルタリングも検討可能（例: tester には testing.md のみ注入）

---

## 4. Confidence-Based Filtering

### 現状の課題

レビューワーカー（`security_red`, `security_blue`）や `tester` が、確信度の低い指摘も含めて全て報告するため:

- レビュー結果にノイズが多い
- 修正サイクルが不必要に長くなる
- スタイルの好みレベルの指摘が MEDIUM/HIGH と混在する

### ECCの知見

`code-reviewer.md` に「確信80%ルール」が明記:

> "Do not flood the review with noise. Report if >80% confident it is a real issue."

さらに:
- 類似問題は統合（5件の個別報告→1件の集約報告）
- 変更されていないコードの問題は CRITICAL 以外スキップ
- スタイル的好みはプロジェクト規約違反でない限りスキップ

### 実装方針

#### Step 1: レビュー系ロールの systemPrompt に確信度ルールを追加

```typescript
// src/roles.ts — security_red の systemPrompt に追加

const CONFIDENCE_FILTER = `
<confidence_filter>
## 報告フィルタリングルール（必須）
- **確信度80%以上** の問題のみ報告すること
- 「可能性がある」「かもしれない」レベルの指摘は CRITICAL 以外省略すること
- 類似の問題は統合して1件にまとめること（例: 「5箇所で同じバリデーション漏れ」→1件）
- 今回の変更に含まれないコードの問題は CRITICAL のみ報告すること
- コーディングスタイルの好みは、プロジェクトルール違反でない限り報告しないこと

各指摘には確信度を明記すること:
- 🔴 確実 (95%+): 再現手順が明確、コードから直接確認可能
- 🟡 高確信 (80-95%): パターンマッチで高確率、ただし文脈依存の可能性あり
- ⚪ 低確信 (80%未満): 報告しない
</confidence_filter>`
```

#### Step 2: 適用対象ロール

```typescript
// 以下のロールの systemPrompt 末尾に CONFIDENCE_FILTER を追加
const REVIEW_ROLES = [
  'security_red',
  'security_blue',
  'tester',
] as const

// roles.ts で各ロールの systemPrompt に追記
// security_red:
systemPrompt: `...既存のプロンプト...${CONFIDENCE_FILTER}`,
```

#### Step 3: レビュータスク自動生成時にもフィルタ指示を注入

```typescript
// src/team-member.ts — handlePostCompletion() のレビュータスク生成部分
const reviewTask = createTask(boardDir, {
  title: `[レビュー] ${task.title}`,
  instruction: `以下のタスク成果物をレビューしてください。

## 報告ルール
- 確信度80%以上の問題のみ報告すること
- 類似問題は統合すること
- スタイルの好みは報告しないこと

## 元タスク
...`,
  // ...
})
```

### 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/roles.ts` | `security_red`, `security_blue`, `tester` の systemPrompt に確信度フィルタ追加 |
| `src/team-member.ts` | レビュータスク自動生成時にフィルタ指示を追加 |

### 期待効果

- レビュー結果のノイズ50-70%削減（ECC実績ベース）
- 修正サイクルの短縮
- 本当に重要な問題への集中

---

## 5. 継続学習の仕組み

### 現状の課題

ワーカーが実行中に学んだパターン（成功したアプローチ、失敗した手法、プロジェクト固有の知見）がセッション終了とともに失われる。次回の実行では同じ試行錯誤を繰り返す。

### ECCの知見

`continuous-learning` スキル + Stop フックの組み合わせ:

1. セッション終了時に自動でパターン抽出スクリプトを実行
2. 抽出されたパターンを `~/.claude/rules/` に自動保存
3. 次回セッションで自動注入

### 実装方針

#### Step 1: フェーズ結果からパターンを抽出する仕組み

project モードでは既にフェーズ結果を `project-save-result` で保存している。これを拡張して、各フェーズの「学び」を蓄積する。

```typescript
// src/learning.ts — 新規作成

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

interface LearnedPattern {
  category: 'success' | 'failure' | 'convention'
  pattern: string
  context: string
  source: string // どのフェーズ/タスクから学んだか
  timestamp: string
}

const LEARNING_DIR = join(process.cwd(), '.learned')
const PATTERNS_FILE = join(LEARNING_DIR, 'patterns.json')

/**
 * 学習パターンを保存
 */
export function savePattern(pattern: LearnedPattern): void {
  if (!existsSync(LEARNING_DIR)) mkdirSync(LEARNING_DIR, { recursive: true })

  const patterns: LearnedPattern[] = existsSync(PATTERNS_FILE)
    ? JSON.parse(readFileSync(PATTERNS_FILE, 'utf-8'))
    : []

  // 重複チェック（同じ pattern は上書き）
  const idx = patterns.findIndex(p => p.pattern === pattern.pattern)
  if (idx >= 0) {
    patterns[idx] = pattern
  } else {
    patterns.push(pattern)
  }

  writeFileSync(PATTERNS_FILE, JSON.stringify(patterns, null, 2))
}

/**
 * 学習パターンをsystemPrompt注入用のテキストに変換
 */
export function loadLearnedPatterns(): string {
  if (!existsSync(PATTERNS_FILE)) return ''

  const patterns: LearnedPattern[] = JSON.parse(
    readFileSync(PATTERNS_FILE, 'utf-8')
  )

  if (patterns.length === 0) return ''

  const sections = patterns.map(p => {
    const icon = p.category === 'success' ? '✅' : p.category === 'failure' ? '❌' : '📌'
    return `- ${icon} ${p.pattern} (${p.context})`
  })

  return `\n\n## 過去の学習パターン\n以下は過去のセッションから学んだパターンです:\n${sections.join('\n')}`
}
```

#### Step 2: フェーズ完了時にパターン抽出を実行

`project-board.ts` の `savePhaseResult` を拡張するか、Director（project スキル）が結果から学びを抽出する。

最もシンプルなアプローチは、`team-member.ts` のタスク完了時にエラーから学ぶこと:

```typescript
// src/team-member.ts — executeTask() の catch ブロック内
import { savePattern } from './learning.js'

} catch (error) {
  // エラーパターンを学習
  savePattern({
    category: 'failure',
    pattern: `${role}ロールのタスク「${task.title}」でエラー: ${message}`,
    context: task.instruction.slice(0, 200),
    source: `board:${boardDir} task:${task.id}`,
    timestamp: new Date().toISOString(),
  })
  // ...
}
```

#### Step 3: 次回セッションで注入

```typescript
// src/team-member.ts — executeTask() 内
import { loadLearnedPatterns } from './learning.js'

const learned = loadLearnedPatterns()
const systemPrompt = roleInfo.systemPrompt + teamProtocol + rules + learned
```

#### Step 4: （高度）Director がフェーズ結果からパターンを抽出

project スキルの SKILL.md を更新し、各フェーズ完了時に Director がワーカーの結果を分析して `savePattern()` を呼ぶ指示を追加:

```markdown
<!-- .claude/skills/project/SKILL.md に追記 -->
## フェーズ完了後の学習

フェーズ結果を保存した後、以下を実行:
1. ワーカーの結果から成功パターン・失敗パターンを抽出
2. `.learned/patterns.json` に保存
3. 次フェーズのコンテキストに含める
```

### 変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/learning.ts` | **新規作成** — パターン保存・読み込みモジュール |
| `src/team-member.ts` | エラー時のパターン学習 + systemPromptへの注入 |
| `.claude/skills/project/SKILL.md` | フェーズ完了後の学習指示を追加 |
| `.gitignore` | `.learned/` を追加 |

### 注意事項

- `.learned/patterns.json` はプロジェクトローカル（`.gitignore` に追加）
- パターンが増えすぎるとコンテキストを圧迫するため、最大50件程度に制限する
- 定期的に古いパターンをプルーニングする仕組みも検討

---

## 実装優先度

| 順位 | 改善項目 | 効果 | 実装コスト | 理由 |
|------|---------|------|-----------|------|
| **1** | モデル選択戦略 | コスト削減 + 計画品質向上 | 低（3ファイル修正） | 最小の変更で最大の効果 |
| **2** | Confidence-Based Filtering | ノイズ削減 | 低（2ファイル修正） | systemPrompt追記のみ |
| **3** | Rulesの常時注入 | 品質の一貫性 | 中（新規ファイル作成） | ルール文書の作成が主な作業 |
| **4** | PostToolUseフック | 自動品質チェック | 中（新規スクリプト + 検証） | bypassPermissionsとの互換性要検証 |
| **5** | 継続学習 | 長期的な改善 | 高（新モジュール + 統合） | 効果測定が難しい |
