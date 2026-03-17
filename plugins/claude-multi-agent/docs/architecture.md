# Architecture — claude-multi-agent

## システム概要

claude-multi-agent は、複数の専門 AI ワーカーを協調させるマルチエージェント・オーケストレーションシステムである。
TypeScript で構築され、LLM 呼び出しには **Claude Agent SDK**（`@anthropic-ai/claude-agent-sdk`）の `query()` API を使用する。
Anthropic API キーは不要で、Claude Code のサブスクリプション認証をそのまま利用する。

3 層のレイヤー構造と複数の実行モードを持ち、タスクの規模や対話要件に応じて使い分ける。

### レイヤー構造

```
Layer 3: プロジェクト計画・フェーズ分解     /orchestrate スキル（Director）
Layer 2: メタタスク（設計 + タスク定義生成） planner_* ワーカー
Layer 1: タスク実行                         team-board / team-member / team-start
```

| Layer | 責務 | 入力 | 出力 |
|-------|------|------|------|
| **Layer 3** | 目標 → マスタープラン → フェーズ分解 | ユーザーの目標 | PhaseBrief[] |
| **Layer 2** | フェーズ → 実行タスク定義生成 | PhaseBrief + フィードフォワード | TaskDefinition[] |
| **Layer 1** | タスク実行 + レビューサイクル | TaskDefinition[] | 成果物 + PhaseResult |

### 実行モード

| モード | エントリ | PM の所在 | 特徴 |
|--------|---------|----------|------|
| **Analyze** | `/analyze` | **Claude Code（オーケストレーター）** | Agent ツールで専門エージェントに委任、並列実行、`.orchestra-shared/` で成果物共有 |
| **Orchestrate** | `/orchestrate` + `team-start.ts` | **Claude Code（Director）** | 2段ボード方式、フェーズ分解、フィードフォワード |
| **7-Phase** | `main.ts` | LLM（PM プロンプト） | 固定パイプライン、バッチ処理 |
| **Interactive PM** | `start.ts` | LLM（PM プロンプト） | セッション継続、フォローアップ可能 |

---

## Analyze モード

### コンセプト

`/analyze` スラッシュコマンドで起動。Claude Code がオーケストレーターとして動作し、
自身では直接作業（Read, Edit, Bash 等）を行わず、全ての作業を Agent ツール経由で `agents/` に定義された専門エージェントに委任する。
エージェント間は `.orchestra-shared/` ディレクトリを介して成果物を共有し、フェーズ制御により先行成果物を後続エージェントが参照可能。

```
User → Claude Code (= Orchestrator)
              |  Agent ツール呼び出し
              v
         context-loader → プロジェクト文脈調査（必要に応じて）
              v
         researcher → 調査・分析
              |  .orchestra-shared/ に成果物を保存
              v
         se / ui-ux  ← 並列起動（設計フェーズ）
              |  .orchestra-shared/ の先行成果物を読んでから作業
              v
         frontend / backend / tester  ← 並列起動（実装・テストフェーズ）
              |  セキュリティ該当時
              v
         security-red-team → security-blue-team → security-red-team → security-consensus
              |
              v
         統合レポート（Markdown）
```

### 実行フロー

1. **コンテキスト調査**（必要に応じて）: `context-loader` でプロジェクト文脈を調査
2. **リサーチ**: `researcher` エージェントでタスクの分析・調査
3. **設計**: リサーチ結果を基に `se`, `ui-ux` を並列起動
4. **実装・テスト**: 設計結果を基に `frontend`, `backend`, `tester` を並列起動
5. **セキュリティ討論**（該当時のみ）:
   - `security-red-team` → 脆弱性指摘
   - `security-blue-team`（Red の結果を渡す） → 防御策
   - `security-red-team`（Blue の結果を渡す） → 再反論
   - `security-consensus`（全結果を渡す） → 合意形成
6. **統合レポート**: 全エージェントの結果を統合し Markdown で出力

### Claude Code エージェント定義（`agents/`）

