# claude-multi-agent

Claude Code のスキル・エージェント機能を活用したマルチエージェント・オーケストレーションシステム。
タスクを専門ワーカーに分解・並列実行し、レビューサイクルを経て統合レポートを生成する。

## スラッシュコマンド（実行モード）

2つの実行モードをスラッシュコマンドで提供:

| コマンド | モード | 特徴 | 用途 |
|---------|--------|------|------|
| `/claude-multi-agent:analyze` | マルチエージェント分析 | Agent ツールで専門エージェントを委任・並列実行 | 単発分析、設計検討 |
| `/claude-multi-agent:orchestrate` | オーケストレーション | フェーズ分解、計画ボード→実行ボードの2段階 | 大規模プロジェクト |

### /analyze — マルチエージェント分析モード

Claude Code がオーケストレーターとして動作し、Agent ツールで専門エージェントに作業を委任する。
エージェント間は `.orchestra-shared/` ディレクトリを介して成果物を共有する。

```
/analyze ユーザー認証機能を設計して
```

実行フロー:
1. `context-loader` でプロジェクト文脈調査（必要に応じて）
2. `researcher` で調査・分析
3. `se`, `ui-ux` を並列起動（設計フェーズ）
4. `frontend`, `backend`, `tester` を並列起動（実装・テストフェーズ）
5. セキュリティ討論（該当時: red → blue → red → consensus）
6. 全結果を統合レポートにまとめる

### /orchestrate — オーケストレーションモード

Claude Code が Director として動作し、大規模タスクをフェーズ分割して計画→実行を繰り返す。

```
/orchestrate ECサイトを構築して
```

```
Director (Claude Code)
  │  project-init → ProjectState 作成
  │  目標分析 → マスタープラン + フェーズ分解（3〜6フェーズ）
  │
  │  ── 各フェーズごとに繰り返し ──
  │    │
  │    ▼
  │  Stage 1: 計画ボード
  │    │  6つのプランナーを並列起動
  │    │  → task-definitions.json 生成
  │    │
  │    ▼
  │  Stage 2: 実行ボード
  │    │  通常ワーカーで実行 + レビューサイクル
  │    │  → フェーズ結果保存
  │    │
  │    ▼
  │  ユーザーに結果報告 → 次フェーズ確認
  │
  ▼
全フェーズ完了 → 統合レポート
```

#### CLI サブコマンド

```bash
# ボード初期化
BOARD=$(bun src/team-start.ts init)

# 作業ディレクトリ指定（実装コードは指定先に出力）
BOARD=$(bun src/team-start.ts init --workdir /path/to/project)

# タスク追加（レビュー付き）
bun src/team-start.ts add-task \
  --board $BOARD --role backend --title "認証API" \
  --instruction "JWT認証APIを実装" \
  --original-task "認証機能" \
  --review-by se \
  --blocked-by "1"

# ペイン起動（同ロール複数可）
bun src/team-start.ts ensure-panes --board $BOARD \
  --roles backend,backend,frontend,se,tester

# 進捗確認
bun src/team-start.ts status --board $BOARD

# ワーカー間通信ログ
bun src/team-start.ts log --board $BOARD

# 結果取得
bun src/team-start.ts results --board $BOARD

# メッセージ送信（方針変更など）
bun src/team-start.ts send --board $BOARD \
  --to backend --from pm --message "OAuth2ではなくPasskeysを使って"

# クリーンアップ
bun src/team-start.ts shutdown --board $BOARD
```

#### レビューサイクル

`--review-by` を付けたタスクは完了時にレビューが自動生成される。

```
backend: 認証API実装
    | 完了
se: [レビュー] 認証API実装           <- 自動生成
    | <request-changes>修正内容</request-changes>
backend: [修正] 認証API実装          <- 自動生成
    | 修正完了
se: [レビュー] 認証API実装           <- 自動生成（再レビュー）
    | 承認
```

#### 複数インスタンス起動

同じロールを複数起動して並列分担が可能。

```bash
# backend タスクが3つ -> 3並列
bun src/team-start.ts ensure-panes --board $BOARD \
  --roles backend,backend,backend,se
# -> backend-1, backend-2, backend-3, se が起動
```

同ロールのインスタンスはタスクを早い者勝ちで取り合う（ファイルロックで排他制御）。

#### プランナーロール

