---

# Python + vLLM Local LLM マルチエージェントオーケストレーションシステム アーキテクチャ設計書

**文書バージョン**: 1.0.0
**作成日**: 2026-03-06
**対象プロジェクト**: vllm-multi-agent（新規）
**移植元**: claude-multi-agent（TypeScript + Claude Agent SDK）

---

## 1. システム概要と設計思想

### 1.1 システム概要

vllm-multi-agent は、複数の専門 AI ワーカーを協調させるマルチエージェント・オーケストレーションシステムである。TypeScript + Claude Agent SDK で構築された claude-multi-agent の設計思想とコア機能を Python + vLLM に移植し、ローカル LLM 環境で完全に自律動作することを目的とする。

Anthropic API への依存を排除し、オンプレミスまたはセルフホスト環境で推論エンジンを動かすことで、プライバシー要件の高い組織や API コスト削減を求めるケースに対応する。

### 1.2 設計思想

**継承する設計原則（移植元から）**

| 原則 | 内容 |
|------|------|
| 外部依存ゼロの IPC | Redis・MQ を使わずファイルシステムのみでプロセス間通信を行う |
| 自律的ワーカー | ワーカーは永続ループで自律的にタスクを取得・実行する |
| レビューサイクル自動化 | タスク完了後に自動でレビュー → 修正 → 再レビューの連鎖を生成する |
| PM の非同期介入 | ワーカー実行中でも PM がタスク追加・方針変更できる |
| フィードフォワード | 前フェーズの結果が次フェーズの入力コンテキストに自動含有される |
| セキュリティ討論 | Red → Blue → Red → Consensus の 4 ラウンド討論で脆弱性を網羅的に評価する |

**ローカル LLM 向けの新規設計原則**

| 原則 | 内容 |
|------|------|
| バックエンド抽象化 | vLLM / Ollama を同一インターフェースで切り替えられる |
| 構造化出力の強制 | response_format（vLLM）または JSON モードで出力形式を機械的に保証する。Scratchpad パターンで推論品質を維持 |
| フォールバック設計 | JSON パース失敗時は最大 3 回再試行し、デフォルト値で継続する |
| 耐障害パターン | Circuit Breaker（連続失敗時の遮断）+ Bulkhead（並列度制限）で LLM バックエンドを保護 |
| タイムアウトの可変化 | 推論速度がモデルとハードウェアに依存するため、全タイムアウトを環境変数で制御する |
| コンテキスト圧縮 | ローカルモデルのコンテキスト長制限に対応するためプリプロセス圧縮を行う |

### 1.3 移植範囲

```
claude-multi-agent (TypeScript)       vllm-multi-agent (Python)
─────────────────────────────         ──────────────────────────────
Claude Agent SDK query()         →    LLMClient (vLLM / Ollama)
roles.ts (ロール定義)            →    roles/  (YAML ファイル群)
XML 構造化出力                   →    JSON モード + guided_json
team-board.ts (IPC)              →    board/  (アトミック書き込み + filelock)
team-member.ts (ワーカーループ)  →    worker/member.py (asyncio ループ)
team-start.ts (CLI)              →    cli/main.py (Typer)
orchestrator.ts (7-Phase)        →    orchestrator/ (7-Phase)
debate.ts (セキュリティ討論)     →    debate/ (4 ラウンド)
project-board.ts (Layer 2/3)     →    project/ (フェーズ管理)
```

---

## 2. 技術選定と根拠

### 2.1 技術スタック一覧

| カテゴリ | 技術 | バージョン | 根拠 |
|---------|------|-----------|------|
| **言語** | Python | 3.12+ | asyncio の成熟、型ヒント強化、tomllib 標準化 |
| **推論エンジン（本番）** | vLLM | 0.15.x+ | OpenAI 互換 API、`response_format` structured outputs、PagedAttention、Async scheduling |
| **推論エンジン（本番候補）** | SGLang | 0.4.x+ | 構造化出力高速（XGrammar統合）、RadixAttention によるプレフィックスキャッシュ効率 |
| **推論エンジン（開発）** | Ollama | 0.3.x+ | セットアップ容易、OpenAI 互換 API |
| **HTTP クライアント** | openai (Python SDK) | 1.x | OpenAI 互換 API を統一的に呼び出す |
| **非同期処理** | asyncio | stdlib | プロセス内タスク並列化 |
| **IPC（プロセス間）** | ファイルベース | — | 外部依存ゼロ、移植元と同一パターン |
| **ファイルロック** | filelock | 3.x | クロスプラットフォームな排他制御 |
| **CLI** | Typer | 0.12.x | 型ヒントベース、自動補完、サブコマンド対応 |
| **YAML** | PyYAML | 6.x | ロール定義の外部化 |
| **設定管理** | python-dotenv + Pydantic Settings | 2.x | 型安全な環境変数バリデーション |
| **ロギング** | structlog | 24.x | 構造化ログ、JSON 出力対応 |
| **テスト** | pytest + pytest-asyncio | — | 非同期テスト対応 |
| **JSON スキーマ** | Pydantic | 2.x | guided_json スキーマ生成、バリデーション |
| **プロセス管理** | tmux (外部) | — | 並列ペイン管理（移植元と同一） |

### 2.2 vLLM 選定根拠

vLLM は以下の理由で本番推論エンジンの第一候補として採用する。SGLang を第二候補として評価し、Phase 5 のベンチマークで最終決定する。

- **OpenAI 互換 API**: `openai` Python SDK をそのまま利用でき、コードの差異を最小化できる
- **Structured Outputs (`response_format`)**: JSON スキーマを指定した制約付き生成（Constrained Decoding / XGrammar）により、ローカル LLM のフォーマット遵守問題を根本解決できる。旧 `guided_json` パラメータは非推奨化が進行中のため、`response_format={"type": "json_schema", ...}` を使用する
- **PagedAttention**: VRAM 効率が高く、複数ワーカーの並列推論に適している
- **バッチ処理**: Continuous Batching で複数リクエストを効率的に処理できる

### 2.3 SGLang 評価候補根拠

SGLang を vLLM の代替候補として Phase 5 ベンチマークで比較評価する。

- **構造化出力の高速性**: XGrammar 統合により、構造化出力のバッチ処理で vLLM の約5倍のスループット（4,200 vs 820 tok/s）を達成
- **RadixAttention**: プレフィックスキャッシュの再利用効率が vLLM の APC を上回り、マルチロールの共通システムプロンプトで特に有効
- **OpenAI 互換 API**: `base_url` 切り替えのみで vLLM と同一コードで動作

### 2.4 Ollama 選定根拠（開発環境）

- セットアップが `ollama serve` コマンド一本で完結する
- OpenAI 互換エンドポイント（`/v1/chat/completions`）を提供しており、vLLM との切り替えがゼロコードで可能
- JSON モード（`format: "json"`）で structured output に対応する

### 2.5 Typer 選定根拠

移植元の `team-start.ts` は `tsx` で直接実行するスクリプトだったが、Typer を採用することで以下を実現する。

- 型ヒントからサブコマンドと引数を自動定義できる
- `--help` の自動生成
- Click ベースのため拡張性が高い

---

## 3. レイヤー構造

### 3.1 4 層アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: プロジェクト計画・フェーズ分解                          │
│  Director (CLI) → マスタープラン → PhaseBrief[]                  │
│  project/ モジュール                                              │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: メタタスク（設計 + タスク定義生成）                      │
│  Planner ワーカー群 → TaskDefinition[]                            │
│  planner_* ロール (YAML)                                          │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: タスク実行（レビューサイクル含む）                        │
│  Worker ループ → 成果物 + PhaseResult                             │
│  worker/ モジュール + board/ モジュール                            │
├─────────────────────────────────────────────────────────────────┤
│  LLM バックエンド抽象化層                                          │
│  LLMClient (vLLM / Ollama) + guided_json + 再試行ロジック          │
│  llm/ モジュール                                                   │
└─────────────────────────────────────────────────────────────────┘
```

| Layer | 責務 | 入力 | 出力 |
|-------|------|------|------|
| Layer 3 | 目標 → マスタープラン → フェーズ分解 | ユーザーの目標 | `PhaseBrief[]` |
| Layer 2 | フェーズ → 実行タスク定義生成 | `PhaseBrief` + フィードフォワード | `TaskDefinition[]` |
| Layer 1 | タスク実行 + レビューサイクル | `TaskDefinition[]` | 成果物 + `PhaseResult` |
| LLM 抽象化 | バックエンド切り替え + 構造化出力 | プロンプト + JSON スキーマ | 型付き応答オブジェクト |

---

## 4. コンポーネント図（ASCII art）

### 4.1 システム全体図

```
┌──────────────────────────────────────────────────────────────────────┐
│                        vllm-multi-agent                              │
│                                                                      │
│  ┌─────────────┐    CLI コマンド     ┌─────────────────────────────┐ │
│  │    User     │ ─────────────────> │     cli/main.py (Typer)     │ │
│  └─────────────┘                   │  init / add-task /           │ │
│                                    │  ensure-panes / status /     │ │
│                                    │  results / shutdown          │ │
│                                    └──────────┬──────────────────┘ │
│                                               │                     │
│                          ┌────────────────────▼──────────────┐      │
│                          │   board/ (Task Board)             │      │
│                          │   ファイルベース IPC                │      │
│                          │   {BOARD_BASE_DIR}/orchestra-{id}  │      │
│                          │   tasks/ inbox/ sessions/         │      │
│                          └──┬───────────────────────────┬───┘      │
│                             │ ポーリング                 │ 書き込み   │
│              ┌──────────────▼──────────────┐            │          │
│              │  worker/member.py           │            │          │
│              │  永続 asyncio ループ         │            │          │
│              │  poll → claim → execute     │            │          │
│              │  → review cycle             │            │          │
│              └──────────────┬──────────────┘            │          │
│                             │                           │          │
│              ┌──────────────▼──────────────┐            │          │
│              │  orchestrator/ (7-Phase)    │            │          │
│              │  research → select →        │            │          │
│              │  plan → execute → QA →     │            │          │
│              │  synthesize → feedback      │            │          │
│              └──────────────┬──────────────┘            │          │
│                             │                           │          │
│              ┌──────────────▼──────────────┐            │          │
│              │   llm/ (LLMClient)          │            │          │
│              │   vLLM / Ollama 切り替え     │            │          │
│              │   guided_json + 再試行       │            │          │
│              └──────────────┬──────────────┘            │          │
│                             │                           │          │
│         ┌───────────────────┼───────────────────┐       │          │
│         │                   │                   │       │          │
│  ┌──────▼──────┐   ┌───────▼──────┐   ┌────────▼────┐  │          │
│  │  vLLM       │   │  Ollama      │   │  その他      │  │          │
│  │  :8000      │   │  :11434      │   │  (将来拡張)  │  │          │
│  │  guided_json│   │  format:json │   │              │  │          │
│  └─────────────┘   └─────────────┘   └─────────────┘  │          │
│                                                         │          │
│  ┌──────────────────────────────────────────────────────▼────────┐ │
│  │  .orchestra-shared/{sessionId}/   (成果物共有ディレクトリ)     │ │
│  │  context-loader.md / se-arch.md / backend-api.py / ...        │ │
│  └───────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 実行モード別コンポーネント