10の専門エージェントが `agents/` 配下にフラットな `.md` ファイルとして定義されている。
各エージェントは `model: sonnet`（context-loader は `haiku`）, `tools: Read/Glob/Grep/Write`, `maxTurns: 10` で構成される。

| エージェント | 定義ファイル | 専門領域 |
|-------------|------------|---------|
| `context-loader` | `agents/context-loader.md` | プロジェクト文脈の調査・文書化 |
| `researcher` | `agents/researcher.md` | 調査・分析・要件明確化・リスク洗い出し |
| `se` | `agents/se.md` | アーキテクチャ設計・技術選定・非機能要件 |
| `frontend` | `agents/frontend.md` | フロントエンド実装・コンポーネント設計・a11y |
| `backend` | `agents/backend.md` | バックエンド実装・API設計・DB設計 |
| `tester` | `agents/tester.md` | テスト戦略・テストケース設計・エッジケース特定 |
| `ui-ux` | `agents/ui-ux.md` | ユーザビリティ・アクセシビリティ・画面設計 |
| `security-red-team` | `agents/security-red-team.md` | 攻撃者視点での脆弱性発見 |
| `security-blue-team` | `agents/security-blue-team.md` | 防御策提案・コストリスク評価 |
| `security-consensus` | `agents/security-consensus.md` | Red/Blue 討論の合意形成 |

---

## Orchestrate モード（tmux + タスクボード）

### コンセプト

Claude Code 自体が PM/Director として動作し、Bash コマンドでファイルベースのタスクボードを操作する。
ワーカーは tmux ペインで永続ループとして起動し、タスクボードを監視して自律的にタスクを取得・実行する。

PM はワーカー実行中でも非同期的にタスク追加・方針変更・メッセージ送信が可能であり、
ユーザーも任意のタイミングで PM に介入できる。

```
User <-> Claude Code (= PM)
              |  Bash コマンド (team-start.ts)
              v
         Task Board (ファイルベース IPC)
              |  ポーリング読み取り
              v
         Member Agents (tmux ペイン、永続ループ)
              |  成果物保存 + <send> 通知
              v
         共有ディレクトリ (.orchestra-shared/{sessionId}/)
```

### データフロー

```
1. PM: init           → ボードディレクトリ + 共有ディレクトリ作成
2. PM: add-task ×N    → タスク JSON をボードに配置
3. PM: ensure-panes   → tmux ペインでワーカー永続ループ起動
4. Worker: poll       → findNextTask() でタスク取得
5. Worker: claimTask  → ファイルロックで排他的にタスクを確保
6. Worker: query()    → Agent SDK でタスク実行（セッション継続）
7. Worker: complete   → 結果を JSON に保存、<send> で他ワーカーに通知
8. Worker: review     → --review-by 指定時、レビュータスクを自動生成
9. PM: status         → 進捗をポーリング確認
10. PM: results       → 完了タスクの成果物を取得
11. PM: shutdown      → shutdown シグナル → ペイン kill → クリーンアップ
```

### ファイルベース IPC

全プロセス間通信はファイルシステム経由で行い、外部依存（Redis、MQ 等）は使わない。

| 機構 | 実装 | 目的 |
|------|------|------|
| アトミック書き込み | `tmp → rename` | 読み取り側が不完全な JSON を読まない |
| タスク排他制御 | `writeFileSync(lock, pid, { flag: 'wx' })` | 複数インスタンスの競合防止 |
| メッセージング | JSONL append + カーソルファイル | 非同期メッセージ配信 |
| 中央ログ | `messages.jsonl` | ワーカー間通信の可視化 |

### ボードディレクトリ構造

```
/tmp/orchestra-{sessionId}/
├── tasks/              # タスク JSON（1.json, 2.json, ...）
│   └── {id}.lock       # claimTask のファイルロック（一時的）
├── inbox/              # メッセージ JSONL
│   ├── {role}.jsonl    # ロール宛メッセージ
│   └── {role}.cursor   # 既読カーソル位置
├── sessions/           # Agent SDK セッション ID
│   └── {role}.txt      # resume 用
├── messages.jsonl      # 全メッセージの中央ログ
├── panes.json          # tmux ペイン ID 永続化
├── shared-dir.txt      # 共有ディレクトリパスへの参照
└── status.json         # { phase, nextTaskId }
```