| ロール | 専門領域 |
|--------|---------|
| `planner_codebase` | コードベース分析 |
| `planner_research` | 技術調査 |
| `planner_ux` | UX設計 |
| `planner_architecture` | アーキテクチャ設計 |
| `planner_ops` | 運用設計 |
| `planner_test` | テスト設計 |

## 専門ワーカー（ロール）

| ロール | 担当領域 |
|--------|---------|
| `researcher` | 調査・分析・要件明確化 |
| `context_loader` | 作業対象リポジトリの技術スタック・規約・構造を調査し全ワーカーに共有 |
| `se` | アーキテクチャ設計・技術選定・非機能要件 |
| `frontend` | React/Next.js・コンポーネント設計・状態管理・a11y |
| `backend` | API設計・DB設計・認証・ビジネスロジック |
| `tester` | テスト戦略・テストケース・品質保証 |
| `ui_ux` | ユーザビリティ・画面設計・アクセシビリティ |
| `security_red` | 攻撃者視点で脆弱性発見・攻撃シナリオ提示 |
| `security_blue` | 防御者視点で対策提案・コストとリスク評価 |

### セキュリティ討論（Red Team vs Blue Team）

セキュリティ評価では、Red Team と Blue Team を独立ワーカーとして起動する。
タスク依存とレビューサイクル（`--review-by`）で自然な討論を実現。

```
security_red: 脆弱性分析
    | 完了 → review-by security_blue
security_blue: [レビュー] 脆弱性分析     <- 自動生成
    | <request-changes> or 承認

security_blue: 防御策提案 (blocked-by red)
    | 完了 → review-by security_red
security_red: [レビュー] 防御策提案      <- 自動生成
    | <request-changes> or 承認
```

## Claude Code エージェント定義

`agents/` 配下に10の専門エージェントを定義。`/analyze` モードで Agent ツール経由で利用される。

| エージェント | 説明 |
|-------------|------|
| `context-loader` | プロジェクト文脈の調査・文書化 |
| `researcher` | 調査・分析・要件明確化 |
| `se` | アーキテクチャ設計・技術選定・非機能要件 |
| `frontend` | フロントエンド実装・コンポーネント設計 |
| `backend` | バックエンド実装・API設計・DB設計 |
| `tester` | テスト戦略・テストケース設計 |
| `ui-ux` | ユーザビリティ・アクセシビリティ・画面設計 |
| `security-red-team` | 攻撃者視点での脆弱性発見 |
| `security-blue-team` | 防御策提案・コストリスク評価 |
| `security-consensus` | Red/Blue 討論の合意形成 |

## セットアップ

### 前提条件

- [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) がインストール済み・認証済み
- tmux（`/orchestrate` モード使用時）
- Bun（`/orchestrate` モード使用時）

### インストール

#### 1. マーケットプレースの登録

ターミナルで以下を実行：

```bash
claude plugin marketplace add akbttytnkr/agent-toolbox
```

#### 2. プラグインのインストール

```bash
claude plugin install claude-multi-agent@agent-toolbox
```

これで `/claude-multi-agent:analyze`, `/claude-multi-agent:orchestrate` のスラッシュコマンドと全エージェントが利用可能になる。

#### 3. `/orchestrate` を使う場合（追加セットアップ）

`/orchestrate` モードは tmux + Bun ランタイムが必要：

```bash
git clone https://github.com/akbttytnkr/claude-multi-agent
cd claude-multi-agent
bun install

# tmux セッション内で Claude Code を起動
tmux new-session -s claude
claude
```

### プラグインの更新

```bash
# マーケットプレースのキャッシュを最新化
claude plugin marketplace update agent-toolbox

# プラグインを更新
claude plugin update claude-multi-agent@agent-toolbox
```

### アンインストール

```bash
claude plugin uninstall claude-multi-agent@agent-toolbox
claude plugin marketplace remove agent-toolbox
```

## セーフガード

### PreToolUse フック

`scripts/` 配下のスクリプトで危険な操作を制限（`hooks/hooks.json` で定義）:

| フック | 制限内容 |
|--------|---------|
| `restrict-git.sh` | `git commit`, `git push` を禁止 |
| `restrict-destructive.sh` | `rm -rf` を禁止 |
| `restrict-workdir.sh` | `CLAUDE_ALLOWED_DIR` 外のファイル操作を禁止 |

