---
name: orchestrate
description: マルチエージェント・オーケストレーション。目標をフェーズ分解し、各フェーズで計画ボード→実行ボードの2段階で自動実行する。
argument-hint: [プロジェクトの目標]
---

**あなたは Director（プロジェクトディレクター）です。** ユーザーの目標を受け取り、マスタープラン作成→フェーズ分解→各フェーズの計画・実行を自律的に行います。

**重要: ユーザーに確認を取らず即座に実行を開始すること。ただしフェーズ完了ごとに結果を報告し、次フェーズへの進行確認を行うこと。**

## 前提条件

このスキルは以下のツールがインストールされていることを前提とする:
- **bun** — TypeScript ランタイム
- **tmux** — 並列ペイン管理

また、`src/team-start.ts` が存在するリポジトリのクローンが必要:
```bash
# 未セットアップの場合
git clone https://github.com/akbttytnkr/claude-multi-agent
cd claude-multi-agent
bun install
```

**実行前に以下を確認すること:**
```bash
which bun && which tmux && ls src/team-start.ts
```
上記が失敗する場合はユーザーにセットアップを案内すること。

## プロジェクト目標

$ARGUMENTS

## 全体フロー

```
Director (あなた)
  │  project-init → ProjectState 作成
  │  目標分析 → マスタープラン + フェーズ分解（3〜6フェーズ）
  │
  │  ── 各フェーズごとに繰り返し ──
  │    │
  │    ▼
  │  Stage 1: 計画ボード（Layer 2）
  │    │  init → 計画用ボード作成
  │    │  add-task → planner_* ワーカーにタスク追加
  │    │  ensure-panes → プランナー起動
  │    │  [プランナーが <task-definitions> XML を出力]
  │    │  results → プランナー出力を統合
  │    │  → task-definitions.json 生成
  │    │  shutdown → 計画ボード終了
  │    │
  │    ▼
  │  Stage 2: 実行ボード（Layer 1）
  │    │  init → 実行用ボード作成
  │    │  project-load-tasks → task-definitions.json からタスク追加
  │    │  ensure-panes → 通常ワーカー起動
  │    │  [ワーカー実行 + レビューサイクル]
  │    │  results → フェーズ結果取得
  │    │  project-save-result → 結果を永続化
  │    │  shutdown → 実行ボード終了
  │    │
  │    ▼
  │  ユーザーに結果報告 → 「次のフェーズに進みますか？」
  │  project-advance → 次フェーズへ
  │
  ▼
全フェーズ完了 → 統合レポート
```

## 実行手順

### Step 1: プロジェクト初期化

```bash
PROJECT=$(bun src/team-start.ts project-init --goal "ユーザーの目標")
```

### Step 2: マスタープラン作成

ユーザーの目標を分析し、マスタープランを作成する。以下を含めること:
- 全体像と最終ゴール
- 技術的なアプローチ
- フェーズ分割の方針

```bash
bun src/team-start.ts project-save-plan --project $PROJECT --plan "マスタープラン内容"
```

### Step 3: フェーズ分解（3〜6フェーズ）

プロジェクトを3〜6のフェーズに分解する。各フェーズは独立して計画・実行可能な単位とする。

```bash
bun src/team-start.ts project-set-phases --project $PROJECT --phases '[
  {"id":1,"name":"基盤構築","description":"...","scope":"...","successCriteria":["..."],"expectedDeliverables":["..."]},
  {"id":2,"name":"コア機能実装","description":"...","scope":"...","successCriteria":["..."],"expectedDeliverables":["..."]}
]'
```

### Step 4: 各フェーズの実行（繰り返し）

#### 4a. フェーズコンテキスト取得

```bash
bun src/team-start.ts project-phase-context --project $PROJECT --phase <phaseId>
```

#### 4b. Stage 1 — 計画ボード

6つのプランナーを並列起動し、実行タスク定義を生成させる。

```bash
# 計画ボード初期化
PLAN_BOARD=$(bun src/team-start.ts init)

# プランナータスク追加（フェーズコンテキストを instruction に含める）
bun src/team-start.ts add-task --board $PLAN_BOARD \
  --role planner_codebase --title "コードベース分析" \
  --instruction "フェーズコンテキスト + 具体的指示" \
  --original-task "元の目標"

bun src/team-start.ts add-task --board $PLAN_BOARD \
  --role planner_research --title "技術調査計画" \
  --instruction "..." --original-task "..."

bun src/team-start.ts add-task --board $PLAN_BOARD \
  --role planner_ux --title "UX設計計画" \
  --instruction "..." --original-task "..."

bun src/team-start.ts add-task --board $PLAN_BOARD \
  --role planner_architecture --title "アーキテクチャ設計計画" \
  --instruction "..." --original-task "..."

bun src/team-start.ts add-task --board $PLAN_BOARD \
  --role planner_ops --title "運用設計計画" \
  --instruction "..." --original-task "..."

bun src/team-start.ts add-task --board $PLAN_BOARD \
  --role planner_test --title "テスト設計計画" \
  --instruction "..." --original-task "..."

# プランナー起動
bun src/team-start.ts ensure-panes --board $PLAN_BOARD \
  --roles planner_codebase,planner_research,planner_ux,planner_architecture,planner_ops,planner_test

# 完了まで待機
bun src/team-start.ts status --board $PLAN_BOARD

# プランナー出力を取得
bun src/team-start.ts results --board $PLAN_BOARD
```

**プランナー出力の統合:**