```
[Orchestrate モード]                    [Team Board モード]
User                                    User
  │                                       │
  ▼                                       ▼
PM (CLI process)                        PM (CLI process / 別ターミナル)
  │ asyncio.gather                         │ Bash サブコマンド
  ▼                                       ▼
researcher (LLM call)               Task Board (ファイル IPC)
  │ 結果をコンテキストに含め                 │ ポーリング (1 sec)
  ├── se (LLM call)           ┌────────────▼────────────────────────┐
  ├── programmer (LLM call)   │ Worker 1  Worker 2  Worker 3  ...  │
  ├── tester (LLM call)       │ (tmux pane, 永続 asyncio ループ)    │
  └── ui_ux (LLM call)        └─────────────────────────────────────┘
        │
  security_red → security_blue → security_red → security_consensus
        │
  統合レポート (Markdown)

[Project モード]
User
  │
  ▼
Director (CLI)
  ├── Phase 1
  │     ├── Stage 1: 計画ボード (planner_* ワーカー)
  │     └── Stage 2: 実行ボード (通常ワーカー + レビューサイクル)
  ├── Phase 2 (前フェーズ結果をフィードフォワード)
  │     └── ...
  └── Phase N → 統合レポート
```

---

## 5. データフロー

### 5.1 Team Board モードのデータフロー

```
1. PM: vllm-agent init --session my-session
   └─> $BOARD_BASE_DIR/orchestra-my-session/ ディレクトリ作成
       tasks/, inbox/, sessions/ サブディレクトリ作成
       status.json = {"phase": "init", "next_task_id": 1}

2. PM: vllm-agent add-task --board $BOARD_BASE_DIR/orchestra-my-session \
       --role programmer --title "認証API実装" --instruction "..."
   └─> tasks/1.json アトミック書き込み
       {"id": 1, "role": "programmer", "status": "pending", ...}

3. PM: vllm-agent ensure-panes --board $BOARD_BASE_DIR/orchestra-my-session \
       --roles programmer,se,tester
   └─> tmux new-window → python -m vllm_agent.worker.member --board ... --role programmer
       panes.json = {"programmer": "tmux-pane-id-1", ...}

4. Worker: asyncio ループ開始
   └─> poll_next_task() → tasks/ を走査し status=pending を取得
       claim_task()     → tasks/1.lock を O_EXCL 作成（排他的取得）
       execute_task()   → LLMClient.chat(system, user) 呼び出し
                          vLLM guided_json でフォーマット保証

5. Worker: タスク完了
   └─> tasks/1.json アトミック更新 → status=done, output=...
       .orchestra-shared/{session}/programmer-auth-api.py 保存
       inbox/se.jsonl に <send> メッセージ追記

6. Worker: レビュータスク自動生成（--review-by se 付きの場合）
   └─> tasks/2.json = {role: se, task_type: review, blocked_by: None, ...}

7. PM: vllm-agent status --board $BOARD_BASE_DIR/orchestra-my-session
   └─> tasks/ を走査し進捗表示

8. PM: vllm-agent results --board $BOARD_BASE_DIR/orchestra-my-session
   └─> 全完了タスクの output を取得・表示

9. PM: vllm-agent shutdown --board $BOARD_BASE_DIR/orchestra-my-session
   └─> shutdown シグナルファイル作成
       Worker が検知して graceful 終了
       tmux ペイン kill
       {BOARD_BASE_DIR}/orchestra-{session}/ クリーンアップ
```

### 5.2 7-Phase モードのデータフロー

```
Phase 1: Research
  入力: ユーザータスク (str)
  処理: LLMClient.chat(researcher_prompt, task)
  出力: research_result (str)

Phase 2: Worker 選定
  入力: task + research_result
  処理: LLMClient.chat_structured(pm_selection_prompt, ..., schema=TeamSelectionSchema)
  出力: TeamSelection(members=[{role, reason}, ...])

Phase 3: サブタスク計画
  入力: task + research_result + team_selection
  処理: LLMClient.chat_structured(pm_planning_prompt, ..., schema=OrchestratorOutputSchema)
  出力: OrchestratorOutput(plan, subtasks=[Subtask(id, role, title, instruction), ...])

Phase 4: 並列実行
  入力: subtasks[]
  処理: asyncio.gather(*[execute_worker(s) for s in subtasks])
        各 execute_worker → LLMClient.chat(role_prompt, task+instruction)
  出力: WorkerResult[] (output, status, duration_ms)

Phase 5: Q&A ルーティング
  入力: 各ワーカー出力中の questions フィールド
  処理: LLMClient.chat_structured(pm_routing_prompt, ..., schema=RoutesSchema)
  出力: QuestionRoute[]

Phase 6: 統合レポート
  入力: all WorkerResult[]
  処理: LLMClient.chat_structured(pm_synthesizer_prompt, ..., schema=SynthesisSchema)
  出力: SynthesisResult(summary, full_report)

Phase 7: フィードバック
  入力: WorkerResult[]
  処理: 各ワーカーロールで LLMClient.chat(role_prompt, feedback_prompt)
  出力: feedback/*.md ファイル群
```

### 5.3 Project モードのデータフロー（フィードフォワード込み）

```
入力: goal = "ECサイトを構築して"

Step 1: project-init
  {BOARD_BASE_DIR}/project-{id}/project.json 作成
  {"id": "...", "goal": "...", "current_phase": 0, "phases": [], ...}

Step 2: フェーズ分解
  LLMClient.chat_structured(director_prompt, goal, schema=MasterPlanSchema)
  → master-plan.md 保存
  → phases/1/brief.md, phases/2/brief.md, ... 保存
  ※ フェーズ間の依存関係は線形（N→N+1）がデフォルト。
    将来的に DAG 依存（例: Phase 2,3 を並列→ Phase 4 で合流）に拡張可能。
    PhaseBrief に optional な depends_on: list[int] フィールドを予約。

Step 3: 各フェーズ実行（繰り返し）

  [Phase N 入力コンテキスト構築 = get_phase_input_context(n)]
    - 元のプロジェクト目標
    - マスタープラン
    - 現フェーズの brief（スコープ、成功基準、期待成果物）
    - Phase 1 〜 N-1 の result.json サマリー  ← フィードフォワード

  Stage 1: 計画ボード
    add-task → planner_codebase, planner_architecture, planner_test, ...
    ensure-panes → 6 プランナー起動
    [プランナーが task_definitions: TaskDefinition[] を JSON 出力]
    results → task-definitions.json 保存
    ※ プランナー失敗時: 成功したプランナーの出力のみで統合（graceful degradation）

  Stage 2: 実行ボード
    project-load-tasks → task-definitions.json からタスク追加
    ensure-panes → 通常ワーカー起動
    [ワーカー実行 + レビューサイクル]
    results → PhaseResult 取得
    project-save-result → phases/N/result.json 保存

  ユーザー確認: "Phase N 完了。次のフェーズに進みますか？"
  project-advance → current_phase++

Step 4: 全フェーズ完了 → 統合レポート生成
```

---

## 6. モジュール構成

```
vllm-multi-agent/
├── vllm_agent/                      # メインパッケージ
│   ├── __init__.py
│   │
│   ├── cli/                         # CLI エントリポイント
│   │   ├── __init__.py
│   │   ├── main.py                  # Typer ルーター (board / project / run)
│   │   ├── board_commands.py        # init / add-task / ensure-panes / status / results / shutdown
│   │   └── project_commands.py      # project-init / project-advance / project-save-result / ...
│   │
│   ├── llm/                         # LLM バックエンド抽象化層
│   │   ├── __init__.py
│   │   ├── client.py                # LLMClient 基底クラス + ファクトリ
│   │   ├── vllm_client.py           # vLLM バックエンド (response_format)
│   │   ├── sglang_client.py         # SGLang バックエンド (VLLMClient 継承)
│   │   ├── ollama_client.py         # Ollama バックエンド (format: json)
│   │   ├── retry.py                 # 再試行ロジック + フォールバック
│   │   ├── circuit_breaker.py       # Circuit Breaker パターン
│   │   ├── bulkhead.py              # Bulkhead パターン (asyncio.Semaphore)
│   │   ├── scratchpad.py            # Scratchpad パターン (thinking フィールド)
│   │   └── schema.py                # Pydantic モデル → JSON スキーマ変換
│   │
│   ├── roles/                       # ロール定義 (YAML)
│   │   ├── loader.py                # YAML ローダー + キャッシュ
│   │   ├── base/
│   │   │   ├── researcher.yaml
│   │   │   ├── context_loader.yaml
│   │   │   ├── se.yaml
│   │   │   ├── programmer.yaml
│   │   │   ├── frontend.yaml
│   │   │   ├── backend.yaml
│   │   │   ├── tester.yaml
│   │   │   └── ui_ux.yaml
│   │   ├── security/
│   │   │   ├── security_red.yaml
│   │   │   ├── security_blue.yaml
│   │   │   └── security_consensus.yaml
│   │   └── planner/
│   │       ├── planner_codebase.yaml
│   │       ├── planner_research.yaml
│   │       ├── planner_ux.yaml
│   │       ├── planner_architecture.yaml
│   │       ├── planner_ops.yaml
│   │       └── planner_test.yaml
│   │
│   ├── board/                       # ファイルベース IPC
│   │   ├── __init__.py
│   │   ├── task_board.py            # タスクボード操作 (CRUD + ロック)
│   │   ├── inbox.py                 # JSONL メッセージング + カーソル
│   │   ├── pane_manager.py          # tmux ペイン管理
│   │   └── atomic.py               # アトミック書き込みユーティリティ
│   │
│   ├── worker/                      # ワーカー実行
│   │   ├── __init__.py
│   │   ├── member.py               # 永続 asyncio ループ (poll → claim → execute)
│   │   ├── review_cycle.py         # レビューサイクル (task → review → revision)
│   │   └── context.py              # コンテキスト圧縮 (トークン制限対応)
│   │
│   ├── orchestrator/               # 7-Phase モード
│   │   ├── __init__.py
│   │   ├── pipeline.py             # Phase 1-7 制御
│   │   ├── researcher.py           # Phase 1: リサーチ
│   │   ├── planner.py              # Phase 2-3: ワーカー選定 + サブタスク計画
│   │   ├── executor.py             # Phase 4: 並列実行
│   │   ├── qa_router.py            # Phase 5: Q&A ルーティング
│   │   ├── synthesizer.py          # Phase 6: 統合レポート
│   │   └── feedback.py             # Phase 7: フィードバック MD
│   │
│   ├── debate/                     # セキュリティ討論
│   │   ├── __init__.py
│   │   └── debate_runner.py        # 4 ラウンド討論 (Red→Blue→Red→Consensus)
│   │
│   ├── project/                    # Project モード (Layer 2/3)
│   │   ├── __init__.py
│   │   ├── project_board.py        # プロジェクト状態管理
│   │   ├── feedforward.py          # フィードフォワードコンテキスト構築
│   │   └── types.py                # ProjectState, PhaseBrief, PhaseResult, TaskDefinition
│   │
│   ├── types.py                    # 共有型定義 (Pydantic モデル)
│   └── config.py                   # 設定管理 (Pydantic Settings)
│
├── roles/                          # ロール YAML 本体 (vllm_agent/roles/ のエイリアス)
├── tests/
│   ├── unit/
│   │   ├── test_llm_client.py
│   │   ├── test_task_board.py
│   │   ├── test_retry.py
│   │   └── test_review_cycle.py
│   └── integration/
│       ├── test_7phase_pipeline.py
│       └── test_team_board.py
├── pyproject.toml                  # パッケージ定義 + 依存関係
├── .env.example                    # 環境変数テンプレート
└── README.md
```

---

## 7. IPC 設計（ファイルベース + asyncio の二層構造）

### 7.1 設計方針

