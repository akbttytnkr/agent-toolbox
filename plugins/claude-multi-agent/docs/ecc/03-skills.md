# Skills 定義ガイド（everything-claude-code）

> **対象リポジトリ**: [everything-claude-code](https://github.com/disler/everything-claude-code)
> **ドキュメントバージョン**: 2026-03-09

---

## Table of Contents

1. [Skillとは何か](#1-skillとは何か)
2. [SKILL.mdのフォーマット](#2-skillmdのフォーマット)
3. [スキル全66一覧（カテゴリ別）](#3-スキル全66一覧カテゴリ別)
   - [Framework & Language (17)](#framework--language-17)
   - [Database (3)](#database-3)
   - [Workflow & Quality (8)](#workflow--quality-8)
   - [Business & Content (5)](#business--content-5)
   - [その他（専門・ニッチ）(33+)](#その他専門ニッチ33)
4. [特殊スキル: continuous-learning](#4-特殊スキル-continuous-learning)
5. [スキルの発動確率と対策](#5-スキルの発動確率と対策)
6. [自作スキルの書き方テンプレート](#6-自作スキルの書き方テンプレート)
7. [Skills vs Agents vs Rules の違い](#7-skills-vs-agents-vs-rules-の違い)

---

## 1. Skillとは何か

### 概要

**Skill**（スキル）は Claude Code に注入するガイダンス・パターン集です。コーディング規約、テスト手法、セキュリティチェックリスト、フレームワーク固有のベストプラクティスなど、Claude が特定のタスクを実行する際に参照する「専門知識」を定義します。

スキルは `~/.claude/skills/<スキル名>/SKILL.md` に配置することで、Claude Code が自動的に読み込みます。

### ディレクトリ構造

```
~/.claude/skills/
└── <skill-name>/
    ├── SKILL.md         # 必須: スキル本体定義
    └── (追加ファイル)   # 任意: config.json, シェルスクリプト等
```

> **注意**: スキルは必ず `<skill-name>/SKILL.md` という形式でディレクトリ内に配置します。ルートに単体 `.md` ファイルとして置いても認識されません。

### 発動メカニズム

スキルは `description` フィールドをもとに Claude が**自動判断して発動**します（確率的）。

```
ユーザーの入力
    ↓
Claude が description を照合
    ↓
関連スキルを自動選択（50〜80%の確率）
    ↓
SKILL.md の内容をコンテキストに注入
    ↓
スキルに基づいた応答を生成
```

スキルは「いつ発動するか」を `description` と `## When to Activate` セクションで定義します。Claude はこれをもとに、現在のタスクに関連するスキルを自動的に適用します。

---

## 2. SKILL.mdのフォーマット

### 基本構造

```markdown
---
name: skill-name           # スキル識別子（ディレクトリ名と一致推奨）
description: >             # いつ発動するかの説明（Claude が判断に使用）
  Activate when working with Python code, writing tests, or
  implementing backend logic.
origin: ECC                # 出所（ECC製は"ECC"、自作は省略可）
---

# スキルタイトル

## When to Activate
- トリガー条件1（例: Pythonコードを書くとき）
- トリガー条件2（例: テストを実装するとき）
- トリガー条件3（例: バックエンドAPIを設計するとき）

## (スキル本体)
具体的なガイドライン、コードパターン、チェックリスト等を記述
```

### フロントマターフィールド一覧

| フィールド | 必須 | 説明 |
|-----------|:----:|------|
| `name` | ○ | スキル名。ディレクトリ名と一致させることを推奨 |
| `description` | ○ | Claude がいつ発動するか判断するための説明。具体的なトリガー状況を記述する |
| `origin` | △ | ECC製スキルは `ECC`、自作スキルは省略可 |

### 実例: tdd-workflow スキルのフロントマター

```markdown
---
name: tdd-workflow
description: >
  Activate when writing tests, implementing new features with TDD,
  or when asked to ensure test coverage. Apply the Red-Green-Refactor
  cycle and enforce 80%+ test coverage.
origin: ECC
---

# TDD Workflow

## When to Activate
- Writing new features
- Adding tests to existing code
- When test coverage is below 80%
- During code review for testability

## Red-Green-Refactor Cycle
1. **RED**: Write a failing test first
2. **GREEN**: Write minimum code to pass
3. **REFACTOR**: Clean up while keeping tests green
...
```

---

## 3. スキル全66一覧（カテゴリ別）

### Framework & Language (17)

フレームワークおよびプログラミング言語に特化したベストプラクティスのスキル群。

| スキル名 | 説明 |
|---------|------|
| `backend-patterns` | Backend API・サーバーサイドのベストプラクティス |
| `coding-standards` | TypeScript/JavaScript/React の普遍的コーディング規約 |
| `django-patterns` | Django REST API、ORM、キャッシュ、ミドルウェアのパターン |
| `django-security` | Django の認証、CSRF、SQLインジェクション、XSS対策 |
| `django-tdd` | pytest-django、factory_boy、モック、カバレッジ |
| `django-verification` | Django マイグレーション、lint、テスト、セキュリティスキャン |
| `frontend-patterns` | React、Next.js、状態管理、パフォーマンス最適化 |
| `frontend-slides` | ゼロ依存 HTML プレゼン、PPTX to web 変換 |
| `golang-patterns` | Go イディオム・慣用パターン |
| `golang-testing` | Go テーブル駆動テスト、サブテスト、ベンチマーク、ファジング |
| `java-coding-standards` | Spring Boot Java の命名規則、イミュータビリティ、Optional |
| `python-patterns` | Pythonic イディオム、PEP 8、型ヒント |
| `python-testing` | pytest、TDD、フィクスチャ、モック |
| `springboot-patterns` | Spring Boot REST API、レイヤードサービス、キャッシュ |
| `springboot-security` | Spring Security、バリデーション、CSRF 対策 |
| `springboot-tdd` | JUnit 5、Mockito、MockMvc、Testcontainers |
| `springboot-verification` | ビルド、静的解析、テスト、セキュリティスキャン |

### Database (3)

データベース設計・クエリ最適化のスキル群。

| スキル名 | 説明 |
|---------|------|
| `clickhouse-io` | ClickHouse クエリ最適化、データエンジニアリング |
| `jpa-patterns` | JPA/Hibernate エンティティ設計、クエリ最適化 |
| `postgres-patterns` | PostgreSQL クエリ最適化、スキーマ設計、インデックス戦略 |

### Workflow & Quality (8)

開発ワークフロー・品質管理のスキル群。

| スキル名 | 説明 |
|---------|------|
| `continuous-learning` | セッション終了時にパターン自動抽出 → スキル化（Stopフック連動） |
| `continuous-learning-v2` | Instinct（原子的行動）ベースの学習システム |
| `eval-harness` | Eval駆動開発（EDD）のフォーマル評価フレームワーク |
| `iterative-retrieval` | サブエージェントのコンテキスト問題への段階的精緻化 |
| `security-review` | 認証、入力値、シークレット、API、支払い機能のセキュリティチェックリスト |
| `strategic-compact` | 論理的な間隔でのコンテキスト手動圧縮提案 |
| `tdd-workflow` | TDD 強制: 80%+ カバレッジ、unit/integration/E2E |
| `verification-loop` | 品質検証ループパターン |

### Business & Content (5)

ビジネス・コンテンツ作成のスキル群。

| スキル名 | 説明 |
|---------|------|
| `article-writing` | 音声・ノート・ドキュメントを使ったロングフォームライティング |
| `content-engine` | マルチプラットフォーム SNS コンテンツ、スクリプト作成 |
| `market-research` | 出所付き市場・競合・ファンド・技術調査 |
| `investor-materials` | ピッチデック、1ページャー、投資家メモの作成 |
| `investor-outreach` | 投資家へのコールドメール、ウォームイントロ作成 |

### その他（専門・ニッチ）(33+)

特定ドメイン・技術スタック向けの専門スキル群。

| スキル名 | 説明 |
|---------|------|
| `agent-harness-construction` | エージェントハーネスの構築パターン |
| `agentic-engineering` | エージェント型エンジニアリング手法 |
| `ai-first-engineering` | AI 優先の開発手法 |
| `api-design` | API 設計ベストプラクティス |
| `autonomous-loops` | 自律ループパターン |
| `configure-ecc` | ECC インタラクティブインストーラー |
| `content-hash-cache-pattern` | コンテンツハッシュキャッシュパターン |
| `continuous-agent-loop` | 継続的エージェントループ |
| `cost-aware-llm-pipeline` | コスト意識型 LLM パイプライン設計 |
| `cpp-coding-standards` | C++ コーディング標準 |
| `cpp-testing` | C++ テスト手法 |
| `database-migrations` | DB マイグレーション管理 |
| `deployment-patterns` | デプロイパターン |
| `docker-patterns` | Docker パターン |
| `e2e-testing` | E2E テスト |
| `enterprise-agent-ops` | エンタープライズエージェント運用 |
| `foundation-models-on-device` | オンデバイスファウンデーションモデル |
| `liquid-glass-design` | Liquid Glass デザインパターン |
| `nanoclaw-repl` | nanoclaw REPL |
| `nutrient-document-processing` | ドキュメント処理 |
| `plankton-code-quality` | コード品質管理 |
| `project-guidelines-example` | プロジェクト固有スキルのテンプレート |
| `ralphinho-rfc-pipeline` | RFC パイプライン |
| `regex-vs-llm-structured-text` | Regex vs LLM 構造化テキスト選択ガイド |
| `search-first` | 調査優先ワークフロー |
| `security-scan` | セキュリティスキャン |
| `skill-stocktake` | スキルの棚卸し |
| `swift-actor-persistence` | Swift Actor パーシスタンス |
| `swift-concurrency-6-2` | Swift Concurrency 6.2 |
| `swift-protocol-di-testing` | Swift プロトコル DI テスト |
| `swiftui-patterns` | SwiftUI パターン |
| `visa-doc-translate` | VISA ドキュメント翻訳 |

---

## 4. 特殊スキル: continuous-learning

### 概要

`continuous-learning` は通常のスキルと異なり、**Claude Code の Stopフックに連動**して動作する自動学習スキルです。セッション終了時にシェルスクリプトを実行し、会話から有用なパターンを自動抽出して新しいスキルとして保存します。

### ディレクトリ構造

```
~/.claude/skills/continuous-learning/
├── SKILL.md              # スキル定義
├── config.json           # Stopフック設定
└── evaluate-session.sh   # セッション評価スクリプト
```

### config.jsonの設定

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "~/.claude/skills/continuous-learning/evaluate-session.sh"
          }
        ]
      }
    ]
  }
}
```

この設定により、Claude Code のセッションが終了するたびに `evaluate-session.sh` が自動実行されます。

### v2: continuous-learning-v2

v2 は **Instinct（原子的行動）** ベースの進化版です。

- `~/.claude/homunculus/` ディレクトリを使用
- より細粒度なパターン抽出（原子的行動単位）
- **常にユーザーレベルのインストール**（`~/.claude/`）が必要

### なぜ v2 が必要だったか

v1 の設計背景から学べる重要な教訓:

> "v1 relied on skills to observe. Skills are probabilistic—they fire ~50-80% of the time."

スキル自体が確率的に発動するため、v1 ではスキルの観測・学習も不安定でした。v2 はより確実なフック連動方式に移行しています。

---

## 5. スキルの発動確率と対策

### 発動確率の現実

スキルの自動発動は**確率的**であり、100% ではありません。

```
発動確率: 50〜80%
```

これは ECC の `continuous-learning` スキル内で明示的に記載されている既知の制約です:

> "Skills are probabilistic—they fire ~50-80% of the time."

### なぜ確率的なのか

Claude は `description` フィールドとユーザーの入力を照合してスキルを発動させますが、コンテキストウィンドウの制限や複数スキルの優先順位付けにより、必ずしも全てのスキルが毎回発動するわけではありません。

### 対策: 確実に発動させる方法

#### 1. コマンド（/xxx）で明示的に呼び出す

重要な場面ではコマンドを使って明示的にスキルを適用します:

```bash
# TDD スキルを確実に適用したい場合
/tdd

# セキュリティレビューを確実に実行したい場合
/code-review
```

#### 2. description を具体的に書く

```markdown
# 悪い例（曖昧）
description: Python コードに使用

# 良い例（具体的なトリガーを列挙）
description: >
  Activate when writing Python code, implementing Python functions,
  creating Python classes, writing pytest tests, or reviewing Python
  scripts. Apply PEP 8 standards and type hints.
```

#### 3. When to Activate セクションを充実させる

```markdown
## When to Activate
- Writing new Python functions or classes
- Implementing pytest test cases
- Reviewing Python code for style issues
- Adding type annotations to existing code
- Creating Python CLI tools or scripts
```

#### 4. CLAUDE.md に明示的に参照を記載

プロジェクトの `CLAUDE.md` に常時適用したいスキルへの参照を記載することで、Claude が常にそのガイダンスを意識するようにできます:

```markdown
## Coding Standards
Follow the patterns defined in the `coding-standards` skill.
Always apply TDD using the `tdd-workflow` skill pattern.
```

---

## 6. 自作スキルの書き方テンプレート

### 基本テンプレート

```
~/.claude/skills/my-custom-skill/SKILL.md
```

```markdown
---
name: my-custom-skill
description: >
  Activate when [具体的なシナリオ1], [具体的なシナリオ2],
  or [具体的なシナリオ3]. This skill provides [スキルの主目的].
---

# My Custom Skill（スキルのタイトル）

## When to Activate
- [トリガー条件1]
- [トリガー条件2]
- [トリガー条件3]

## Core Principles（基本原則）
1. [原則1]
2. [原則2]
3. [原則3]

## Patterns（パターン集）

### [パターン1のタイトル]

[パターンの説明]

```typescript
// コード例
function example() {
  // 推奨するパターン
}
```

### [パターン2のタイトル]

[パターンの説明]

## Anti-Patterns（アンチパターン）

### 避けるべき: [アンチパターン1]

```typescript
// 悪い例
const bad = something.old()

// 良い例
const good = something.new()
```

## Checklist（チェックリスト）

実装完了前に確認:
- [ ] [チェック項目1]
- [ ] [チェック項目2]
- [ ] [チェック項目3]
```

### プロジェクト固有スキルの例

チームのコーディング規約をスキル化した例:

```markdown
---
name: acme-coding-standards
description: >
  Activate when writing any code for the ACME project. Applies
  company-specific naming conventions, error handling patterns,
  and logging standards.
---

# ACME Project Coding Standards

## When to Activate
- Writing any new code for ACME project
- Reviewing code in the ACME codebase
- Adding error handling or logging

## Naming Conventions
- Service classes: `XxxService` (例: `UserService`)
- Repository classes: `XxxRepository`
- DTOs: `XxxDto` または `XxxRequest`/`XxxResponse`

## Error Handling
すべての外部 API 呼び出しは try-catch でラップし、
`AcmeException` に変換して上位に伝播させる。

```typescript
try {
  const result = await externalApi.call(params)
  return result
} catch (error) {
  throw new AcmeException('API call failed', { cause: error })
}
```

## Logging
構造化ログを使用。`console.log` は禁止。

```typescript
// 推奨
logger.info('User created', { userId: user.id, email: user.email })

// 禁止
console.log('User created:', user)
```
```

### `/skill-create` コマンドによる自動生成

Git ヒストリーからスキルを自動生成することも可能:

```bash
# Git ヒストリーを解析してスキルを自動生成
/skill-create

# continuous-learning-v2 用の Instinct を生成
/skill-create --instincts
```

---

## 7. Skills vs Agents vs Rules の違い

### 比較表

| 項目 | Skills | Agents | Rules |
|------|--------|--------|-------|
| **配置場所** | `~/.claude/skills/<name>/SKILL.md` | `~/.claude/agents/<name>.md` | `~/.claude/rules/` |
| **発動方法** | `description` による自動判断（確率的） | コマンドから明示的に呼び出し | 常時適用 |
| **主な用途** | ガイダンス・パターン・チェックリスト注入 | 特定タスクの自律的実行 | コーディング規約・禁止事項の強制 |
| **モデル指定** | 不可 | 可（例: `model: opus`） | 不可 |
| **ツール制限** | 不可 | 可（`tools: ["Read", "Grep"]`） | 不可 |
| **発動確率** | 50〜80%（確率的） | コマンド呼び出し時は確実 | 100%（常時適用） |
| **内容の性質** | コードパターン・チェックリスト・ガイドライン | システムプロンプト形式のエージェント指示 | 短い強制ルール |

### 三層アーキテクチャ

ECC の設計は **コマンド → エージェント → スキル** の三層構造になっています:

```
/tdd （コマンド）
  └─→ tdd-guide （エージェント: TDD の進行を管理）
        └─→ tdd-workflow （スキル: 具体的な TDD パターンを提供）
```

```
/orchestrate （コマンド）
  └─→ planner → tdd-guide → code-reviewer → security-reviewer
        （各エージェントが対応するスキルを参照しながら実行）
```

### 使い分けのガイドライン

| 用途 | 推奨する機能 |
|------|------------|
| 常時適用したいコーディング規約 | **Rules** |
| フレームワーク固有のベストプラクティス | **Skills** |
| 明示的に呼び出すワークフロー手順 | **Commands** |
| 複雑なマルチステップタスクの自律実行 | **Agents** + Commands の組み合わせ |

### 実践的な活用フロー

```
1. Rules  → チームの絶対ルール（常時適用）
2. Skills → フレームワーク・パターンの専門知識（必要時に自動注入）
3. Commands → 反復的なワークフローの明示的な実行
4. Agents → 複雑なタスクの自律実行（コマンド経由）
```

---

## 参考: ECCスキルの導入方法

### インストール

`configure-ecc` スキルがウィザード形式でインストールを案内します:

```bash
# ECC リポジトリをクローン
git clone https://github.com/disler/everything-claude-code /tmp/everything-claude-code

# configure-ecc スキルをインストール
cp -r /tmp/everything-claude-code/skills/configure-ecc ~/.claude/skills/
```

その後 Claude Code で「Install ECC」または「configure-ecc を実行して」と指示するとウィザードが起動します。

### 推奨スタートセット

プロジェクトへの適用で特に有用なスキル:

| 優先度 | スキル名 | 理由 |
|--------|---------|------|
| 必須 | `tdd-workflow` | テスト駆動開発の基礎 |
| 必須 | `security-review` | セキュリティチェックリスト |
| 必須 | `coding-standards` | 一般的なコーディング規約 |
| 推奨 | `verification-loop` | 品質検証の自動化 |
| 推奨 | 言語固有スキル | 使用技術スタックに合わせて選択 |

---

*このドキュメントは [everything-claude-code](https://github.com/disler/everything-claude-code) リポジトリの分析に基づいて作成されました。*
