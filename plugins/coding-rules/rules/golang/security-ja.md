---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
---
# Go セキュリティ

> このファイルは [common/security.md](../common/security.md) を Go 固有の内容で拡張します。

## シークレット管理

```go
apiKey := os.Getenv("OPENAI_API_KEY")
if apiKey == "" {
    log.Fatal("OPENAI_API_KEY not configured")
}
```

## セキュリティスキャン

- 静的セキュリティ分析には **gosec** を使用:
  ```bash
  gosec ./...
  ```

## Context とタイムアウト

タイムアウト制御には必ず `context.Context` を使用する:

```go
ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
defer cancel()
```