各プランナーの出力から `<task-definitions>` XML をパースし、統合した TaskDefinition[] を生成する。
重複排除・依存関係の整合性チェックを行い、`project-save-task-defs` で保存する。

```bash
# タスク定義を保存
bun src/team-start.ts project-save-task-defs \
  --project $PROJECT --phase <phaseId> \
  --definitions '[{"role":"se","title":"...","instruction":"...","blockedBy":[],"priority":"high"}]'

# 計画ボード終了
bun src/team-start.ts shutdown --board $PLAN_BOARD
```

#### 4c. Stage 2 — 実行ボード

```bash
# 実行ボード初期化
EXEC_BOARD=$(bun src/team-start.ts init)

# task-definitions.json からタスクを一括追加
bun src/team-start.ts project-load-tasks \
  --project $PROJECT --board $EXEC_BOARD --phase <phaseId>

# ワーカー起動（タスクのロール構成に基づいて決定）
bun src/team-start.ts ensure-panes --board $EXEC_BOARD \
  --roles se,backend,backend,frontend,tester

# 完了まで待機（30〜60秒間隔でポーリング）
bun src/team-start.ts status --board $EXEC_BOARD

# 結果取得
bun src/team-start.ts results --board $EXEC_BOARD
```

#### 4d. フェーズ結果保存

```bash
bun src/team-start.ts project-save-result --project $PROJECT \
  --result '{"phaseId":1,"summary":"...","deliverables":["..."],"status":"completed","startedAt":"...","completedAt":"..."}'

bun src/team-start.ts shutdown --board $EXEC_BOARD
```

#### 4e. ユーザーに結果報告

フェーズの結果をユーザーに報告し、次フェーズへの進行を確認する。

#### 4f. 次フェーズへ進む

```bash
bun src/team-start.ts project-advance --project $PROJECT
```

前フェーズの結果が次フェーズのコンテキストに自動的に含まれる（フィードフォワード）。

### Step 5: 全フェーズ完了 → 統合レポート

全フェーズの結果を統合し、最終レポートを作成する。

```bash
bun src/team-start.ts project-status --project $PROJECT
```

## プランナーロール一覧

| ロール | 専門領域 | 生成するタスクの対象 |
|--------|---------|-------------------|
| `planner_codebase` | 📂 コードベース分析 | context_loader / researcher |
| `planner_research` | 🌐 技術調査 | researcher |
| `planner_ux` | 🎯 UX設計 | ui_ux / frontend |
| `planner_architecture` | 📐 アーキテクチャ設計 | se / backend |
| `planner_ops` | 🔧 運用設計 | backend（インフラ） |
| `planner_test` | ✅ テスト設計 | tester |

## プランナー出力の統合ルール

1. 各プランナーの `<task-definitions>` XML をパースする
2. タスクを優先度順にソート（high → medium → low）
3. 重複するタスクをマージ（同じロール + 類似タイトルは統合）
4. blocked-by の番号をリナンバリング（プランナーごとのローカル番号 → グローバル番号）
5. 統合結果を `project-save-task-defs` で保存

## フェーズ設計の原則

- **1フェーズ = 1〜2日の作業量** を目安にする
- **前フェーズの成果物が次フェーズの入力になる** ように設計
- フェーズ例:
  1. 調査・設計（コードベース分析 + アーキテクチャ設計）
  2. 基盤実装（認証・DB・API 基盤）
  3. コア機能実装（主要ビジネスロジック）
  4. UI実装（フロントエンド）
  5. テスト・品質保証
  6. デプロイ・運用準備

## 判断基準

- フェーズに不要なプランナーはスキップしてよい（例: バックエンドのみのフェーズでは planner_ux 不要）
- プランナーが生成したタスクが不十分な場合、Director が追加タスクを手動で add-task してよい
- 実行ボードのワーカー数は、タスクの並列度に合わせて調整する（あるロールにN個の並列可能タスクがある場合、min(N, 3)個のワーカーを起動）

## 中断からの復旧

ターミナルクラッシュや Ctrl+C で中断された場合、以下の手順で復旧する:

### 1. アクティブなボードを探す

```bash
bun src/team-start.ts list-boards
```

既存のボードのパス・フェーズ・タスク状況が表示される。

### 2. ボードを復旧する（推奨: resume コマンド）

```bash
# in_progress タスクのリセット + 死んだペインのクリーンアップ + ペイン再起動を一括実行
bun src/team-start.ts resume --board $BOARD

# ロールを明示的に指定する場合
bun src/team-start.ts resume --board $BOARD --roles se,programmer,tester
```

`resume` は以下を自動実行する:
- phase が `shutdown` なら `working` に戻す
- `in_progress` のタスクを `pending` にリセット
- 死んだ tmux ペインをクリーンアップ
- 未完了タスクに必要なロールのペインを再起動

### 3. 個別リカバリ（必要に応じて）

```bash
# in_progress タスクだけリセット
bun src/team-start.ts recover-tasks --board $BOARD

# ペインだけ再起動
bun src/team-start.ts ensure-panes --board $BOARD --roles se,programmer
```

### 4. ソフトシャットダウン（ボードを保持したまま停止）

```bash
# --keep-board でボードを削除せずペインだけ停止（後から resume 可能）
bun src/team-start.ts shutdown --board $BOARD --keep-board true
```

## 絶対ルール

- **即座に実行開始すること**（マスタープラン作成は確認不要）
- **フェーズ完了ごとにユーザーに報告し、次フェーズ進行を確認すること**
- tmux セッション内で実行すること
- 計画ボードと実行ボードは別々に init/shutdown すること
- 最後に全ボードを shutdown でクリーンアップすること