### 共有ディレクトリ

```
.orchestra-shared/{sessionId}/
├── context-loader-project-context.md   ← コンテキストローダーの調査結果
├── se-architecture.md                  ← SE の設計書
├── backend-auth-api.ts                 ← backend の実装コード
├── frontend-login-form.tsx             ← frontend のコンポーネント
├── tester-test-plan.md                 ← tester のテスト計画
├── security_red-vulnerabilities.md     ← Red Team の脆弱性レポート
└── security_blue-defenses.md           ← Blue Team の防御策
```

- プロジェクトルート直下に `.orchestra-shared/` を作成（`CLAUDE_ALLOWED_DIR` 制約を回避するため `/tmp` ではなくプロジェクト内）
- `.gitignore` 対象
- ワーカーは成果物保存後、`<send to="ロール名">` で関連メンバーに通知

### レビューサイクル

`--review-by` 付きタスクが完了すると、`team-member.ts` の `handlePostCompletion()` が自動的にレビュータスクを生成する。

```
task (backend)  ──完了──>  review (se)  ──承認──>  終了
                                │
                       <request-changes>
                                │
                                v
                        revision (backend)  ──完了──>  review (se)  ──承認──>  終了
```

タスク種別（`taskType`）:
- `task` — 通常のタスク
- `review` — レビュータスク（自動生成）
- `revision` — 修正タスク（`<request-changes>` 時に自動生成）

### 複数インスタンス起動

同ロールのワーカーを複数起動して並列分担が可能。

```bash
bun src/team-start.ts ensure-panes --board $BOARD \
  --roles backend,backend,backend,se
# → backend-1, backend-2, backend-3, se が起動
```

- インスタンス ID: `backend-1`, `backend-2` 等（単一なら `se`）
- タスク取得は早い者勝ち（`claimTask()` のファイルロックで排他制御）
- メッセージはインスタンス ID 宛（`--to backend-1`）とベースロール宛（`--to backend`）の両方を受信

---

## Project モード（Layer 2/3、`/orchestrate` に統合）

### コンセプト

`/orchestrate` スラッシュコマンドで起動。Claude Code が Director として動作し、大規模な目標をフェーズに分解、
各フェーズで「計画ボード（プランナーワーカー）→ 実行ボード（通常ワーカー）」の2段階実行を行う。

前フェーズの結果が次フェーズの入力に自動的に含まれる（フィードフォワード）ため、
アジャイル的に設計→実装を繰り返しながら品質を高める。

### データフロー

```
User: "ECサイトを作って"
  │
  ▼
Director (Claude Code + /project SKILL.md)
  │  project-init → ProjectState 作成
  │  目標分析 → マスタープラン + フェーズ分解（3〜6フェーズ）
  │
  │  ── 各フェーズごとに繰り返し ──
  │    │
  │    ▼
  │  Stage 1: 計画ボード（Layer 2）
  │    │  init → 計画用ボード作成
  │    │  add-task → planner_* ワーカーにタスク追加
  │    │  ensure-panes → 6 プランナー起動
  │    │  [プランナーが <task-definitions> XML を出力]
  │    │  results → Director がプランナー出力を統合
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
  │  project-advance → 次フェーズへ（前フェーズ結果がインプットに）
  │
  ▼
全フェーズ完了 → 統合レポート
```

### プロジェクト状態管理

`project-board.ts` が team-board.ts と同じアトミック書き込みパターンでプロジェクト状態を管理する。

```
/tmp/project-{projectId}/
├── project.json              # ProjectState
├── master-plan.md            # マスタープラン
└── phases/
    ├── 1/
    │   ├── brief.md           # フェーズ概要
    │   ├── task-definitions.json  # プランナーが生成したタスク定義
    │   └── result.json        # フェーズ実行結果
    ├── 2/ ...
```