プロセス間通信はファイルシステムを唯一の共有状態とする。外部ミドルウェア（Redis、RabbitMQ 等）への依存は持たない。これはネットワーク障害や外部サービス停止によるシステム全体の停止リスクを排除するためである。

プロセス内の非同期処理には `asyncio.Queue` を使用し、ポーリング間隔を抑制する。

### 7.2 二層 IPC 構造

```
┌─────────────────────────────────────────────────┐
│          Layer A: プロセス内 (asyncio)            │
│                                                  │
│  asyncio.Queue         asyncio.Event             │
│  └─ ワーカー内部の      └─ shutdown シグナル      │
│     タスクキュー           の通知                 │
│  (ポーリングを抑制)                               │
└───────────────────────┬─────────────────────────┘
                        │ ファイルシステム経由
┌───────────────────────▼─────────────────────────┐
│          Layer B: プロセス間 (ファイル)            │
│                                                  │
│  tasks/{id}.json       アトミック書き込み          │
│  tasks/{id}.lock       filelock 排他制御          │
│  inbox/{role}.jsonl    JSONL メッセージ追記        │
│  inbox/{role}.cursor   既読カーソル               │
│  messages.jsonl        全メッセージ中央ログ        │
│  panes.json            tmux ペイン ID 永続化      │
│  sessions/{role}.txt   セッション ID 永続化        │
│  status.json           ボード状態                 │
│  shutdown              シャットダウンシグナル      │
└─────────────────────────────────────────────────┘
```

### 7.3 タスクボードディレクトリ構造

```
{BOARD_BASE_DIR}/orchestra-{sessionId}/
# BOARD_BASE_DIR = $XDG_RUNTIME_DIR（推奨）または /tmp（フォールバック）
├── tasks/
│   ├── 1.json           # {"id": 1, "role": "programmer", "status": "pending", ...}
│   ├── 1.lock           # claimTask のファイルロック（一時的、完了後削除）
│   ├── 2.json           # {"id": 2, "role": "se", "status": "done", ...}
│   └── ...
├── inbox/
│   ├── se.jsonl         # se ロール宛メッセージ (JSONL)
│   ├── se.cursor        # se ワーカーの既読位置 (int)
│   ├── programmer.jsonl
│   └── ...
├── sessions/
│   ├── se.txt           # セッション継続用 ID
│   └── ...
├── messages.jsonl       # 全メッセージの中央ログ
├── panes.json           # {"programmer": "tmux-pane-1", ...}
├── shared-dir.txt       # .orchestra-shared/{sessionId}/ へのパス
├── status.json          # {"phase": "running", "next_task_id": 5}
└── shutdown             # 存在すれば全ワーカーが graceful 終了
```

### 7.4 アトミック書き込み実装

```python
# vllm_agent/board/atomic.py
import json
import os
import tempfile
from pathlib import Path


def atomic_write_json(path: Path, data: dict) -> None:
    """
    tmp ファイルへの書き込み後 rename することで
    読み取り側が不完全な JSON を読まないことを保証する。
    """
    dir_path = path.parent
    with tempfile.NamedTemporaryFile(
        mode="w",
        dir=dir_path,
        suffix=".tmp",
        delete=False,
        encoding="utf-8",
    ) as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        tmp_path = f.name

    os.replace(tmp_path, path)  # POSIX では atomic, Windows では best-effort
```

### 7.5 タスク排他制御実装

```python
# vllm_agent/board/task_board.py
from filelock import FileLock, Timeout
from pathlib import Path
import json


def claim_task(task_path: Path) -> dict | None:
    """
    filelock でタスクを排他的に取得する。
    取得失敗（他ワーカーが先に取得）の場合は None を返す。
    """
    lock_path = task_path.with_suffix(".lock")
    lock = FileLock(str(lock_path), timeout=0)

    try:
        with lock:
            task = json.loads(task_path.read_text())
            if task["status"] != "pending":
                return None

            task["status"] = "running"
            task["claimed_at"] = _now_iso()
            atomic_write_json(task_path, task)
            return task
    except Timeout:
        return None  # 他のワーカーが取得済み
```

### 7.6 JSONL メッセージング実装

```python
# vllm_agent/board/inbox.py
import json
import os
from pathlib import Path
from filelock import FileLock


def send_message(inbox_dir: Path, to_role: str, message: dict) -> None:
    """JSONL にアトミックに追記する。

    POSIX では write(2) が PIPE_BUF（4096 bytes）以下なら atomic だが、
    大きなメッセージでは保証されない。filelock で排他制御を行い、
    書き込みの完全性を保証する。
    """
    jsonl_path = inbox_dir / f"{to_role}.jsonl"
    lock_path = inbox_dir / f"{to_role}.jsonl.lock"
    line = json.dumps(message, ensure_ascii=False) + "\n"

    lock = FileLock(str(lock_path), timeout=5)
    with lock:
        with open(jsonl_path, "a", encoding="utf-8") as f:
            f.write(line)
            f.flush()
            os.fsync(f.fileno())  # ディスクへの永続化を保証


def read_new_messages(inbox_dir: Path, role: str) -> list[dict]:
    """カーソル位置以降の新着メッセージを取得"""
    jsonl_path = inbox_dir / f"{role}.jsonl"
    cursor_path = inbox_dir / f"{role}.cursor"

    cursor = int(cursor_path.read_text()) if cursor_path.exists() else 0

    if not jsonl_path.exists():
        return []

    messages = []
    with open(jsonl_path, encoding="utf-8") as f:
        f.seek(cursor)
        for line in f:
            if line.strip():
                messages.append(json.loads(line))
        new_cursor = f.tell()

    cursor_path.write_text(str(new_cursor))
    return messages
```

---

## 8. LLM バックエンド抽象化

### 8.1 LLMClient インターフェース

```python
# vllm_agent/llm/client.py
from abc import ABC, abstractmethod
from typing import Any, Type, TypeVar
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class LLMClient(ABC):

    @abstractmethod
    async def chat(
        self,
        system_prompt: str,
        user_prompt: str,
        timeout: float | None = None,
    ) -> str:
        """テキスト応答を返す基本 chat インターフェース"""
        ...

    @abstractmethod
    async def chat_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: Type[T],
        timeout: float | None = None,
    ) -> T:
        """
        JSON スキーマに従った構造化応答を返す。
        vLLM: guided_json、Ollama: format=json + Pydantic バリデーション。
        """
        ...


def create_llm_client(backend: str = "vllm") -> LLMClient:
    """環境変数 LLM_BACKEND に基づきクライアントを生成するファクトリ"""
    if backend == "vllm":
        from vllm_agent.llm.vllm_client import VLLMClient
        return VLLMClient()
    elif backend == "sglang":
        from vllm_agent.llm.sglang_client import SGLangClient
        return SGLangClient()
    elif backend == "ollama":
        from vllm_agent.llm.ollama_client import OllamaClient
        return OllamaClient()
    else:
        raise ValueError(f"Unknown LLM backend: {backend}")
```

### 8.2 vLLM バックエンド実装

```python
# vllm_agent/llm/vllm_client.py
from openai import AsyncOpenAI
from pydantic import BaseModel
from typing import Type, TypeVar
from vllm_agent.config import settings
from vllm_agent.llm.client import LLMClient
from vllm_agent.llm.schema import sanitize_schema

T = TypeVar("T", bound=BaseModel)


class VLLMClient(LLMClient):

    def __init__(self) -> None:
        self._client = AsyncOpenAI(
            base_url=settings.vllm_base_url,  # 例: http://localhost:8000/v1
            api_key=settings.vllm_api_key or "dummy",
        )
        self._model = settings.vllm_model

    async def chat(self, system_prompt: str, user_prompt: str, timeout: float | None = None) -> str:
        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            timeout=timeout or settings.default_timeout,
        )
        return response.choices[0].message.content or ""

    async def chat_structured(
        self,
        system_prompt: str,
        user_prompt: str,
        schema: Type[T],
        timeout: float | None = None,
    ) -> T:
        """
        vLLM の response_format (Structured Outputs) で制約付き生成を行う。
        XGrammar バックエンドにより JSON スキーマに従った出力が機械的に保証される。
        """
        json_schema = sanitize_schema(schema.model_json_schema())

        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": schema.__name__,
                    "schema": json_schema,
                    "strict": True,
                },
            },
            timeout=timeout or settings.default_timeout,
        )
        raw = response.choices[0].message.content or "{}"
        return schema.model_validate_json(raw)
```

### 8.2.1 SGLang バックエンド実装

SGLang は OpenAI 互換 API を提供するため、VLLMClient とほぼ同一のコードで動作する。
主な差異は `base_url` とサーバー起動コマンドのみ。

```python
# vllm_agent/llm/sglang_client.py
from vllm_agent.llm.vllm_client import VLLMClient
from vllm_agent.config import settings
from openai import AsyncOpenAI


class SGLangClient(VLLMClient):
    """SGLang バックエンド。VLLMClient を継承し base_url とモデル名のみ差し替え。

    SGLang は XGrammar による構造化出力を vLLM の約5倍の速度で処理する。
    OpenAI 互換 API (`/v1/chat/completions`) を使用するため、
    response_format / chat_structured のコードは VLLMClient と完全に共通。
    """

    def __init__(self) -> None:
        # VLLMClient.__init__ を呼ばず、直接初期化
        self._client = AsyncOpenAI(
            base_url=settings.sglang_base_url,  # 例: http://localhost:30000/v1
            api_key="dummy",
        )
        self._model = settings.sglang_model
```

SGLang サーバー起動例:

```bash
python -m sglang.launch_server \
  --model-path Qwen/Qwen3-32B \
  --port 30000 \
  --mem-fraction-static 0.90 \
  --context-length 32768
```

### 8.3 JSON スキーマサニタイズ

Pydantic v2 が生成する JSON スキーマには XGrammar と非互換の要素が含まれる場合がある。
`response_format` に渡す前にサニタイズ処理を挟む。

```python
# vllm_agent/llm/schema.py
import copy


def sanitize_schema(schema: dict) -> dict:
    """
    Pydantic v2 生成の JSON スキーマを vLLM/SGLang の structured outputs 互換に変換。
    - $defs をインライン展開
    - 大きな integer maximum/minimum をクランプ（XGrammar の制限回避）
    - anyOf [type, null] パターンを正規化
    """
    schema = copy.deepcopy(schema)
    defs = schema.pop("$defs", {})

    def _resolve_refs(obj: dict) -> dict:
        if "$ref" in obj:
            ref_name = obj["$ref"].split("/")[-1]
            return _resolve_refs(defs.get(ref_name, {}))
        for key, value in list(obj.items()):
            if isinstance(value, dict):
                obj[key] = _resolve_refs(value)
            elif isinstance(value, list):
                obj[key] = [_resolve_refs(v) if isinstance(v, dict) else v for v in value]
        # 大きな整数をクランプ（XGrammar 制限）
        for bound in ("maximum", "minimum"):
            if bound in obj and abs(obj[bound]) > 2**31:
                obj[bound] = 2**31 if bound == "maximum" else -(2**31)
        return obj

    return _resolve_refs(schema)
```

### 8.4 Scratchpad パターン（思考→構造化出力の分離）

ローカル LLM は構造化出力が強制されると、推論品質が低下する場合がある（"thinking tokens" が制約により抑制されるため）。
Let Me Think (Anthropic 2024) や Inner Monologue パターンに基づき、2段階出力方式を採用する。

**方式: スキーマに `thinking` フィールドを含める**

