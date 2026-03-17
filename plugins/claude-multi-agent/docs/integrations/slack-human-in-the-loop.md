# Slack Human-in-the-Loop 設計書

## 概要

オーケストレーション実行中や Claude Code セッション中に、AI が判断に迷った場合に
Slack 経由で人間に質問を投げ、返信を待って処理を続行する仕組み。

### 解決する課題

- `claude -p` は非対話モードのため、実行中にユーザーへ直接質問できない
- 長時間のオーケストレーション実行中、ユーザーはターミナルの前にいない場合がある
- ワーカー間の Q&A（Phase 5）で解決できない質問を人間にエスカレーションしたい

---

## アーキテクチャ

```
┌───────────────────────────────────────────┐
│ orchestration-demo / Claude Code          │
│                                           │
│  質問が発生                                │
│    │                                      │
│    ▼                                      │
│  Slack MCP: メッセージ投稿                  │
│    │  → channel: #orchestration-questions  │
│    │  → 戻り値: thread_ts (スレッドID)      │
│    │                                      │
│    ▼                                      │
│  ポーリングループ                            │
│    │  Slack MCP: スレッド返信を取得           │
│    │  → 返信なし: 待機 → 再ポーリング         │
│    │  → 返信あり: 回答を取得                  │
│    │  → タイムアウト: フォールバック処理        │
│    │                                      │
│    ▼                                      │
│  回答を使って処理を続行                       │
└───────────────────────────────────────────┘

         ↕ Slack API

┌───────────────────────────────────────────┐
│ Slack                                     │
│  #orchestration-questions                 │
│                                           │
│  🤖 Bot: セキュリティ要件について確認です。     │
│        認証方式は JWT と Session の          │
│        どちらを想定していますか？              │
│    │                                      │
│    └── 👤 User: JWT でお願いします           │
└───────────────────────────────────────────┘
```

---

## Slack MCP サーバーの選択肢

| サーバー | 認証 | メッセージ送信 | スレッド読取 | 推奨場面 |
|---------|------|-------------|------------|---------|
| **Official Slack MCP** (`mcp.slack.com`) | OAuth | ✅ | ✅ | Workspace 管理者権限がある場合 |
| **@modelcontextprotocol/server-slack** | Bot Token | ✅ `slack_post_message` | ✅ `slack_get_thread_replies` | シンプルに始めたい場合 |
| **korotovsky/slack-mcp-server** | Browser/User/Bot Token | ✅ opt-in | ✅ `conversations_replies` | 高機能・検索が必要な場合 |

### 推奨: `@modelcontextprotocol/server-slack`

シンプルかつ必要十分なツールが揃っている。

```jsonc
// .mcp.json
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "xoxb-your-bot-token",
        "SLACK_TEAM_ID": "T01234567"
      }
    }
  }
}
```

#### 必要な Bot Token スコープ

| スコープ | 用途 |
|---------|------|
| `chat:write` | メッセージ送信 |
| `channels:history` | チャンネル履歴の読み取り |
| `channels:read` | チャンネル一覧の取得 |
| `users:read` | ユーザー情報の取得 |

---

## 利用場面ごとの設計

### 場面 1: オーケストレーション実行中

Phase 5 (Q&A) でワーカー間で解決できない質問を Slack にエスカレーションする。

#### フロー

```
Phase 4: ワーカー並列実行
  │
  ▼
Phase 5: Q&A ループ
  ├── ワーカー間で回答可能 → 通常の Q&A フロー
  └── 回答不可 / 人間の判断が必要
        │
        ▼
      Slack エスカレーション
        ├── slack_post_message → thread_ts 取得
        ├── ポーリング (30秒間隔, 最大30分)
        │     └── slack_get_thread_replies
        ├── 返信あり → QAAnswer として Phase 6 に渡す
        └── タイムアウト → デフォルト回答 or スキップ
```

#### 実装イメージ (`src/slack-escalation.ts`)

```typescript
import { callSlackMcp } from "./slack-mcp.js";

interface SlackQuestion {
  channel: string;
  question: string;
  context: string;        // ワーカーの出力やタスクの背景
  fromRole: string;
  timeoutMs: number;       // デフォルト: 30分
  pollIntervalMs: number;  // デフォルト: 30秒
}

interface SlackAnswer {
  answered: boolean;
  answer: string;
  answeredBy: string;
  timestamp: string;
}

async function askHuman(params: SlackQuestion): Promise<SlackAnswer> {
  // 1. 質問をフォーマットして投稿
  const message = formatQuestion(params);
  const { threadTs } = await postMessage(params.channel, message);

  // 2. ポーリングで返信を待つ
  const deadline = Date.now() + params.timeoutMs;

  while (Date.now() < deadline) {
    await sleep(params.pollIntervalMs);

    const replies = await getThreadReplies(params.channel, threadTs);
    const humanReplies = replies.filter(r => !r.bot_id); // Bot 以外

    if (humanReplies.length > 0) {
      const latest = humanReplies[humanReplies.length - 1];
      return {
        answered: true,
        answer: latest.text,
        answeredBy: latest.user,
        timestamp: latest.ts,
      };
    }
  }

  // 3. タイムアウト
  return {
    answered: false,
    answer: "",
    answeredBy: "",
    timestamp: "",
  };
}
```

#### メッセージフォーマット