### プランナーロール

| Role ID | Emoji | 名前 | 生成するタスクの対象 |
|---------|-------|------|-------------------|
| `planner_codebase` | 📂 | コードベースプランナー | context_loader / researcher |
| `planner_research` | 🌐 | リサーチプランナー | researcher |
| `planner_ux` | 🎯 | UXプランナー | ui_ux / frontend |
| `planner_architecture` | 📐 | アーキテクチャプランナー | se / backend |
| `planner_ops` | 🔧 | 運用プランナー | backend（インフラ） |
| `planner_test` | ✅ | テストプランナー | tester |

各プランナーは `<task-definitions>` XML 形式でタスク定義を出力する:

```xml
<task-definitions>
  <task role="backend" priority="high" review-by="se">
    <title>認証API実装</title>
    <instruction>詳細な指示...</instruction>
    <blocked-by>1</blocked-by>
  </task>
</task-definitions>
```

### フィードフォワード

`getPhaseInputContext()` が各フェーズの入力コンテキストを構築する:

1. 元のプロジェクト目標
2. マスタープラン
3. 現フェーズの brief（スコープ、成功基準、期待される成果物）
4. 全完了フェーズの結果サマリー

これにより、前フェーズの成果が自然に次フェーズの計画に反映される。

### CLI サブコマンド（project-* 系）

| コマンド | 用途 |
|---------|------|
| `project-init --goal <goal>` | プロジェクト初期化、ProjectState 作成 |
| `project-status --project <dir>` | プロジェクト状態表示 |
| `project-set-phases --project <dir> --phases <json>` | フェーズ定義登録 |
| `project-save-plan --project <dir> --plan <text>` | マスタープラン保存 |
| `project-phase-context --project <dir> --phase <id>` | フェーズ入力コンテキスト取得 |
| `project-advance --project <dir>` | 次フェーズへ進む |
| `project-save-result --project <dir> --result <json>` | フェーズ結果保存 |
| `project-load-tasks --project <dir> --board <boardDir> --phase <id>` | タスク定義 → ボードにタスク追加 |
| `project-save-task-defs --project <dir> --phase <id> --definitions <json>` | タスク定義保存 |

---

## 7-Phase モード

固定パイプラインの単発実行。PM は LLM のシステムプロンプトとして機能する。

```bash
bun src/main.ts "ユーザー認証機能を設計して"
```

```
Phase 1: Researcher     → 調査・分析
Phase 2: PM (LLM)       → ワーカーロール選定（XML → パース）
Phase 3: PM (LLM)       → サブタスク分解・割り当て
Phase 4: Workers         → 並列実行（Promise.allSettled / tmux ペイン）
Phase 5: Q&A             → ワーカー間質問のルーティング・回答
Phase 6: PM (LLM)        → 全成果を統合レポートに集約
Phase 7: Feedback        → 各ワーカーの一人称視点振り返り
```

- Phase 4 では `process.env.TMUX` が設定されていれば tmux ペインで可視化
- セキュリティ委員会（`isDebate: true`）は 4 ラウンド討論（`debate.ts`）
- 1 ワーカーの失敗が全体を止めない（`Promise.allSettled`）

---

## Interactive PM モード

セッション継続型の対話的実行。フォローアップ質問が可能。

```bash
tmux
bun src/start.ts
> ユーザー認証機能を設計して
# ... 結果 ...
> セキュリティ面をもっと深掘りして
```

Agent SDK の `query()` + `resume` でセッションを継続し、文脈を保持したまま追加指示を処理する。

---

## 専門ワーカーロール