```python
# vllm_agent/llm/scratchpad.py
from pydantic import BaseModel, Field
from typing import TypeVar, Type

T = TypeVar("T", bound=BaseModel)


class WithThinking(BaseModel):
    """Scratchpad パターンのベーススキーマ。
    thinking フィールドで自由記述の推論を許可し、
    構造化フィールドの生成品質を維持する。"""
    thinking: str = Field(
        description="Step-by-step reasoning before producing the final answer. "
                    "This field is for internal reasoning and will be discarded."
    )


def wrap_with_thinking(schema: Type[T]) -> type:
    """既存の Pydantic モデルに thinking フィールドを動的に追加する。

    Usage:
        ThinkingSubtask = wrap_with_thinking(Subtask)
        result = await client.chat_structured(..., schema=ThinkingSubtask)
        # result.thinking は破棄、他フィールドを Subtask として使用
    """
    fields = {}
    for name, field_info in schema.model_fields.items():
        fields[name] = (field_info.annotation, field_info)

    # thinking を先頭に配置（LLM が最初に推論してから構造化フィールドを埋める）
    new_model = type(
        f"Thinking{schema.__name__}",
        (WithThinking,),
        {"__annotations__": {
            **WithThinking.__annotations__,
            **{name: field_info.annotation for name, field_info in schema.model_fields.items()},
        }},
    )
    return new_model
```

**適用方針:**
- `thinking` フィールドは JSON スキーマの先頭に配置し、LLM が推論を完了してから構造化フィールドを生成する順序を保証
- `thinking` フィールドの内容はログに記録するが、下流処理では破棄する
- 全タスク出力スキーマ（`Subtask`, `ReviewResult`, `DebateArgument` 等）に適用
- `thinking` フィールドを含むスキーマは `sanitize_schema()` と組み合わせて使用

### 8.5 再試行ロジック

```python
# vllm_agent/llm/retry.py
import asyncio
import logging
import random
from typing import Callable, Awaitable, TypeVar
from pydantic import ValidationError

T = TypeVar("T")
logger = logging.getLogger(__name__)


async def with_retry(
    fn: Callable[[], Awaitable[T]],
    max_attempts: int = 3,
    backoff_base: float = 2.0,
    default: T | None = None,
) -> T:
    """
    最大 max_attempts 回の再試行を行う。
    JSON パース失敗 / バリデーションエラー / タイムアウトに対応する。
    全試行失敗時は default を返す（None の場合は最終例外を raise）。
    """
    last_error: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            return await fn()
        except (ValidationError, ValueError, json.JSONDecodeError) as e:
            last_error = e
            logger.warning(
                "Structured output parse failed",
                attempt=attempt,
                max_attempts=max_attempts,
                error=str(e),
            )
        except asyncio.TimeoutError as e:
            last_error = e
            logger.warning("LLM call timed out", attempt=attempt)
        except Exception as e:
            last_error = e
            logger.error("LLM call failed", attempt=attempt, error=str(e))

        if attempt < max_attempts:
            wait = backoff_base ** (attempt - 1) + random.uniform(0, 1.0)  # ジッター付き
            await asyncio.sleep(wait)

    if default is not None:
        logger.error("All attempts failed, returning default value")
        return default

    raise last_error  # type: ignore
```

### 8.6 バックエンド切り替え設定

```bash
# .env
LLM_BACKEND=vllm           # vllm | sglang | ollama
VLLM_BASE_URL=http://localhost:8000/v1
VLLM_MODEL=Qwen/Qwen3-32B
SGLANG_BASE_URL=http://localhost:30000/v1
SGLANG_MODEL=Qwen/Qwen3-32B
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen3:32b
MAX_REVISIONS=3            # レビューサイクル最大修正回数
```

vLLM サーバー起動例:

```bash
vllm serve Qwen/Qwen3-32B \
  --enable-prefix-caching \
  --guided-decoding-backend xgrammar \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.90 \
  --port 8000
```

---

## 9. ロール定義の設計（YAML 形式）

### 9.1 YAML スキーマ

ロール定義を TypeScript の `roles.ts` ハードコードから YAML ファイルに外部化する。これにより、コード変更なしにシステムプロンプトや設定を調整できる。

```yaml
# vllm_agent/roles/base/se.yaml
id: se
name: システムエンジニア
emoji: "🏗️"
layer: 1                          # 1=実行ロール, 2=プランナーロール
is_debate: false                  # true の場合は debate_runner を使用

llm:
  max_tokens: 4096
  temperature: 0.3
  timeout: 180                    # 秒（環境変数でオーバーライド可能）

review:
  can_review: true                # このロールがレビュアーになれるか
  can_be_reviewed: true           # このロールの成果物がレビュー対象か

system_prompt: |
  あなたはシステムエンジニア（SE）です。

  役割:
  - システム全体のアーキテクチャ設計
  - 技術選定と非機能要件（性能・可用性・セキュリティ）の検討
  - コンポーネント間の連携設計とデータフロー設計
  - 技術的な実現可能性の評価

  出力形式:
  1. アーキテクチャ概要
  2. 技術選定と根拠
  3. コンポーネント設計
  4. 非機能要件の対応方針
  5. 技術的リスクと対策

  最終出力は必ずテキストで詳細な分析レポートとして返すこと。
```

```yaml
# vllm_agent/roles/security/security_red.yaml
id: security_red
name: セキュリティ Red Team
emoji: "🔴"
layer: 1
is_debate: false

llm:
  max_tokens: 4096
  temperature: 0.1               # 攻撃パターンは網羅的に、創造性は低め
  timeout: 300

review:
  can_review: true               # Blue Team の防御策をレビューできる
  can_be_reviewed: true

system_prompt: |
  あなたはセキュリティ Red Team の専門家です。攻撃者視点でシステムの脆弱性を発見します。
  ...
```

```yaml
# vllm_agent/roles/planner/planner_architecture.yaml
id: planner_architecture
name: アーキテクチャプランナー
emoji: "📐"
layer: 2                          # Layer 2: タスク定義生成ロール
is_debate: false

llm:
  max_tokens: 8192
  temperature: 0.2
  timeout: 300

output_format:
  type: structured                # structured | text
  # Layer 2 プランナーは TaskDefinition[] を JSON 出力する
  schema: TaskDefinitionsOutput

system_prompt: |
  あなたはアーキテクチャプランナーです。
  フェーズの目標とコンテキストを基に、se / backend / programmer ロールへのタスクを設計してください。

  以下の JSON 形式で出力してください:
  {
    "task_definitions": [
      {
        "role": "se",
        "title": "...",
        "instruction": "...",
        "priority": "high",
        "review_by": "tester",
        "blocked_by": []
      }
    ]
  }
```

### 9.2 ロール一覧（17 種）

| Role ID | Emoji | Layer | 担当領域 |
|---------|-------|-------|---------|
| `researcher` | リサーチャー | 1 | 調査・分析・要件明確化 |
| `context_loader` | コンテキストローダー | 1 | リポジトリ技術スタック調査・全ワーカーへの共有 |
| `se` | システムエンジニア | 1 | アーキテクチャ設計・技術選定・非機能要件 |
| `programmer` | プログラマー | 1 | フルスタック実装・コード設計 |
| `frontend` | フロントエンドエンジニア | 1 | React/Next.js・コンポーネント設計・a11y |
| `backend` | バックエンドエンジニア | 1 | API 設計・DB 設計・認証・ビジネスロジック |
| `tester` | テスター | 1 | テスト戦略・テストケース・品質保証 |
| `ui_ux` | UI/UX デザイナー | 1 | ユーザビリティ・画面設計・アクセシビリティ |
| `security_red` | セキュリティ Red Team | 1 | 攻撃者視点での脆弱性発見 |
| `security_blue` | セキュリティ Blue Team | 1 | 防御者視点での対策提案 |
| `security_consensus` | セキュリティ委員会議長 | 1 | Red/Blue 討論の合意形成 |
| `planner_codebase` | コードベースプランナー | 2 | context_loader / researcher タスク生成 |
| `planner_research` | リサーチプランナー | 2 | researcher タスク生成 |
| `planner_ux` | UX プランナー | 2 | ui_ux / frontend タスク生成 |
| `planner_architecture` | アーキテクチャプランナー | 2 | se / backend / programmer タスク生成 |
| `planner_ops` | 運用プランナー | 2 | backend / programmer（インフラ）タスク生成 |
| `planner_test` | テストプランナー | 2 | tester タスク生成 |

### 9.3 ロールローダー実装

```python
# vllm_agent/roles/loader.py
import yaml
from pathlib import Path
from functools import lru_cache
from dataclasses import dataclass


@dataclass
class RoleDefinition:
    id: str
    name: str
    emoji: str
    layer: int
    is_debate: bool
    system_prompt: str
    llm_config: dict
    output_format: dict


@lru_cache(maxsize=None)
def load_all_roles() -> dict[str, RoleDefinition]:
    """全 YAML ロール定義を起動時に一括ロード・キャッシュ"""
    roles_dir = Path(__file__).parent
    roles: dict[str, RoleDefinition] = {}

    for yaml_file in roles_dir.rglob("*.yaml"):
        data = yaml.safe_load(yaml_file.read_text(encoding="utf-8"))
        role = RoleDefinition(
            id=data["id"],
            name=data["name"],
            emoji=data.get("emoji", ""),
            layer=data.get("layer", 1),
            is_debate=data.get("is_debate", False),
            system_prompt=data["system_prompt"],
            llm_config=data.get("llm", {}),
            output_format=data.get("output_format", {"type": "text"}),
        )
        roles[role.id] = role

    return roles
```

---

## 10. レビューサイクルの状態遷移図

### 10.1 状態遷移

```
タスク追加 (--review-by se)
         │
         ▼
┌─────────────────┐
│  status: pending │
│  task_type: task │
└────────┬────────┘
         │ claimTask()
         ▼
┌─────────────────┐
│ status: running  │
│ task_type: task  │
└────────┬────────┘
         │ execute_task() 完了
         ▼
┌─────────────────┐
│  status: done    │
│  task_type: task │
└────────┬────────┘
         │ handle_post_completion() が自動生成
         ▼
┌─────────────────────────┐
│  status: pending        │   ← 新規タスクとしてボードに追加
│  task_type: review      │
│  role: se               │   (--review-by で指定したロール)
│  blocked_by: [task_id]  │
└────────────┬────────────┘
             │ se ワーカーが取得・実行
             ▼
      ┌──────┴──────┐
      │ レビュー判定 │
      └──────┬──────┘
             │
    ┌────────┴────────┐
    │ <approve>       │ <request-changes>
    ▼                 ▼
┌──────────┐    ┌─────────────────────────┐
│   終了    │    │  status: pending        │   ← 修正タスク自動生成
└──────────┘    │  task_type: revision    │
                │  role: programmer       │   (元のワーカーロール)
                │  blocked_by: [rev_id]   │
                └────────────┬────────────┘
                             │ programmer が修正
                             ▼
                   ┌─────────────────────┐
                   │ status: done        │
                   │ task_type: revision │
                   └────────┬────────────┘
                            │ handle_post_completion() が再度生成
                            ▼
                   ┌─────────────────────────┐
                   │  status: pending        │   ← 再レビュータスク
                   │  task_type: review      │
                   │  role: se               │
                   └─────────────────────────┘
                            ... (承認されるまで繰り返し)
```

### 10.2 タスク状態とタスク種別

**タスク状態 (`status`)**

| 値 | 説明 |
|----|------|
| `pending` | 未取得。ワーカーが claimTask() で取得可能 |
| `running` | 取得済み・実行中 |
| `done` | 完了（成功） |
| `error` | 完了（エラー） |
| `blocked` | 依存タスク未完了のためスキップ |

