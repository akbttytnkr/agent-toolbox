# Discord Human-in-the-Loop 設計書

## 概要

Discord 経由で AI が人間に質問を投げ、返信を待って処理を続行する仕組み。
Discord には **human-in-the-loop 専用の MCP サーバー** が存在し、
「質問を投稿 → 返信をブロッキング待機 → 回答を返す」が 1 ツールコールで完結する。

### Slack 版との違い

| 観点 | Discord | Slack |
|------|---------|-------|
| 専用 MCP サーバー | あり（KOBA789, EugenEistrach） | なし（自前でポーリング実装が必要） |
| 返信待機方式 | Gateway WebSocket（リアルタイム） | ポーリング（30秒間隔） |
| 実装の複雑さ | **1 ツールコールで完結** | 投稿 → ポーリングループの実装が必要 |
| 公式 MCP サーバー | なし（全てコミュニティ製） | あり（Slack 公式） |
| セットアップ | Bot Token 1 つ | OAuth + Bot Token + App Token |

---

## アーキテクチャ

```
┌──────────────────────────────────────────┐
│ orchestration-demo / Claude Code         │
│                                          │
│  質問が発生                               │
│    │                                     │
│    ▼                                     │
│  MCP: ask_human("質問内容")               │
│    │                                     │
│    │  ← ブロッキング待機（ポーリング不要）   │
│    │  ← Gateway WebSocket で返信を検知     │
│    │                                     │
│    ▼                                     │
│  回答テキストが返却 → 処理続行              │
└──────────────────────────────────────────┘

         ↕ Discord Gateway (WebSocket)

┌──────────────────────────────────────────┐
│ Discord                                  │
│  #orchestration-questions                │
│                                          │
│  📌 スレッド: AI からの質問                 │
│  │                                       │
│  ├─ 🤖 Bot: @user 認証方式は JWT と       │
│  │         Session のどちらを想定して       │
│  │         いますか？                      │
│  │                                       │
│  └─ 👤 User: JWT でお願いします            │
│         ↑ この返信が即座に AI に返る        │
└──────────────────────────────────────────┘
```

---

## Discord MCP サーバーの選択肢

### 比較表

| サーバー | 方式 | 言語 | 返信待機 | タイムアウト |
|---------|------|------|---------|------------|
| **KOBA789/human-in-the-loop** | スレッド作成 + @mention | Rust | ✅ ブロッキング | なし（無期限） |
| **EugenEistrach/mcp-discord-agent-comm** | メッセージ + Discord Reply | Node.js | ✅ ブロッキング | 300秒 |
| **barryyip0625/mcp-discord** | 汎用 Discord 操作 | Node.js | ❌ 手動ポーリング | なし |

### 推奨: KOBA789/human-in-the-loop

human-in-the-loop に特化した設計。スレッド作成 + @mention + ブロッキング待機が 1 ツールコールで完結する。

**ツール:**

```
ask_human(question: string) → string
```

- 指定チャンネルにスレッドを作成
- 対象ユーザーを @mention して質問を投稿
- Discord Gateway でスレッド内の返信をリアルタイム監視
- 返信が来た時点でテキストを返却

#### 設定

```jsonc
// .mcp.json
{
  "mcpServers": {
    "human-in-the-loop": {
      "command": "/path/to/human-in-the-loop",
      "args": [
        "--channel-id", "1234567890123456789",
        "--user-id", "9876543210987654321"
      ],
      "env": {
        "DISCORD_TOKEN": "your-bot-token"
      }
    }
  }
}
```

### 代替: EugenEistrach/mcp-discord-agent-comm

Node.js 製で `npx` で即座に使える。5 分のタイムアウト付き。

**ツール:**

```
send_message(message: string, expect_reply?: boolean) → string
```

- `expect_reply: true` で返信待機モード
- ユーザーは Discord の「返信」機能でリプライする
- 300 秒（5 分）でタイムアウト

#### 設定

```jsonc
// .mcp.json
{
  "mcpServers": {
    "discord": {
      "command": "npx",
      "args": ["mcp-discord-agent-comm"],
      "env": {
        "DISCORD_BOT_TOKEN": "your-bot-token",
        "DISCORD_CHANNEL_ID": "1234567890123456789"
      }
    }
  }
}
```