```
🔔 *オーケストレーション: 人間の判断が必要です*

*タスク:* ECサイトの決済システム設計
*質問元:* 🏗️ システムエンジニア
*フェーズ:* Phase 5 (Q&A)

---

*質問:*
> 決済プロバイダーは Stripe と PayPay の
> どちらを優先的にサポートすべきですか？
> 両方の場合、統合の優先順位を教えてください。

*背景:*
> Researcher の調査では両方の導入事例があり、
> 技術的にはどちらも実現可能とのことです。

---
このスレッドに返信してください（30分以内）
```

### 場面 2: Claude Code セッション中

Claude Code の Hook を使い、セッション中に判断に迷った場合に Slack 通知を送る。

#### 方式 A: Stop Hook + Slack 通知

Claude Code が処理を止めた時（追加の指示が必要な時）に Slack に通知。

```jsonc
// .claude/settings.json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/notify-slack-on-stop.sh"
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
# .claude/hooks/notify-slack-on-stop.sh

INPUT=$(cat)
STOP_REASON=$(echo "$INPUT" | jq -r '.stop_reason // "unknown"')

# end_turn（自然終了）の場合のみ通知
if [ "$STOP_REASON" = "end_turn" ]; then
  CHANNEL="${SLACK_QUESTION_CHANNEL:-C01234567}"
  MESSAGE="🛑 Claude Code が追加の指示を待っています。ターミナルを確認してください。"

  curl -s -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"channel\":\"$CHANNEL\",\"text\":\"$MESSAGE\"}" \
    > /dev/null
fi

exit 0
```

#### 方式 B: Slack MCP を直接使用

Claude Code セッション内で Slack MCP ツールを直接呼び出す。
CLAUDE.md やスキルに「不明点があれば Slack に質問する」ルールを記載。

```markdown
<!-- .claude/CLAUDE.md に追記 -->

## 不明点の解決方針

実装中に以下のケースに該当する場合、Slack MCP で質問を投稿し返信を待つこと:

1. 要件の解釈が複数ある場合
2. セキュリティに関わる判断が必要な場合
3. 外部サービスの選定が必要な場合

質問チャンネル: #orchestration-questions
```

---

## ポーリング戦略

### パラメータ

| 項目 | デフォルト値 | 説明 |
|------|------------|------|
| `pollIntervalMs` | 30,000 (30秒) | ポーリング間隔 |
| `timeoutMs` | 1,800,000 (30分) | 最大待機時間 |
| `maxRetries` | 60 | 最大ポーリング回数 |

### タイムアウト時のフォールバック

```typescript
type FallbackStrategy =
  | "skip"           // 質問をスキップして続行
  | "default_answer" // デフォルトの回答を使用
  | "abort"          // オーケストレーションを中止
  | "notify_only";   // 結果に「未回答」として記録

const DEFAULT_FALLBACK: FallbackStrategy = "skip";
```

### ポーリング最適化

```
 0s   30s   60s   90s  ... 5min  ... 15min  ... 30min
 |-----|-----|-----|-----|------|---------|---------|
  30秒間隔                 1分間隔          2分間隔

最初の5分: 30秒間隔（すぐ返信が来る可能性が高い）
5-15分: 1分間隔（急ぎでない可能性）
15-30分: 2分間隔（API コスト削減）
```

---

## セキュリティ考慮事項

| リスク | 対策 |
|--------|------|
| Bot Token の漏洩 | 環境変数で管理、コードにハードコードしない |
| 不正な返信の混入 | 返信者を Workspace メンバーに限定（`bot_id` フィルタ） |
| 機密情報の Slack 流出 | 質問テンプレートで機密情報を除外するルールを設定 |
| Slack API レート制限 | ポーリング間隔を 30 秒以上に設定（Tier 3: 50+ req/min） |

---

## 設定ファイル

プロジェクトルートに `.env` または環境変数で管理する。

```bash
# Slack MCP 設定
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_TEAM_ID=T01234567
SLACK_QUESTION_CHANNEL=C01234567   # #orchestration-questions

# ポーリング設定
SLACK_POLL_INTERVAL_MS=30000       # 30秒
SLACK_TIMEOUT_MS=1800000           # 30分
SLACK_FALLBACK_STRATEGY=skip       # skip | default_answer | abort | notify_only
```

---

## 実装ロードマップ

### Phase 1: 基盤構築

- [ ] Slack App の作成と Bot Token の取得
- [ ] `@modelcontextprotocol/server-slack` の `.mcp.json` 設定
- [ ] `src/slack-mcp.ts` — Slack MCP ツール呼び出しのラッパー
- [ ] 接続確認（チャンネル一覧取得テスト）

### Phase 2: 質問投稿 + ポーリング

- [ ] `src/slack-escalation.ts` — `askHuman()` 関数の実装
- [ ] メッセージフォーマッターの実装
- [ ] ポーリングループ（バックオフ付き）
- [ ] タイムアウト + フォールバック処理

### Phase 3: オーケストレーション統合

- [ ] `src/orchestrator.ts` の Phase 5 にエスカレーション分岐を追加
- [ ] PM のルーティングに「human」ターゲットを追加
- [ ] `src/main.ts` に `--enable-slack` フラグを追加

### Phase 4: Claude Code Hook 統合

- [ ] `.claude/hooks/notify-slack-on-stop.sh` の作成
- [ ] `.claude/settings.json` に Stop hook を追加
- [ ] CLAUDE.md に Slack 質問ルールを追記

### Phase 5: 運用改善

- [ ] ポーリングのバックオフ最適化
- [ ] 質問・回答ログの JSONL 保存
- [ ] Slack スレッドのリアクション対応（✅ で回答完了を明示）
- [ ] 複数質問のバッチ投稿対応