**タスク種別 (`task_type`)**

| 値 | 説明 | 生成元 |
|----|------|--------|
| `task` | 通常タスク | PM が手動追加 |
| `review` | レビュータスク | `handle_post_completion()` が自動生成 |
| `revision` | 修正タスク | レビュアーが `<request-changes>` を出力した時に自動生成 |

### 10.3 レビューサイクル実装

**無限ループ防止**: レビュー回数の上限（`MAX_REVISIONS`、デフォルト3）を超えた場合は
`<request-changes>` を無視し、最終リビジョン結果を承認済みとして扱う。
これはローカル LLM が品質のばらつきにより永続的に修正要求を出し続けるリスクへの対策である。

```python
# vllm_agent/worker/review_cycle.py
import re
import logging
from pathlib import Path
from vllm_agent.board.task_board import TaskBoard
from vllm_agent.types import Task, TaskType
from vllm_agent.config import settings

logger = logging.getLogger(__name__)


def handle_post_completion(
    board: TaskBoard,
    completed_task: Task,
    output: str,
) -> list[Task]:
    """
    タスク完了後の後処理。
    review_by が設定されている場合はレビュータスクを自動生成する。
    レビュー出力に <request-changes> が含まれる場合は revision タスクを生成する。

    無限ループ防止: revision_count >= settings.max_revisions の場合は
    <request-changes> を無視し、強制承認扱いとする。
    """
    generated: list[Task] = []

    if completed_task.task_type == TaskType.TASK and completed_task.review_by:
        # レビュータスクを生成
        review_task = board.add_task(
            role=completed_task.review_by,
            title=f"[レビュー] {completed_task.title}",
            instruction=_build_review_instruction(completed_task, output),
            task_type=TaskType.REVIEW,
            reviewed_task_id=completed_task.id,
            revision_count=0,
        )
        generated.append(review_task)

    elif completed_task.task_type == TaskType.REVIEW:
        revision_count = completed_task.revision_count or 0

        if _has_request_changes(output):
            if revision_count >= settings.max_revisions:
                # 上限到達: 強制承認扱い。ログに記録して終了
                logger.warning(
                    "Max revisions reached, force-approving",
                    task_id=completed_task.id,
                    revision_count=revision_count,
                    max_revisions=settings.max_revisions,
                )
                return generated  # 空リスト = サイクル終了

            # 修正タスクを生成
            revision_task = board.add_task(
                role=completed_task.reviewed_task_role,
                title=f"[修正] {completed_task.title.removeprefix('[レビュー] ')}",
                instruction=_build_revision_instruction(completed_task, output),
                task_type=TaskType.REVISION,
                review_by=completed_task.role,
                revision_count=revision_count + 1,
            )
            generated.append(revision_task)

    elif completed_task.task_type == TaskType.REVISION and completed_task.review_by:
        # 再レビュータスクを生成（revision_count を引き継ぐ）
        re_review_task = board.add_task(
            role=completed_task.review_by,
            title=f"[再レビュー] {completed_task.title.removeprefix('[修正] ')}",
            instruction=_build_review_instruction(completed_task, output),
            task_type=TaskType.REVIEW,
            reviewed_task_id=completed_task.id,
            revision_count=completed_task.revision_count,
        )
        generated.append(re_review_task)

    return generated


def _has_request_changes(output: str) -> bool:
    return bool(re.search(r"<request-changes>", output, re.IGNORECASE))
```

---

## 11. セキュリティ討論の設計

### 11.1 Team Board モード（推奨）：独立ワーカー方式

`security_red` と `security_blue` を独立ワーカーとして起動し、タスク依存とレビューサイクルで討論を実現する。

```
PM: add-task --role security_red --title "脆弱性分析" --review-by security_blue
  └─> tasks/1.json (pending, review_by=security_blue)

[security_red ワーカー実行]
  └─> tasks/1.json (done)
      handle_post_completion() → tasks/2.json (review, role=security_blue)

[security_blue ワーカーが tasks/2.json を取得・実行]
  出力に <approve> または <request-changes>
  ├── <approve>  → 終了（防御策が十分）
  ├── <early-terminate> → 早期終了（重大脆弱性なし、追加討論不要と判断）
  └── <request-changes> → tasks/3.json (revision, role=security_red)
                             ↓
                          security_red が再分析
                             ↓
                          tasks/4.json (review, role=security_blue)
                          ... (max_revisions まで繰り返し、超過時は強制終了)

PM: add-task --role security_blue --title "防御策提案" --blocked-by 1 --review-by security_red
  └─> tasks/5.json (blocked, unblocked when task/1 done)
      [security_blue が先に防御策提案、security_red がレビュー]
```

### 11.2 7-Phase モード：4 ラウンド逐次討論

```python
# vllm_agent/debate/debate_runner.py
import asyncio
from dataclasses import dataclass
from vllm_agent.llm.client import LLMClient
from vllm_agent.roles.loader import load_all_roles


@dataclass
class DebateRound:
    speaker: str   # "red" | "blue" | "consensus"
    label: str
    content: str


async def run_debate(
    llm: LLMClient,
    original_task: str,
    instruction: str,
    on_round: callable = None,
    enable_early_termination: bool = True,
) -> str:
    """
    Red → Blue → Red（反論）→ Consensus の 4 ラウンド討論。
    各ラウンドは前ラウンドの出力をコンテキストに含める。

    早期終了: Blue Team が Round 2 で「重大脆弱性なし」と判断した場合、
    Round 3（Red 反論）をスキップして直接 Consensus に移行する。
    判定条件: Blue Team 出力に <early-terminate> タグが含まれる場合。
    """
    roles = load_all_roles()
    red_prompt = roles["security_red"].system_prompt
    blue_prompt = roles["security_blue"].system_prompt
    consensus_prompt = roles["security_consensus"].system_prompt

    task_ctx = f"## 対象タスク\n{original_task}\n\n## セキュリティ評価の指示\n{instruction}"
    debate_timeout = 300.0  # 環境変数でオーバーライド可能
    rounds: list[DebateRound] = []

    # Round 1: Red Team — 脆弱性分析
    red1 = await llm.chat(red_prompt, task_ctx, timeout=debate_timeout)
    r1 = DebateRound(speaker="red", label="Red Team — 脆弱性分析", content=red1)
    rounds.append(r1)
    if on_round:
        on_round(r1)

    # Round 2: Blue Team — 防御策提案
    blue1 = await llm.chat(
        blue_prompt,
        f"{task_ctx}\n\n## Red Team の指摘:\n{red1}\n\n上記の指摘に対して防御策を提案してください。",
        timeout=debate_timeout,
    )
    r2 = DebateRound(speaker="blue", label="Blue Team — 防御策提案", content=blue1)
    rounds.append(r2)
    if on_round:
        on_round(r2)

    # 早期終了判定: Blue Team が重大脆弱性なしと判断した場合
    if enable_early_termination and "<early-terminate>" in blue1:
        logger.info("Early termination triggered by Blue Team")
        # Round 3 をスキップして直接 Consensus へ
        consensus = await llm.chat(
            consensus_prompt,
            f"{task_ctx}\n\n## 討論記録（早期終了）:\n### Round 1 Red Team:\n{red1}\n\n"
            f"### Round 2 Blue Team（早期終了判定）:\n{blue1}\n\n"
            "Blue Team が重大脆弱性なしと判定したため早期終了。合意事項をまとめてください。",
            timeout=debate_timeout,
        )
        r_final = DebateRound(speaker="consensus", label="議長 — 合意形成（早期終了）", content=consensus)
        rounds.append(r_final)
        if on_round:
            on_round(r_final)
        return "\n\n---\n\n".join(f"### {r.label}\n{r.content}" for r in rounds)

    # Round 3: Red Team — 反論・追加指摘
    red2 = await llm.chat(
        red_prompt,
        f"{task_ctx}\n\n## これまでの討論:\n### Red Team（1回目）:\n{red1}\n\n### Blue Team:\n{blue1}\n\nBlue Team の防御策に対して、不十分な点や追加の懸念を指摘してください。",
        timeout=debate_timeout,
    )
    r3 = DebateRound(speaker="red", label="Red Team — 反論・追加指摘", content=red2)
    rounds.append(r3)
    if on_round:
        on_round(r3)

    # Round 4: Consensus — 合意形成
    consensus = await llm.chat(
        consensus_prompt,
        f"{task_ctx}\n\n## 討論全記録:\n### Round 1 Red Team:\n{red1}\n\n### Round 2 Blue Team:\n{blue1}\n\n### Round 3 Red Team（反論）:\n{red2}\n\n上記討論を踏まえ合意事項をまとめてください。",
        timeout=debate_timeout,
    )
    r4 = DebateRound(speaker="consensus", label="議長 — 合意形成", content=consensus)
    rounds.append(r4)
    if on_round:
        on_round(r4)

    return "\n\n---\n\n".join(f"### {r.label}\n{r.content}" for r in rounds)
```

---

## 12. フィードフォワードの設計

### 12.1 設計概要

Project モード（Layer 3）において、前フェーズの実行結果を次フェーズの入力コンテキストに自動的に含有する仕組みをフィードフォワードと呼ぶ。これによりフェーズ間の知識伝達が自動化され、後続フェーズが前フェーズの成果を前提として計画・実行できる。

### 12.2 フィードフォワードコンテキスト構築

```python
# vllm_agent/project/feedforward.py
from pathlib import Path
from vllm_agent.project.types import ProjectState, PhaseBrief, PhaseResult
from vllm_agent.worker.context import compress_if_needed


def get_phase_input_context(
    project_state: ProjectState,
    phase_id: int,
    max_tokens: int = 8192,
) -> str:
    """
    フェーズ N の入力コンテキストを構築する。
    - 元のプロジェクト目標
    - マスタープラン
    - Phase N の brief（スコープ・成功基準・期待成果物）
    - Phase 1 〜 N-1 の result サマリー（フィードフォワード部分）

    max_tokens を超える場合は古いフェーズから要約圧縮する。
    """
    parts: list[str] = []

    # 1. プロジェクト目標（常に含む）
    parts.append(f"## プロジェクト目標\n{project_state.goal}")

    # 2. マスタープラン（常に含む）
    master_plan_path = project_state.project_dir / "master-plan.md"
    if master_plan_path.exists():
        parts.append(f"## マスタープラン\n{master_plan_path.read_text()}")

    # 3. 現フェーズの Brief
    current_brief = project_state.get_phase_brief(phase_id)
    if current_brief:
        parts.append(
            f"## Phase {phase_id} — スコープ\n{current_brief.scope}\n\n"
            f"## 成功基準\n{current_brief.success_criteria}\n\n"
            f"## 期待される成果物\n{current_brief.expected_deliverables}"
        )

    # 4. 完了フェーズの結果サマリー（フィードフォワード）
    completed_results: list[str] = []
    for prev_phase_id in range(1, phase_id):
        result = project_state.get_phase_result(prev_phase_id)
        if result:
            completed_results.append(
                f"### Phase {prev_phase_id}: {result.phase_name}\n"
                f"**主要成果物**: {result.deliverables_summary}\n"
                f"**次フェーズへの申し送り**: {result.handoff_notes}"
            )

    if completed_results:
        feedforward_section = "## 前フェーズの実行結果（フィードフォワード）\n" + "\n\n".join(completed_results)
        parts.append(feedforward_section)

    raw_context = "\n\n".join(parts)

    # コンテキスト長制限対応: 超過する場合は古いフェーズのサマリーを圧縮
    return compress_if_needed(raw_context, max_tokens=max_tokens)
```