| Role ID | Emoji | 名前 | 担当領域 | 備考 |
|---------|-------|------|---------|------|
| `researcher` | 🔍 | リサーチャー | 調査・分析・要件明確化 | 7-Phase の Phase 1 専用 |
| `context_loader` | 📖 | コンテキストローダー | 作業対象リポジトリの技術スタック・規約・構造を調査し全ワーカーに共有 | `.orchestra-shared/00-context.md` に保存 |
| `se` | 🏗️ | システムエンジニア | アーキテクチャ設計・技術選定・非機能要件 | |
| `context_loader` | 📖 | コンテキストローダー | 作業対象リポジトリの技術スタック・規約・構造を調査し全ワーカーに共有 | `.orchestra-shared/00-context.md` に保存 |
| `frontend` | 🖥️ | フロントエンドエンジニア | React/Next.js・コンポーネント設計・状態管理・a11y | |
| `backend` | ⚙️ | バックエンドエンジニア | API設計・DB設計・認証・ビジネスロジック | |
| `tester` | 🧪 | テスター | テスト戦略・テストケース・品質保証 | |
| `ui_ux` | 🎨 | UI/UXデザイナー | ユーザビリティ・画面設計・アクセシビリティ | |
| `security_red` | 🔴 | セキュリティ Red Team | 攻撃者視点で脆弱性発見・攻撃シナリオ提示 | 独立ワーカー |
| `security_blue` | 🔵 | セキュリティ Blue Team | 防御者視点で対策提案・コストとリスク評価 | 独立ワーカー |
| `security_committee` | 🛡️ | セキュリティ委員会 | 4 ラウンド討論（Red→Blue→Red→議長） | 7-Phase 用、`isDebate: true` |
| `planner_codebase` | 📂 | コードベースプランナー | コードベース分析 → context_loader/researcher タスク生成 | Layer 2 |
| `planner_research` | 🌐 | リサーチプランナー | 技術調査計画 → researcher タスク生成 | Layer 2 |
| `planner_ux` | 🎯 | UXプランナー | UX設計 → ui_ux/frontend タスク生成 | Layer 2 |
| `planner_architecture` | 📐 | アーキテクチャプランナー | アーキテクチャ設計 → se/backend タスク生成 | Layer 2 |
| `planner_ops` | 🔧 | 運用プランナー | 運用設計 → backend タスク生成 | Layer 2 |
| `planner_test` | ✅ | テストプランナー | テスト設計 → tester タスク生成 | Layer 2 |

- PM はロール定義に含まれない。Team Board では Claude Code 自体、7-Phase/Interactive では LLM プロンプトとして機能
- 全ワーカー（researcher・security_committee 除く）は `<questions>` XML で他ワーカーへの質問を埋め込み可能
- Team Board モードでは `<send to="ロール名">` で他ワーカーにメッセージを送信可能

### セキュリティ討論

#### Team Board モード（推奨）: 独立ワーカー方式

Red Team と Blue Team を独立ワーカーとして起動し、タスク依存とレビューサイクル（`--review-by`）で討論を実現する。

```
security_red: 脆弱性分析
    | 完了 → review-by security_blue
security_blue: [レビュー] 脆弱性分析     ← handlePostCompletion() が自動生成
    | <request-changes> or 承認

security_blue: 防御策提案 (blocked-by red)
    | 完了 → review-by security_red
security_red: [レビュー] 防御策提案      ← handlePostCompletion() が自動生成
    | <request-changes> or 承認
```

双方向のレビューサイクルにより:
- Red Team: 「本当にそれで十分か？」
- Blue Team: 「過剰な指摘では？コストとリスクのバランスは？」

が自然にやり取りされ、承認されるまでラウンドが繰り返される。

#### 7-Phase モード: 4 ラウンド逐次討論

`debate.ts` が 4 ラウンドの討論を `callClaude()` の逐次呼び出しで実行する。

```
Round 1: 🔴 Red Team   — OWASP/CWE ベースの脆弱性分析
Round 2: 🔵 Blue Team  — 防御策提案（優先度・実装コスト付き）
Round 3: 🔴 Red Team   — 反論・残存リスクの指摘
Round 4: ⚖️ 議長       — 合意形成（リスク・対策・未解決論点・評価 A-D）
```

各ラウンドは前ラウンドの出力をコンテキストに含め、ラウンドあたり最大 5 分（300,000ms）のタイムアウト。

