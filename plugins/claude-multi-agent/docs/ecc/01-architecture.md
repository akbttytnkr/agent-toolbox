# everything-claude-code アーキテクチャドキュメント

> **対象リポジトリ:** everything-claude-code (npm: `ecc-universal`)
> **バージョン:** 1.8.0
> **最終更新:** 2026-03-09

---

## Table of Contents

1. [プロジェクト概要](#1-プロジェクト概要)
2. [ディレクトリ構造](#2-ディレクトリ構造)
3. [コンポーネント関係図](#3-コンポーネント関係図)
4. [設定ファイル体系](#4-設定ファイル体系)
5. [インストール方法](#5-インストール方法)
6. [Rules vs Skills の違い](#6-rules-vs-skills-の違い)
7. [注意事項とリスク](#7-注意事項とリスク)

---

## 1. プロジェクト概要

### 目的

everything-claude-code は **Claude Code ユーザー向けの production-ready な設定・コンポーネントの総合コレクション**です。

10ヶ月以上の集中的な実務使用から蒸留された以下のコンポーネントを提供します:

- **Agents** — 専門タスク実行のサブエージェント定義
- **Skills** — ドメイン知識・ワークフロー参照モジュール
- **Commands** — ユーザー呼び出しスラッシュコマンド
- **Rules** — 常時適用される開発規約
- **Hooks** — イベント駆動の自動化スクリプト
- **MCP設定** — 外部サービスとの統合設定

### 対象ユーザー

| ユーザー層 | 目的 |
|-----------|------|
| Claude Code ユーザー | AI支援開発のベストプラクティスをすぐに適用 |
| Cursor / OpenCode / Codex ユーザー | クロスIDE対応の設定を流用 |
| チーム開発者 | 統一された開発規約・ワークフローの共有 |

### プロジェクト規模

| 指標 | 値 |
|------|-----|
| GitHub Stars | 50K+ |
| Forks | 6K+ |
| Contributors | 30+ |
| Agents | 16ファイル |
| Commands | 43ファイル |
| Skills | 67ディレクトリ |
| 対応言語 | Shell, TypeScript, Python, Go, Java, Markdown |

---

## 2. ディレクトリ構造

### 全体構造

```
everything-claude-code/
│
├── 【コア機能コンポーネント】
├── agents/          # 専門サブエージェント定義（16ファイル）
├── commands/        # スラッシュコマンド定義（43ファイル）
├── skills/          # ワークフロー・知識モジュール（67ディレクトリ）
├── rules/           # 常時適用ルール（common/ + 言語別）
├── hooks/           # フック設定（hooks.json + README）
│
├── 【設定・スキーマ】
├── schemas/         # JSONスキーマ定義（3ファイル）
├── mcp-configs/     # MCPサーバー設定（15+統合）
├── contexts/        # コンテキストテンプレート（3ファイル）
│
├── 【IDE別設定】
├── .claude/         # Claude Code ローカル設定
├── .cursor/         # Cursor IDE設定
├── .codex/          # Codex IDE設定
├── .opencode/       # OpenCode IDE設定
├── .agents/         # 代替エージェント形式
│
├── 【補助リソース】
├── examples/        # CLAUDE.mdサンプル（7ファイル）
├── docs/            # 多言語ドキュメント（ja-JP, zh-CN, zh-TW等）
├── scripts/         # Node.jsユーティリティ（CI検証, フック用）
├── tests/           # テストスイート
├── plugins/         # プラグイン設定
├── assets/          # 画像・アセット
│
├── 【インストール・パッケージ】
├── install.sh       # インストールスクリプト（247行）
├── package.json     # npmパッケージメタデータ
│
└── 【ドキュメント】
    ├── CLAUDE.md                  # Claude Code向けプロジェクト説明
    ├── CONTRIBUTING.md            # コントリビューションガイド（426行）
    ├── the-longform-guide.md      # 上級者向け詳細ガイド
    ├── the-shortform-guide.md     # クイックスタートガイド
    ├── the-security-guide.md      # セキュリティガイド
    └── the-openclaw-guide.md      # OpenClawガイド
```

### 各フォルダの詳細

| フォルダ | ファイル数 | 形式 | 役割 |
|---------|-----------|------|------|
| `agents/` | 16 | Markdown + YAML frontmatter | 専門タスク用サブエージェント定義 |
| `commands/` | 43 | Markdown + YAML frontmatter | ユーザー呼び出しスラッシュコマンド |
| `skills/` | 67ディレクトリ | 各 `SKILL.md` | ドメイン知識・ワークフロー参照 |
| `hooks/` | 2 | JSON + Markdown | 自動トリガーイベント |
| `rules/` | 22+ | Markdown | 常時適用の開発規約 |
| `schemas/` | 3 | JSON Schema | 設定ファイルのバリデーション定義 |
| `mcp-configs/` | 1 | JSON | 外部サービス統合設定 |
| `contexts/` | 3 | Markdown | 動的システムプロンプト用テンプレート |
| `examples/` | 7 | Markdown + JSON | CLAUDE.mdサンプル集 |

---

## 3. コンポーネント関係図

### データフロー概観

```
┌─────────────────────────────────────────────────────────┐
│                       ユーザー                            │
└─────────┬───────────────────┬───────────────────────────┘
          │                   │
          ▼                   ▼
┌──────────────────┐  ┌──────────────────────────────────┐
│  スラッシュコマンド │  │         自動適用                  │
│  /tdd            │  │  ┌────────────┐  ┌─────────────┐ │
│  /plan           │  │  │  rules/    │  │  hooks/     │ │
│  /code-review    │  │  │  *.md      │  │  hooks.json │ │
│  /security-check │  │  │  (常時注入) │  │  (イベント)  │ │
└────────┬─────────┘  │  └────────────┘  └──────┬──────┘ │
         │            └─────────────────────────┼────────┘
         ▼                                       │
┌──────────────────┐                            │
│    agents/       │◄───────────────────────────┘
│  *.md            │   フックからエージェント呼び出し可
│  (サブエージェント)│
└────────┬─────────┘
         │  参照
         ▼
┌──────────────────┐    ┌──────────────────┐
│    skills/       │    │   mcp-configs/   │
│  */SKILL.md      │    │  (外部サービス)   │
│  (知識参照)       │    │  GitHub, Supabase│
└──────────────────┘    │  Vercel, etc.    │
                        └──────────────────┘
```

### コンポーネント間の呼び出し関係

| コンポーネント | 呼び出し元 | 呼び出し先 | 用途 |
|--------------|-----------|-----------|------|
| `commands/` | ユーザー（/コマンド） | `agents/` を委譲 | ユーザー主導ワークフロー |
| `agents/` | `commands/` または自動 | Read/Write/Bash等のツール | 専門タスク実行 |
| `skills/` | `agents/` または Claude | — | 知識・パターン参照 |
| `rules/` | 自動注入 | — | 常時制約・規約適用 |
| `hooks/` | イベントトリガー | Bashコマンド | 自動化・品質ゲート |
| `mcp-configs/` | Claude Code設定 | 外部サービスAPI | 外部統合 |
| `contexts/` | CLI alias | — | 動的システムプロンプト |

### フックイベントの種類

```
hooks/hooks.json（17フック）
│
├── PreToolUse (6フック)
│   ├── tmux自動起動
│   ├── tmuxリマインダー
│   ├── git push確認ダイアログ
│   ├── docファイル変更警告
│   ├── 手動コンパクション提案
│   └── 学習観察キャプチャ
│
├── PreCompact (1フック)
│   └── セッション状態保存
│
├── SessionStart (1フック)
│   └── セッション検出・パッケージマネージャーセットアップ
│
├── PostToolUse (5フック)
│   ├── PR作成ログ
│   ├── ビルド完了分析（非同期）
│   ├── 品質ゲートチェック（非同期）
│   ├── JS/TSファイル自動フォーマット
│   └── TypeScript型チェック
│
├── Stop (3フック)
│   ├── console.log警告
│   ├── セッション状態追跡
│   └── パターン抽出評価
│
└── SessionEnd (1フック)
    └── トークン・コストメトリクス追跡
```

### 主要エージェント一覧

| エージェント | モデル | 主な役割 |
|------------|-------|---------|
| `code-reviewer` | sonnet | コード品質・セキュリティレビュー |
| `tdd-guide` | sonnet | テスト駆動開発実施 |
| `planner` | opus | 実装計画・リスク評価 |
| `security-reviewer` | sonnet | OWASP Top10脆弱性検出 |
| `python-reviewer` | sonnet | Python専門レビュー |
| `go-reviewer` | sonnet | Go専門レビュー |
| `architect` | opus | アーキテクチャ設計 |
| `chief-of-staff` | opus | 複雑タスクの調整・オーケストレーション |
| `database-reviewer` | sonnet | DBスキーマ・クエリレビュー |
| `doc-updater` | haiku | ドキュメント更新（軽量タスク） |
| `e2e-runner` | sonnet | E2Eテスト実行 |
| `refactor-cleaner` | sonnet | コードリファクタリング |

> **モデル選択の指針:** haiku（シンプルタスク） → sonnet（コーディング標準） → opus（複雑・戦略タスク）

---

## 4. 設定ファイル体系

### schemas/ フォルダ

```
schemas/
├── hooks.schema.json          # フック設定のバリデーション
├── plugin.schema.json         # プラグイン設定のバリデーション
└── package-manager.schema.json # パッケージマネージャー検出定義
```

#### hooks.schema.json — フック設定スキーマ

フックイベントの種別と設定フィールド:

| イベント | タイミング | ユースケース |
|---------|-----------|-------------|
| `PreToolUse` | ツール実行前 | 検証・警告・ブロック |
| `PostToolUse` | ツール実行後 | フォーマット・チェック・通知 |
| `PreCompact` | コンテキスト圧縮前 | 状態保存 |
| `SessionStart` | セッション開始時 | コンテキスト読み込み |
| `SessionEnd` | セッション終了時 | クリーンアップ |
| `Stop` | レスポンス完了時 | 学習記録・監査 |
| `Notification` | 通知イベント | 外部通知 |
| `SubagentStop` | サブエージェント停止時 | サブエージェント後処理 |

**フック定義の最小構成:**

```json
{
  "type": "PreToolUse",
  "command": "echo 'hook executed'"
}
```

**オプションフィールド:**

```json
{
  "type": "PostToolUse",
  "command": "npm run format",
  "async": true,
  "timeout": 30
}
```

**マッチャー構文（フィルタリング例）:**

```javascript
// 特定ツールにマッチ
tool == "Bash"
tool == "Edit"

// コマンド内容でフィルタ
tool_input.command matches "rm -rf /"

// ファイルパスでフィルタ
tool_input.file_path matches "\\.tsx?$"

// 複合条件
tool == "Bash" && tool_input.command matches "git push"
```

#### package-manager.schema.json

npm, pnpm, yarn, bun の4つに対応したパッケージマネージャーの自動検出スキーマ。

### rules/ フォルダ構成

```
rules/
├── common/                      # 言語非依存（9ファイル）
│   ├── agents.md               # エージェント使用ルール
│   ├── coding-style.md         # コーディングスタイル
│   ├── development-workflow.md  # 開発ワークフロー
│   ├── git-workflow.md         # Gitワークフロー
│   ├── hooks.md                # フック設定ルール
│   ├── patterns.md             # 設計パターン
│   ├── performance.md          # パフォーマンス最適化
│   ├── security.md             # セキュリティ要件
│   └── testing.md              # テスト要件（80%カバレッジ必須）
├── typescript/                  # TypeScript固有（5ファイル）
├── python/                      # Python固有（4ファイル）
├── golang/                      # Go固有（4ファイル）
└── swift/                       # Swift固有（4ファイル）
```

**優先順位:** 言語固有ルール > 共通ルール（CSSの詳細度と同じ考え方）

**主要な規約（testing.md より）:**

- 最低テストカバレッジ: **80%**
- TDDワークフロー: **必須**（RED → GREEN → REFACTOR）
- テスト種別: **Unit + Integration + E2E すべて必須**

---

## 5. インストール方法

### CLI経由インストール（install.sh）

**基本構文:**

```bash
./install.sh [--target <claude|cursor|antigravity>] <言語> [<言語> ...]
```

**インストールターゲット:**

| ターゲット | デフォルト | インストール先 | インストール対象 |
|-----------|-----------|--------------|----------------|
| `claude` | ✅ | `~/.claude/rules/` | rulesのみ |
| `cursor` | — | `./.cursor/` | rules, agents, skills, commands, MCP |
| `antigravity` | — | `.agent/` | 設定ファイル |

**インストール例:**

```bash
# TypeScriptルールのみ（Claude Codeターゲット - デフォルト）
./install.sh typescript

# 複数言語を一括インストール
./install.sh typescript python golang

# Cursor IDE向けにインストール
./install.sh --target cursor typescript

# Cursor + 複数言語
./install.sh --target cursor typescript python golang
```

**インストール動作の詳細:**

1. `rules/common/` の共通ルールは常にインストール
2. `rules/<言語>/` の言語固有ルールは指定時のみインストール
3. ディレクトリ構造を保持（相対パス参照を有効に保つ）
4. npmシムリンク解決（npxからのインストールに対応）
5. パストラバーサル防止（ホワイトリスト検証）

### npm経由インストール（推奨）

```bash
# グローバルインストール
npm install -g ecc-universal

# TypeScriptのルールをインストール
npx ecc-install typescript

# 複数言語を一括インストール
npx ecc-install typescript python golang
```

### MCP設定（外部サービス統合）

`mcp-configs/mcp-servers.json` で15以上の外部サービスが設定可能:

| サーバー | 用途 |
|---------|------|
| `github` | PRs, Issues, リポジトリ操作 |
| `firecrawl` | Webスクレイピング |
| `supabase` | Supabaseデータベース操作 |
| `memory` | セッション間永続メモリ |
| `sequential-thinking` | Chain-of-Thoughtリーズニング |
| `vercel` | Vercelデプロイ |
| `railway` | Railwayデプロイ |
| `cloudflare-*` | Cloudflare Workers/Observability |
| `clickhouse` | ClickHouseアナリティクス |
| `exa-web-search` | Exa APIによるWeb検索 |
| `context7` | ライブドキュメント参照 |
| `magic` | Magic UIコンポーネント |
| `filesystem` | ファイルシステム操作 |

> **重要:** コンテキストウィンドウ保持のため、有効化するMCPサーバーは **10以下を推奨**

---

## 6. Rules vs Skills の違い

これは everything-claude-code を理解する上で最も重要な概念の一つです。

### 比較表

| 観点 | Rules | Skills |
|------|-------|--------|
| **適用タイミング** | 常時（自動注入） | タスク時に必要に応じて参照 |
| **内容の性質** | 標準・規約・チェックリスト | 深い実践的参照情報・手順 |
| **スコープ** | 広範（全開発に適用） | 特定タスク・技術領域 |
| **ファイル形式** | Markdown（`rules/*.md`） | Markdown（`skills/*/SKILL.md`） |
| **例** | `testing.md`（80%カバレッジ必須） | `tdd-workflow/SKILL.md`（TDD手順詳細） |

### Rules の例

```markdown
# rules/common/testing.md

## テスト要件

- 最低カバレッジ: 80%
- TDDワークフロー必須
- Unit + Integration + E2E すべて実装すること
```

→ これは **常にClaudeのコンテキストに注入され**、すべての開発タスクに自動適用されます。

### Skills の例

```markdown
---
name: tdd-workflow
description: テスト駆動開発のワークフローと実践手順
origin: ECC
---

# TDD ワークフロー

## いつ使うか
新機能を実装する前にテストを先に書く場合。

## 手順
1. RED: 失敗するテストを書く
2. GREEN: テストを通す最小限のコードを書く
3. REFACTOR: コードを整理する
...
```

→ これは **必要なときにAgentやClaudeが参照する**知識ベースです。

### 設計の考え方

```
Rules  = 「常に守るべきルール」（チームの開発規約書に相当）
Skills = 「必要なときに開く参考書」（技術ドキュメントに相当）
```

---

## 7. 注意事項とリスク

### 既知のリスク

| リスク | 影響度 | 対処法 |
|--------|--------|--------|
| skills/ の数が67と多く全体像把握が困難 | 中 | カテゴリ別のインデックスを参照 |
| hooks.json がtmux前提（Windows非対応の可能性） | 中 | Windows環境では該当フックを無効化 |
| MCPサーバーのAPIキー管理 | **高** | `YOUR_*_HERE` プレースホルダーを必ず置換すること |
| install.sh がbash依存 | 低 | Windows環境ではGit Bash等が必要 |

### MCPサーバー設定の注意

```json
// mcp-servers.json の例（設定前に必ず置換が必要なフィールド）
{
  "github": {
    "env": {
      "GITHUB_TOKEN": "YOUR_GITHUB_TOKEN_HERE"  // ← 必ず置換
    }
  }
}
```

### パフォーマンスに関する推奨事項

- 有効化するMCPサーバーは **10以下**に制限
- Agentモデルは **タスクの複雑さに応じて選択**（コスト最適化）
  - シンプルタスク → haiku
  - 標準コーディング → sonnet
  - 複雑な設計・計画 → opus

---

*このドキュメントは `/home/akaba/github/claude-multi-agent/.orchestra-shared/54c730eb/researcher-architecture-report.md` の分析レポートをもとに作成しました。*
