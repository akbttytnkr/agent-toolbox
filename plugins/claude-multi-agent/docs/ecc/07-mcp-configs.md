# MCP設定ガイド（everything-claude-code）

> **対象リポジトリ**: [everything-claude-code](https://github.com/disler/everything-claude-code)
> **設定ファイル**: `mcp-configs/mcp-servers.json`
> **ドキュメントバージョン**: 2026-03-09

---

## Table of Contents

1. [MCPとは何か](#1-mcpとは何か)
2. [mcp-servers.jsonのフォーマット](#2-mcp-serversjsonのフォーマット)
3. [全16サーバーの詳細一覧](#3-全16サーバーの詳細一覧)
   - [データベース (2)](#データベース-2)
   - [デプロイ (3)](#デプロイ-3)
   - [Web・検索 (3)](#web検索-3)
   - [開発支援 (4)](#開発支援-4)
   - [UI・コンポーネント (1)](#uiコンポーネント-1)
   - [システム・インフラ (3)](#システムインフラ-3)
4. [コンテキストウィンドウ管理：10以下の鉄則](#4-コンテキストウィンドウ管理10以下の鉄則)
5. [プロジェクト別の推奨設定例](#5-プロジェクト別の推奨設定例)
6. [APIキー管理の注意点](#6-apiキー管理の注意点)

---

## 1. MCPとは何か

### Model Context Protocol（MCP）の概要

**MCP**（Model Context Protocol）は、Claude Code が外部サービスやツールと連携するための標準プロトコルです。MCPサーバーを設定することで、Claude はデータベースの操作、Webスクレイピング、デプロイ管理など、外部 API を直接呼び出す能力を獲得します。

```
Claude Code
    │
    ├── MCP Server（github）    → GitHub PR/Issue/リポジトリ操作
    ├── MCP Server（supabase）  → データベース操作
    ├── MCP Server（vercel）    → デプロイ管理
    └── MCP Server（...）       → その他外部サービス
```

### MCPの特性：CLIラッパーとしての本質

ECC の `the-longform-guide.md` は MCP の本質を次のように表現しています:

> "MCP はコンテキストのラッパーであり、CLIの便利なラッパーである"

MCPサーバーを有効化すると、そのサーバーの**ツール定義（スキーマ）がコンテキストウィンドウに消費されます**。これはトークンコストとのトレードオフです。

| コスト種別 | 内容 |
|----------|------|
| コンテキストコスト | ツール定義がウィンドウを占有（サーバー数に比例） |
| トークンコスト | 実際の API 呼び出し時に発生 |

---

## 2. mcp-servers.jsonのフォーマット

### 基本構造

`mcp-configs/mcp-servers.json` は Claude Code の MCP 設定ファイルです。このファイルを `~/.claude/` または `.claude/`（プロジェクト）にコピーして使用します。

```json
{
  "mcpServers": {
    "<server-name>": {
      "command": "npx",
      "args": ["-y", "@package/mcp-server"],
      "env": {
        "API_KEY": "YOUR_API_KEY_HERE"
      }
    }
  }
}
```

### 接続タイプ

MCPサーバーには2種類の接続方式があります:

#### 1. `npx` 形式（ローカル起動）

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_TOKEN_HERE"
      }
    }
  }
}
```

- Node.js パッケージとしてローカルで起動
- `npx -y` で自動インストール＆実行
- 環境変数 `env` で認証情報を渡す

#### 2. `HTTP` 形式（リモートサーバー）

```json
{
  "mcpServers": {
    "vercel": {
      "type": "http",
      "url": "https://mcp.vercel.com/sse"
    }
  }
}
```

- リモートで動作するMCPサーバーに接続
- SSE（Server-Sent Events）で通信
- 認証は URL またはヘッダーで処理

---

## 3. 全16サーバーの詳細一覧

### データベース (2)

#### `supabase`

| 項目 | 内容 |
|------|------|
| **用途** | Supabase データベースの操作（テーブル管理、クエリ実行、RLS 設定等） |
| **接続方式** | `npx` |
| **パッケージ** | `@supabase/mcp-server-supabase` |
| **認証** | `SUPABASE_ACCESS_TOKEN` + プロジェクト参照 ID |
| **主なユースケース** | マイグレーション実行、スキーマ確認、データ操作 |

```json
"supabase": {
  "command": "npx",
  "args": [
    "-y",
    "@supabase/mcp-server-supabase",
    "--access-token", "YOUR_SUPABASE_ACCESS_TOKEN",
    "--project-ref", "YOUR_PROJECT_REF"
  ]
}
```

> **注意**: `YOUR_PROJECT_REF` は Supabase プロジェクトの URL から取得（例: `abcdefghijklmnop`）

#### `clickhouse`

| 項目 | 内容 |
|------|------|
| **用途** | ClickHouse 分析クエリ、カラム型ストレージへの高速アクセス |
| **接続方式** | `HTTP` |
| **URL** | ClickHouse の MCP エンドポイント |
| **認証** | なし（URL エンドポイントで制御） |
| **主なユースケース** | ログ分析、時系列データ集計、大規模クエリ |

```json
"clickhouse": {
  "type": "http",
  "url": "https://mcp.clickhouse.com/sse"
}
```

---

### デプロイ (3)

#### `vercel`

| 項目 | 内容 |
|------|------|
| **用途** | Vercel プロジェクトのデプロイ管理、環境変数設定、ドメイン管理 |
| **接続方式** | `HTTP` |
| **URL** | `https://mcp.vercel.com/sse` |
| **認証** | なし（Vercel CLI の認証を継承） |
| **主なユースケース** | デプロイ実行、プロジェクト一覧確認、ログ閲覧 |

```json
"vercel": {
  "type": "http",
  "url": "https://mcp.vercel.com/sse"
}
```

#### `railway`

| 項目 | 内容 |
|------|------|
| **用途** | Railway へのデプロイ、サービス管理、環境変数操作 |
| **接続方式** | `npx` |
| **パッケージ** | `@railway/mcp` |
| **認証** | なし（Railway CLI の認証を継承） |
| **主なユースケース** | バックエンドサービスのデプロイ、データベース起動 |

```json
"railway": {
  "command": "npx",
  "args": ["-y", "@railway/mcp"]
}
```

#### `cloudflare-workers-builds`

| 項目 | 内容 |
|------|------|
| **用途** | Cloudflare Workers のビルド・デプロイ管理 |
| **接続方式** | `HTTP` |
| **URL** | Cloudflare の MCP エンドポイント |
| **認証** | なし（Wrangler CLI の認証を継承） |
| **主なユースケース** | Worker のデプロイ、ビルドログ確認 |

---

### Web・検索 (3)

#### `exa-web-search`

| 項目 | 内容 |
|------|------|
| **用途** | Exa API による高品質な Web 検索・リサーチ |
| **接続方式** | `npx` |
| **パッケージ** | `exa-mcp-server` |
| **認証** | `EXA_API_KEY` |
| **主なユースケース** | 技術調査、ライブラリ比較、最新情報収集 |

```json
"exa-web-search": {
  "command": "npx",
  "args": ["-y", "exa-mcp-server"],
  "env": {
    "EXA_API_KEY": "YOUR_EXA_API_KEY_HERE"
  }
}
```

> **活用例**: ECC の `development-workflow.md` では開発フェーズ1（Research & Reuse）で Exa を使ったスケルトンプロジェクト調査を**必須**としています。

#### `firecrawl`

| 項目 | 内容 |
|------|------|
| **用途** | Web スクレイピング・クローリング、ページコンテンツ抽出 |
| **接続方式** | `npx` |
| **パッケージ** | `firecrawl-mcp` |
| **認証** | `FIRECRAWL_API_KEY` |
| **主なユースケース** | ドキュメントサイトの内容取得、競合調査、データ収集 |

```json
"firecrawl": {
  "command": "npx",
  "args": ["-y", "firecrawl-mcp"],
  "env": {
    "FIRECRAWL_API_KEY": "YOUR_FIRECRAWL_API_KEY_HERE"
  }
}
```

#### `cloudflare-docs`

| 項目 | 内容 |
|------|------|
| **用途** | Cloudflare 公式ドキュメントの検索・参照 |
| **接続方式** | `HTTP` |
| **認証** | なし |
| **主なユースケース** | Workers/Pages/R2 等の仕様確認 |

---

### 開発支援 (4)

#### `github`

| 項目 | 内容 |
|------|------|
| **用途** | GitHub の PR・Issue・リポジトリ管理を Claude から直接操作 |
| **接続方式** | `npx` |
| **パッケージ** | `@modelcontextprotocol/server-github` |
| **認証** | `GITHUB_PERSONAL_ACCESS_TOKEN` |
| **主なユースケース** | PR 作成・レビュー、Issue 管理、コードレビューコメント |

```json
"github": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_GITHUB_TOKEN_HERE"
  }
}
```

> **必要な権限スコープ**: `repo`, `read:org`（最小限）

#### `memory`

| 項目 | 内容 |
|------|------|
| **用途** | セッション間を跨いだ永続メモリの保存・検索 |
| **接続方式** | `npx` |
| **パッケージ** | `@modelcontextprotocol/server-memory` |
| **認証** | なし |
| **主なユースケース** | ユーザー設定の記憶、過去の決定事項の参照 |

```json
"memory": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-memory"]
}
```

> **セキュリティ注意**: メモリポイズニング攻撃のリスクあり（外部からの入力を永続メモリに格納しない）

#### `sequential-thinking`

| 項目 | 内容 |
|------|------|
| **用途** | Chain-of-Thought 推論の強制、複雑な問題の段階的分解 |
| **接続方式** | `npx` |
| **パッケージ** | `@modelcontextprotocol/server-sequential-thinking` |
| **認証** | なし |
| **主なユースケース** | アーキテクチャ設計、複雑なバグ診断、要件分析 |

```json
"sequential-thinking": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
}
```

#### `context7`

| 項目 | 内容 |
|------|------|
| **用途** | ライブラリの最新ドキュメントをリアルタイムで参照 |
| **接続方式** | `npx` |
| **パッケージ** | `@upstash/context7-mcp` |
| **認証** | なし |
| **主なユースケース** | React、Next.js、Prisma 等の最新 API ドキュメント取得 |

```json
"context7": {
  "command": "npx",
  "args": ["-y", "@upstash/context7-mcp"]
}
```

> **活用例**: Claude の学習データ以降に更新されたライブラリの最新仕様を取得する際に有効。

---

### UI・コンポーネント (1)

#### `magic`

| 項目 | 内容 |
|------|------|
| **用途** | Magic UI の React コンポーネントを生成・カスタマイズ |
| **接続方式** | `npx` |
| **パッケージ** | `@21st-dev/magic` |
| **認証** | なし |
| **主なユースケース** | モダンな UI コンポーネントの素早い生成、アニメーション付きコンポーネント |

```json
"magic": {
  "command": "npx",
  "args": ["-y", "@21st-dev/magic"]
}
```

---

### システム・インフラ (3)

#### `filesystem`

| 項目 | 内容 |
|------|------|
| **用途** | 特定ディレクトリへのファイルシステム操作（読み取り・書き込み・一覧） |
| **接続方式** | `npx` |
| **パッケージ** | `@modelcontextprotocol/server-filesystem` |
| **認証** | パス設定必要 |
| **主なユースケース** | 特定のプロジェクトディレクトリへのスコープ付きアクセス |

```json
"filesystem": {
  "command": "npx",
  "args": [
    "-y",
    "@modelcontextprotocol/server-filesystem",
    "/path/to/allowed/directory"
  ]
}
```

> **セキュリティ**: アクセス許可するディレクトリを最小限に絞ること。`~/.ssh`, `~/.aws` 等は絶対に含めない。

#### `cloudflare-workers-bindings`

| 項目 | 内容 |
|------|------|
| **用途** | Cloudflare Workers のバインディング（KV、D1、R2 等）管理 |
| **接続方式** | `HTTP` |
| **認証** | なし（Wrangler CLI の認証を継承） |

#### `cloudflare-observability`

| 項目 | 内容 |
|------|------|
| **用途** | Cloudflare のログ・モニタリング・アナリティクス参照 |
| **接続方式** | `HTTP` |
| **認証** | なし |
| **主なユースケース** | Workers のエラーログ調査、パフォーマンス監視 |

---

## 4. コンテキストウィンドウ管理：10以下の鉄則

### なぜ10以下なのか

MCPサーバーを有効化すると、各サーバーの**ツール定義がコンテキストウィンドウを消費**します。

```
1サーバーあたりの消費量: 約 3,000〜7,000 トークン（ツール数に依存）
10サーバー有効化時の消費: 最大 70,000+ トークン
```

> ECC の `the-shortform-guide.md` より: "20-30の設定を持ち、10未満を有効化することが鉄則"

コンテキストが圧迫されると:
- Claude の応答品質が低下
- コンテキストの後半でのコード変更精度が落ちる（特に最後の 20% では大規模リファクタリングを避けること）
- セッション内での作業継続性が困難になる

### 著者の実際の設定例

ECC 作者の実際の運用方法:

| 項目 | 数量 |
|------|------|
| 設定済み MCPサーバー総数 | 14個 |
| 同時有効化数 | 5〜6個（プロジェクト毎） |

### プロジェクト別の有効化方法

Claude Code では `claude_desktop_config.json` または `.claude/settings.json` で有効化するサーバーを管理します:

```json
{
  "mcpServers": {
    "github": { /* ... */ },
    "context7": { /* ... */ },
    "sequential-thinking": { /* ... */ }
  }
}
```

使わないサーバーは設定ファイルから**コメントアウトまたは削除**して管理します。

---

## 5. プロジェクト別の推奨設定例

### Web フロントエンドプロジェクト（Next.js）

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_TOKEN"
      }
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    },
    "vercel": {
      "type": "http",
      "url": "https://mcp.vercel.com/sse"
    },
    "magic": {
      "command": "npx",
      "args": ["-y", "@21st-dev/magic"]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

**有効化数**: 5個 ✅

---

### フルスタック SaaS プロジェクト（Next.js + Supabase）

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_TOKEN"
      }
    },
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase",
        "--access-token", "YOUR_SUPABASE_TOKEN",
        "--project-ref", "YOUR_PROJECT_REF"
      ]
    },
    "vercel": {
      "type": "http",
      "url": "https://mcp.vercel.com/sse"
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    },
    "exa-web-search": {
      "command": "npx",
      "args": ["-y", "exa-mcp-server"],
      "env": {
        "EXA_API_KEY": "YOUR_EXA_KEY"
      }
    }
  }
}
```

**有効化数**: 5個 ✅

---

### データエンジニアリングプロジェクト（ClickHouse）

```json
{
  "mcpServers": {
    "clickhouse": {
      "type": "http",
      "url": "https://mcp.clickhouse.com/sse"
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_TOKEN"
      }
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```

**有効化数**: 4個 ✅

---

### Cloudflare Workers プロジェクト

```json
{
  "mcpServers": {
    "cloudflare-docs": {
      "type": "http",
      "url": "https://mcp.cloudflare.com/docs/sse"
    },
    "cloudflare-workers-builds": {
      "type": "http",
      "url": "https://mcp.cloudflare.com/workers-builds/sse"
    },
    "cloudflare-workers-bindings": {
      "type": "http",
      "url": "https://mcp.cloudflare.com/workers-bindings/sse"
    },
    "cloudflare-observability": {
      "type": "http",
      "url": "https://mcp.cloudflare.com/observability/sse"
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_TOKEN"
      }
    }
  }
}
```

**有効化数**: 5個 ✅

---

## 6. APIキー管理の注意点

### プレースホルダーの置換忘れ

ECC の `mcp-servers.json` にはプレースホルダーが含まれています:

```
YOUR_GITHUB_TOKEN_HERE
YOUR_SUPABASE_ACCESS_TOKEN
YOUR_EXA_API_KEY_HERE
YOUR_FIRECRAWL_API_KEY_HERE
```

**これらをそのまま使用しても動作しません。** コピー後に必ず実際の値に置換してください。

### 設定ファイルをコミットしない

APIキーが含まれる設定ファイルは Git にコミットしないこと:

```bash
# .gitignore に追加
.claude/settings.json
claude_desktop_config.json
mcp-servers.json
*.env
```

### 環境変数を使う（推奨）

直接値を書く代わりに、環境変数経由で渡すことを推奨します:

```json
"env": {
  "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
}
```

または、シェルの環境変数として設定:

```bash
# ~/.bashrc または ~/.zshrc
export GITHUB_TOKEN="ghp_xxxxxxxxxxxx"
export EXA_API_KEY="exa_xxxxxxxxxxxx"
export FIRECRAWL_API_KEY="fc_xxxxxxxxxxxx"
```

### MCPサーバー別の最小権限設定

| サーバー | 推奨するAPIキーの最小権限 |
|---------|----------------------|
| `github` | `repo`（Private Repo含む場合）または `public_repo`（Public のみ） |
| `supabase` | プロジェクト固有のアクセストークン（全プロジェクトアクセスを避ける） |
| `firecrawl` | 使用量制限付きキーを使用 |
| `exa-web-search` | レート制限を確認して適切なプランを選択 |

### セキュリティリスク：MCPツールポイズニング

ECC の `the-security-guide.md` で警告されている「**ラグプル攻撃**」:

> 承認後にツール定義を変更する攻撃。MCPサーバーのアップデートが悪意のある変更を含む場合がある。

**対策**:
- MCPサーバーのバージョンを固定する
- `npx -y` の代わりにバージョン指定: `npx -y package@1.2.3`
- 信頼できる公式パッケージのみ使用

```json
"github": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-github@0.6.2"]
}
```

### `filesystem` サーバーのパス制限（重要）

```json
"filesystem": {
  "command": "npx",
  "args": [
    "-y",
    "@modelcontextprotocol/server-filesystem",
    "/home/user/projects/my-project"  // ← 特定プロジェクトのみ
  ]
}
```

**絶対に含めてはいけないパス**（ECC `the-security-guide.md` より）:
- `~/.ssh` — SSH 秘密鍵
- `~/.aws` — AWS 認証情報
- `~/.env` — 環境変数ファイル
- `/etc` — システム設定
- `~/.config` — アプリケーション設定

---

## サーバー一覧クイックリファレンス

| サーバー名 | 接続方式 | 認証 | 主な用途 |
|-----------|---------|------|---------|
| `github` | npx | GITHUB_PERSONAL_ACCESS_TOKEN | PR・Issue・リポジトリ管理 |
| `firecrawl` | npx | FIRECRAWL_API_KEY | Webスクレイピング |
| `supabase` | npx | SUPABASE_ACCESS_TOKEN + project-ref | データベース操作 |
| `memory` | npx | なし | 永続メモリ |
| `sequential-thinking` | npx | なし | Chain-of-Thought推論 |
| `vercel` | HTTP | なし | Vercelデプロイ |
| `railway` | npx | なし | Railwayデプロイ |
| `cloudflare-docs` | HTTP | なし | Cloudflareドキュメント検索 |
| `cloudflare-workers-builds` | HTTP | なし | Workersビルド管理 |
| `cloudflare-workers-bindings` | HTTP | なし | Workersバインディング |
| `cloudflare-observability` | HTTP | なし | ログ・モニタリング |
| `clickhouse` | HTTP | なし | 分析クエリ |
| `exa-web-search` | npx | EXA_API_KEY | Web検索・リサーチ |
| `context7` | npx | なし | ライブドキュメント参照 |
| `magic` | npx | なし | Magic UIコンポーネント |
| `filesystem` | npx | パス設定必要 | ファイルシステム操作 |

---

*このドキュメントは [everything-claude-code](https://github.com/disler/everything-claude-code) リポジトリの分析に基づいて作成されました。*