---

## LLM 呼び出しの仕組み

### Agent SDK（デフォルト）

全ての LLM 呼び出しは `claude-sdk.ts` → `@anthropic-ai/claude-agent-sdk` の `query()` API を経由する。

```typescript
query({
  prompt: userPrompt,
  options: {
    systemPrompt: { type: 'preset', preset: 'claude_code', append: systemPrompt },
    model: 'claude-sonnet-4-6',
    maxTurns: 1,          // 7-Phase: 1, Team Board ワーカー: 20
    permissionMode: '...', // 7-Phase: 'dontAsk', Team Board: 'acceptEdits'
    persistSession: false, // 7-Phase: false, Team Board: true（resume 対応）
  },
})
```

| 用途 | maxTurns | permissionMode | persistSession | resume |
|------|----------|---------------|----------------|--------|
| 7-Phase ワーカー | 1 | `dontAsk` | false | なし |
| Team Board ワーカー | 20 | `acceptEdits` | true | セッション ID |
| Interactive PM | 20 | `acceptEdits` | true | セッション ID |

- API キー不要 — Claude Code のサブスクリプション認証を利用
- Team Board ワーカーは `acceptEdits` でファイル操作が可能（コード生成・ドキュメント保存）
- `persistSession: true` + `resume` でセッションを跨いだ文脈継続

### CLI フォールバック

`USE_LEGACY_CLI=1` 環境変数で `claude -p` CLI spawn 版（`claude-cli.legacy.ts`）に切り替え可能。
`claude-cli.ts` がアダプターとして SDK 版と CLI 版を切り替える。

---

## 各モジュールの責務と依存関係

| ファイル | 責務 |
|---------|------|
| `src/team-start.ts` | Team Board + Project CLI サブコマンドルーター |
| `src/team-member.ts` | tmux ペイン内の永続ワーカーループ（poll → claim → execute → review cycle） |
| `src/team-board.ts` | ファイルベースのタスクボード + インボックス + ペイン ID 永続化 + セッション ID 永続化 |
| `src/project-board.ts` | プロジェクト状態管理（フェーズ、マスタープラン、タスク定義、フィードフォワード） |
| `src/project-types.ts` | Layer 2/3 型定義（ProjectState, PhaseBrief, PhaseResult, TaskDefinition） |
| `src/main.ts` | 7-Phase CLI エントリポイント + フェーズ制御 |
| `src/start.ts` | Interactive PM エントリポイント（readline + query/resume） |
| `src/types.ts` | 7-Phase 用共有型定義（Subtask, WorkerResult, etc.） |
| `src/roles.ts` | ワーカーロール定義（名前・emoji・systemPrompt）+ PM プロンプト群 |
| `src/claude-sdk.ts` | Agent SDK ラッパー（`query()` + タイムアウト + エラーハンドリング） |
| `src/claude-cli.ts` | SDK/CLI アダプター（`USE_LEGACY_CLI=1` で切り替え） |
| `src/claude-cli.legacy.ts` | CLI spawn 版（`claude -p` 子プロセス） |
| `src/agents.ts` | Agent SDK 用エージェント定義 |
| `src/orchestrator.ts` | 7-Phase の Phase 1-3, 5 制御 |
| `src/worker.ts` | 7-Phase の Phase 4 並列実行 |
| `src/worker-pane.ts` | 7-Phase の tmux ペイン用ワーカースクリプト |
| `src/synthesizer.ts` | 7-Phase の Phase 6 統合レポート生成 |
| `src/feedback.ts` | 7-Phase の Phase 7 フィードバック MD 生成 |
| `src/debate.ts` | セキュリティ 4 ラウンド討論ロジック |
| `src/debate-pane.ts` | 7-Phase の tmux ペイン用討論スクリプト |

### 依存グラフ