### 12.3 コンテキスト圧縮（ローカル LLM 対応）

#### 圧縮戦略の仕様

ローカル LLM のコンテキスト長（典型: 4K〜32K トークン）は商用 LLM（100K+）より大幅に短い。
フェーズ数増加に伴うコンテキスト膨張を制御するため、以下の階層的圧縮戦略を採用する。

| 優先度 | 圧縮対象 | 圧縮方法 | 保持トークン上限 |
|--------|---------|---------|----------------|
| 1（常に含む） | プロジェクト目標 | 圧縮なし | 〜500 |
| 2（常に含む） | マスタープラン | 圧縮なし | 〜1000 |
| 3（常に含む） | 現フェーズの brief | 圧縮なし | 〜1000 |
| 4（最新優先） | 直前フェーズ(N-1)の結果 | 全文含有 | 〜2000 |
| 5（要約優先） | N-2 以前のフェーズ結果 | `handoff_notes` サマリーのみ | 各〜300 |
| 6（破棄） | 上限超過分 | 省略 + 注記 | 0 |

**PhaseResult の型定義に `handoff_notes: str` フィールドを設ける。**
各フェーズ完了時に Director が200〜300トークンの申し送りサマリーを生成・保存する。
これにより、フェーズ数が10を超えても直前の詳細 + 過去の要約でコンテキスト長を制御できる。

**トークンカウント**: 本番では `transformers.AutoTokenizer` を使用してモデル固有のトークナイザーで
正確にカウントする。`tiktoken` は OpenAI モデル用であり Qwen3 には対応しない。

```python
# vllm_agent/worker/context.py
import re
from typing import Optional


_default_tokenizer: Optional[object] = None


def get_tokenizer(model_name: str = "Qwen/Qwen3-32B"):
    """AutoTokenizer をシングルトンでロードする。初回のみ数秒かかる。"""
    global _default_tokenizer
    if _default_tokenizer is None:
        try:
            from transformers import AutoTokenizer
            _default_tokenizer = AutoTokenizer.from_pretrained(model_name)
        except ImportError:
            import logging
            logging.getLogger(__name__).warning(
                "transformers not installed, falling back to estimation. "
                "Install with: pip install transformers"
            )
    return _default_tokenizer


def count_tokens(text: str, tokenizer: Optional[object] = None) -> int:
    """
    トークン数を計測する。
    tokenizer が指定されていれば正確なカウント。
    未指定の場合はグローバルの AutoTokenizer を使用し、
    transformers 未インストール時のみ簡易推定にフォールバック。
    """
    tok = tokenizer or get_tokenizer()
    if tok is not None:
        return len(tok.encode(text))
    return _estimate_tokens(text)


def compress_if_needed(
    text: str,
    max_tokens: int = 8192,
    tokenizer: Optional[object] = None,
) -> str:
    """
    トークン数が max_tokens を超過する場合、セクション単位で末尾を省略する。
    """
    estimated_tokens = count_tokens(text, tokenizer)
    if estimated_tokens <= max_tokens:
        return text

    # セクション単位で先頭から保持し、制限に達したら切り捨て
    sections = re.split(r"\n## ", text)
    result_sections: list[str] = []
    current_tokens = 0

    for i, section in enumerate(sections):
        section_with_header = section if i == 0 else f"## {section}"
        # 内部ループでは軽量な推定を使用（AutoTokenizer の O(n) コストを回避）
        section_tokens = _estimate_tokens(section_with_header)

        if current_tokens + section_tokens > max_tokens * 0.9:
            result_sections.append(
                "\n\n[注意: コンテキスト長制限により以降のセクションは省略されました]"
            )
            break

        result_sections.append(section_with_header)
        current_tokens += section_tokens

    return "\n".join(result_sections)


def _estimate_tokens(text: str) -> int:
    """ASCII 文字は 4 chars/token、それ以外（CJK 等）は 2 chars/token で推定"""
    ascii_chars = sum(1 for c in text if ord(c) < 128)
    non_ascii_chars = len(text) - ascii_chars
    return ascii_chars // 4 + non_ascii_chars // 2
```

---

## 13. エラーハンドリング戦略（ローカル LLM 特有の対策）

### 13.1 ローカル LLM 固有の問題と対策

| 問題 | 原因 | 対策 |
|------|------|------|
| フォーマット不遵守 | ローカルモデルのinstruction following 能力の限界 | guided_json（vLLM）でハード制約、Ollama は format:json + バリデーション |
| JSON パース失敗 | 出力に前後テキストが混入 | `chat_structured` で JSON 部分を正規表現で抽出してからバリデーション |
| 推論タイムアウト | ハードウェア性能依存 | 全タイムアウトを環境変数化、デフォルト 180 秒（ロール YAML でオーバーライド可） |
| コンテキスト長超過 | ローカルモデルのコンテキストウィンドウ制限 | `compress_if_needed()` でプリプロセス圧縮 |
| VRAM OOM | 並列リクエストによる VRAM 消費 | vLLM の `--max-model-len` と `--max-num-seqs` で制御 |
| モデル品質のバラつき | モデルサイズ・量子化レベルによる差異 | 再試行 3 回 + デフォルト値で継続、品質監視ログ出力 |

### 13.2 エラーハンドリング階層

```
Level 0: 接続保護（Circuit Breaker + Bulkhead）
  ├── Circuit Breaker OPEN → リクエスト即時拒否（reset_timeout 後に HALF_OPEN で再試行）
  └── Bulkhead セマフォ飽和 → セマフォ解放待ち（max_concurrent_llm_calls で制御）

Level 1: LLM 呼び出し単位
  ├── TimeoutError → 再試行（最大 3 回、指数バックオフ + ジッター）
  ├── ValidationError → 再試行（プロンプトにフォーマット修正指示を追加）
  └── ConnectionError → Circuit Breaker に failure 記録 → 即時エラー

Level 2: ワーカータスク単位
  ├── LLM エラー全試行失敗 → タスク status=error で記録、継続
  ├── タスク取得競合 → claimTask() で None 返却、次のタスクに移行
  └── ワーカークラッシュ → status=running のまま残存
                            → PM が timeout 後に status=error にリカバリ

Level 3: ボード全体
  ├── 全ワーカー失敗 → PM が status=error のタスクを検知してアラート
  └── 孤立ロック (.lock ファイル残存) → PM が定期クリーンアップ
```

### 13.3 Circuit Breaker パターン

LLM サーバーが過負荷やダウン状態の場合、無駄なリトライを防ぎシステム全体の安定性を保つために Circuit Breaker パターンを実装する。

```python
# vllm_agent/llm/circuit_breaker.py
import time
import logging
from enum import Enum
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


class CircuitState(Enum):
    CLOSED = "closed"        # 正常: リクエストを通過させる
    OPEN = "open"            # 遮断: リクエストを即時拒否する
    HALF_OPEN = "half_open"  # 試行: 1リクエストだけ通過させて回復を確認


@dataclass
class CircuitBreaker:
    """LLM バックエンドへの Circuit Breaker。

    failure_threshold 回連続で失敗すると OPEN 状態に遷移し、
    reset_timeout 秒後に HALF_OPEN で回復を試みる。
    """
    failure_threshold: int = 5
    reset_timeout: float = 60.0
    _state: CircuitState = field(default=CircuitState.CLOSED, init=False)
    _failure_count: int = field(default=0, init=False)
    _last_failure_time: float = field(default=0.0, init=False)
    _success_count: int = field(default=0, init=False)

    def can_execute(self) -> bool:
        if self._state == CircuitState.CLOSED:
            return True
        if self._state == CircuitState.OPEN:
            if time.monotonic() - self._last_failure_time >= self.reset_timeout:
                self._state = CircuitState.HALF_OPEN
                logger.info("Circuit breaker → HALF_OPEN (attempting recovery)")
                return True
            return False
        # HALF_OPEN: 1リクエストのみ許可
        return True

    def record_success(self) -> None:
        if self._state == CircuitState.HALF_OPEN:
            self._success_count += 1
            if self._success_count >= 2:  # 2回連続成功で回復
                self._state = CircuitState.CLOSED
                self._failure_count = 0
                self._success_count = 0
                logger.info("Circuit breaker → CLOSED (recovered)")
        else:
            self._failure_count = 0

    def record_failure(self) -> None:
        self._failure_count += 1
        self._last_failure_time = time.monotonic()
        self._success_count = 0
        if self._failure_count >= self.failure_threshold:
            self._state = CircuitState.OPEN
            logger.warning(
                "Circuit breaker → OPEN (failures=%d, blocking for %.0fs)",
                self._failure_count, self.reset_timeout,
            )

    @property
    def state(self) -> CircuitState:
        return self._state
```

**適用箇所:** `with_retry()` の外側で Circuit Breaker を検査する。

```python
# retry.py での使用例
circuit = CircuitBreaker(failure_threshold=5, reset_timeout=60.0)

async def call_llm_with_protection(fn, **kwargs):
    if not circuit.can_execute():
        raise ConnectionError("Circuit breaker is OPEN — LLM server unavailable")
    try:
        result = await with_retry(fn, **kwargs)
        circuit.record_success()
        return result
    except Exception as e:
        circuit.record_failure()
        raise
```

### 13.4 Bulkhead パターン（並列リクエスト制御）

vLLM の `--max-num-seqs` でサーバー側の同時リクエスト数を制限するが、クライアント側でもアプリケーション層セマフォにより過負荷を防止する。

```python
# vllm_agent/llm/bulkhead.py
import asyncio
import logging

logger = logging.getLogger(__name__)


class LLMBulkhead:
    """LLM 呼び出しの並列度を制限するセマフォ。

    vLLM の --max-num-seqs（デフォルト 256）に対し、
    クライアント側でより保守的な並列度制限を設ける。
    これにより、大量のワーカーが同時にリクエストを送信した際の
    キューイング遅延や VRAM OOM を防止する。
    """
    def __init__(self, max_concurrent: int = 8):
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._max = max_concurrent

    async def execute(self, fn):
        async with self._semaphore:
            return await fn()

    @property
    def available(self) -> int:
        return self._semaphore._value


# グローバルインスタンス（Settings から初期化）
llm_bulkhead = LLMBulkhead(max_concurrent=8)
```

**Settings への追加:**

```python
# config.py に追加
max_concurrent_llm_calls: int = Field(
    default=8,
    description="アプリケーション層の LLM 同時呼び出し上限。"
                "vLLM の --max-num-seqs より小さい値を設定すること"
)
```

**ワーカーでの使用:**

```python
# worker_loop 内
output = await llm_bulkhead.execute(
    lambda: execute_task_with_retry(claimed)
)
```

### 13.5 JSON 抽出フォールバック

```python
# vllm_agent/llm/schema.py
# ※ sanitize_schema()（§8.3）と同一ファイル。
#   sanitize_schema = vLLM/SGLang の response_format 用スキーマ変換
#   extract_and_validate = Ollama 等 response_format 非対応バックエンドのフォールバック
import json
import re
from typing import Type, TypeVar
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


def extract_and_validate(raw: str, schema: Type[T]) -> T:
    """
    LLM 出力から JSON を抽出してバリデーションする。
    guided_json が使えない場合（Ollama 等）のフォールバック処理。
    
    試行順序:
    1. 出力全体を JSON としてパース
    2. ```json ... ``` コードブロックを抽出
    3. { } で囲まれた最初の JSON オブジェクトを抽出
    4. 全試行失敗 → ValidationError を raise（再試行ロジックが処理）
    """
    # 試行 1: 全体をそのままパース
    try:
        return schema.model_validate_json(raw.strip())
    except Exception:
        pass

    # 試行 2: ```json ... ``` コードブロック
    code_block = re.search(r"```json\s*([\s\S]*?)\s*```", raw)
    if code_block:
        try:
            return schema.model_validate_json(code_block.group(1))
        except Exception:
            pass

    # 試行 3: { ... } の最外殻 JSON
    brace_match = re.search(r"(\{[\s\S]*\})", raw)
    if brace_match:
        try:
            return schema.model_validate_json(brace_match.group(1))
        except Exception:
            pass

    raise ValueError(f"JSON extraction failed from output: {raw[:200]}...")
```

