# Skills — Skills 拡張ガイド

## skills とは

Claude Code の **skills** は、特定のコンテキストで自動的に適用されるドメイン知識やルールセットである。
`.claude/skills/<skill-name>/SKILL.md` に配置し、フロントマターで名前と説明を定義すると、
Claude Code がタスクの内容に応じて自動的に適切な skill を読み込む。

### skills と commands の違い

| 機能 | skills | commands（スラッシュコマンド） |
|------|--------|-------------------------------|
| 配置場所 | `.claude/skills/<name>/SKILL.md` | `.claude/commands/<name>.md` |
| 起動方法 | コンテキストに応じて**自動適用** | ユーザーが `/name` で**明示的に実行** |
| 主な用途 | コーディング規約・設計原則の適用 | タスクの自動化・ワークフロー実行 |
| フロントマター | `name`, `description` | `description`, `allowed-tools`, `argument-hint`, `disable-model-invocation` |

---

## SKILL.md の書き方

### ディレクトリ構造

```
.claude/
└── skills/
    └── <skill-name>/
        └── SKILL.md
```

### フロントマター

```yaml
---
name: skill-name
description: >
  この skill が自動適用される条件の説明。
  Claude Code はこの description を読んで、
  現在のタスクに関連するかどうかを判断する。
---
```

`description` は **自動適用のトリガー条件** として機能する。
タスクの内容がこの説明に合致すると判断された場合に、SKILL.md の本文が Claude のコンテキストに追加される。

### 本文

SKILL.md の本文には、ルール・規約・パターン・禁止事項などを自由に記述する。
Markdown 形式で、コード例を含めることも可能。

---

## orchestration-demo で想定される skill 案

### `/orchestrate` — タスクのオーケストレーション実行

```yaml
---
name: orchestrate
description: >
  タスクのオーケストレーション実行。7フェーズ（リサーチ→チーム編成→計画→並列実行→Q&A→統合→フィードバック）を
  順に実行し、最終レポートを生成する。orchestration-demoのメインフローを起動する際に使用。
---
```

**スラッシュコマンド版** (`.claude/commands/orchestrate.md`):

```markdown
---
description: タスクをオーケストレーションで実行する
argument-hint: "<タスクの説明>"
allowed-tools: Bash(bun src/main.ts *)
disable-model-invocation: true
---

以下のタスクを orchestration-demo で実行してください。

## 実行コマンド

```bash
bun src/main.ts "$ARGUMENTS"
```

## 実行後

1. `feedback/` ディレクトリに生成されたフィードバックファイルを確認
2. 実行ログを `logs/` に記録
3. 結果のサマリーをユーザーに報告
```

### `/add-worker` — 新しい専門ワーカーロールの追加

```yaml
---
name: add-worker
description: >
  orchestration-demo に新しい専門ワーカーロールを追加する。
  roles.ts のロール定義を拡張し、新しいシステムプロンプトを作成する。
---
```

**スラッシュコマンド版** (`.claude/commands/add-worker.md`):

```markdown
---
description: 新しいワーカーロールを追加する
argument-hint: "<ロール名> <説明>"
allowed-tools: Read, Edit, Write, Bash(bun --noEmit *)
disable-model-invocation: true
---

## 手順

1. `src/roles.ts` を読み込み、既存のロール定義パターンを確認
2. `src/types.ts` の `WorkerRole` 型に新しいロール ID を追加
3. `src/roles.ts` に新しいロール定義を追加:
   - `id`: ロール ID（snake_case）
   - `name`: 表示名（日本語）
   - `emoji`: 絵文字
   - `systemPrompt`: 専門家としてのシステムプロンプト
   - `isDebate`: false（討論型でない場合）
4. 型チェック実行: `npx tsc --noEmit`
5. 変更内容をユーザーに報告

## 入力

$ARGUMENTS
```

### `/review-feedback` — フィードバック集計・分析

```yaml
---
name: review-feedback
description: >
  orchestration-demo のフィードバックディレクトリ（feedback/）に蓄積された
  ワーカーフィードバックを集計・分析する。傾向の把握やワーカー間の関係性を可視化する。
---
```

**スラッシュコマンド版** (`.claude/commands/review-feedback.md`):

```markdown
---
description: フィードバックを集計・分析する
allowed-tools: Read, Glob, Grep, Bash(wc *), Bash(ls *)
disable-model-invocation: false
---

## 手順

1. `feedback/` ディレクトリ配下の全 `.md` ファイルを収集
2. ロールごとにフィードバックを分類
3. 以下の観点で分析:
   - 各ワーカーの主な課題・フラストレーション
   - 改善提案の傾向
   - ワーカー間の相互評価
   - 繰り返し出現するテーマ
4. 分析レポートを生成してユーザーに提示
```