```
Project モード:
  team-start.ts ──→ project-board.ts ──→ project-types.ts
                ──→ team-board.ts ──→ roles.ts

Team Board モード:
  team-start.ts ──→ team-board.ts ──→ roles.ts
  team-member.ts ──→ team-board.ts
                 ──→ roles.ts
                 ──→ @anthropic-ai/claude-agent-sdk (query)
                 ──→ debate.ts (security_committee のみ)

7-Phase モード:
  main.ts
    ├── orchestrator.ts ──→ claude-cli.ts ──→ claude-sdk.ts ──→ @anthropic-ai/claude-agent-sdk
    ├── worker.ts ────────→ claude-cli.ts
    │     ├── debate.ts ──→ claude-cli.ts
    │     ├── worker-pane.ts → claude-cli.ts
    │     └── debate-pane.ts → debate.ts
    ├── synthesizer.ts ───→ claude-cli.ts
    └── feedback.ts ──────→ claude-cli.ts

Interactive PM モード:
  start.ts ──→ @anthropic-ai/claude-agent-sdk (query + resume)
           ──→ roles.ts
```

---

## ファイル構成

```
claude-multi-agent/
├── src/
│   ├── team-start.ts          # Team Board + Project CLI サブコマンドルーター
│   ├── team-member.ts         # tmux ペイン内の永続ワーカーループ
│   ├── team-board.ts          # ファイルベースのタスクボード + IPC
│   ├── project-board.ts       # プロジェクト状態管理（Layer 2/3）
│   ├── project-types.ts       # Layer 2/3 型定義
│   ├── main.ts                # 7-Phase エントリポイント
│   ├── start.ts               # Interactive PM エントリポイント
│   ├── types.ts               # 7-Phase 共有型定義
│   ├── roles.ts               # ワーカーロール定義 + PM プロンプト群
│   ├── claude-sdk.ts          # Agent SDK ラッパー
│   ├── claude-cli.ts          # SDK/CLI アダプター
│   ├── claude-cli.legacy.ts   # CLI spawn 版フォールバック
│   ├── agents.ts              # Agent SDK エージェント定義
│   ├── orchestrator.ts        # 7-Phase Phase 1-3, 5
│   ├── worker.ts              # 7-Phase Phase 4 並列実行
│   ├── worker-pane.ts         # 7-Phase tmux ペインスクリプト
│   ├── synthesizer.ts         # 7-Phase Phase 6 統合レポート
│   ├── feedback.ts            # 7-Phase Phase 7 フィードバック
│   ├── debate.ts              # セキュリティ 4 ラウンド討論
│   └── debate-pane.ts         # 7-Phase tmux ペイン用討論スクリプト
├── docs/
│   ├── architecture.md        # 本ファイル
│   ├── claude/
│   │   ├── hooks.md           # Claude Code Hooks 活用ガイド
│   │   └── skills.md          # Skills 拡張ガイド
│   └── integrations/
│       ├── slack-human-in-the-loop.md
│       └── discord-human-in-the-loop.md
├── agents/                    # Claude Code エージェント定義（10の .md ファイル）
├── skills/
│   ├── analyze/               # /analyze スラッシュコマンド（サブエージェント方式）
│   └── orchestrate/           # /orchestrate スラッシュコマンド（tmux + タスクボード、Layer 2/3）
├── hooks/
│   └── hooks.json             # PreToolUse / PostToolUse フック定義
├── scripts/                   # フック用シェルスクリプト
├── rules/
│   └── common/                # 共有コーディングルール
├── .claude-plugin/
│   ├── plugin.json            # プラグインマニフェスト
│   └── marketplace.json       # マーケットプレイスメタデータ
├── .claude/
│   └── settings.json          # 権限設定
├── CLAUDE.md                  # プロジェクトルール
├── .orchestra-shared/         # ワーカー間成果物共有（.gitignore 対象）
├── package.json
├── tsconfig.json
└── .gitignore
```

---

## 技術スタック

