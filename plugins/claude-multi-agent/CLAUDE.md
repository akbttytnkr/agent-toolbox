# Project Rules

## 禁止コマンド（hookにより強制）

### Git制限 (`restrict-git.sh`)
- **git commit** — 禁止。ユーザーに手動実行を依頼すること
- **git push** — 禁止。ユーザーに手動実行を依頼すること

### 破壊的コマンド制限 (`restrict-destructive.sh`)
- **rm -rf** — 禁止。ファイル削除が必要な場合はユーザーに確認すること

### 作業ディレクトリ制限 (`restrict-workdir.sh`)
- 環境変数 `CLAUDE_ALLOWED_DIR` が設定されている場合、そのディレクトリ配下のみ操作が許可される
- ディレクトリ外への `cd`, `mv`, `cp`, `rm`, `touch`, `mkdir` はブロックされる
- 未設定の場合はディレクトリ制限なし

## 許可されているGit操作

- `git status`, `git diff`, `git log`, `git branch`, `git checkout`, `git add` など読み取り・ステージング系コマンドは使用可能

## PR作成ルール

ユーザーからPR作成を依頼された場合は、以下の手順に従うこと:

1. 変更内容を確認する（`git status`, `git diff`）
2. 新しいブランチを作成する（`git checkout -b <branch-name>`）
3. ユーザーに以下のcommit・pushコマンドを提示し、手動実行を依頼する:
   ```
   git add <files>
   git commit -m "コミットメッセージ"
   git push -u origin <branch-name>
   ```
4. ユーザーがpush完了後、`gh pr create` コマンドでPRを作成する
5. PRのタイトルとbodyは以下の形式で記述する:

```
gh pr create --title "PRタイトル" --body "$(cat <<'EOF'
## Summary
- 変更内容の要約

## Changes
- 具体的な変更点

## Test plan
- テスト方法
EOF
)"
```

- PRの内容（タイトル・本文）は変更内容に基づいて適切に記述すること
- PR作成後、PRのURLをユーザーに提示すること
