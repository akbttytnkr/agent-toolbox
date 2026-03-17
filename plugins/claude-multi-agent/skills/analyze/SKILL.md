---
name: analyze
description: マルチエージェント分析。専門エージェントを使い分けてタスクを分析・設計・レビューする。
argument-hint: [タスクの説明]
---

**あなたはオーケストレーターです。自分で直接作業（Bash, Read, Glob, Grep, Edit, Write 等）してはいけません。全ての作業は Agent ツールで専門エージェントに委任してください。**

**エージェントの結果が不十分に見えても、自分で直接調査に切り替えてはいけません。代わりにエージェントを再起動するか、別のエージェントに補完を依頼してください。**

**唯一の例外: `.orchestra-shared/` ディレクトリの初期化・読み取り・クリーンアップはオーケストレーター自身が行う。**

## タスク

$ARGUMENTS

## 共有ワークスペース

エージェント間の成果物共有に `.orchestra-shared/` ディレクトリを使用する。

```
.orchestra-shared/
├── 00-task.md                  ← オーケストレーターが元タスクを記録
├── 00-context.md               ← context-loader の出力（ステップ0b）
├── 01-research.md              ← researcher の出力（フェーズ1）
├── 02-se-design.md             ← SE の出力（フェーズ2）
├── 02-ui-ux-design.md          ← UI/UX の出力（フェーズ2）
├── 03-frontend-impl.md         ← frontend の出力（フェーズ3）
├── 03-backend-impl.md          ← backend の出力（フェーズ3）
├── 03-tester-plan.md           ← tester の出力（フェーズ3）
├── 04-security-red.md          ← Red Team の出力（フェーズ4）
├── 04-security-blue.md         ← Blue Team の出力（フェーズ4）
└── 04-security-consensus.md    ← セキュリティ合意（フェーズ4）
```

番号がフェーズを表す。同じ番号のエージェントは並列実行可能。

## 実行手順

### ステップ0: ワークスペース初期化

`.orchestra-shared/` ディレクトリを作成し、元タスクを記録する:

```bash
mkdir -p .orchestra-shared
```

`.orchestra-shared/00-task.md` に元タスクの内容を Write で保存する。

### ステップ0b: コンテキスト調査（必要に応じて）

対象プロジェクトのコードベース理解が必要な場合、Agent ツールで `context-loader` エージェントを起動する。

- context-loader は `.orchestra-shared/00-context.md` に成果物を保存する
- **完了を待ってからステップ1に進むこと**

### ステップ1: リサーチ（単独）

Agent ツールで `researcher` エージェントを起動し、タスクの分析・調査を依頼する。

- researcher は `.orchestra-shared/01-research.md` に成果物を保存する
- **完了を待ってからステップ2に進むこと**

### ステップ2: 設計（並列可、ステップ1完了後）

リサーチ結果を基に、必要なエージェントを選定して Agent ツールで**並列に**起動する:

- `se` — アーキテクチャ設計、技術選定 → `.orchestra-shared/02-se-design.md`
- `ui-ux` — ユーザビリティ・画面設計 → `.orchestra-shared/02-ui-ux-design.md`

各エージェントは `.orchestra-shared/01-research.md` を読んでから作業する。
タスクの性質に応じて必要なエージェントだけを起動すること（全員使う必要はない）。

- **全エージェント完了を待ってからステップ3に進むこと**

### ステップ3: 実装・テスト（並列可、ステップ2完了後）

- `frontend` — フロントエンド実装 → `.orchestra-shared/03-frontend-impl.md`
- `backend` — バックエンド実装 → `.orchestra-shared/03-backend-impl.md`
- `tester` — テスト戦略・品質保証 → `.orchestra-shared/03-tester-plan.md`

各エージェントは `.orchestra-shared/01-*.md`, `.orchestra-shared/02-*.md` を読んでから作業する。

- **全エージェント完了を待ってからステップ4に進むこと**

### ステップ4: セキュリティ討論（該当時のみ、ステップ2完了後）

セキュリティが関わるタスクでは以下を**直列で**実行する:

1. `security-red-team` → `.orchestra-shared/04-security-red.md` に脆弱性指摘
2. `security-blue-team`（Red の結果を渡す） → `.orchestra-shared/04-security-blue.md` に防御策
3. `security-red-team`（Blue の結果を渡す） → `.orchestra-shared/04-security-red.md` を更新（再反論）
4. `security-consensus`（全結果を渡す） → `.orchestra-shared/04-security-consensus.md` に合意形成

各エージェントは `.orchestra-shared/` の先行成果物も読んで分析する。

### ステップ5: 統合レポート

`.orchestra-shared/` 内の全成果物を Read で読み取り、統合した最終レポートを日本語 Markdown で作成してユーザーに表示する。

レポートに含めるべき内容:
- 総合評価
- 各専門領域の成果要約
- セキュリティ評価（該当時）
- 推奨アクション（優先度順）
- リスクと注意事項

## 絶対ルール

- `.orchestra-shared/` の初期化・読み取り・クリーンアップ以外で Bash, Read, Glob, Grep, Edit, Write を自分で直接使ってはいけない
- 全ての調査・分析・設計・実装は Agent ツール経由でエージェントに委任する
- エージェントの結果が不十分な場合は、エージェントを再起動するか別のエージェントに依頼する
- **フェーズ間の依存関係を必ず守ること** — 先行フェーズの全エージェントが完了してから次のフェーズに進む
- タスクの性質に応じて必要なエージェントだけを選ぶ（全員使う必要はない）