---

## Discord Bot のセットアップ

### 1. Bot 作成

1. [Discord Developer Portal](https://discord.com/developers/applications) でアプリケーション作成
2. 「Bot」タブ → 「Add Bot」
3. トークンをコピー（**環境変数で管理、コードにハードコードしない**）

### 2. Privileged Gateway Intents の有効化

「Bot」タブ → 以下を有効化:

| Intent | 必須 | 用途 |
|--------|------|------|
| **Message Content Intent** | ✅ | メッセージ本文の読み取り |
| Presence Intent | ❌ | 不要 |
| Server Members Intent | ❌ | 不要 |

> **Note**: Message Content Intent は 100 サーバー未満の Bot では審査不要で利用可能。

### 3. Bot の権限設定

OAuth2 → URL Generator で以下を選択:

| 権限 | 用途 |
|------|------|
| `Send Messages` | 質問の投稿 |
| `Create Public Threads` | 質問スレッドの作成 |
| `Send Messages in Threads` | スレッド内での投稿 |
| `Read Message History` | 返信の読み取り |
| `Manage Threads` | スレッド管理 |
| `Add Reactions` | リアクション（オプション） |

### 4. Bot をサーバーに招待

生成された OAuth2 URL でサーバーに追加。

---

## 利用場面ごとの設計

### 場面 1: オーケストレーション実行中

Phase 5 (Q&A) でワーカー間で解決できない質問を Discord にエスカレーションする。

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
      ask_human("質問内容")    ← 1 ツールコールで完結
        │
        │  Discord スレッド作成 + @mention
        │  Gateway で返信をリアルタイム待機
        │
        ▼
      回答テキスト → QAAnswer として Phase 6 に渡す
```

#### 実装イメージ (`src/discord-escalation.ts`)

```typescript
// KOBA789/human-in-the-loop を使う場合、
// MCP ツールコールが返信まで自動的にブロックするため、
// ポーリングロジックは不要。

interface EscalationResult {
  answered: boolean;
  answer: string;
  source: "discord";
}

async function escalateToHuman(
  question: string,
  context: string,
  fromRole: string,
): Promise<EscalationResult> {
  const formatted = [
    `**質問元:** ${fromRole}`,
    `**背景:** ${context}`,
    ``,
    `**質問:**`,
    `> ${question}`,
  ].join("\n");

  // MCP ツール呼び出し — 返信が来るまでブロック
  const answer = await mcpCall("human-in-the-loop", "ask_human", {
    question: formatted,
  });

  return {
    answered: true,
    answer,
    source: "discord",
  };
}
```

**Slack 版との比較:**

```
// Slack: 投稿 → ポーリングループ → 返信取得（3ステップ）
const { threadTs } = await postMessage(channel, message);
while (Date.now() < deadline) {
  await sleep(30000);
  const replies = await getThreadReplies(channel, threadTs);
  if (replies.length > 0) return replies[0];
}

// Discord: 1ステップで完結
const answer = await mcpCall("human-in-the-loop", "ask_human", { question });
```

### 場面 2: Claude Code セッション中

Claude Code の CLAUDE.md に Discord MCP の利用ルールを記載し、
セッション中に不明点があれば `ask_human` を呼び出す。

```markdown
<!-- .claude/CLAUDE.md に追記 -->

## 不明点の解決方針

実装中に以下のケースに該当する場合、Discord MCP の `ask_human` で質問すること:

1. 要件の解釈が複数ある場合
2. セキュリティに関わる判断が必要な場合
3. 外部サービスの選定が必要な場合

返信が来るまで処理はブロックされる。
```

Hook で通知だけ飛ばす方式も併用可能:

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
            "command": "bash .claude/hooks/notify-discord-on-stop.sh"
          }
        ]
      }
    ]
  }
}
```

---

## タイムアウトとフォールバック

| サーバー | タイムアウト | 対策 |
|---------|------------|------|
| KOBA789 | なし（無期限待機） | 外部でタイムアウトを実装する必要あり |
| EugenEistrach | 300秒（5分） | 短すぎる場合はフォーク・設定変更 |

### KOBA789 のタイムアウト対策

```typescript
async function askHumanWithTimeout(
  question: string,
  timeoutMs: number = 1800000, // 30分
): Promise<EscalationResult> {
  const result = await Promise.race([
    mcpCall("human-in-the-loop", "ask_human", { question }),
    sleep(timeoutMs).then(() => null),
  ]);

  if (result === null) {
    return { answered: false, answer: "", source: "discord" };
  }

  return { answered: true, answer: result, source: "discord" };
}
```

### フォールバック戦略

```typescript
type FallbackStrategy =
  | "skip"           // 質問をスキップして続行
  | "default_answer" // デフォルトの回答を使用
  | "abort"          // オーケストレーションを中止
  | "notify_only";   // 結果に「未回答」として記録
```

---

## Slack vs Discord 比較まとめ

| 観点 | Slack | Discord |
|------|-------|---------|
| **HitL 専用 MCP** | なし | あり（KOBA789, EugenEistrach） |
| **実装の複雑さ** | 高（ポーリング自作） | 低（1 ツールコール） |
| **返信検知** | ポーリング（30秒間隔） | Gateway WebSocket（即時） |
| **公式サポート** | Slack 公式 MCP あり | コミュニティのみ |
| **企業利用** | ✅ 一般的 | チームによる |
| **セットアップ** | OAuth + 複数トークン | Bot Token 1 つ |
| **無料枠** | ワークスペース制限あり | サーバー無料 |
| **レート制限** | 厳しめ（2025年以降） | 比較的緩い |

### 選択の指針

- **企業チーム・既存 Slack ワークスペース** → Slack 版
- **個人・小規模チーム・シンプルに始めたい** → Discord 版（KOBA789 推奨）
- **両方使いたい** → 共通インターフェースで抽象化（後述）

---

## 共通インターフェース（Slack / Discord 両対応）

将来的に Slack・Discord を切り替え可能にする場合の抽象化:

```typescript
// src/types.ts に追加

interface HumanEscalation {
  askHuman(params: {
    question: string;
    context: string;
    fromRole: string;
    timeoutMs?: number;
  }): Promise<EscalationResult>;
}

interface EscalationResult {
  answered: boolean;
  answer: string;
  source: "slack" | "discord";
}
```

```typescript
// src/escalation-factory.ts

function createEscalation(): HumanEscalation {
  const provider = process.env.ESCALATION_PROVIDER ?? "discord";

  switch (provider) {
    case "discord":
      return new DiscordEscalation();
    case "slack":
      return new SlackEscalation();
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}
```

---

## 設定ファイル

```bash
# Discord MCP 設定
DISCORD_TOKEN=your-bot-token
DISCORD_CHANNEL_ID=1234567890123456789  # #orchestration-questions
DISCORD_USER_ID=9876543210987654321     # 通知先ユーザー

# エスカレーション共通設定
ESCALATION_PROVIDER=discord             # discord | slack
ESCALATION_TIMEOUT_MS=1800000           # 30分
ESCALATION_FALLBACK=skip                # skip | default_answer | abort | notify_only
```

---

## 実装ロードマップ

### Phase 1: Discord Bot セットアップ

- [ ] Discord Developer Portal で Bot 作成
- [ ] Message Content Intent の有効化
- [ ] Bot をサーバーに招待、`#orchestration-questions` チャンネル作成

### Phase 2: MCP サーバー導入

- [ ] KOBA789/human-in-the-loop のビルド（Rust）または EugenEistrach の npx 設定
- [ ] `.mcp.json` の設定
- [ ] `ask_human` の動作確認

### Phase 3: オーケストレーション統合

- [ ] `src/discord-escalation.ts` の実装
- [ ] `src/orchestrator.ts` の Phase 5 にエスカレーション分岐を追加
- [ ] タイムアウト + フォールバック処理
- [ ] `src/main.ts` に `--enable-discord` フラグを追加

### Phase 4: Claude Code 統合

- [ ] `.mcp.json` に human-in-the-loop を追加
- [ ] CLAUDE.md に Discord 質問ルールを追記
- [ ] Stop hook での通知スクリプト作成（オプション）

### Phase 5: 共通化（オプション）

- [ ] `HumanEscalation` インターフェースの実装
- [ ] `ESCALATION_PROVIDER` による切り替え
- [ ] 質問・回答ログの JSONL 保存
