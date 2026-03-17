# Commands・Contexts・Plugins ガイド

> **対象リポジトリ:** everything-claude-code (npm: `ecc-universal`)
> **最終更新:** 2026-03-09

---

## Table of Contents

1. [Commands（スラッシュコマンド）](#1-commandsスラッシュコマンド)
   - [コマンドとは](#11-コマンドとは)
   - [フォーマット](#12-フォーマット)
   - [全43コマンド一覧](#13-全43コマンド一覧)
   - [主要コマンド詳細](#14-主要コマンド詳細)
   - [三層連携アーキテクチャ](#15-コマンド→エージェント→スキルの三層連携)
2. [Contexts（コンテキストファイル）](#2-contextsコンテキストファイル)
   - [dev.md（開発モード）](#21-devmd開発モード)
   - [research.md（調査モード）](#22-researchmd調査モード)
   - [review.md（レビューモード）](#23-reviewmdレビューモード)
   - [使い分け方](#24-使い分け方)
3. [Plugins（プラグインシステム）](#3-pluginsプラグインシステム)
   - [インストール方法](#31-インストール方法)
   - [推奨プラグイン一覧](#32-推奨プラグイン一覧)
4. [Examples（CLAUDE.mdテンプレート）](#4-examplesclaude-mdテンプレート)
   - [テンプレート一覧](#41-テンプレート一覧)
   - [汎用テンプレートの構成](#42-汎用テンプレートの構成)
5. [活用方針まとめ](#5-活用方針まとめ)

---

## 1. Commands（スラッシュコマンド）

### 1.1 コマンドとは

Commands は、ユーザーが `/コマンド名` と入力することで呼び出せる**スラッシュコマンド**です。`commands/*.md` ファイルとして定義され、Claude Code の UI から直接実行できます。

- ファイル名がそのままコマンド名になる（`commands/tdd.md` → `/tdd`）
- 複雑なワークフローをワンコマンドで起動できる
- 内部でエージェント（`agents/`）を呼び出すことが多い

### 1.2 フォーマット

コマンドファイルは Markdown + YAML frontmatter で定義します:

```markdown
---
description: コマンドの概要説明（スラッシュコマンド一覧に表示）
allowed_tools: ["Bash", "Read", "Write", "Edit"]  # 任意
---

# コマンドタイトル

## 手順

1. ステップ1の説明
2. ステップ2の説明
...

## エージェント委譲（例）

Use the `tdd-guide` agent to execute TDD workflow.
```

**フロントマターフィールド:**

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `description` | 推奨 | コマンド一覧に表示される説明文 |
| `allowed_tools` | 任意 | 使用を許可するツール（省略時は全ツール利用可） |

### 1.3 全43コマンド一覧

#### 開発・コーディング

| コマンド | 概要 |
|---------|------|
| `/plan` | 実装計画作成（コード変更前の確認必須）|
| `/tdd` | TDD強制ワークフロー（RED→GREEN→REFACTOR）|
| `/code-review` | コードレビュー（CRITICAL/HIGH/MEDIUM/LOW 優先度付き）|
| `/refactor-clean` | リファクタリング＋クリーンアップ |
| `/build-fix` | ビルドエラー修正 |
| `/quality-gate` | 品質ゲートチェック |
| `/verify` | 検証ループ実行 |
| `/update-docs` | ドキュメント更新 |
| `/update-codemaps` | コードマップ更新 |

#### テスト

| コマンド | 概要 |
|---------|------|
| `/e2e` | E2Eテスト実行 |
| `/test-coverage` | テストカバレッジ確認 |
| `/eval` | 評価ハーネス実行 |
| `/learn-eval` | Evalから学習 |
| `/harness-audit` | ハーネス監査 |

#### 言語・フレームワーク固有

| コマンド | 概要 |
|---------|------|
| `/go-build` | Goビルド |
| `/go-review` | Goコードレビュー |
| `/go-test` | Goテスト |
| `/python-review` | Pythonコードレビュー |

#### マルチエージェント・オーケストレーション

| コマンド | 概要 |
|---------|------|
| `/orchestrate` | エージェントオーケストレーション |
| `/multi-plan` | マルチエージェント計画 |
| `/multi-execute` | マルチエージェント実行 |
| `/multi-workflow` | マルチエージェントワークフロー |
| `/multi-backend` | マルチバックエンド実行 |
| `/multi-frontend` | マルチフロントエンド実行 |
| `/model-route` | モデルルーティング |

#### 自律ループ

| コマンド | 概要 |
|---------|------|
| `/loop-start` | 自律ループ開始（sequential/continuous-pr/rfc-dag/infinite）|
| `/loop-status` | ループ状態確認 |
| `/claw` | Clawパターン実行 |

#### 学習・スキル管理

| コマンド | 概要 |
|---------|------|
| `/learn` | セッション中の手動パターン抽出 |
| `/skill-create` | Gitヒストリーからスキル自動生成 |
| `/evolve` | InstinctをSkill/Command/Agentに進化 |
| `/instinct-status` | Instinct状態確認 |
| `/instinct-export` | Instinctエクスポート |
| `/instinct-import` | Instinctインポート |

#### セッション・プロジェクト管理

| コマンド | 概要 |
|---------|------|
| `/checkpoint` | チェックポイント保存 |
| `/sessions` | セッション管理 |
| `/projects` | プロジェクト管理 |
| `/promote` | 本番プロモート |
| `/pm2` | PM2プロセス管理 |
| `/setup-pm` | PMセットアップ |

### 1.4 主要コマンド詳細

#### `/plan` — 実装計画作成

```
使用エージェント: planner（model: opus）
```

- 要件分析 → フェーズ分割 → リスク評価 → **ユーザー確認待ち** → 実装
- コードを変更する前に必ず確認を求めることが特徴
- 大きな機能追加やリファクタリング前に使用推奨

```
/plan 新しい認証機能を追加したい
```

---

#### `/tdd` — テスト駆動開発ワークフロー

```
使用エージェント: tdd-guide
参照スキル: tdd-workflow
```

TDD の3ステップを強制実行:

```
RED   → 失敗するテストを先に書く
GREEN → テストを通す最小限のコードを書く
REFACTOR → コードを整理・最適化する
```

最終的にカバレッジ **80%以上** を確認。

---

#### `/orchestrate` — エージェントオーケストレーション

複数エージェントをシーケンシャルに実行し、エージェント間で **Handoff Document** を受け渡します。

**プリセットワークフロー:**

| ワークフロー | エージェント連携 |
|------------|----------------|
| `feature` | planner → tdd-guide → code-reviewer → security-reviewer |
| `bugfix` | planner → tdd-guide → code-reviewer |
| `refactor` | architect → code-reviewer → tdd-guide |
| `security` | security-reviewer → code-reviewer → architect |

```
/orchestrate feature
```

---

#### `/loop-start` — 自律ループ

自律的にタスクを繰り返し実行するループパターン:

| モード | 説明 |
|--------|------|
| `sequential` | タスクリストを順番に処理 |
| `continuous-pr` | PRを継続的に作成・マージ |
| `rfc-dag` | RFC（設計書）のDAGベース処理 |
| `infinite` | 無限ループ（監視・継続タスク向け） |

実行モード: `safe`（デフォルト・確認あり）/ `fast`（確認なしで高速実行）

ループ計画は `.claude/plans/` に自動保存されます。

---

#### `/skill-create` — スキル自動生成

Git ヒストリーを解析して `SKILL.md` を自動生成:

```bash
# 通常のSKILL.md生成
/skill-create

# continuous-learning-v2 用 Instinct を生成
/skill-create --instincts
```

---

#### `/code-review` — コードレビュー

```
使用エージェント: code-reviewer
```

問題を重要度別に分類して報告:

```
CRITICAL  — 即時修正が必要（セキュリティ脆弱性など）
HIGH      — リリース前に修正すべき問題
MEDIUM    — 改善推奨の問題
LOW       — スタイル・最適化の提案
```

### 1.5 コマンド→エージェント→スキルの三層連携

ECC のコンポーネントは三層構造で連携します:

```
Layer 1: ユーザー
    │
    ▼ スラッシュコマンドで呼び出し
Layer 2: コマンド（commands/）
    │    /tdd, /plan, /orchestrate...
    │
    ▼ エージェントに委譲
Layer 3: エージェント（agents/）
    │    tdd-guide, planner, code-reviewer...
    │
    ▼ 実行時に知識参照
Layer 4: スキル（skills/）
         tdd-workflow, security-review, coding-standards...
```

**具体的な連携例:**

```
/tdd コマンド実行
  └─→ tdd-guide エージェント（専門的なTDD実施者として動作）
        └─→ tdd-workflow スキル（具体的なTDDパターン・チェックリストを参照）
              └─→ テスト作成 → 実装 → リファクタリング → カバレッジ確認
```

```
/orchestrate feature
  └─→ planner（計画作成）
        └─→ tdd-guide（TDD実施）
              └─→ code-reviewer（品質確認）
                    └─→ security-reviewer（セキュリティ確認）
```

---

## 2. Contexts（コンテキストファイル）

`contexts/` フォルダには3つのコンテキストファイルがあります。セッション全体の動作モードを設定するための**システムプロンプトテンプレート**です。

### 2.1 dev.md（開発モード）

```
Mode: Active development
Focus: 実装、コーディング、機能構築
```

**優先事項（順序あり）:**
1. 動作すること（Working）
2. 正確であること（Correct）
3. クリーンであること（Clean）

**推奨ツール:** Edit, Write, Bash, Grep, Glob

コードを**先に書いて後から説明する**アプローチ。実装フェーズで使用。

---

### 2.2 research.md（調査モード）

```
Mode: 探索・調査・学習
Focus: 行動前の理解
```

**プロセス:**
```
質問理解 → コード探索 → 仮説形成 → 検証 → まとめ
```

**推奨ツール:** Read, Grep, Glob, WebSearch, WebFetch

コードを書く前に**理解を深める**アプローチ。新機能調査や未知のコードベース探索で使用。

---

### 2.3 review.md（レビューモード）

```
Mode: PRレビュー、コード分析
Focus: 品質・セキュリティ・保守性
```

**チェック項目（優先度順）:**
```
critical > high > medium > low
```

| カテゴリ | 確認内容 |
|---------|---------|
| ロジック | アルゴリズムの正確性、エッジケース |
| セキュリティ | 脆弱性、インジェクション、認証 |
| パフォーマンス | N+1クエリ、不要な計算 |
| 可読性 | 命名、コメント、構造 |
| テスト | カバレッジ、テストの質 |

**推奨ツール:** Read, Grep

---

### 2.4 使い分け方

| 状況 | 使用するコンテキスト |
|------|-------------------|
| 新機能を実装中 | `dev.md` |
| 未知のコードベースを調査中 | `research.md` |
| PRをレビュー中 | `review.md` |
| バグ調査中 | `research.md` → `dev.md` |

**使い方のヒント:** コンテキストファイルを `CLAUDE.md` から参照するか、セッション開始時に Claude に明示的に伝えることで適用できます。

---

## 3. Plugins（プラグインシステム）

プラグインは**マーケットプレイス経由**でインストールする拡張システムです。`plugins/` ディレクトリには README のみが含まれており、実際のプラグインは外部マーケットプレイスから取得します。

### 3.1 インストール方法

**マーケットプレイスの追加:**

```bash
# 公式マーケットプレイスを追加
claude plugin marketplace add https://github.com/anthropics/claude-plugins-official
```

**プラグインのブラウズ・インストール:**

```bash
# プラグインブラウザを起動（インタラクティブ）
/plugins

# 特定プラグインを直接インストール
claude plugin install typescript-lsp@claude-plugins-official
```

**インストール先のディレクトリ構造:**

```
~/.claude/plugins/
├── cache/                    # ダウンロード済みプラグインのキャッシュ
├── installed_plugins.json    # インストール済みプラグイン一覧
├── known_marketplaces.json   # 登録済みマーケットプレイス
└── marketplaces/             # マーケットプレイスのメタデータ
```

### 3.2 推奨プラグイン一覧

| カテゴリ | プラグイン名 | 用途 |
|---------|------------|------|
| **開発** | `typescript-lsp` | TypeScript言語サーバー統合 |
| **開発** | `pyright-lsp` | Python型チェック（Pyright） |
| **開発** | `hookify` | 会話形式でフックを作成 |
| **品質** | `code-review` | コードレビュー自動化 |
| **品質** | `pr-review-toolkit` | PR自動化・チェック |
| **品質** | `security-guidance` | セキュリティチェック |
| **検索** | `mgrep` | 高度な検索（ripgrepより強力）|
| **検索** | `context7` | ライブドキュメント参照 |
| **ワークフロー** | `commit-commands` | Gitワークフロー自動化 |
| **ワークフロー** | `feature-dev` | 機能開発ワークフロー |

> **注意:** プラグインシステムは外部マーケットプレイスに依存します。プラグインの品質・安全性は各マーケットプレイス管理者に依存するため、インストール前に内容を確認してください。

---

## 4. Examples（CLAUDE.mdテンプレート）

`examples/` ディレクトリには、実プロジェクトですぐに使える `CLAUDE.md` テンプレートが6種類用意されています。

### 4.1 テンプレート一覧

| ファイル名 | 対象プロジェクト |
|-----------|---------------|
| `CLAUDE.md` | **汎用テンプレート**（全プロジェクト共通の出発点）|
| `django-api-CLAUDE.md` | Django API プロジェクト |
| `go-microservice-CLAUDE.md` | Go マイクロサービス |
| `rust-api-CLAUDE.md` | Rust API プロジェクト |
| `saas-nextjs-CLAUDE.md` | SaaS（Next.js）プロジェクト |
| `user-CLAUDE.md` | ユーザーレベルのグローバル設定 |
| `statusline.json` | ステータスライン表示設定のサンプル |

### 4.2 汎用テンプレートの構成

`examples/CLAUDE.md` の構成は以下の通りです:

```markdown
# Project Overview
プロジェクトの概要・目的・技術スタック

## Critical Rules

### 1. Code Organization
- 1ファイルあたり推奨: 200〜400行
- 上限: 800行（超える場合は分割）

### 2. Code Style
- イミュータビリティを優先
- エラーハンドリングの統一

### 3. Testing
- TDD必須（Red → Green → Refactor）
- 最低カバレッジ: 80%以上

### 4. Security
- シークレット管理（環境変数使用必須）
- 全外部入力のバリデーション

## File Structure
プロジェクトのディレクトリ構造

## Key Patterns
プロジェクト固有のパターン・規約

## Available Commands
/tdd      — TDDワークフロー
/plan     — 実装計画作成
/code-review — コードレビュー
...

## Git Workflow
ブランチ戦略・コミット規約
```

**プロジェクト固有テンプレートの活用:**

新規プロジェクト開始時は、技術スタックに合ったテンプレートをコピーして `CLAUDE.md` として配置するだけで、ECC のルールとコマンドが即座に有効になります。

```bash
# Django プロジェクトの場合
cp ~/.claude/skills/examples/django-api-CLAUDE.md ./CLAUDE.md

# Next.js SaaS の場合
cp ~/.claude/skills/examples/saas-nextjs-CLAUDE.md ./CLAUDE.md
```

---

## 5. 活用方針まとめ

### 自プロジェクトへの適用順序

```
Step 1: examples/CLAUDE.md をプロジェクトの CLAUDE.md として配置
         ↓
Step 2: コアスキルをインストール
         tdd-workflow, security-review, coding-standards
         ↓
Step 3: コアコマンドを配置
         /plan, /tdd, /code-review, /orchestrate
         ↓
Step 4: 作業フェーズに応じてコンテキストを切り替え
         dev.md / research.md / review.md
         ↓
Step 5: 複雑なタスクはエージェントをコマンドから呼び出す
         planner, tdd-guide, security-reviewer など
```

### コンポーネント選択ガイド

| やりたいこと | 使うもの |
|------------|---------|
| 常時適用したいパターン・ガイドライン | `skills/` |
| 明示的に呼び出す手順・ワークフロー | `commands/` |
| 複雑なマルチステップタスク | `agents/` + `commands/` の組み合わせ |
| セッション全体のモード設定 | `contexts/` |
| IDE拡張機能 | `plugins/` |

### 注意事項

| 注意点 | 詳細 |
|--------|------|
| スキルの発動は確率的 | スキルは 50〜80% の確率でしか発動しない。重要な場面では `/tdd` のように明示的にコマンドで呼び出す方が確実 |
| プラグインは外部依存 | プラグインは外部マーケットプレイスに依存するため、信頼できるソースからのみインストール |
| continuous-learning-v2 | `~/.claude/homunculus/` を使用するため、常にユーザーレベルのインストールが必要 |

---

*このドキュメントは `/home/akaba/github/claude-multi-agent/.orchestra-shared/54c730eb/researcher-skills-commands-contexts-plugins.md` の分析レポートをもとに作成しました。*