### `/security-audit` — セキュリティ委員会の単体実行

```yaml
---
name: security-audit
description: >
  セキュリティ委員会の4ラウンド討論を単体で実行する。
  Red Team / Blue Team / Chairman による多角的なセキュリティ評価を行う。
---
```

**スラッシュコマンド版** (`.claude/commands/security-audit.md`):

```markdown
---
description: セキュリティ委員会の討論を単体実行する
argument-hint: "<評価対象の説明>"
allowed-tools: Bash(bun *), Read
disable-model-invocation: true
---

## 手順

以下のタスクについてセキュリティ委員会の討論を実行します。

```bash
# debate.ts を直接呼び出すスクリプトを実行
bun -e "
import { runDebate } from './src/debate.js';
const result = await runDebate('$ARGUMENTS');
console.log(result);
"
```

## 出力

4ラウンドの討論結果:
1. 🔴 Red Team: 脆弱性分析
2. 🔵 Blue Team: 防御策提案
3. 🔴 Red Team: 反論
4. ⚖️ Chairman: 総括・評価
```

---

## スラッシュコマンドとの連携

skills と commands は相互補完的に使用する。

### 推奨パターン

```
.claude/
├── skills/
│   ├── orchestration-patterns/      # オーケストレーションの設計パターン（自動適用）
│   │   └── SKILL.md
│   ├── worker-development/          # ワーカー開発のガイドライン（自動適用）
│   │   └── SKILL.md
│   └── security-guidelines/         # セキュリティ評価の基準（自動適用）
│       └── SKILL.md
├── commands/
│   ├── orchestrate.md               # /orchestrate — タスク実行
│   ├── add-worker.md                # /add-worker — ロール追加
│   ├── review-feedback.md           # /review-feedback — フィードバック分析
│   └── security-audit.md            # /security-audit — セキュリティ討論
└── settings.json                    # hooks 設定
```

### 使い分け

| ユースケース | 推奨機能 |
|-------------|---------|
| コードを書く際に常に適用したいルール | **skill** |
| ユーザーが明示的に実行するワークフロー | **command** |
| ツール呼び出し時の自動チェック | **hook** |

---

## FIXER プロジェクトの実装例（参考）

### frontend-standards skill

```yaml
---
name: frontend-standards
description: >
  フロントエンド（TypeScript/React/Next.js）のコーディング規約。
  apps/web、apps/web-practitioner、packages配下のTypeScript/Reactコード作成時、
  フロントエンド実装方針提案時に自動適用。
---
```

- TypeScript の厳密な型付けルール
- Server/Client Component の使い分けパターン
- Tailwind CSS 4 / shadcn/ui の設計規約
- 禁止 `useEffect` パターン 10 選と正しい代替手法
- React Hook Form + Zod によるフォーム設計

### backend-standards skill

```yaml
---
name: backend-standards
description: >
  バックエンド（Go言語）のコーディング規約。
  services/、gateway/bff-service/配下のGoコード作成時、
  バックエンド実装方針提案時に自動適用。
---
```

- Hexagonal Architecture / CQRS パターン
- ドメイン層の純粋性（外部依存の排除）
- 禁止パターン（`init()`, グローバル変数, `panic` 等）
- エラーハンドリング規約（`pkg/errors`）

### FIXER の commands 例

| コマンド | 説明 |
|---------|------|
| `/git:pr` | PR の作成・更新を自動化 |
| `/dependabot` | Dependabot PR の一括処理 |
| `/check-design-consistency` | 設計書の整合性チェック |
| `/wireframe` | 画面設計書から HTML ワイヤーフレームを生成 |
| `/create-screen-from-design` | 設計書からスクリーン実装を生成 |
| `/e2e:manage-test-case` | E2E テストケースの管理 |
| `/monorepo:add-js-bin-package` | モノレポにパッケージを追加 |
| `/monorepo:add-mcp-server-preset` | MCP サーバープリセットを追加 |

### commands のフロントマター活用

```yaml
---
description: コマンドの説明（スラッシュコマンドピッカーに表示）
argument-hint: "<引数の説明>"
allowed-tools: Bash(git *), Read, Edit    # 使用可能ツールの制限
disable-model-invocation: true             # 動的コンテキスト注入を抑制
---
```

- `allowed-tools`: コマンドが使用できるツールを制限し、安全性を向上
- `disable-model-invocation: true`: コマンドをそのまま実行（モデルによる解釈なし）
- `disable-model-invocation: false`: モデルが知識を活用して柔軟に実行
- 動的コンテキスト: `` !`command` `` 構文でシェルコマンドの出力をプロンプトに埋め込み可能
