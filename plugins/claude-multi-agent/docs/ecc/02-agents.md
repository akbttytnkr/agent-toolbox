# Agents 設計ガイド — everything-claude-code

> **情報源**: `everything-claude-code` リポジトリ の `agents/` ディレクトリ（16ファイル）および `.agents/skills/` ディレクトリ（16スキル）の分析結果

---

## Table of Contents

1. [Agentとは何か](#1-agentとは何か)
2. [Agentファイルのフォーマット](#2-agentファイルのフォーマット)
   - 2.1 [ファイル構造](#21-ファイル構造)
   - 2.2 [YAMLフロントマター](#22-yamlフロントマター)
   - 2.3 [Markdown本文の典型構成](#23-markdown本文の典型構成)
3. [全16エージェント一覧と分類](#3-全16エージェント一覧と分類)
4. [代表的エージェントの詳細](#4-代表的エージェントの詳細)
   - 4.1 [architect — システム設計の専門家](#41-architect--システム設計の専門家)
   - 4.2 [planner — 実装計画の専門家](#42-planner--実装計画の専門家)
   - 4.3 [code-reviewer — コードレビューの専門家](#43-code-reviewer--コードレビューの専門家)
   - 4.4 [loop-operator — 自律ループ管理の専門家](#44-loop-operator--自律ループ管理の専門家)
5. [設計パターンとベストプラクティス](#5-設計パターンとベストプラクティス)
   - 5.1 [モデル選択戦略](#51-モデル選択戦略)
   - 5.2 [ツールアクセス制御パターン](#52-ツールアクセス制御パターン)
   - 5.3 [フックによる品質強制](#53-フックによる品質強制)
   - 5.4 [外科的修正の原則](#54-外科的修正の原則)
   - 5.5 [Confidence-Based Filtering](#55-confidence-based-filtering)
   - 5.6 [信頼性のための外部スクリプト活用](#56-信頼性のための外部スクリプト活用)
   - 5.7 [永続的知識ファイルパターン](#57-永続的知識ファイルパターン)
   - 5.8 [段階的フェーズ分割](#58-段階的フェーズ分割)
6. [自作エージェントの書き方テンプレート](#6-自作エージェントの書き方テンプレート)
7. [.agents/skills/openai.yaml との比較](#7-agentsskillsopenaisyaml-との比較)
8. [リスクと注意点](#8-リスクと注意点)

---

## 1. Agentとは何か

**Agent**は、特定の役割・ワークフロー・ツールアクセス権限を持つ専門化されたAIサブプロセスです。Claude Code の `--agent` フラグや `claude agent` コマンドで呼び出し、複雑なタスクを自律的に処理させます。

### 通常のプロンプトとの違い

| 観点 | 通常のプロンプト | Agent |
|------|----------------|-------|
| 役割定義 | なし / セッション毎に記述 | ファイルに永続定義 |
| ツール制限 | なし（全ツール利用可） | `tools:` リストで明示制限 |
| モデル指定 | デフォルト | `model:` で個別指定 |
| ワークフロー | アドホック | 構造化されたステップ手順 |
| 再利用性 | 低い | ファイルとして共有・バージョン管理可 |

### Agentが解決する問題

- **一貫性**: 毎回同じ品質・手順でタスクを実行
- **安全性**: 最小権限のツールのみ付与し、破壊的操作を防止
- **コスト最適化**: タスク種別に応じて適切なモデルを選択
- **チーム共有**: Gitで管理されたエージェント定義をチーム全員が利用可能

---

## 2. Agentファイルのフォーマット

### 2.1 ファイル構造

Agentは `agents/` ディレクトリ内のMarkdownファイル（`.md`）として定義します。

```
agents/
├── architect.md
├── planner.md
├── code-reviewer.md
├── loop-operator.md
└── ...（16ファイル）
```

ファイルは **YAMLフロントマター + Markdown本文** の2層構造です。

### 2.2 YAMLフロントマター

```yaml
---
name: agent-name           # 必須: エージェント識別子（呼び出し時のキー）
description: "..."         # 必須: 用途説明 + proactiveトリガー条件を含む
tools:                     # 必須: 許可ツールリスト（最小権限原則）
  - Read
  - Grep
  - Glob
model: sonnet              # 必須: opus / sonnet / haiku
color: "#FF5733"           # 任意: UIカラー（16進数）
---
```

#### `description` の書き方

`description` は単なる説明文ではなく、**いつこのエージェントを自動起動するか**のトリガー条件も含めます。

```yaml
description: >
  Reviews code changes for quality, security, and maintainability issues.
  Use PROACTIVELY after any code change or before merging to main.
  Triggered by: git diff, PR creation, code modification requests.
```

#### `tools` の選択指針

利用可能な主要ツール:

| ツール | 用途 |
|--------|------|
| `Read` | ファイル読み取り |
| `Grep` | パターン検索 |
| `Glob` | ファイル検索 |
| `Bash` | シェルコマンド実行 |
| `Edit` | ファイル編集 |
| `Write` | ファイル書き込み |
| `WebFetch` | Webコンテンツ取得 |

### 2.3 Markdown本文の典型構成

```markdown
# Agent Title

You are a [役割定義]. [エージェントの核心的な目的・制約を1〜2文で説明]

## Your Role
- 責務1
- 責務2

## Workflow
### Step 1: [フェーズ名]
[具体的な手順]

### Step 2: [フェーズ名]
[具体的な手順]

## [ドメイン固有チェックリスト]
- [ ] チェック項目1
- [ ] チェック項目2

## Key Principles
- 原則1
- 原則2

## Output Format
[出力フォーマット例（コードブロックで明示）]

## Red Flags / Anti-Patterns
- 避けるべきパターン（なぜ悪いかも記述）

## References
- skill: skill-name
- CLAUDE.md
```

#### 頻出セクション一覧

| セクション | 用途 | 代表エージェント |
|-----------|------|----------------|
| `## Your Role` / `## Mission` | エージェントの責務明示 | 全16件 |
| `## Workflow / Process` | ステップバイステップ手順 | 全16件 |
| `## Key Principles` | 設計原則・制約 | 大多数 |
| `## Review Checklist` | レビュー確認項目 | code-reviewer, security-reviewer |
| `## Approval Criteria` | 承認/拒否基準 | code-reviewer, security-reviewer |
| `## Required Checks` | 必須前提確認 | loop-operator |
| `## Escalation` | エスカレーション条件 | loop-operator, chief-of-staff |
| `## Plan Format` | 出力テンプレート | planner |
| `## ADR Template` | アーキテクチャ決定記録 | architect |
| `## Red Flags` | アンチパターン一覧 | architect, planner |
| `## v1.8 Addendum` | バージョン更新追記 | code-reviewer, tdd-guide |

---

## 3. 全16エージェント一覧と分類

### 設計・計画カテゴリ

| Agent名 | モデル | 主な目的 |
|---------|--------|---------|
| **architect** | opus | システム設計、スケーラビリティ、技術的意思決定 |
| **planner** | opus | 複雑な機能・リファクタの詳細実装計画作成 |
| **doc-updater** | haiku | ドキュメント・コードマップ生成・更新 |

### コードレビューカテゴリ

| Agent名 | モデル | 主な目的 |
|---------|--------|---------|
| **code-reviewer** | sonnet | 品質・セキュリティ・保守性の総合レビュー |
| **security-reviewer** | sonnet | OWASP Top 10準拠のセキュリティ脆弱性検出 |
| **python-reviewer** | sonnet | Python品質・PEP8準拠 |
| **go-reviewer** | sonnet | Goイディオマティックパターン・並行性 |
| **database-reviewer** | sonnet | PostgreSQL最適化・RLS |

### エラー解決カテゴリ

| Agent名 | モデル | 主な目的 |
|---------|--------|---------|
| **build-error-resolver** | sonnet | TypeScript/JavaScriptビルド・型エラー修正 |
| **go-build-resolver** | sonnet | Goビルド・vet・コンパイルエラー修正 |
| **refactor-cleaner** | sonnet | デッドコード削除・コード統合 |

### テストカテゴリ

| Agent名 | モデル | 主な目的 |
|---------|--------|---------|
| **tdd-guide** | sonnet | TDD（テスト駆動開発）実践の強制 |
| **e2e-runner** | sonnet | E2Eテスト生成・実行 |

### 通信・自動化カテゴリ

| Agent名 | モデル | 主な目的 |
|---------|--------|---------|
| **chief-of-staff** | opus | メール/Slack/LINE等マルチチャネル通信管理 |
| **loop-operator** | sonnet | 自律エージェントループ監視・安全停止 |

### 最適化カテゴリ

| Agent名 | モデル | 主な目的 |
|---------|--------|---------|
| **harness-optimizer** | sonnet | エージェントハーネス設定チューニング |

---

## 4. 代表的エージェントの詳細

### 4.1 architect — システム設計の専門家

**モデル**: `opus`（最高能力が必要）
**ツール**: `Read`, `Grep`, `Glob` のみ（書き込み不可・設計に集中）

#### ワークフロー

```
Step 1: Current State Analysis
  → 既存アーキテクチャ・技術的負債の把握

Step 2: Requirements Gathering
  → 機能・非機能要件の収集

Step 3: Design Proposal
  → 高レベル設計図・コンポーネント責務定義

Step 4: Trade-Off Analysis
  → 各設計判断の Pros / Cons / Alternatives / Decision
```

#### 5つの設計原則

1. **Modularity & Separation of Concerns** — SRP、高凝集低結合
2. **Scalability** — 水平スケール、ステートレス設計
3. **Maintainability** — 明確な構造、テスト容易性
4. **Security** — 多層防御、最小権限の原則
5. **Performance** — 効率的アルゴリズム、キャッシュ戦略

#### ADR（Architecture Decision Records）テンプレート

architect は設計判断をADRとして記録します:

```markdown
## ADR-001: [決定タイトル]
- **Status**: Accepted / Proposed / Deprecated
- **Context**: なぜこの決定が必要だったか
- **Decision**: 何を選択したか
- **Pros**: メリット
- **Cons**: デメリット
- **Alternatives Considered**: 検討した他の選択肢
- **Consequences**: この決定がもたらす影響
```

#### スケーラビリティ計画

```
10K users  → 単一サーバー + キャッシュ
100K users → 水平スケール + CDN
1M users   → マイクロサービス + 非同期処理
10M users  → グローバル分散 + CQRS
```

#### アンチパターン警告（8種類）

- Big Ball of Mud
- Golden Hammer（ハンマーを持てば全てが釘に見える）
- Premature Optimization
- God Object
- Circular Dependencies
- Chatty Interface
- Leaky Abstraction
- Not Invented Here Syndrome

---

### 4.2 planner — 実装計画の専門家

**モデル**: `opus`
**ツール**: `Read`, `Grep`, `Glob` のみ（読み取り専用）

#### ワークフロー

```
Step 1: Requirements Analysis
  → 要件の完全理解・成功基準の特定

Step 2: Architecture Review
  → 既存コードベース構造・再利用可能パターン確認

Step 3: Step Breakdown
  → ファイルパス・依存関係・リスク付きの詳細ステップ

Step 4: Implementation Order
  → 依存関係優先・増分テスト可能な順序
```

#### 計画出力フォーマット（標準テンプレート）

```markdown
# Implementation Plan: [Feature Name]

## Overview
[1〜2文でのサマリー]

## Requirements
- 機能要件リスト

## Architecture Changes
- 変更が必要なコンポーネント

## Implementation Steps

### Phase 1: Minimum Viable
1. **[Step Name]** (File: `path/to/file.ts`)
   - Action: [何をするか]
   - Why: [なぜ必要か]
   - Dependencies: [依存ステップ]
   - Risk: Low / Medium / High

### Phase 2: Core Experience
（ハッピーパス完成）

### Phase 3: Edge Cases
（エラー処理・エッジケース）

### Phase 4: Optimization
（パフォーマンス・監視）

## Testing Strategy
[各フェーズのテスト方針]

## Risks & Mitigations
| Risk | Mitigation |
|------|-----------|

## Success Criteria
- [ ] 完了の定義
```

#### ベストプラクティス 7項目

1. 具体的なファイルパスを必ず指定する
2. エッジケースを事前に洗い出す
3. 既存コードの拡張を新規作成より優先する
4. 各フェーズは独立してマージ可能に設計する
5. リスクが高いステップは早めに着手する
6. テスト戦略をステップと同時に計画する
7. 成功基準を定量的に定義する

---

### 4.3 code-reviewer — コードレビューの専門家

**モデル**: `sonnet`（均衡モデル）
**ツール**: `Read`, `Grep`, `Glob`, `Bash`（`git diff` 実行のため）

#### ワークフロー

```
Step 1: Gather Context
  → git diff --staged で変更全体を把握

Step 2: Understand Scope
  → 変更ファイル・機能の関連確認

Step 3: Read Surrounding Code
  → 変更を孤立させず全体文脈で読む

Step 4: Apply Review Checklist
  → CRITICAL → HIGH の順で体系的確認

Step 5: Report Findings
  → 80%確信ルールでフィルタリングして報告
```

#### 重要度分類とチェック項目

| 重要度 | カテゴリ | 代表チェック項目 |
|--------|---------|----------------|
| **CRITICAL** | Security | ハードコード認証情報、SQLインジェクション、XSS |
| **HIGH** | Code Quality | 関数50行超、深いネスト(4階層超)、エラーハンドリング欠如 |
| **HIGH** | React/Next.js | useEffectの依存配列漏れ、クライアント/サーバー境界違反 |
| **HIGH** | Backend | 入力バリデーション欠如、N+1クエリ、レートリミット欠如 |
| **MEDIUM** | Performance | O(n²)アルゴリズム、不要な再レンダリング |
| **LOW** | Best Practices | チケット番号なしTODO、マジックナンバー |

#### 承認基準（3段階）

```
APPROVE  → CRITICAL / HIGH なし
WARNING  → HIGH のみあり（慎重マージ可）
BLOCK    → CRITICAL 発見 → マージ禁止
```

#### Confidence-Based Filtering（80%ルール）

```
> "Do not flood the review with noise.
>  Report ONLY if >80% confident it is a real issue."
```

具体的フィルタリングルール:

- 類似問題は統合（5件個別報告 → 1件集約報告）
- 変更されていないコードのISSUEはCRITICAL以外スキップ
- スタイル的好みはプロジェクト規約違反でない限りスキップ

#### v1.8 追記: AIコード生成レビュー向け注意事項

```
- 動作リグレッション: AIが「改善」した結果、既存機能が壊れていないか
- セキュリティ前提の崩壊: 認証・認可ロジックがAI生成で変わっていないか
- 隠れた結合: AIが暗黙的に依存関係を追加していないか
- コスト増大: APIコール増加・N+1クエリ等
```

---

### 4.4 loop-operator — 自律ループ管理の専門家

**モデル**: `sonnet`
**ツール**: `Read`, `Grep`, `Glob`, `Bash`, `Edit`
**カラー**: `#FF8C00`（orange — UIでの視認性重視）

#### ミッション

明確な停止条件・観測可能性・リカバリーアクションにより、**自律AIループを安全に実行する**。ループが暴走する前に検知・停止・エスカレーション。

#### ワークフロー（5ステップ）

```
Step 1: ループ開始
  → 明示的なパターン・モードを確認してから開始

Step 2: チェックポイント追跡
  → 進捗状況を定期的に記録

Step 3: 異常検知
  → ストール・リトライストームを検知

Step 4: スコープ縮小・一時停止
  → 繰り返し失敗時にスコープを縮小して停止

Step 5: 再開
  → 検証パス後のみ再開許可
```

#### 必須前提条件（Required Checks）

ループ開始前に以下が全て満たされていることを確認:

```
✓ quality gates が有効
✓ eval baseline が存在
✓ rollback path が存在
✓ branch / worktree isolation が設定済み
```

#### エスカレーション条件（4トリガー）

以下のいずれかに該当した場合、即座にエスカレーション:

```
1. 2連続チェックポイントで進捗なし
2. 同一スタックトレースの繰り返し失敗
3. バジェットウィンドウ外のコストドリフト
4. マージコンフリクトによるキュー進行ブロック
```

---

## 5. 設計パターンとベストプラクティス

### 5.1 モデル選択戦略

```
[opus]    ← 最高能力・高コスト
  └─ 用途: 複雑な判断・長文生成・設計
  └─ 対象: architect, planner, chief-of-staff

[sonnet]  ← 能力/コスト 均衡（主力）
  └─ 用途: 実装・レビュー・デバッグ・テスト
  └─ 対象: code-reviewer, security-reviewer, 各エラー解決、tdd-guide, e2e-runner

[haiku]   ← 最速・最安
  └─ 用途: 単純な文書生成・定型処理
  └─ 対象: doc-updater
```

**選択指針**:
- 判断・設計・長文生成が必要 → **opus**
- それ以外のほとんどのケース → **sonnet**
- 単純なテキスト生成・フォーマット変換 → **haiku**

> **注意**: opusを多用するとAPI費用が急増します。v1.8でコスト意識の明示的追記があるほど重要な考慮事項です。

### 5.2 ツールアクセス制御パターン

最小権限の原則に基づき、4つのパターンで分類:

```
[読み取り専用]        Read + Grep + Glob
  └─ 対象: architect, planner
  └─ 理由: 設計・計画エージェントは読むだけでよい

[診断追加]            Read + Grep + Glob + Bash
  └─ 対象: code-reviewer, go-reviewer, security-reviewer
  └─ 理由: git diff / テスト実行は必要だが書き込みは不要

[実装フル]            + Write + Edit
  └─ 対象: tdd-guide, e2e-runner, build-error-resolver
  └─ 理由: コード生成・修正が責務

[通信特化]            Read + Grep + Glob + Bash + Edit + Write
  └─ 対象: chief-of-staff
  └─ 理由: メール送信・ファイル操作が責務
```

> **警告**: Write/Edit を付与する実装エージェントは破壊的変更リスクがあります。必ず意図した範囲のみに付与してください。

### 5.3 フックによる品質強制

```
> "LLMs forget instructions ~20% of the time.
>  PostToolUse hooks enforce checklists at the tool level
>  — the LLM physically cannot skip them."
```

`PostToolUse` フックで品質チェックを物理的に強制する設計:

```yaml
# .claude/settings.json (例)
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "tool:Bash",
        "command": "./scripts/post-bash-check.sh"
      }
    ]
  }
}
```

**使用例（chief-of-staff）**: メール送信後の7ステップチェックリストをフックで強制し、LLMが「うっかり」プロンプト指示を無視する問題を根本解決。

### 5.4 外科的修正の原則

`build-error-resolver` および `go-build-resolver` が採用する設計思想:

```
目的:  ビルドを緑にすること、それだけ
禁止:  追加リファクタリング
禁止:  関連しない改善
禁止:  スタイル修正
必須:  最小変更で最大効果
```

> 「ついでにリファクタ」はバグの温床。エラー解決エージェントは**単一責任**を徹底。

### 5.5 Confidence-Based Filtering

`code-reviewer` の80%確信ルールは、全エージェント設計に波及する重要な思想:

```python
# 概念的な実装イメージ
def should_report(issue, confidence):
    if confidence < 0.80:
        return False  # ノイズを出力しない
    if is_duplicate(issue):
        aggregate_with_similar()  # 類似問題は統合
        return False
    if not_in_changed_code(issue) and severity != "CRITICAL":
        return False  # 変更外のコードはスキップ
    return True
```

**原則**:
- 確信が低い指摘はしない（ノイズはレビューの価値を下げる）
- 類似問題は5件個別報告より1件の集約報告が有用
- 変更されていないコードへの指摘はCRITICAL以外スキップ

### 5.6 信頼性のための外部スクリプト活用

```
> "Calendar math, timezone handling, free-slot calculation
>  — use scripts, not the LLM."
```

LLMが苦手な**決定論的処理**はスクリプトに委ねる:

| 処理種別 | LLMに任せるべきか |
|---------|-----------------|
| カレンダー計算 | NO → スクリプト |
| タイムゾーン変換 | NO → スクリプト |
| 数値計算・集計 | NO → スクリプト |
| 文章生成・要約 | YES → LLM |
| コード品質判断 | YES → LLM |
| 設計判断 | YES → LLM |

### 5.7 永続的知識ファイルパターン

セッションをまたいだコンテキスト保持のため、Gitトラッキングされたファイルを使用:

```
.
├── SOUL.md                    ← トーン・ペルソナ定義
├── preferences.md             ← ユーザー好み
├── todo.md                    ← タスク管理
├── private/
│   └── relationships.md       ← 人間関係・連絡先コンテキスト
└── .claude/
    └── rules/
        ├── coding-standards.md  ← 毎セッション自動ロード
        ├── workflow.md
        └── ...
```

> **ポイント**: `.claude/rules/*.md` は全セッションで自動ロードされるため、チーム規約やプロジェクト固有ルールの置き場所として最適。

### 5.8 段階的フェーズ分割

`planner` が採用する実装フェーズ戦略:

```
Phase 1: Minimum Viable
  → 最小価値スライス（デモ可能な最小単位）

Phase 2: Core Experience
  → ハッピーパス完成（通常ユースケース全対応）

Phase 3: Edge Cases
  → エラー処理・エッジケース・バリデーション

Phase 4: Optimization
  → パフォーマンス改善・監視・ロギング
```

**重要**: 全フェーズ完了前でも、**各フェーズが独立してマージ可能**に設計する。これにより継続的デリバリーが実現。

---

## 6. 自作エージェントの書き方テンプレート

以下のテンプレートをコピーして、カスタムエージェントを作成できます。

### 基本テンプレート

```markdown
---
name: my-agent
description: >
  [何をするエージェントか1文で説明].
  Use PROACTIVELY when [自動起動すべき状況].
  Triggered by: [トリガーキーワード].
tools:
  - Read
  - Grep
  - Glob
  # 書き込みが必要な場合のみ追加:
  # - Bash
  # - Edit
  # - Write
model: sonnet  # opus(複雑な設計) / sonnet(実装・レビュー) / haiku(単純な文書)
color: "#4A90D9"  # 任意: UIカラー
---

# My Agent Title

You are a [役割]. [核心的な目的・制約を1〜2文で説明].

## Your Role
- 責務1: [具体的な説明]
- 責務2: [具体的な説明]

## Workflow

### Step 1: [準備フェーズ]
1. [具体的な手順]
2. [具体的な手順]

### Step 2: [分析フェーズ]
1. [具体的な手順]
2. [具体的な手順]

### Step 3: [実行フェーズ]
1. [具体的な手順]
2. [具体的な手順]

### Step 4: [報告フェーズ]
1. [具体的な手順]

## [ドメイン固有チェックリスト]（オプション）
- [ ] チェック項目1
- [ ] チェック項目2

## Key Principles
- 原則1（なぜ重要かを記述）
- 原則2
- NEVER [やってはいけないこと]
- ALWAYS [必ずやること]

## Output Format
[出力の期待フォーマットをコードブロックで明示]

## Red Flags（アンチパターン）
- [避けるべき状況1] → [代わりにすべきこと]
- [避けるべき状況2] → [代わりにすべきこと]

## References
- skill: [依存するスキル名]（存在する場合）
```

### 最小限のシンプルテンプレート

```markdown
---
name: simple-agent
description: "[何をするか]. Use when [いつ使うか]."
tools: ["Read", "Grep", "Glob"]
model: sonnet
---

# Simple Agent

You are a [役割]. Your job is to [目的].

## Workflow
1. [ステップ1]
2. [ステップ2]
3. [ステップ3]

## Key Principles
- [重要な制約や原則]
```

### 作成チェックリスト

```
✓ name: がケバブケース（my-agent-name）になっている
✓ description: にトリガー条件が含まれている
✓ tools: が最小権限になっている（不要なツールを外している）
✓ model: がタスク複雑度に合っている
✓ Workflow にステップが2〜5個ある
✓ Key Principles に NEVER/ALWAYS が含まれている
✓ Output Format が明示されている（出力があるエージェントの場合）
```

---

## 7. .agents/skills/openai.yaml との比較

### Skillsのディレクトリ構造

```
.agents/skills/
├── api-design/
│   ├── agents/openai.yaml   ← UIインターフェース定義
│   └── SKILL.md             ← スキルの詳細説明
├── coding-standards/
├── e2e-testing/
├── eval-harness/
├── frontend-patterns/
├── frontend-slides/
│   ├── agents/openai.yaml
│   ├── SKILL.md
│   └── STYLE_PRESETS.md     ← スキル固有の追加ファイル
├── market-research/
├── security-review/
├── tdd-workflow/
├── verification-loop/
└── ...（計16スキル）
```

### openai.yaml のフォーマット

```yaml
interface:
  display_name: "Coding Standards"   # UI表示名
  short_description: "..."           # 短い説明文（1〜2文）
  brand_color: "#3B82F6"             # ブランドカラー（hex）
  default_prompt: "..."              # 呼び出し時のデフォルト指示
policy:
  allow_implicit_invocation: true    # 暗黙的呼び出し許可
```

> **命名の注意**: ファイル名は `openai.yaml` ですが、Claude Code用として使われています。元々他社向けフォーマットを流用した可能性があります（開発者が別サービスとの互換性を持たせた可能性）。

### Agents vs Skills 比較表

| 観点 | Agents (`.md`) | Skills (`openai.yaml`) |
|------|----------------|------------------------|
| **フォーマット** | YAML FM + Markdown | Pure YAML |
| **目的** | エージェント動作定義（役割・ワークフロー） | UI統合・呼び出しインターフェース定義 |
| **詳細度** | 高（100〜200行の詳細指示） | 低（5〜10行のメタデータ） |
| **ツール定義** | あり（`tools:` リスト） | なし |
| **モデル指定** | あり（`model: opus/sonnet/haiku`） | なし |
| **ワークフロー** | 詳細手順を記述 | なし（`default_prompt` のみ） |
| **呼び出し方法** | `claude --agent agent-name` | `allow_implicit_invocation: true` で自動検出 |
| **主な用途** | 開発ワークフロー内の専門タスク | 汎用スキル・コンテンツ生成・ビジネス用途 |
| **カバー領域** | 開発特化（コードレビュー・テスト・ビルド） | 多目的（市場調査・投資家向け資料・ブログ執筆） |

### エージェント ↔ スキルの参照関係

| Agent | 参照するSkill |
|-------|-------------|
| `tdd-guide` | `tdd-workflow` |
| `e2e-runner` | `e2e-testing` |
| `security-reviewer` | `security-review` |
| `database-reviewer` | `postgres-patterns`, `database-migrations` |
| `python-reviewer` | `python-patterns` |
| `go-reviewer`, `go-build-resolver` | `golang-patterns` |
| `code-reviewer` | `CLAUDE.md`, `.claude/rules/` |
| `architect`, `planner` | なし（自己完結型） |

**設計思想**: AgentはSkillを「参照」するが「内包」しない。スキルは再利用可能な知識ライブラリとして機能し、複数のエージェントが同じスキルを参照できる。

---

## 8. リスクと注意点

| リスク | 影響度 | 対策 |
|--------|--------|------|
| **モデルコスト増大** | 高 | opusは必要最小限に。設計・長文生成のみopusを使用 |
| **ツール過剰権限** | 高 | Write/Edit付与は慎重に。読み取り専用エージェントはRead/Grep/Globのみ |
| **LLM指示忘れ** | 中 | ~20%の確率で発生。PostToolUseフックで重要チェックを強制 |
| **ループの暴走** | 高 | loop-operatorを使用。エスカレーション条件を明示的に設定 |
| **スキル参照の不整合** | 低 | エージェントが参照するスキルが存在するか定期確認 |
| **openai.yaml命名混乱** | 低 | ファイル名はOpenAI由来だがClaude Code用。チーム内で認識共有 |

---

*情報源: `everything-claude-code` リポジトリ `agents/*.md`（16ファイル）、`.agents/skills/*/agents/openai.yaml`（サンプル）の分析結果*
*分析日: 2026-03-09*