| 技術 | バージョン / 設定 | 用途 |
|------|-----------------|------|
| **TypeScript** | ES2023 / NodeNext / strict | 全ソースコード |
| **@anthropic-ai/claude-agent-sdk** | ^0.2.66 | LLM 呼び出し（`query` + `resume`） |
| **Bun** | ^1.3 | TypeScript ネイティブ実行（高速ランタイム） |
| **tmux** | — | 並列ペイン管理・可視化 |
| **ファイルベース IPC** | — | アトミック書き込み（tmp → rename）、ファイルロック排他制御 |

### 設計上の特徴

| 特徴 | 説明 |
|------|------|
| **API キー不要** | Agent SDK 経由で Claude Code サブスクリプションを利用 |
| **外部依存ゼロの IPC** | Redis・MQ 等を使わず、ファイルシステムのみでプロセス間通信 |
| **自律的ワーカー** | Team Board ワーカーは永続ループでタスクを自律取得・実行 |
| **レビューサイクル自動化** | `--review-by` で完了時に自動レビュー → 修正 → 再レビューの連鎖 |
| **排他的タスク取得** | ファイルロック（`wx` フラグ）で複数インスタンスの競合を安全に制御 |
| **セッション継続** | `persistSession` + `resume` でワーカーの文脈を跨ぎタスク間で保持 |
| **PM の非同期介入** | CLI サブコマンドにより、ワーカー実行中でもタスク追加・方針変更が可能 |
| **独立ワーカー型セキュリティ討論** | Red/Blue Team を個別ワーカーとして起動し、レビューサイクルで自然な討論を実現 |

---

## セーフガード

### PreToolUse フック（`hooks/hooks.json` + `scripts/`）

Claude Code の PreToolUse フックで危険な操作を実行前にブロックする。
`hooks/hooks.json` でフック定義を宣言し、`scripts/` 配下のシェルスクリプトを呼び出す。

| フック | ファイル | 制限内容 |
|--------|---------|---------|
| Git 制限 | `restrict-git.sh` | `git commit`, `git push` をブロック。ユーザーに手動実行を依頼 |
| 破壊的操作制限 | `restrict-destructive.sh` | `rm -rf` をブロック。削除が必要な場合はユーザーに確認 |
| ワークディレクトリ制限 | `restrict-workdir.sh` | `CLAUDE_ALLOWED_DIR` 環境変数が設定されている場合、そのディレクトリ外への `cd`, `mv`, `cp`, `rm`, `touch`, `mkdir` をブロック |

フックの判定結果:
- `exit 0` + 空の出力 → 許可
- `exit 2` + JSON `{"decision": "block", "reason": "..."}` → ブロック（ツール実行を中止）

### 権限設定（`.claude/settings.json`）

> 注意: `.claude/settings.json` はプラグインとして配布されない（開発者のローカル設定）。プラグイン利用者は自身の設定で権限を管理する。

```json
{
  "permissions": {
    "allow": [
      "Bash(bun src/team-start.ts *)",
      "Bash(*$BOARD*)",
      "Bash(*$PROJECT*)",
      "Read(*)",
      "Read(!**/.env*)",
      "Read(!**/credentials*)",
      "Read(!**/secrets*)"
    ]
  }
}
```

- Team Board / Project 関連の Bash コマンドを事前許可
- 機密ファイル（`.env`, `credentials`, `secrets`, `*.key`, `*.pem` 等）の読み取りを拒否

### CI/CD — main ブランチ保護

`.github/workflows/protect-main.yml` により、オーナー未承認の merge を自動リバートする。

```
PR merged to main
  │
  ▼
GitHub Actions: check-approval
  │  reviews = listReviews(PR)
  │  ownerApproved = reviews.some(r => r.user === 'akbttytnkr' && r.state === 'APPROVED')
  │
  ├── ownerApproved → Merge is valid（何もしない）
  │
  └── !ownerApproved → 自動リバート
        │  git.updateRef('heads/main', base.sha, force: true)
        │  issues.createComment("リバートしました")
        └── core.setFailed()
```

- トリガー: `pull_request_target` の `closed`（merge 時）
- リバート方法: `main` の ref を PR のベース SHA に force update
- 通知: PR にコメントで再スクリーニング要求
