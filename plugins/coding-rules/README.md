# coding-rules

言語別コーディングルール集。Claude Codeプロジェクトに適用するルールファイルを提供する。

## 対応言語

| 言語 | ディレクトリ |
|------|------------|
| 共通（全言語） | `rules/common/` |
| TypeScript | `rules/typescript/` |
| Python | `rules/python/` |
| Go | `rules/golang/` |

## ルールカテゴリ

各言語ディレクトリに以下のファイルが含まれる（日本語版は `-ja.md` サフィックス）:

| ファイル | 日本語版 | 内容 |
|---------|---------|------|
| `coding-style.md` | `coding-style-ja.md` | コーディングスタイル・命名規約・フォーマット |
| `hooks.md` | `hooks-ja.md` | フック設定（自動フォーマット・静的解析） |
| `patterns.md` | `patterns-ja.md` | 設計パターン・アーキテクチャ |
| `security.md` | `security-ja.md` | セキュリティチェックリスト |
| `testing.md` | `testing-ja.md` | テスト戦略・フレームワーク |

common ディレクトリにはさらに以下が含まれる:

| ファイル | 日本語版 | 内容 |
|---------|---------|------|
| `agents.md` | `agents-ja.md` | エージェントオーケストレーション |
| `development-workflow.md` | `development-workflow-ja.md` | 開発ワークフロー |
| `git-workflow.md` | `git-workflow-ja.md` | Git ワークフロー |
| `performance.md` | `performance-ja.md` | パフォーマンス最適化 |

## 適用方法

### プラグインとしてインストール

```bash
claude plugin marketplace add akbttytnkr/agent-toolbox
claude plugin install coding-rules@agent-toolbox
```

### 手動コピー

```bash
# 共通ルール + 特定言語のルールをコピー
cp -r rules/common/* /path/to/your-project/.claude/rules/
cp -r rules/typescript/* /path/to/your-project/.claude/rules/
```

## ルール優先順位

言語別ルール > 共通ルール（同名ファイルがある場合、言語別が優先）
