---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript/JavaScript コーディングスタイル

> このファイルは [common/coding-style.md](../common/coding-style.md) を TypeScript/JavaScript 固有の内容で拡張します。

## 型とインターフェース

公開API、共有モデル、コンポーネントの props を明示的・可読・再利用可能にするために型を使用する。

### 公開API

- エクスポートされる関数、共有ユーティリティ、公開クラスメソッドにはパラメータ型と戻り値型を付与する
- 明らかなローカル変数の型は TypeScript の推論に任せる
- 繰り返し使われるインラインのオブジェクト形状は名前付き型またはインターフェースに抽出する

```typescript
// 悪い例: 型指定のないエクスポート関数
export function formatUser(user) {
  return `${user.firstName} ${user.lastName}`
}

// 良い例: 公開APIに明示的な型を付与
interface User {
  firstName: string
  lastName: string
}

export function formatUser(user: User): string {
  return `${user.firstName} ${user.lastName}`
}
```

### Interface と Type Alias の使い分け

- 拡張や実装される可能性のあるオブジェクト形状には `interface` を使用
- union、intersection、タプル、マップ型、ユーティリティ型には `type` を使用
- 相互運用性のために `enum` が必要な場合を除き、文字列リテラルの union を優先する

```typescript
interface User {
  id: string
  email: string
}

type UserRole = 'admin' | 'member'
type UserWithRole = User & {
  role: UserRole
}
```

### `any` の回避

- アプリケーションコードで `any` を使用しない
- 外部または信頼できない入力には `unknown` を使い、安全にナローイングする
- 値の型が呼び出し元に依存する場合はジェネリクスを使用する

```typescript
// 悪い例: any は型安全性を失う
function getErrorMessage(error: any) {
  return error.message
}

// 良い例: unknown は安全なナローイングを強制する
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected error'
}
```

### React Props

- コンポーネントの props は名前付き `interface` または `type` で定義する
- コールバック props は明示的に型付けする
- 特別な理由がない限り `React.FC` は使用しない

```typescript
interface User {
  id: string
  email: string
}

interface UserCardProps {
  user: User
  onSelect: (id: string) => void
}

function UserCard({ user, onSelect }: UserCardProps) {
  return <button onClick={() => onSelect(user.id)}>{user.email}</button>
}
```

### JavaScript ファイル

- `.js` / `.jsx` ファイルでは、型があると明確になる場合に JSDoc を使用する（TypeScript 移行が現実的でない場合）
- JSDoc をランタイムの挙動と一致させる

```javascript
/**
 * @param {{ firstName: string, lastName: string }} user
 * @returns {string}
 */
export function formatUser(user) {
  return `${user.firstName} ${user.lastName}`
}
```

## イミュータビリティ

スプレッド演算子を使ったイミュータブルな更新:

```typescript
interface User {
  id: string
  name: string
}

// 悪い例: ミューテーション
function updateUser(user: User, name: string): User {
  user.name = name // ミューテーション!
  return user
}

// 良い例: イミュータブル
function updateUser(user: Readonly<User>, name: string): User {
  return {
    ...user,
    name
  }
}
```

## エラーハンドリング

async/await と try-catch を使い、unknown エラーを安全にナローイングする:

```typescript
interface User {
  id: string
  email: string
}

declare function riskyOperation(userId: string): Promise<User>

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unexpected error'
}

const logger = {
  error: (message: string, error: unknown) => {
    // 本番用ロガー（pino や winston 等）に置き換えること
  }
}

async function loadUser(userId: string): Promise<User> {
  try {
    const result = await riskyOperation(userId)
    return result
  } catch (error: unknown) {
    logger.error('Operation failed', error)
    throw new Error(getErrorMessage(error))
  }
}
```

## 入力バリデーション

Zod を使ったスキーマベースのバリデーションと型推論:

```typescript
import { z } from 'zod'

const userSchema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150)
})

type UserInput = z.infer<typeof userSchema>

const validated: UserInput = userSchema.parse(input)
```

## Console.log

- 本番コードに `console.log` を残さない
- 適切なロギングライブラリを使用する
- 自動検出についてはフックを参照