### 13.6 ワーカー永続ループのエラー処理

```python
# vllm_agent/worker/member.py（抜粋）
import asyncio
import logging

logger = logging.getLogger(__name__)

async def worker_loop(board_dir: Path, role: str) -> None:
    """
    永続ループ。エラーが発生しても自動リカバリして継続する。
    shutdown ファイルが作成された場合のみ graceful 終了する。
    """
    while True:
        # shutdown チェック
        if (board_dir / "shutdown").exists():
            logger.info("Shutdown signal received", role=role)
            break

        try:
            task = poll_next_task(board_dir, role)
            if task is None:
                await asyncio.sleep(1.0)  # ポーリング間隔
                continue

            claimed = claim_task(board_dir, task["id"])
            if claimed is None:
                continue  # 他ワーカーが取得済み

            output = await execute_task_with_retry(claimed)
            await complete_task(board_dir, claimed, output)
            await handle_post_completion(board_dir, claimed, output)

        except asyncio.CancelledError:
            raise  # CancelledError は握りつぶさない

        except Exception as e:
            logger.error("Worker loop error", role=role, error=str(e), exc_info=True)
            await asyncio.sleep(5.0)  # エラー後は少し待つ
```

### 13.7 孤立ロックファイルのクリーンアップ

ワーカーがクラッシュした場合、`.lock` ファイルが残存してタスクが永久に `running` 状態になるリスクがある。
PM の定期クリーンアップで孤立ロックを検出・削除する。

```python
# vllm_agent/board/cleanup.py
import json
import time
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def cleanup_stale_locks(
    board_dir: Path,
    lock_timeout_sec: int = 600,
) -> list[int]:
    """worker_lock_timeout_sec を超過した孤立ロックを検出・クリーンアップする。

    Returns:
        リカバリしたタスク ID のリスト
    """
    tasks_dir = board_dir / "tasks"
    recovered: list[int] = []

    for lock_file in tasks_dir.glob("*.lock"):
        task_id = int(lock_file.stem)
        task_file = tasks_dir / f"{task_id}.json"

        if not task_file.exists():
            lock_file.unlink(missing_ok=True)
            continue

        task = json.loads(task_file.read_text())
        if task.get("status") != "running":
            lock_file.unlink(missing_ok=True)
            continue

        # claimed_at からの経過時間を検査
        claimed_at = task.get("claimed_at")
        if claimed_at is None:
            continue

        from datetime import datetime, timezone
        claimed_time = datetime.fromisoformat(claimed_at).timestamp()
        elapsed = time.time() - claimed_time

        if elapsed > lock_timeout_sec:
            logger.warning(
                "Stale lock detected, recovering task",
                task_id=task_id,
                elapsed_sec=int(elapsed),
            )
            task["status"] = "error"
            task["error"] = f"Worker timeout after {int(elapsed)}s"
            task_file.write_text(json.dumps(task, ensure_ascii=False, indent=2))
            lock_file.unlink(missing_ok=True)
            recovered.append(task_id)

    return recovered
```

**PM での使用（status コマンド実行時に自動実行）:**

```python
# board_commands.py の status コマンド内
recovered = cleanup_stale_locks(board_dir, settings.worker_lock_timeout_sec)
if recovered:
    typer.echo(f"⚠️ Recovered stale tasks: {recovered}")
```

### 13.8 プランナー Graceful Degradation

Project モードの Stage 1（計画ボード）では最大6つのプランナーを並列起動するが、
一部のプランナーが失敗しても計画フェーズ全体を失敗とせず、成功した出力のみで統合する。

```python
# vllm_agent/project/plan_integrator.py
import logging

logger = logging.getLogger(__name__)


def integrate_planner_outputs(
    planner_results: dict[str, dict | None],
    min_success_count: int = 1,
) -> list[dict]:
    """プランナー出力を統合する。失敗したプランナーはスキップする。

    Args:
        planner_results: {planner_role: output_or_None}
        min_success_count: 最低成功数（これ未満なら全体を失敗とする）

    Returns:
        統合された TaskDefinition リスト

    Raises:
        RuntimeError: 成功プランナー数が min_success_count 未満の場合
    """
    successful: list[dict] = []
    failed: list[str] = []

    for role, output in planner_results.items():
        if output is None or output.get("status") == "error":
            failed.append(role)
            logger.warning("Planner failed, skipping", role=role)
            continue
        successful.extend(output.get("task_definitions", []))

    if len(planner_results) - len(failed) < min_success_count:
        raise RuntimeError(
            f"Too few planners succeeded: {len(planner_results) - len(failed)}"
            f"/{len(planner_results)} (min={min_success_count})"
        )

    if failed:
        logger.warning(
            "Plan integration completed with degradation",
            failed_planners=failed,
            total_tasks=len(successful),
        )

    return successful
```

**必須プランナーの定義:** `planner_architecture` は必須（タスク依存関係の骨格を生成するため）。
他のプランナー（`planner_ux`, `planner_ops` 等）はフェーズ内容に応じてオプショナル。

---

## 14. 設定管理（環境変数・設定ファイル）

### 14.1 設定クラス（Pydantic Settings）

```python
# vllm_agent/config.py
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # LLM バックエンド
    llm_backend: str = Field(default="vllm", description="vllm | sglang | ollama")

    # vLLM / SGLang 設定
    vllm_base_url: str = Field(default="http://localhost:8000/v1")
    vllm_model: str = Field(default="Qwen/Qwen3-32B")
    vllm_api_key: str = Field(default="dummy")

    # SGLang 設定
    sglang_base_url: str = Field(default="http://localhost:30000/v1")
    sglang_model: str = Field(default="Qwen/Qwen3-32B")

    # Ollama 設定
    ollama_base_url: str = Field(default="http://localhost:11434/v1")
    ollama_model: str = Field(default="qwen3:32b")

    # タイムアウト（秒）
    default_timeout: float = Field(default=180.0)
    debate_timeout: float = Field(default=300.0)
    plan_timeout: float = Field(default=240.0)

    # 再試行
    max_retry_attempts: int = Field(default=3)
    retry_backoff_base: float = Field(default=2.0)
    circuit_breaker_threshold: int = Field(default=5, description="Circuit Breaker 発動までの連続失敗回数")
    circuit_breaker_reset_sec: float = Field(default=60.0, description="Circuit Breaker リセットまでの待機秒数")

    # ワーカー設定
    poll_interval: float = Field(default=1.0, description="タスクポーリング間隔（秒）")
    worker_lock_timeout_sec: int = Field(default=600, description="タスクロック最大保持時間")
    max_revisions: int = Field(default=3, description="レビューサイクル最大修正回数。超過時は強制承認")
    max_concurrent_llm_calls: int = Field(
        default=8,
        description="アプリケーション層の LLM 同時呼び出し上限（Bulkhead パターン）"
    )

    # ディレクトリ（セキュリティ: /tmp ではなく $XDG_RUNTIME_DIR を優先使用）
    board_base_dir: str = Field(
        default_factory=lambda: os.environ.get("XDG_RUNTIME_DIR", "/tmp"),
        description="タスクボードのベースディレクトリ。"
                    "$XDG_RUNTIME_DIR（Linux: /run/user/{uid}）を優先使用し、"
                    "未設定時のみ /tmp にフォールバック"
    )
    shared_dir_name: str = Field(default=".orchestra-shared")
    feedback_dir: str = Field(default="./feedback")

    # コンテキスト長
    max_context_tokens: int = Field(default=8192, description="プリプロセス圧縮の閾値")

    # ログ
    log_level: str = Field(default="INFO")
    log_format: str = Field(default="json", description="json | text")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
```

### 14.2 .env.example

```bash
# .env.example

# LLM バックエンド選択
LLM_BACKEND=vllm           # vllm | sglang | ollama

# vLLM 設定（本番）
VLLM_BASE_URL=http://localhost:8000/v1
VLLM_MODEL=Qwen/Qwen3-32B
VLLM_API_KEY=dummy         # vLLM はキー不要。ダミー値を設定

# SGLang 設定（本番候補）
SGLANG_BASE_URL=http://localhost:30000/v1
SGLANG_MODEL=Qwen/Qwen3-32B

# Ollama 設定（開発）
OLLAMA_BASE_URL=http://localhost:11434/v1
OLLAMA_MODEL=qwen3:32b

# タイムアウト設定（推論速度に応じて調整）
DEFAULT_TIMEOUT=180        # 一般タスク (秒)
DEBATE_TIMEOUT=300         # セキュリティ討論 (秒)
PLAN_TIMEOUT=240           # 計画フェーズ (秒)

# 再試行設定
MAX_RETRY_ATTEMPTS=3
RETRY_BACKOFF_BASE=2.0
CIRCUIT_BREAKER_THRESHOLD=5   # 連続失敗回数で Circuit Breaker 発動
CIRCUIT_BREAKER_RESET_SEC=60  # Circuit Breaker リセット待機秒数

# ワーカー設定
POLL_INTERVAL=1.0          # タスクポーリング間隔 (秒)
MAX_REVISIONS=3            # レビューサイクル最大修正回数（超過時は強制承認）
MAX_CONCURRENT_LLM_CALLS=8 # アプリケーション層 LLM 同時呼び出し上限（Bulkhead）

# コンテキスト長
MAX_CONTEXT_TOKENS=8192    # コンテキスト圧縮閾値（モデルのウィンドウサイズ以下に設定）

# ディレクトリ設定
# BOARD_BASE_DIR は未設定時 $XDG_RUNTIME_DIR → /tmp の順でフォールバック
# セキュリティ上 $XDG_RUNTIME_DIR（/run/user/{uid}）を推奨
# BOARD_BASE_DIR=/run/user/1000
FEEDBACK_DIR=./feedback

# ログ設定
LOG_LEVEL=INFO
LOG_FORMAT=json            # json | text
```

### 14.3 CLI コマンド一覧

```bash
# Board コマンド群
vllm-agent board init --session <session-id>
vllm-agent board add-task --board <dir> --role <role> --title <title> \
    --instruction <text> [--review-by <role>] [--blocked-by <id>]
vllm-agent board ensure-panes --board <dir> --roles <role1,role2,...>
vllm-agent board status --board <dir>
vllm-agent board results --board <dir> [--role <role>]
vllm-agent board send --board <dir> --to <role> --message <text>
vllm-agent board shutdown --board <dir>

# Project コマンド群
vllm-agent project init --goal <goal>
vllm-agent project status --project <dir>
vllm-agent project advance --project <dir>
vllm-agent project phase-context --project <dir> --phase <id>
vllm-agent project save-result --project <dir> --result <json>
vllm-agent project load-tasks --project <dir> --board <dir> --phase <id>

# 実行モード
vllm-agent run --task <task-text>        # 7-Phase モード
vllm-agent orchestrate --task <task-text> # Orchestrate モード
```

---

## 15. 非機能要件の対応方針

### 15.1 性能

