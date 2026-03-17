# Python + vLLM Local LLM マルチエージェントオーケストレーションシステム 実装計画書

**バージョン:** 1.0.0
**作成日:** 2026-03-06
**ベースプロジェクト:** claude-multi-agent (TypeScript + Claude Agent SDK)

---

## 目次

1. [プロジェクト概要](#1-プロジェクト概要)
2. [フェーズ分割とロードマップ](#2-フェーズ分割とロードマップ)
3. [各フェーズ詳細タスクリスト](#3-各フェーズ詳細タスクリスト)
4. [マイルストーン定義](#4-マイルストーン定義)
5. [依存関係図](#5-依存関係図)
6. [リスク管理表](#6-リスク管理表)
7. [開発環境セットアップ手順](#7-開発環境セットアップ手順)
8. [ディレクトリ構造の初期設計](#8-ディレクトリ構造の初期設計)
9. [推奨モデル一覧](#9-推奨モデル一覧)

---

## 1. プロジェクト概要

### 1.1 目的

既存の `claude-multi-agent`（TypeScript + Anthropic Claude Agent SDK）が持つマルチエージェントオーケストレーションの設計思想・コアアルゴリズムを、Python + vLLM によるローカル LLM 環境に移植する。

外部 API への依存を排除し、オンプレミス・エアギャップ環境でも動作する自律型マルチエージェントシステムを構築することが主目的である。

### 1.2 スコープ

**移植対象（In Scope）:**

| 機能カテゴリ | 移植対象 | 移植方針 |
|---|---|---|
| ロール定義 | 17 種のワーカーロール + PM プロンプト群 | TypeScript 定数 → YAML ファイル群 |
| LLM 呼び出し抽象化 | `callClaude()` シグネチャ | openai ライブラリ互換 API で再実装 |
| 7-Phase オーケストレーター | Phase 1〜7 固定パイプライン | Python 非同期関数に移植 |
| タスクボード IPC | ファイルベース IPC + アトミック書き込み | `pathlib` + `filelock` で再実装 |
| 永続ワーカーループ | tmux ペイン内ポーリングループ | `asyncio` + サブプロセス管理 |
| レビューサイクル | task → review → revision チェーン | Python `dataclass` + 状態機械 |
| セキュリティ討論 | 4 ラウンド逐次討論 | `async/await` 逐次呼び出し |
| フィードフォワード | `ProjectState` + フェーズ間引き継ぎ | `dataclass` + JSON 永続化 |
| XML/JSON パーサー | XML タグ抽出 → JSON モード | `re` + `json` モジュール |
| tmux ペイン管理 | ペイン起動・監視 | `subprocess` + tmux CLI |
| CLI サブコマンド | `team-start.ts` 相当 | `Typer`（型ヒントベースの CLI フレームワーク） |
| フィードバック生成 | Phase 7 一人称振り返り | 非同期並行実行 |

**対象外（Out of Scope）:**

- Anthropic Claude API との連携（API キー不要の SDK 機能）
- TypeScript コードベース自体の保守・変更
- Web UI / ダッシュボード
- クラウドデプロイ基盤（Kubernetes 等）

### 1.3 前提条件

- Python 3.12 以上がインストール済みであること
- CUDA 対応 GPU（VRAM 16GB 以上推奨）、または Ollama 動作環境（CPU 可）
- tmux がインストール済みであること（並列可視化に使用）
- `git` / `uv`（Python パッケージマネージャー）が利用可能であること
- 既存の `claude-multi-agent` リポジトリを参照可能であること（ロールプロンプトの引用元）

### 1.4 技術選定理由

| 選定技術 | 理由 |
|---|---|
| Python 3.12+ | `asyncio` の成熟度、LLM エコシステムの中心。`pyproject.toml` は `requires-python = ">=3.12"` |
| vLLM (0.15.x+) | ページドアテンション・連続バッチ処理による高スループット、OpenAI API 互換エンドポイント、Structured Outputs |
| SGLang (候補) | XGrammar 統合による構造化出力高速化（vLLM 比約5倍）、RadixAttention。Phase 5 で比較評価 |
| Ollama | 開発時のモデル管理の簡便さ、CPU 動作対応 |
| openai ライブラリ | vLLM / SGLang / Ollama 共に `base_url` 切り替えだけで互換動作 |
| Typer | 型安全な CLI、既存 `team-start.ts` の `--flag` 構文を自然に表現。Click より型ヒントベースで簡潔 |
| pathlib + filelock | クロスプラットフォームなファイルロック。`fcntl` は Linux/macOS 専用のため `filelock`（サードパーティ）を採用 |
| YAML | ロール定義の可読性・編集容易性（JSON より優れる） |
| dataclass + JSON | `project-types.ts` の interface 群の自然な対応物 |

---

## 2. フェーズ分割とロードマップ

```
開始                                                          完了
 |                                                              |
 v                                                              v
[Phase 1]------[Phase 2]------[Phase 3]------[Phase 4]------[Phase 5]
 基盤構築       コア機能       高度機能      Directorモード  品質保証
 1〜2週目      3〜5週目      6〜8週目       9〜11週目      12〜14週目
 5〜9人日      10〜17人日    9〜14人日      7〜11人日       5〜10人日
```

### フェーズ概要

| フェーズ | 名称 | 期間 | 工数 | 目標 |
|---|---|---|---|---|
| 1 | 基盤構築 | 2週間 | 5〜9人日 | LLM抽象化・ロール定義・プロジェクト骨格 |
| 2 | コア機能 | 3週間 | 10〜17人日 | 7-Phase動作・タスクボードIPC・永続ワーカー |
| 3 | 高度機能 | 3週間 | 9〜14人日 | Team Boardモード・レビューサイクル・セキュリティ討論 |
| 4 | Directorモード | 3週間 | 7〜11人日 | フェーズ分解・フィードフォワード・Projectモード |
| 5 | 品質保証 | 3週間 | 5〜10人日 | テスト・ベンチマーク・ドキュメント |

**合計: 約 36〜61 人日（14 週間）**

---

## 3. 各フェーズ詳細タスクリスト

### Phase 1: 基盤構築（Week 1〜2）

**目標:** LLM と会話できる状態・ロール定義を読み込める状態を確立する

#### 1-A: プロジェクト骨格
- [ ] `uv init vllm-multi-agent` でプロジェクト作成
- [ ] `pyproject.toml` に依存パッケージ定義（openai, typer, pyyaml, pydantic, filelock）
- [ ] `src/` パッケージ構造を作成（`__init__.py` 配置）
- [ ] `.env.example` と設定読み込みモジュール（`config.py`）を作成
- [ ] `Makefile` で共通コマンドを整備（`make dev`, `make test`, `make run`）

#### 1-B: LLM 呼び出し抽象化（1〜2人日）
- [ ] `src/llm/client.py` に `LLMClient` クラスを実装
- [ ] `src/llm/backends/vllm_backend.py` — vLLM 用バックエンド
- [ ] `src/llm/backends/ollama_backend.py` — Ollama 用バックエンド（開発用）
- [ ] `src/llm/circuit_breaker.py` — Circuit Breaker パターン実装
- [ ] `src/llm/bulkhead.py` — Bulkhead パターン（asyncio.Semaphore による並列度制限）
- [ ] `src/llm/scratchpad.py` — Scratchpad パターン（thinking フィールド付きスキーマ生成）
- [ ] バックエンド切り替えファクトリ（`LLM_BACKEND=vllm|sglang|ollama`）
- [ ] 最小単位のスモークテスト（Ollama 接続確認）

#### 1-C: ロール定義 YAML（0.5〜1人日）
- [ ] `src/roles/` ディレクトリ作成
- [ ] `src/roles/workers/` — 各ロール YAML（計 17 ファイル）
- [ ] `src/roles/pm_prompts/` — PM 用プロンプト YAML
- [ ] `src/roles/loader.py` — YAML 読み込み + Pydantic バリデーション

#### 1-D: XML/JSON パーサー（1〜2人日）
- [ ] `src/parsers/xml_parser.py` — XML タグ抽出
- [ ] `src/parsers/json_parser.py` — JSON モード出力パース・バリデーション
- [ ] `src/parsers/subtask_parser.py` — `<subtask>` XML → `Subtask` dataclass
- [ ] `src/parsers/route_parser.py` — `<route>` XML → `QuestionRoute` dataclass
- [ ] パーサー単体テスト（正常系・異常系）

### Phase 2: コア機能（Week 3〜5）

**目標:** 7-Phase パイプラインが端から端まで動作すること

#### 2-A: 型定義（0.5人日）
- [ ] `src/types.py` — dataclass 定義（`Subtask`, `WorkerResult`, `Question`, `QAAnswer`, `SynthesisResult`）

#### 2-B: 7-Phase オーケストレーター（3〜5人日）
- [ ] `src/orchestrator.py` — Phase 1〜3, 5 制御
- [ ] `src/worker.py` — Phase 4 並列実行（`asyncio.gather`）
- [ ] `src/synthesizer.py` — Phase 6 統合
- [ ] `src/feedback.py` — Phase 7 フィードバック
- [ ] `src/main.py` — 7-Phase エントリポイント

#### 2-C: ファイルベース IPC（3〜5人日）
- [ ] `src/board/task_board.py` — アトミック書き込み・ファイルロック・タスク CRUD
- [ ] `src/board/inbox.py` — JSONL メッセージング + カーソル管理
- [ ] `src/board/models.py` — ボード用 dataclass
- [ ] ボードディレクトリ作成時のセキュリティ対策:
  - `$XDG_RUNTIME_DIR`（`/run/user/{uid}`）を優先使用
  - `os.makedirs(mode=0o700)` でパーミッション設定
  - `/tmp` はフォールバックのみ（シンボリックリンク攻撃・TOCTOU 対策）

#### 2-D: CLI エントリポイント（3〜5人日）
- [ ] `src/cli/main_cli.py` — Typer アプリケーション本体
- [ ] `src/cli/team_cli.py` — Team Board サブコマンド群（init, add-task, ensure-panes, status, results, shutdown, send）
- [ ] `pyproject.toml` に `[project.scripts]` で `vllm-agent` コマンドを登録

#### 2-E: tmux ペイン管理（2〜3人日）
- [ ] `src/tmux/pane_manager.py` — ペイン起動・監視・終了
- [ ] `src/tmux/panes_registry.py` — ペイン ID の JSON 永続化

### Phase 3: 高度機能（Week 6〜8）

**目標:** Team Board モード・レビューサイクル・セキュリティ討論が動作すること

#### 3-A: 永続ワーカーループ（4〜7人日）
- [ ] `src/worker_loop.py` — poll → claim → execute → post_completion サイクル
- [ ] シャットダウンシグナルファイル監視
- [ ] `execute_task()` — LLM 呼び出し + 結果保存
- [ ] `handle_post_completion()` — レビューサイクル自動生成

#### 3-B: レビューサイクル（2〜3人日）
- [ ] `src/review/cycle.py` — レビュータスク自動生成
- [ ] `<request-changes>` タグ検出 → リビジョンタスク生成
- [ ] `<approve>` タグ検出 → サイクル終了

#### 3-C: セキュリティ討論（1〜2人日）
- [ ] `src/debate.py` — 4 ラウンド逐次討論（Red → Blue → Red → Consensus）

#### 3-D: 構造化出力対応（3〜5人日）
- [ ] vLLM JSON モード有効化
- [ ] JSON スキーマ定義（Pydantic モデル）
- [ ] XML フォールバック
- [ ] `src/parsers/structured.py` — 統合パーサー

### Phase 4: Director モード（Week 9〜11）

**目標:** Project モード（Layer 2/3）のフェーズ分解・フィードフォワードが動作すること

#### 4-A: プロジェクト型定義（0.5〜1人日）
- [ ] `src/project/types.py` — `ProjectState`, `PhaseBrief`, `PhaseResult`, `TaskDefinition`

#### 4-B: プロジェクトボード（3〜4人日）
- [ ] `src/project/board.py` — `ProjectState` 永続化 + フィードフォワード
- [ ] `src/project/task_loader.py` — `<task-definitions>` XML → `TaskDefinition[]`

#### 4-C: プランナーロール（1〜2人日）
- [ ] `src/roles/workers/planner_*.yaml` — 6 種プランナーロール
- [ ] `src/project/planner.py` — プランナー実行ロジック
- [ ] `src/project/plan_integrator.py` — プランナー出力の統合 + Graceful Degradation
  - 一部プランナー失敗時も成功出力のみで統合（`planner_architecture` は必須）

#### 4-D: Director CLI（2〜3人日）
- [ ] `src/cli/project_cli.py` — project-init, project-status, project-set-phases, project-save-plan, project-phase-context, project-advance, project-save-result, project-load-tasks, project-save-task-defs

### Phase 5: 品質保証・最適化（Week 12〜14）

**目標:** 本番投入可能な品質レベルへ引き上げる

#### 5-A: テスト（3〜5人日）
- [ ] `tests/unit/` — パーサー・タスクボード・レビューサイクル・型の単体テスト
- [ ] `tests/integration/` — LLM モックによる 7-Phase・Team Board 統合テスト
- [ ] `tests/e2e/` — Ollama 実行による E2E テスト
- [ ] `pytest.ini` / `conftest.py` 整備

#### 5-B: ベンチマーク（1〜2人日）
- [ ] `benchmarks/latency.py` — LLM 呼び出し遅延計測
- [ ] `benchmarks/throughput.py` — 並列ワーカー数 vs スループット計測

#### 5-C: ドキュメント（1〜3人日）
- [ ] `docs/architecture.md`, `docs/quickstart.md`, `docs/production.md`, `docs/roles.md`
- [ ] `README.md`

#### 5-D: 最適化・観測性
- [ ] LLM 呼び出し並行数上限（Bulkhead セマフォ制御）
- [ ] Circuit Breaker による LLM バックエンド保護
- [ ] ボードポーリングの Exponential Backoff
- [ ] ログ構造化（`structlog`）
- [ ] Langfuse 統合（オプション、`LANGFUSE_ENABLED=true` で有効化）
- [ ] 孤立ロックファイル自動クリーンアップ（`cleanup_stale_locks`）
- [ ] モデル更新品質テストスイート（構造化出力準拠率・レイテンシ・VRAM 検証）

---

## 4. マイルストーン定義

### MS-1: Phase 1 完了（Week 2 末）

- [ ] `uv run python -c "from src.llm.client import LLMClient; print('OK')"` が通る
- [ ] Ollama 起動状態で LLM 応答が返る
- [ ] ロール定義 17 件が全て読み込める
- [ ] `pytest tests/unit/test_xml_parser.py` が全パス

### MS-2: Phase 2 完了（Week 5 末）

- [ ] `uv run python src/main.py "ユーザー認証機能を設計して"` が Phase 1〜7 を完走する
- [ ] 複数ワーカーが `asyncio.gather` で並列実行される
- [ ] タスクボードのアトミック書き込み・競合テストが全パス
- [ ] `vllm-agent team init` コマンドが正常動作する

### MS-3: Phase 3 完了（Week 8 末）

- [ ] tmux ペインでワーカーが自律的にタスク取得・実行・完了する（5 タスク連続）
- [ ] `--review-by` 付きタスクでレビューサイクルが自動生成される
- [ ] `run_debate()` が 4 ラウンド完走し結果を返す

### MS-4: Phase 4 完了（Week 11 末）

- [ ] Project モードの初期化・フェーズ設定が動作する
- [ ] `get_phase_input_context()` がフィードフォワードコンテキストを正しく返す
- [ ] プランナーロールが `<task-definitions>` を出力し `TaskDefinition[]` にパースできる

### MS-5: Phase 5 完了（Week 14 末）

- [ ] `pytest tests/` で全テスト合格（カバレッジ 70% 以上）
- [ ] E2E テストでシステム全体が完走する
- [ ] `docs/quickstart.md` に従い新規開発者が環境構築できる

---

## 5. 依存関係図

### モジュール実装順序

```
[Phase 1]
  config.py
      |
  llm/client.py --- llm/backends/ollama_backend.py
      |                         +-- llm/backends/vllm_backend.py
  roles/loader.py --- roles/workers/*.yaml
      |
  parsers/xml_parser.py --- parsers/json_parser.py
      |                             |
  parsers/subtask_parser.py    parsers/structured.py

[Phase 2]
  types.py
      |
  board/models.py
      |
  board/task_board.py --- board/inbox.py
      |
  orchestrator.py --- worker.py
      |                    |
  synthesizer.py      tmux/pane_manager.py
      |
  feedback.py
      |
  cli/main_cli.py --- cli/team_cli.py

[Phase 3]
  worker_loop.py --- review/cycle.py
      |
  debate.py
      |
  parsers/structured.py (enhanced)

[Phase 4]
  project/types.py
      |
  project/board.py --- project/task_loader.py
      |
  project/planner.py
      |
  cli/project_cli.py
```

### クリティカルパス

```
config.py -> llm/client.py -> orchestrator.py -> main.py -> CLI
                |
                +-> board/task_board.py -> worker_loop.py -> review/cycle.py
                                |
                                +-> project/board.py -> project/planner.py
```

---

## 6. リスク管理表

| ID | リスク | 影響度 | 発生確率 | 対策 |
|---|---|---|---|---|
| R-01 | vLLM の JSON モード対応が不完全なモデルでパース失敗 | 高 | 中 | XML フォールバックを必ず実装。プロンプトエンジニアリングで誘導を強化 |
| R-02 | ローカル LLM の推論速度が遅く 7-Phase が実用的でない | 高 | 高 | ワーカー並列数とモデルサイズをチューニング。量子化モデル優先使用 |
| R-03 | `filelock` のファイルロック競合がパフォーマンスに影響 | 低 | 低 | `timeout=0` で非ブロッキング取得。取得失敗時は次タスクに移行 |
| R-04 | tmux 未インストール環境での動作不能 | 中 | 中 | `TMUX_DISABLED=1` でペイン管理をスキップしログ出力のみで継続 |
| R-05 | ロールプロンプトの品質が低く LLM が期待通りに動作しない | 高 | 中 | 既存プロンプトを忠実に移植後、モデル別のプロンプト調整を追加 |
| R-06 | 複数ワーカーのファイルロック競合が想定外に頻発 | 中 | 低 | ランダム遅延を追加。ロック取得失敗時は指数バックオフで再試行 |
| R-07 | VRAM 不足でモデルが読み込めない | 高 | 中 | 段階的モデルサイズ選択ガイドを提供。量子化・GPU 分割オプションを文書化 |
| R-08 | 非同期コードの例外処理漏れによるワーカーサイレント失敗 | 高 | 中 | `asyncio.gather` に `return_exceptions=True`、最外殻 `try/except` |
| R-09 | XML パースが LLM 出力のフォーマット揺れに対応できない | 中 | 高 | `re.DOTALL` + 複数パターン試行。タグ名の大文字小文字を正規化 |
| R-10 | プランナーロールが `<task-definitions>` 形式を守らない | 中 | 高 | プロンプトに厳密な出力例を複数含める。パース失敗時はリトライ（最大 3 回） |
| R-11 | Phase 3-A 永続ワーカーループ（4-7人日）がクリティカルパス上で工数超過 | 高 | 中 | 早期にプロトタイプ実装を行い不確実性を削減。Phase 2-C（IPC）と並行開発で分散 |

---

## 7. 開発環境セットアップ手順

### 7.1 前提パッケージ

```bash
# uv のインストール
curl -LsSf https://astral.sh/uv/install.sh | sh
source ~/.bashrc

# tmux のインストール
sudo apt-get install -y tmux  # Ubuntu/Debian

# CUDA 確認（GPU 使用時）
nvidia-smi
```

### 7.2 Ollama セットアップ（開発用）

```bash
# インストール
curl -fsSL https://ollama.com/install.sh | sh

# サーバー起動
ollama serve &

# 開発用モデルダウンロード
ollama pull qwen3:8b         # 軽量（CPU 可）
ollama pull qwen3:32b        # 高品質（GPU 推奨）

# 動作確認
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "qwen3:8b", "messages": [{"role": "user", "content": "hello"}]}'
```

### 7.3 vLLM セットアップ（本番用）

```bash
# インストール（v0.15.x 以降を指定）
pip install "vllm>=0.15"

# サーバー起動（A100x1 の場合）
vllm serve Qwen/Qwen3-32B \
  --enable-prefix-caching \
  --guided-decoding-backend xgrammar \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.90 \
  --host 0.0.0.0 --port 8000

# サーバー起動（RTX 4090x2 / NVLink なしの場合 → Pipeline Parallelism）
vllm serve Qwen/Qwen3-32B \
  --enable-prefix-caching \
  --guided-decoding-backend xgrammar \
  --pipeline-parallel-size 2 \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.90 \
  --host 0.0.0.0 --port 8000

# 動作確認
curl http://localhost:8000/v1/models
```

### 7.4 プロジェクトセットアップ

```bash
# リポジトリ作成
mkdir vllm-multi-agent && cd vllm-multi-agent
git init

# Python 環境構築
uv init --python 3.12
uv add openai pyyaml pydantic typer structlog
uv add --dev pytest pytest-asyncio pytest-cov ruff mypy

# 環境変数設定
cp .env.example .env
# LLM_BACKEND=ollama
# OLLAMA_BASE_URL=http://localhost:11434/v1
# OLLAMA_MODEL=qwen3:8b

# 動作確認
uv run python -c "from src.llm.client import LLMClient; print('OK')"
```

---

## 8. ディレクトリ構造の初期設計

```
vllm-multi-agent/
├── src/
│   ├── __init__.py
│   ├── main.py                    # 7-Phase エントリポイント
│   ├── worker_loop.py             # 永続ワーカーループ（Team Board）
│   ├── orchestrator.py            # 7-Phase Phase 1-3, 5 制御
│   ├── synthesizer.py             # Phase 6 統合レポート
│   ├── feedback.py                # Phase 7 フィードバック
│   ├── debate.py                  # セキュリティ 4 ラウンド討論
│   ├── types.py                   # 7-Phase 共有 dataclass
│   ├── config.py                  # 環境変数読み込み・設定
│   ├── llm/                       # LLM 呼び出し抽象化
│   │   ├── __init__.py
│   │   ├── client.py              # LLMClient + CallOptions
│   │   └── backends/
│   │       ├── __init__.py
│   │       ├── vllm_backend.py
│   │       └── ollama_backend.py
│   ├── roles/                     # ロール定義
│   │   ├── __init__.py
│   │   ├── loader.py              # YAML 読み込み + Pydantic
│   │   ├── workers/               # ワーカーロール YAML（17 ファイル）
│   │   └── pm_prompts/            # PM プロンプト YAML
│   ├── parsers/                   # XML/JSON パーサー
│   │   ├── __init__.py
│   │   ├── xml_parser.py
│   │   ├── json_parser.py
│   │   ├── subtask_parser.py
│   │   ├── route_parser.py
│   │   └── structured.py
│   ├── board/                     # ファイルベース IPC
│   │   ├── __init__.py
│   │   ├── models.py
│   │   ├── task_board.py
│   │   ├── inbox.py
│   │   └── session.py
│   ├── review/                    # レビューサイクル
│   │   ├── __init__.py
│   │   └── cycle.py
│   ├── project/                   # Project モード（Layer 2/3）
│   │   ├── __init__.py
│   │   ├── types.py
│   │   ├── board.py
│   │   ├── planner.py
│   │   └── task_loader.py
│   ├── tmux/                      # tmux ペイン管理
│   │   ├── __init__.py
│   │   ├── pane_manager.py
│   │   └── panes_registry.py
│   ├── cli/                       # CLI エントリポイント
│   │   ├── __init__.py
│   │   ├── main_cli.py
│   │   ├── team_cli.py
│   │   └── project_cli.py
│   └── utils/
│       ├── __init__.py
│       ├── semaphore.py
│       ├── logging.py
│       └── timestamp.py
├── tests/
│   ├── conftest.py
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── benchmarks/
├── docs/
├── feedback/                      # .gitignore
├── .orchestra-shared/             # .gitignore
├── pyproject.toml
├── .env.example
├── .gitignore
├── Makefile
└── README.md
```

---

## 9. 推奨モデル一覧

### 開発・テスト用（Ollama、CPU 動作可）

| モデル名 | サイズ | VRAM 目安 | 用途 |
|---|---|---|---|
| `qwen3:8b` | 8B | 8GB / CPU 可 | 単体テスト・スモークテスト |
| `qwen3:14b` | 14B | 12GB | 統合テスト・デバッグ |
| `qwen3-coder:8b` | 8B | 8GB / CPU 可 | programmer ロールのテスト |
| `llama3.2:3b` | 3B | 4GB / CPU 可 | CI の軽量テスト |

### 本番推奨（vLLM / SGLang + GPU）

**デフォルト運用: 全ロールを単一モデルで対応する。** ロール差はプロンプト（YAML）で制御する。
マルチモデル構成はオプション機能として提供する（要追加 GPU）。

| モデル名 | サイズ | VRAM | GPU 構成 | 用途 | 備考 |
|---|---|---|---|---|---|
| **`Qwen/Qwen3-32B`** | 32B | 40GB+ | **A100x1 / RTX 4090x2** | **全ロール汎用（推奨デフォルト）** | Qwen2.5-72B 同等性能。GPU 要件半減 |
| `Qwen/Qwen3-32B-AWQ` | 32B (Q4) | 20GB+ | RTX 4090x1 / 3090x1 | 全ロール汎用（軽量版） | 量子化による品質低下は約5% |
| `Qwen/Qwen2.5-Coder-32B-Instruct` | 32B | 40GB+ | A100x1 | programmer / frontend / backend | オプション: コード生成特化 |
| `Qwen/Qwen3-72B-AWQ` | 72B (Q4) | 48GB+ | A100x2 | 最高品質オプション | 全ロールで最高品質が必要な場合のみ |

### GPU 構成ガイド

| GPU | VRAM | 推奨モデル | 価格帯 | 備考 |
|---|---|---|---|---|
| **RTX 4090 x1** | 24GB | Qwen3-32B-AWQ (Q4) | $1,500-2,000 | **コスパ最高。個人・小規模チーム推奨** |
| **RTX 4090 x2** | 48GB | Qwen3-32B (FP16) | $3,000-4,000 | NVLink なし → PP=2 を使用 |
| **A100 80GB x1** | 80GB | Qwen3-32B (FP16) | $10,000-15,000 | 大規模チーム・本番推奨 |
| **A100 80GB x2** | 160GB | Qwen3-72B (FP16) | $20,000-30,000 | 最高品質要求時のみ |
| RTX 3090 x2 | 48GB | Qwen3-32B-AWQ (Q4) | $1,600-2,400 (中古) | NVLink 対応最後の世代。PP=2 推奨 |

**注意: NVLink なし環境（RTX 4090 等）で TP=2 を使用すると GPU 間通信が PCIe 経由となり性能劣化する。Pipeline Parallelism (`--pipeline-parallel-size 2`) を推奨する。**

### ロール別モデル推奨（オプション: マルチモデル構成時）

**重要: マルチモデル構成は複数の vLLM/SGLang インスタンスが必要であり、GPU 総量が大幅に増加する。**
**デフォルトは全ロール共通モデル（Qwen3-32B）での運用を推奨する。**

| ロール | 推奨モデル | 理由 | 必要 GPU 追加分 |
|---|---|---|---|
| researcher, se, PM | Qwen3-32B（デフォルトと同一） | 複雑な推論・構造化出力 | なし |
| programmer, frontend, backend | Qwen2.5-Coder-32B | コード生成特化 | +A100x1 |
| tester, security_red, security_blue | Qwen3-32B（デフォルトと同一） | 論理的分析・列挙 | なし |
| planner_* | Qwen3-32B（デフォルトと同一） | タスク定義生成の構造化出力精度 | なし |
| context_loader | Qwen3-8B | コード読み取り中心 | 軽量、同一 GPU で共存可能 |

---

## 付録: 移植対応表

| TypeScript ファイル | Python 移植先 | 備考 |
|---|---|---|
| `src/types.ts` | `src/types.py` | `interface` → `dataclass` |
| `src/roles.ts` | `src/roles/workers/*.yaml` + `loader.py` | 定数 → YAML |
| `src/claude-sdk.ts` | `src/llm/client.py` | `query()` → `AsyncOpenAI` |
| `src/claude-cli.ts` | `src/llm/client.py`（ファクトリ） | バックエンド切り替え |
| `src/orchestrator.ts` | `src/orchestrator.py` | XML パーサーを分離 |
| `src/worker.ts` | `src/worker.py` | `Promise.allSettled` → `asyncio.gather` |
| `src/worker-pane.ts` | `src/worker_loop.py` + `tmux/` | tmux 管理を分離 |
| `src/synthesizer.ts` | `src/synthesizer.py` | 直接移植 |
| `src/feedback.ts` | `src/feedback.py` | 直接移植 |
| `src/debate.ts` | `src/debate.py` | 直接移植 |
| `src/team-board.ts` | `src/board/task_board.py` + `inbox.py` | `filelock` で排他制御 |
| `src/team-member.ts` | `src/worker_loop.py` | メインループ移植 |
| `src/team-start.ts` | `src/cli/team_cli.py` + `project_cli.py` | Typer サブコマンド |
| `src/project-board.ts` | `src/project/board.py` | フィードフォワード含む |
| `src/project-types.ts` | `src/project/types.py` | `interface` → `dataclass` |
| `src/agents.ts` | 廃止 | openai ライブラリに統一 |