### CI/CD — 自動バージョニング

`.github/workflows/publish-plugin.yml` により、main への push 時に patch バージョンを自動インクリメントして GitHub Packages に publish。

## ファイル構成

```
claude-multi-agent/
├── src/
│   ├── team-start.ts        # Orchestrate CLI サブコマンドルーター
│   ├── team-member.ts       # tmux ペイン内の永続ワーカーループ
│   ├── team-board.ts        # ファイルベースのタスクボード + インボックス
│   ├── project-board.ts     # プロジェクト管理（フェーズ・マスタープラン）
│   ├── project-types.ts     # プロジェクト用型定義
│   ├── main.ts              # 7-Phase エントリポイント
│   ├── start.ts             # Interactive PM エントリポイント
│   ├── types.ts             # 共有型定義
│   ├── roles.ts             # ワーカーロール定義・システムプロンプト
│   ├── claude-sdk.ts        # Agent SDK ラッパー（query）
│   ├── claude-cli.ts        # SDK/CLI アダプター
│   ├── claude-cli.legacy.ts # CLI spawn 版（フォールバック）
│   ├── agents.ts            # Agent SDK 用エージェント定義
│   ├── orchestrator.ts      # Phase 1-3, 5 制御
│   ├── worker.ts            # Phase 4 並列実行
│   ├── worker-pane.ts       # tmux ペイン用ワーカースクリプト
│   ├── synthesizer.ts       # Phase 6 統合レポート
│   ├── feedback.ts          # Phase 7 フィードバック生成
│   ├── debate.ts            # セキュリティ4ラウンド討論
│   └── debate-pane.ts       # tmux ペイン用討論スクリプト
├── .claude-plugin/
│   ├── plugin.json          # プラグインマニフェスト
├── .claude/
│   ├── CLAUDE.md            # プロジェクトルール
│   └── settings.json        # 権限設定
├── agents/                  # Claude Code エージェント定義（10ロール）
├── skills/
│   ├── analyze/             # /claude-multi-agent:analyze スラッシュコマンド
│   └── orchestrate/         # /claude-multi-agent:orchestrate スラッシュコマンド
├── hooks/
│   └── hooks.json           # フック定義
├── scripts/                 # フックスクリプト（restrict-*, post-edit-*）
├── rules/                   # 共通ルール
├── docs/
│   ├── architecture.md      # アーキテクチャ概要
│   ├── plugin-install.md    # プラグインインストール手順
│   └── integrations/        # 外部連携ドキュメント
├── .github/
│   └── workflows/
│       └── publish-plugin.yml # 自動バージョニング + GitHub Packages publish
├── package.json
├── tsconfig.json
└── .gitignore
```

## ルールの手動適用

プラグインをインストールせずにルールだけを自分のプロジェクトに適用したい場合、`rules/common/` を手動でコピーできる。

```bash
# コーディングスタイル（イミュータビリティ、ファイルサイズ、命名規則等）
cp rules/common/coding-style.md /path/to/your-project/.claude/rules/

# 品質基準（TDD、カバレッジ80%、コードレビュー分類、Lint修正方針）
cp rules/common/quality-standards.md /path/to/your-project/.claude/rules/

# セキュリティチェックリスト（コミット前8項目）
cp rules/common/security.md /path/to/your-project/.claude/rules/

# エージェントオーケストレーション（並列実行、マルチパースペクティブ分析）
cp rules/common/agent-orchestration.md /path/to/your-project/.claude/rules/

# ランタイム指定（bun 使用の強制） ※プロジェクトに合わせて編集が必要
cp rules/common/runtime.md /path/to/your-project/.claude/rules/

# 全ルールを一括コピー
cp -r rules/common/* /path/to/your-project/.claude/rules/
```

> **注意**: `runtime.md` は本プロジェクト固有の設定（bun 強制）のため、コピー先のプロジェクトに合わせて内容を編集すること。

## 技術スタック

- **TypeScript** 5.7 (ES2023 / NodeNext / strict)
- **@anthropic-ai/claude-agent-sdk** v0.2.66 — LLM 呼び出し（query + resume）
- **Bun** — TypeScript ネイティブ実行（高速ランタイム）
- **tmux** — 並列ペイン管理
- **ファイルベース IPC** — アトミック書き込み（tmp → rename）、ファイルロック排他制御