| 要件 | 対策 |
|------|------|
| 推論レイテンシ | vLLM Continuous Batching + PagedAttention で GPU 効率最大化 |
| 並列ワーカー数 | `--max-num-seqs` で vLLM の同時リクエスト数を制御し VRAM OOM を防止 |
| ポーリングオーバーヘッド | `asyncio.sleep(POLL_INTERVAL)` で CPU 使用率を抑制。デフォルト 1 秒 |
| コンテキスト肥大化 | `compress_if_needed()` でプロンプト長を `MAX_CONTEXT_TOKENS` 以内に制御 |
| キャッシュ効率 | vLLM の Prefix Caching でシステムプロンプト部分の KV キャッシュを再利用 |

### 15.2 可用性

| 要件 | 対策 |
|------|------|
| ワーカー障害 | 永続ループ内で例外をキャッチし自動リカバリ。`status=error` でタスクを記録し継続 |
| LLM サーバー停止 | `ConnectionError` を即時エラーとし、ワーカーがリトライ後に待機状態に移行 |
| 孤立ロック | PM の `cleanup` コマンドが `worker_lock_timeout_sec` 超過のロックを削除（下記 §13.7 参照） |
| データ永続性 | ファイルベース IPC のため、プロセス再起動後もタスクボードは継続する |
| セッション継続 | `sessions/{role}.txt` にセッション ID を保存し、ワーカー再起動時に再開可能 |

### 15.3 セキュリティ

| 要件 | 対策 |
|------|------|
| LLM プロンプトインジェクション | システムプロンプトとユーザープロンプトを明示的に分離。構造化出力で応答を制限 |
| ファイルシステムへのアクセス制御 | `CLAUDE_ALLOWED_DIR` 相当の環境変数 `ALLOWED_WORK_DIR` で操作範囲を制限 |
| 機密情報の混入 | ロール YAML でファイルアクセス権限を定義。デフォルトは読み取り専用 |
| LLM サーバー通信 | vLLM は内部ネットワーク（localhost）に配置。外部公開時は認証プロキシを前置 |
| ログへの機密情報 | structlog でログレベル・フィールドをフィルタリング。環境変数は INFO 以上でマスク |
| 一時ディレクトリの安全性 | `/tmp` はマルチユーザー環境でシンボリックリンク攻撃・TOCTOU リスクがあるため、`$XDG_RUNTIME_DIR`（`/run/user/{uid}`、パーミッション `0700`）を優先使用。ボードディレクトリ作成時は `os.makedirs(mode=0o700, exist_ok=True)` を使用 |

### 15.4 保守性

| 要件 | 対策 |
|------|------|
| ロール追加 | YAML ファイル追加のみ。コード変更不要 |
| バックエンド追加 | `LLMClient` を継承したクラスを追加し、ファクトリに登録するだけ |
| 設定変更 | 全タイムアウト・パス・モデル名は環境変数で制御 |
| ログ観測性 | structlog で構造化 JSON ログを出力。Grafana / Loki で可視化可能 |
| LLM 観測性 | Langfuse（オプション）で LLM 呼び出しのトレーシング・コスト・品質を可視化（下記 §15.5 参照） |
| テスト容易性 | `LLMClient` を抽象クラスにしたことで、テスト時にモック実装に差し替え可能 |

### 15.5 観測性（Langfuse 統合）

Langfuse はオープンソースの LLM オブザーバビリティプラットフォームで、セルフホスト可能。
LLM 呼び出しのトレーシング・レイテンシ・トークン使用量・品質スコアを一元的に可視化する。

**導入はオプショナル**（`LANGFUSE_ENABLED=false` がデフォルト）。

```python
# vllm_agent/observability/langfuse_tracer.py
import os
import logging
from contextlib import contextmanager
from typing import Optional

logger = logging.getLogger(__name__)

_langfuse = None


def init_langfuse():
    """Langfuse クライアントを初期化する（LANGFUSE_ENABLED=true の場合のみ）"""
    global _langfuse
    if os.environ.get("LANGFUSE_ENABLED", "false").lower() != "true":
        return
    try:
        from langfuse import Langfuse
        _langfuse = Langfuse()
        logger.info("Langfuse observability enabled")
    except ImportError:
        logger.warning("langfuse package not installed, observability disabled")


@contextmanager
def trace_llm_call(
    name: str,
    role: str,
    task_id: Optional[int] = None,
    metadata: Optional[dict] = None,
):
    """LLM 呼び出しをトレーシングするコンテキストマネージャ。

    Usage:
        with trace_llm_call("chat_structured", role="programmer", task_id=1):
            result = await client.chat_structured(...)
    """
    if _langfuse is None:
        yield
        return

    trace = _langfuse.trace(
        name=name,
        metadata={
            "role": role,
            "task_id": task_id,
            **(metadata or {}),
        },
    )
    try:
        yield trace
    finally:
        trace.end()
```

**収集メトリクス:**

| メトリクス | 説明 | 用途 |
|-----------|------|------|
| レイテンシ | LLM 呼び出しの応答時間 | ボトルネック特定 |
| トークン使用量 | input/output トークン数 | コンテキスト圧縮の効果測定 |
| 再試行回数 | `with_retry` での再試行発生率 | モデル品質の監視 |
| Circuit Breaker 発動 | OPEN 状態への遷移回数 | LLM サーバーの安定性監視 |
| タスク完了率 | 成功/失敗/エラーの割合 | システム全体の健全性 |

**Settings への追加:**

```python
# config.py
langfuse_enabled: bool = Field(default=False, description="Langfuse 観測性の有効化")
```

---

## 16. 技術的リスクと対策

### 16.1 リスク一覧

| リスク | 発生可能性 | 影響度 | 対策 |
|--------|-----------|--------|------|
| **ローカル LLM のフォーマット遵守の不安定さ** | 高 | 高 | guided_json（vLLM）でハード制約。失敗時は 3 回再試行 + デフォルト値 |
| **VRAM 不足による推論エラー** | 中 | 高 | `--max-num-seqs` で同時リクエスト数を制限。モデルの量子化（AWQ/GPTQ）で VRAM 削減 |
| **コンテキスト長超過** | 高 | 中 | `compress_if_needed()` でプリプロセス圧縮。フェーズ結果は申し送りサマリー形式で圧縮 |
| **推論速度の遅延** | 高 | 中 | タイムアウトを環境変数化。ローカル LLM では 180 秒〜300 秒を想定 |
| **ファイルロック競合** | 低 | 低 | `filelock` でクロスプラットフォームな排他制御。タイムアウト 0 で非ブロッキング |
| **孤立ロック（ワーカークラッシュ時）** | 低 | 中 | PM が定期的に `worker_lock_timeout_sec` 超過のロックを検出・削除 |
| **モデル更新による品質劣化** | 低 | 中 | YAML でモデル名を管理。モデル変更時は品質テストスイートで検証（下記 §16.4 参照） |
| **tmux 依存** | 低 | 低 | tmux がない環境では単一プロセスでのシーケンシャル実行にフォールバック |

### 16.2 guided_json が使えない場合のフォールバック戦略

```
vLLM guided_json (第一優先)
  │ 失敗（モデル非対応・サーバー設定不備）
  ▼
Ollama format=json (第二優先)
  │ 失敗（モデルの JSON 遵守能力不足）
  ▼
テキスト出力から正規表現で JSON 抽出 (第三優先)
  │ 失敗
  ▼
デフォルト値で継続 (最終フォールバック)
  例: Subtask.title = "解析失敗", Subtask.instruction = 元のタスク全文
```

### 16.3 段階的移行戦略

本プロジェクトを段階的に構築するためのロードマップを以下に示す。

```
Phase 1: 基盤構築（roadmap.md Phase 1 に対応）
  - llm/ モジュール実装（vLLM / SGLang / Ollama バックエンド + 再試行）
  - Circuit Breaker / Bulkhead / Scratchpad パターン
  - 単体テスト（モック LLM で検証）

Phase 2: コア機能（roadmap.md Phase 2 に対応）
  - orchestrator/ + debate/ 実装
  - roles/ YAML 化
  - board/ モジュール実装（アトミック書き込み + filelock）
  - CLI (run / board コマンド群)

Phase 3: 高度機能（roadmap.md Phase 3 に対応）
  - worker/member.py 実装（asyncio ループ）
  - review_cycle.py 実装（max_revisions 対応）
  - セキュリティ討論（早期終了対応）

Phase 4: Director モード（roadmap.md Phase 4 に対応）
  - project/ モジュール実装
  - feedforward.py 実装（階層的圧縮戦略）
  - プランナー Graceful Degradation
  - CLI (project コマンド群)

Phase 5: 品質保証・最適化（roadmap.md Phase 5 に対応）
  - structlog による構造化ログ
  - Langfuse 観測性統合（オプション）
  - メトリクス収集（推論時間・再試行回数・成功率）
  - 統合テスト・ベンチマーク
```

### 16.4 モデル更新ガイド

新しいモデル（例: Qwen3 → Qwen4）への移行時の検証手順を以下に示す。

**Step 1: 設定変更**
```bash
# .env のモデル名を変更するだけ（コード変更不要）
VLLM_MODEL=Qwen/Qwen4-32B
OLLAMA_MODEL=qwen4:32b
```

**Step 2: 品質テストスイートの実行**

| テスト項目 | 検証内容 | 合格基準 |
|-----------|---------|---------|
| 構造化出力準拠 | `response_format` で JSON スキーマに準拠した出力が得られるか | 成功率 95% 以上 |
| ロール遵守 | 各ロールのシステムプロンプトに従った応答が得られるか | 定性評価で問題なし |
| 推論速度 | 平均レイテンシが許容範囲内か | 前モデルの 1.5 倍以内 |
| VRAM 使用量 | `--gpu-memory-utilization` 設定内で動作するか | OOM エラーなし |
| レビューサイクル | `<approve>` / `<request-changes>` の判定が妥当か | サンプル 10 件で検証 |

**Step 3: 段階的ロールアウト**
1. まず Ollama（開発環境）で品質テストを実行
2. 問題なければ vLLM（本番環境）に適用
3. Langfuse のメトリクスで品質劣化がないか 1 週間モニタリング

---

## 付録: 参照ファイル

本設計書の作成にあたり参照した既存実装ファイル。

**移植元 (claude-multi-agent)**
- `/home/akaba/github/claude-multi-agent/src/orchestrator.ts` — Phase 1-3, 5 制御ロジック
- `/home/akaba/github/claude-multi-agent/src/types.ts` — 共有型定義
- `/home/akaba/github/claude-multi-agent/src/agents.ts` — エージェント定義
- `/home/akaba/github/claude-multi-agent/src/worker-pane.ts` — tmux ペイン内ワーカー
- `/home/akaba/github/claude-multi-agent/src/debate.ts` — 4 ラウンドセキュリティ討論
- `/home/akaba/github/claude-multi-agent/src/feedback.ts` — フィードバック生成
- `/home/akaba/github/claude-multi-agent/src/synthesizer.ts` — 統合レポート生成
- `/home/akaba/github/claude-multi-agent/src/claude-sdk.ts` — LLM 呼び出し抽象化
- `/home/akaba/github/claude-multi-agent/.claude/agents/researcher/README.md` — researcher ロール定義
- `/home/akaba/github/claude-multi-agent/.claude/agents/se/README.md` — se ロール定義
- `/home/akaba/github/claude-multi-agent/.claude/skills/orchestrate/SKILL.md` — Orchestrate モード仕様

**既存ドキュメント**
- `/home/akaba/github/claude-multi-agent-docs-arch/docs/architecture.md` — 移植元アーキテクチャ設計書（全モード詳細）
