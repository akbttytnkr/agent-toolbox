---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
---
# Go テスト

> このファイルは [common/testing.md](../common/testing.md) を Go 固有の内容で拡張します。

## フレームワーク

標準の `go test` と**テーブル駆動テスト**を使用する。

## 競合状態の検出

`-race` フラグを付けて必ず実行する:

```bash
go test -race ./...
```

## カバレッジ

```bash
go test -cover ./...
```

## 参考

スキル: `golang-testing` で詳細な Go テストパターンとヘルパーを参照。
