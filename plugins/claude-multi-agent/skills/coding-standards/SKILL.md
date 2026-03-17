---
name: coding-standards
description: TypeScript、JavaScript、React、Node.js開発のための汎用コーディング標準、ベストプラクティス、パターン。
---

# コーディング標準とベストプラクティス

すべてのプロジェクトに適用される汎用的なコーディング標準。

## コード品質の原則

### 1. 可読性優先

* コードは書くよりも読まれることが多い
* 明確な変数名と関数名
* コメントよりも自己文書化コードを優先
* 一貫したフォーマット

### 2. KISS (Keep It Simple, Stupid)

* 機能する最もシンプルなソリューションを採用
* 過剰設計を避ける
* 早すぎる最適化を避ける
* 理解しやすさ > 巧妙なコード

### 3. DRY (Don't Repeat Yourself)

* 共通ロジックを関数に抽出
* 再利用可能なコンポーネントを作成
* ユーティリティ関数をモジュール間で共有
* コピー&ペーストプログラミングを避ける

### 4. YAGNI (You Aren't Gonna Need It)

* 必要ない機能を事前に構築しない
* 推測的な一般化を避ける
* 必要なときのみ複雑さを追加
* シンプルに始めて、必要に応じてリファクタリング

## テスト標準

### テスト構造（AAAパターン）

```typescript
test('calculates similarity correctly', () => {
  // Arrange
  const vector1 = [1, 0, 0]
  const vector2 = [0, 1, 0]

  // Act
  const similarity = calculateCosineSimilarity(vector1, vector2)

  // Assert
  expect(similarity).toBe(0)
})
```

### テストの命名

```typescript
// ✅ GOOD: Descriptive test names
test('returns empty array when no markets match query', () => { })
test('throws error when OpenAI API key is missing', () => { })
test('falls back to substring search when Redis unavailable', () => { })

// ❌ BAD: Vague test names
test('works', () => { })
test('test search', () => { })
```

## コードスメルの検出

以下のアンチパターンに注意してください。

### 1. 長い関数

```typescript
// ❌ BAD: Function > 50 lines
function processMarketData() {
  // 100 lines of code
}

// ✅ GOOD: Split into smaller functions
function processMarketData() {
  const validated = validateData()
  const transformed = transformData(validated)
  return saveData(transformed)
}
```

### 2. 深いネスト

```typescript
// ❌ BAD: 5+ levels of nesting
if (user) {
  if (user.isAdmin) {
    if (market) {
      if (market.isActive) {
        if (hasPermission) {
          // Do something
        }
      }
    }
  }
}

// ✅ GOOD: Early returns
if (!user) return
if (!user.isAdmin) return
if (!market) return
if (!market.isActive) return
if (!hasPermission) return

// Do something
```

### 3. マジックナンバー

```typescript
// ❌ BAD: Unexplained numbers
if (retryCount > 3) { }
setTimeout(callback, 500)

// ✅ GOOD: Named constants
const MAX_RETRIES = 3
const DEBOUNCE_DELAY_MS = 500

if (retryCount > MAX_RETRIES) { }
setTimeout(callback, DEBOUNCE_DELAY_MS)
```

**覚えておいてください**: コード品質は妥協できません。明確で保守可能なコードにより、迅速な開発と自信を持ったリファクタリングが可能になります。
