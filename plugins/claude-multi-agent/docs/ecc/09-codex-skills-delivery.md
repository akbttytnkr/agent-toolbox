# Codex CLI 向けスキル配信の仕組み

> **対象リポジトリ**: [everything-claude-code](https://github.com/disler/everything-claude-code)
> **ドキュメントバージョン**: 2026-03-12

---

## Table of Contents

1. [背景: なぜクロスツール対応が必要か](#1-背景-なぜクロスツール対応が必要か)
2. [`.agents/skills/` ディレクトリの構造](#2-agentsskills-ディレクトリの構造)
3. [`openai.yaml` の仕様](#3-openaiyaml-の仕様)
4. [Codex CLI でのスキル発動フロー](#4-codex-cli-でのスキル発動フロー)
5. [Claude Code との対応関係](#5-claude-code-との対応関係)
6. [提供されているスキル一覧](#6-提供されているスキル一覧)
7. [制約と注意点](#7-制約と注意点)

---

## 1. 背景: なぜクロスツール対応が必要か

everything-claude-code（ECC）は、複数の AI コーディングツールで同じスキル資産を使えることを設計目標にしています。各ツールはスキルの読み込み方法が異なるため、ツールごとにメタデータを用意しています。

```
同一のスキル内容（SKILL.md）
    │
    ├─ Claude Code → skills/<name>/SKILL.md  （description frontmatter で自動判断）
    ├─ Codex CLI   → .agents/skills/<name>/  （openai.yaml でインターフェース定義）
    ├─ Cursor IDE  → .cursor/skills/         （YAML frontmatter で定義）
    └─ OpenCode    → .opencode/              （プラグイン形式）
```

Codex CLI は Claude Code のようなスラッシュコマンド（`/xxx`）やフック機構を持ちません。代わりに `.agents/skills/` ディレクトリを**自動検出（auto-load）**し、`$` プレフィックスによるコマンド呼び出しとして公開します。

---

## 2. `.agents/skills/` ディレクトリの構造

各スキルは以下の2ファイルで構成されます:

```
.agents/skills/
└── <skill-name>/
    ├── SKILL.md              # スキル本体（指示内容・ワークフロー定義）
    └── agents/
        └── openai.yaml       # Codex CLI へのインターフェース定義
```

### SKILL.md

Claude Code の `skills/<name>/SKILL.md` と同じフォーマットです。YAML frontmatter + Markdown 本体で構成されます。

```markdown
---
name: tdd-workflow
description: >
  Use this skill when writing new features, fixing bugs, or refactoring code.
  Enforces test-driven development with 80%+ coverage.
origin: ECC
---

# Test-Driven Development Workflow

## When to Activate
- Writing new features or functionality
- Fixing bugs or issues
- Refactoring existing code

## Core Principles
...
```

### agents/openai.yaml

Codex CLI がスキルを認識・表示するためのメタデータファイルです。詳細は次節で解説します。

---

## 3. `openai.yaml` の仕様

```yaml
interface:
  display_name: "TDD Workflow"                                    # UI に表示される名前
  short_description: "Test-driven development with 80%+ coverage" # 短い説明文
  brand_color: "#22C55E"                                          # UI 表示時のアクセントカラー
  default_prompt: "Follow TDD: write tests first, implement, verify 80%+ coverage"
                                                                  # $ で呼び出した際のデフォルトプロンプト
policy:
  allow_implicit_invocation: true   # 明示的に呼び出さなくても自動発動を許可するか
```

### フィールド詳細

| フィールド | 必須 | 説明 |
|-----------|:----:|------|
| `interface.display_name` | ○ | `$` コマンド一覧に表示されるスキル名 |
| `interface.short_description` | ○ | 一覧表示時の概要テキスト |
| `interface.brand_color` | △ | UI 上のアクセントカラー（16進数） |
| `interface.default_prompt` | △ | スキル選択時にデフォルトで注入されるプロンプト |
| `policy.allow_implicit_invocation` | △ | `true` の場合、ユーザーが明示的に呼び出さなくてもコンテキストに応じて自動発動する |

### `allow_implicit_invocation` の意味

- `true` — Claude Code の description ベースの自動判断に近い動作。Codex が文脈から判断してスキルを適用する
- `false`（または未設定）— ユーザーが `$` で明示的に選択した場合のみ発動する

---

## 4. Codex CLI でのスキル発動フロー

### `$` コマンドによる明示的呼び出し

Codex CLI のプロンプトで `$` を入力すると、`.agents/skills/` 配下のスキルがインクリメンタル検索で一覧表示されます:

```
› $tdd

  TDD Workflow    [Skill] Test-driven development with 80%+ coverage

  Press enter to insert or esc to close
```

Enter を押すと `default_prompt` がプロンプトに挿入され、対応する `SKILL.md` の内容がコンテキストに注入されます。

### 暗黙的発動（implicit invocation）

`allow_implicit_invocation: true` のスキルは、ユーザーの入力内容に応じて Codex が自動的にスキルを適用します。これは Claude Code における description ベースの自動発動に相当します。

### フロー図

```
ユーザーが $ を入力
    │
    ▼
Codex CLI が .agents/skills/ を走査
    │
    ▼
openai.yaml の display_name / short_description で一覧表示
    │
    ▼
ユーザーがスキルを選択（Enter）
    │
    ▼
default_prompt をプロンプトに挿入
    │
    ▼
SKILL.md の内容をコンテキストに注入
    │
    ▼
スキルに基づいた応答を生成
```

---

## 5. Claude Code との対応関係

### コマンド呼び出しの対応

| 操作 | Claude Code | Codex CLI |
|------|------------|-----------|
| スキル呼び出し | `/skill-name` （スラッシュコマンド） | `$skill-name` （`$` プレフィックス） |
| 自動発動 | `description` フィールドによる確率的判断 | `allow_implicit_invocation: true` |
| メタデータ | YAML frontmatter in SKILL.md | `agents/openai.yaml` |
| 配置場所 | `~/.claude/skills/<name>/SKILL.md` | `.agents/skills/<name>/` |

### なぜ別のメタデータファイルが必要か

Claude Code は `SKILL.md` の frontmatter（`name`, `description`）だけでスキルを認識しますが、Codex CLI は OpenAI のエージェントフレームワーク規約に従い、`agents/openai.yaml` という別ファイルでインターフェース定義を行います。

`SKILL.md` 自体はツール間で共通のため、スキルの本体（指示内容）は1つだけ管理すればよく、メタデータの差分だけをツールごとに用意する設計です。

### アーキテクチャの比較

```
Claude Code:
  commands/tdd.md → agents/tdd-guide.md → skills/tdd-workflow/SKILL.md
  （コマンド）        （エージェント）        （スキル = 知識）

Codex CLI:
  $tdd-workflow → .agents/skills/tdd-workflow/SKILL.md
  （$ コマンド）    （スキル = 知識 + openai.yaml でインターフェース定義）
```

Claude Code の三層構造（コマンド → エージェント → スキル）に対して、Codex CLI ではスキルが直接コマンドとして公開される、よりフラットな構造です。

---

## 6. 提供されているスキル一覧

ECC が `.agents/skills/` で提供している全16スキル:

| スキル名 | display_name | 説明 | brand_color |
|---------|-------------|------|-------------|
| `tdd-workflow` | TDD Workflow | TDD 強制、80%+ カバレッジ | `#22C55E` |
| `security-review` | Security Review | セキュリティチェックリスト | — |
| `coding-standards` | Coding Standards | 普遍的コーディング規約 | `#3B82F6` |
| `frontend-patterns` | Frontend Patterns | React/Next.js パターン | — |
| `frontend-slides` | Frontend Slides | HTML プレゼン、PPTX 変換 | — |
| `backend-patterns` | Backend Patterns | API 設計、DB、キャッシュ | — |
| `e2e-testing` | E2E Testing | Playwright E2E テスト | — |
| `eval-harness` | Eval Harness | Eval 駆動開発 | — |
| `strategic-compact` | Strategic Compact | コンテキスト管理 | — |
| `api-design` | API Design | REST API 設計パターン | — |
| `verification-loop` | Verification Loop | ビルド・テスト・lint 検証 | — |
| `article-writing` | Article Writing | ロングフォームライティング | — |
| `content-engine` | Content Engine | SNS コンテンツ作成 | — |
| `market-research` | Market Research | 市場・競合調査 | — |
| `investor-materials` | Investor Materials | ピッチデック、メモ、モデル | — |
| `investor-outreach` | Investor Outreach | 投資家アウトリーチ | — |

---

## 7. 制約と注意点

### Codex CLI 固有の制約

ECC の `.codex/AGENTS.md` に記載されている通り、Codex CLI には Claude Code と比べていくつかの制約があります:

| 機能 | Claude Code | Codex CLI |
|------|------------|-----------|
| フック | 8+ イベントタイプ | 未サポート |
| エージェント | サブエージェント Task ツール | シングルエージェントモデル |
| セキュリティ強制 | フックベース | 指示 + サンドボックス |
| MCP | フルサポート | コマンドベースのみ |

### スキル発動の確実性

Claude Code と同様に、`allow_implicit_invocation: true` による暗黙的発動は確率的です。重要な場面では `$` で明示的にスキルを選択することが推奨されます。

### `config.toml` の `persistent_instructions` との関係

`.codex/config.toml` の `persistent_instructions` はセッション全体に適用される恒久的な指示文です。スキルとは別のレイヤーとして機能し、スキルが発動しなくても最低限のルール（TDD、イミュータビリティ、セキュリティ等）が適用されるようになっています。

```toml
[history]
persistent_instructions = """
Follow ECC principles:
1. Test-Driven Development (TDD) - write tests first, 80%+ coverage required
2. Immutability - always create new objects, never mutate
...
"""
```

これは Claude Code における `CLAUDE.md` + Rules に相当するフォールバック機構です。

---

## 参考

- `.codex/AGENTS.md` — Codex 固有のガイダンス補足
- `.codex/config.toml` — Codex CLI のリファレンス設定
- `03-skills.md` — Claude Code 向けスキル定義の詳細ガイド

---

*このドキュメントは [everything-claude-code](https://github.com/disler/everything-claude-code) リポジトリの `.agents/skills/` ディレクトリおよび関連設定ファイルの分析に基づいて作成されました。*
