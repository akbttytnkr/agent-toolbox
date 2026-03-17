# Git ワークフロー

## コミットメッセージ形式
```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

注: ~/.claude/settings.json でアトリビューションはグローバルに無効化済み。

## プルリクエストワークフロー

PR 作成時:
1. コミット履歴全体を分析する（最新コミットだけでなく）
2. `git diff [base-branch]...HEAD` で全変更を確認する
3. 包括的な PR サマリーを作成する
4. TODO 付きのテスト計画を含める
5. 新しいブランチの場合は `-u` フラグ付きでプッシュする

> Git 操作前の完全な開発プロセス（計画、TDD、コードレビュー）については、
> [development-workflow.md](./development-workflow.md) を参照。
