---
name: vue-patterns-ja
description: Vue 3 Composition API、Pinia 状態管理、Nuxt 3 パターン、および堅牢で効率的かつ保守性の高い Vue アプリケーションを構築するためのベストプラクティス。
user-invocable: false
---

# Vue 開発パターン

Vue 3 Composition API パターン、Pinia 状態管理、Nuxt 3 のベストプラクティスを用いて、型安全でパフォーマンスに優れた保守性の高いアプリケーションを構築します。

## 適用タイミング

- Composition API と `<script setup>` を使った Vue 3 コンポーネントの構築
- Pinia ストア（Setup Store パターン）による状態管理
- Nuxt 3 の `useFetch` / `useAsyncData` を使ったデータ取得の実装
- 再利用可能なロジックをカプセル化するコンポーザブル（`useXxx`）の設計
- Vue Router または Nuxt ファイルベースルーティングによるルーティングのセットアップ
- 遅延ロード、`v-memo`、仮想リストを用いたパフォーマンス最適化
- `onErrorCaptured` とグローバルエラーハンドラーによるエラーハンドリング
- Nuxt 3 サーバールート、ミドルウェア、プラグインの構成

## コア原則

### Composition API ファースト

Composition API を常に使用してください。Options API はレガシーであり、新規コードでは使用しないでください。

```typescript
// ✅ GOOD: <script setup> を使った Composition API
<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  initialCount?: number
}

const props = withDefaults(defineProps<Props>(), {
  initialCount: 0,
})

const count = ref(props.initialCount)
const doubled = computed(() => count.value * 2)

function increment() {
  count.value++
}
</script>

<template>
  <div>
    <p>Count: {{ count }} (doubled: {{ doubled }})</p>
    <button @click="increment">Increment</button>
  </div>
</template>
```

```typescript
// ❌ BAD: Options API - 新規コードでは使用しない
export default {
  data() {
    return { count: 0 }
  },
  computed: {
    doubled() {
      return this.count * 2
    },
  },
  methods: {
    increment() {
      this.count++
    },
  },
}
```

### TypeScript 統合

`<script setup>` では常に `lang="ts"` を付けて TypeScript を使用してください。Props、Emits、データ構造には明示的なインターフェースを定義してください。

```typescript
// ✅ GOOD: 完全な TypeScript 統合
<script setup lang="ts">
interface User {
  id: number
  name: string
  email: string
  role: 'admin' | 'user'
}

interface Props {
  user: User
  isEditable?: boolean
}

interface Emits {
  (e: 'update', user: User): void
  (e: 'delete', id: number): void
}

const props = withDefaults(defineProps<Props>(), {
  isEditable: false,
})

const emit = defineEmits<Emits>()
</script>
```

## プロジェクト構成

### Vue / Nuxt 推奨レイアウト

```text
my-nuxt-app/
├── assets/               # Vite で処理される静的アセット
├── components/
│   ├── base/             # 汎用再利用コンポーネント（BaseButton, BaseInput）
│   ├── ui/               # UI 固有コンポーネント（Modal, Toast）
│   └── feature/          # 機能固有コンポーネント（UserCard, ProductList）
├── composables/          # 自動インポートされるコンポーザブル（useAuth, useCart）
├── layouts/              # Nuxt レイアウトコンポーネント（default.vue, auth.vue）
├── middleware/           # Nuxt ルートミドルウェア
├── pages/                # ファイルベースルーティング（Nuxt）
│   ├── index.vue
│   ├── users/
│   │   ├── index.vue     # /users
│   │   └── [id].vue      # /users/:id
│   └── admin/
│       └── [...slug].vue # /admin/*（キャッチオール）
├── plugins/              # Nuxt プラグイン
├── public/               # そのまま配信される静的ファイル
├── server/
│   ├── api/              # サーバールート（/api/*）
│   └── middleware/       # サーバーサイドミドルウェア
├── stores/               # Pinia ストア
├── types/                # 共有 TypeScript 型定義
├── utils/                # 純粋なユーティリティ関数（Nuxt では自動インポート）
├── app.vue
├── nuxt.config.ts
└── tsconfig.json
```

### ファイル命名規則

```text
# コンポーネント: PascalCase
components/UserCard.vue
components/base/BaseButton.vue

# コンポーザブル: 'use' プレフィックスの camelCase
composables/useAuth.ts
composables/useLocalStorage.ts

# ストア: 'use' プレフィックスの camelCase
stores/useUserStore.ts
stores/useCartStore.ts

# ページ: kebab-case（Nuxt 慣例）
pages/user-profile.vue
pages/products/[id].vue

# ユーティリティ / 型: camelCase
utils/formatDate.ts
types/index.ts
```

## Composition API パターン

### ref と reactive の使い分け

すべてのリアクティブ状態には `ref` を使用してください。`reactive` は常に全体としてアクセスし、ルート参照を置き換える必要がない複雑なオブジェクトにのみ使用してください。

```typescript
// ✅ GOOD: プリミティブとオブジェクトには ref を使用
const count = ref(0)
const user = ref<User | null>(null)
const items = ref<Item[]>([])

// スクリプト内では .value でアクセス、テンプレートでは自動アンラップ
count.value++
user.value = { id: 1, name: 'Alice', email: 'alice@example.com', role: 'user' }
```

```typescript
// ❌ BAD: プリミティブに reactive を使用 - 分割代入でリアクティビティが失われる
const state = reactive({ count: 0, name: '' })
const { count } = state  // count は通常の数値になり、リアクティブではない！

// ✅ GOOD: reactive オブジェクトが必要な場合、分割代入時に toRefs を使用
const state = reactive({ count: 0, name: '' })
const { count, name } = toRefs(state)  // count と name は Ref になる
```

```typescript
// ❌ BAD: プリミティブを reactive でラップ
const count = reactive(0)  // Vue 3 では TypeError

// ✅ GOOD: プリミティブには常に ref を使用
const count = ref(0)
```

### computed

```typescript
// ✅ GOOD: computed による派生状態
<script setup lang="ts">
const products = ref<Product[]>([])
const searchQuery = ref('')
const selectedCategory = ref<string | null>(null)

// computed チェーンは効率的 - 依存関係が変わったときのみ再計算
const filteredByCategory = computed(() =>
  selectedCategory.value
    ? products.value.filter(p => p.category === selectedCategory.value)
    : products.value
)

const filteredProducts = computed(() =>
  searchQuery.value.trim()
    ? filteredByCategory.value.filter(p =>
        p.name.toLowerCase().includes(searchQuery.value.toLowerCase())
      )
    : filteredByCategory.value
)

const totalPrice = computed(() =>
  filteredProducts.value.reduce((sum, p) => sum + p.price, 0)
)
</script>
```

```typescript
// ✅ GOOD: 双方向の派生状態には書き込み可能な computed を使用
const firstName = ref('Alice')
const lastName = ref('Smith')

const fullName = computed({
  get: () => `${firstName.value} ${lastName.value}`,
  set: (value: string) => {
    const [first, ...rest] = value.split(' ')
    firstName.value = first
    lastName.value = rest.join(' ')
  },
})
```

### watch / watchEffect

```typescript
// ✅ GOOD: 新旧の値を使った特定の依存関係の watch
watch(
  () => route.params.id,
  async (newId, oldId) => {
    if (newId !== oldId) {
      await fetchUser(String(newId))
    }
  }
)

// ✅ GOOD: 複数ソースの watch
watch(
  [searchQuery, selectedFilter],
  ([query, filter]) => {
    performSearch(query, filter)
  },
  { debounce: 300 }  // VueUse スタイル; それ以外は手動デバウンスを使用
)

// ✅ GOOD: 依存関係の自動追跡には watchEffect を使用
watchEffect(async () => {
  // 自動追跡: currentPage.value, pageSize.value, sortBy.value
  const result = await fetchItems({
    page: currentPage.value,
    size: pageSize.value,
    sort: sortBy.value,
  })
  items.value = result.data
})

// ✅ GOOD: ウォッチャーを手動で停止
const stop = watchEffect(() => {
  console.log('count:', count.value)
})

// 不要になったら停止
onUnmounted(() => stop())
```

```typescript
// ❌ BAD: 非同期処理のクリーンアップなしの watch
watch(userId, async (id) => {
  // userId が素早く変化すると、レスポンスが順不同で届く可能性がある！
  const user = await fetchUser(id)
  currentUser.value = user
})

// ✅ GOOD: onWatcherCleanup（Vue 3.5+）または onCleanup によるクリーンアップ
watch(userId, async (id, _, onCleanup) => {
  let cancelled = false
  onCleanup(() => { cancelled = true })

  const user = await fetchUser(id)
  if (!cancelled) {
    currentUser.value = user
  }
})
```

### provide / inject

```typescript
// ✅ GOOD: InjectionKey を使った型安全な provide/inject
// types/injection-keys.ts
import type { InjectionKey, Ref } from 'vue'

export interface ThemeContext {
  theme: Ref<'light' | 'dark'>
  toggleTheme: () => void
}

export const ThemeKey: InjectionKey<ThemeContext> = Symbol('theme')
```

```typescript
// ParentComponent.vue
<script setup lang="ts">
import { provide, ref } from 'vue'
import { ThemeKey } from '@/types/injection-keys'

const theme = ref<'light' | 'dark'>('light')

function toggleTheme() {
  theme.value = theme.value === 'light' ? 'dark' : 'light'
}

provide(ThemeKey, { theme, toggleTheme })
</script>
```

```typescript
// ChildComponent.vue - ツリーの深い場所にある子コンポーネント
<script setup lang="ts">
import { inject } from 'vue'
import { ThemeKey } from '@/types/injection-keys'

const themeContext = inject(ThemeKey)
// themeContext は ThemeContext | undefined - 未提供のケースを処理する
if (!themeContext) throw new Error('ThemeKey not provided')

const { theme, toggleTheme } = themeContext
</script>
```

### defineProps / defineEmits / defineExpose

```typescript
// ✅ GOOD: 型のみの宣言（Vue 3.3+）
<script setup lang="ts">
interface Props {
  title: string
  count?: number
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
}

interface Emits {
  (e: 'submit', value: string): void
  (e: 'cancel'): void
}

const props = withDefaults(defineProps<Props>(), {
  count: 0,
  variant: 'primary',
  disabled: false,
})

const emit = defineEmits<Emits>()

// 親コンポーネントに必要なものだけ公開（デフォルト: 何も公開しない）
const inputRef = ref<HTMLInputElement | null>(null)

defineExpose({
  focus: () => inputRef.value?.focus(),
  clear: () => { /* ... */ },
})
</script>
```

## コンポーザブル（カスタムフック）

### useXxx 命名と状態のカプセル化

```typescript
// ✅ GOOD: 状態をカプセル化したコンポーザブル
// composables/useCounter.ts
import { ref, computed } from 'vue'

interface UseCounterOptions {
  initialValue?: number
  min?: number
  max?: number
}

export function useCounter(options: UseCounterOptions = {}) {
  const { initialValue = 0, min = -Infinity, max = Infinity } = options

  const count = ref(initialValue)

  const isAtMin = computed(() => count.value <= min)
  const isAtMax = computed(() => count.value >= max)

  function increment(step = 1) {
    count.value = Math.min(count.value + step, max)
  }

  function decrement(step = 1) {
    count.value = Math.max(count.value - step, min)
  }

  function reset() {
    count.value = initialValue
  }

  return { count: readonly(count), isAtMin, isAtMax, increment, decrement, reset }
}
```

### 再利用可能なロジックの抽出

```typescript
// ✅ GOOD: useLocalStorage コンポーザブル
// composables/useLocalStorage.ts
import { ref, watch } from 'vue'

export function useLocalStorage<T>(key: string, defaultValue: T) {
  const storedValue = localStorage.getItem(key)
  const initial = storedValue ? (JSON.parse(storedValue) as T) : defaultValue

  const value = ref<T>(initial)

  watch(
    value,
    (newValue) => {
      if (newValue === null || newValue === undefined) {
        localStorage.removeItem(key)
      } else {
        localStorage.setItem(key, JSON.stringify(newValue))
      }
    },
    { deep: true }
  )

  return value
}

// 使用例
const theme = useLocalStorage<'light' | 'dark'>('theme', 'light')
```

```typescript
// ✅ GOOD: アボートサポート付きの useFetch コンポーザブル
// composables/useFetch.ts
import { ref, shallowRef } from 'vue'

interface UseFetchReturn<T> {
  data: Ref<T | null>
  error: Ref<Error | null>
  pending: Ref<boolean>
  execute: () => Promise<void>
}

export function useFetch<T>(url: string | (() => string)): UseFetchReturn<T> {
  const data = shallowRef<T | null>(null)
  const error = ref<Error | null>(null)
  const pending = ref(false)
  let controller: AbortController | null = null

  async function execute() {
    controller?.abort()
    controller = new AbortController()

    pending.value = true
    error.value = null

    try {
      const resolvedUrl = typeof url === 'function' ? url() : url
      const response = await fetch(resolvedUrl, { signal: controller.signal })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      data.value = await response.json()
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        error.value = err as Error
      }
    } finally {
      pending.value = false
    }
  }

  onUnmounted(() => controller?.abort())

  return { data, error, pending, execute }
}
```

### useAsyncData（Nuxt）

```typescript
// ✅ GOOD: 適切な型付けとオプションを使った Nuxt の useAsyncData
<script setup lang="ts">
const route = useRoute()

const { data: user, status, error, refresh } = await useAsyncData(
  `user-${route.params.id}`,  // 重複排除とキャッシュのための一意キー
  () => $fetch<User>(`/api/users/${route.params.id}`),
  {
    watch: [() => route.params.id],  // パラメーター変更時に再フェッチ
    transform: (user) => ({
      ...user,
      fullName: `${user.firstName} ${user.lastName}`,
    }),
  }
)

// ジェネリクスで型付け - user は Ref<TransformedUser | null>
</script>
```

## コンポーネント設計

### SFC のベストプラクティス

```vue
<!-- ✅ GOOD: 適切に構成された SFC -->
<script setup lang="ts">
// 1. インポート
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/stores/useUserStore'
import type { Product } from '@/types'

// 2. Props & Emits
interface Props {
  categoryId: string
  pageSize?: number
}

const props = withDefaults(defineProps<Props>(), { pageSize: 20 })
const emit = defineEmits<{ (e: 'select', product: Product): void }>()

// 3. ストアとコンポーザブル
const userStore = useUserStore()

// 4. リアクティブ状態
const products = ref<Product[]>([])
const isLoading = ref(false)

// 5. Computed
const canPurchase = computed(() => userStore.isAuthenticated && products.value.length > 0)

// 6. メソッド
async function loadProducts() {
  isLoading.value = true
  try {
    products.value = await $fetch(`/api/categories/${props.categoryId}/products`)
  } finally {
    isLoading.value = false
  }
}

// 7. ライフサイクル
onMounted(loadProducts)
</script>

<template>
  <div class="product-grid">
    <div v-if="isLoading" class="loading-state" aria-busy="true">
      <BaseSpinner />
    </div>

    <template v-else>
      <ProductCard
        v-for="product in products"
        :key="product.id"
        :product="product"
        :can-purchase="canPurchase"
        @select="emit('select', product)"
      />
    </template>
  </div>
</template>
```

### スロットパターン

```typescript
// ✅ GOOD: フォールバックコンテンツ付きのデフォルトスロット
<!-- DataTable.vue -->
<template>
  <table>
    <thead>
      <tr>
        <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
      </tr>
    </thead>
    <tbody>
      <!-- デフォルトスロット: 呼び出し元が行のレンダリングを制御 -->
      <slot v-if="$slots.default" />
      <!-- フォールバック: 自動的に行をレンダリング -->
      <template v-else>
        <tr v-for="row in data" :key="row.id">
          <td v-for="col in columns" :key="col.key">{{ row[col.key] }}</td>
        </tr>
      </template>
    </tbody>
  </table>
</template>
```

```typescript
// ✅ GOOD: 名前付きスロットとスコープ付きスロット
<!-- CardLayout.vue -->
<template>
  <div class="card">
    <header v-if="$slots.header" class="card-header">
      <slot name="header" />
    </header>

    <main class="card-body">
      <!-- スコープ付きスロット: 内部状態を呼び出し元に公開 -->
      <slot :is-loading="isLoading" :error="error" />
    </main>

    <footer v-if="$slots.footer" class="card-footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<!-- 使用例 -->
<CardLayout>
  <template #header>
    <h2>User Profile</h2>
  </template>

  <!-- 分割代入を使ったスコープ付きスロット -->
  <template #default="{ isLoading, error }">
    <LoadingSpinner v-if="isLoading" />
    <ErrorMessage v-else-if="error" :message="error.message" />
    <UserDetails v-else />
  </template>

  <template #footer>
    <BaseButton>Edit</BaseButton>
  </template>
</CardLayout>
```

### v-model 設計パターン

```typescript
// ✅ GOOD: defineModel を使った v-model（Vue 3.4+）
<!-- BaseInput.vue -->
<script setup lang="ts">
interface Props {
  placeholder?: string
  disabled?: boolean
}

defineProps<Props>()

// defineModel が自動的に双方向バインディングを作成
const model = defineModel<string>({ default: '' })
</script>

<template>
  <input
    :value="model"
    :placeholder="placeholder"
    :disabled="disabled"
    @input="model = ($event.target as HTMLInputElement).value"
  />
</template>

<!-- 使用例: ネイティブの v-model とまったく同じように動作 -->
<BaseInput v-model="username" placeholder="Enter username" />
```

```typescript
// ✅ GOOD: 複数の名前付き v-model バインディング（Vue 3.4+）
<!-- DateRangePicker.vue -->
<script setup lang="ts">
const startDate = defineModel<string>('start', { required: true })
const endDate = defineModel<string>('end', { required: true })
</script>

<!-- 使用例 -->
<DateRangePicker v-model:start="rangeStart" v-model:end="rangeEnd" />
```

## 状態管理（Pinia）

### Setup ストア（推奨）

TypeScript サポートとコンポーザブルの統合をより良くするために、Options ストアよりも Setup ストアを推奨します。

```typescript
// ✅ GOOD: Setup ストアパターン
// stores/useUserStore.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

interface User {
  id: number
  name: string
  email: string
  role: 'admin' | 'user'
}

export const useUserStore = defineStore('user', () => {
  // 状態
  const currentUser = ref<User | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // ゲッター（computed）
  const isAuthenticated = computed(() => currentUser.value !== null)
  const isAdmin = computed(() => currentUser.value?.role === 'admin')
  const displayName = computed(() => currentUser.value?.name ?? 'Guest')

  // アクション
  async function login(email: string, password: string) {
    isLoading.value = true
    error.value = null

    try {
      const user = await $fetch<User>('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      currentUser.value = user
    } catch (err) {
      error.value = (err as Error).message
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    currentUser.value = null
  }

  function $reset() {
    currentUser.value = null
    isLoading.value = false
    error.value = null
  }

  return {
    // 状態（適切な箇所では readonly として公開）
    currentUser: readonly(currentUser),
    isLoading: readonly(isLoading),
    error: readonly(error),
    // ゲッター
    isAuthenticated,
    isAdmin,
    displayName,
    // アクション
    login,
    logout,
    $reset,
  }
})
```

### ストアの分割

データ型ではなくドメインでストアを整理してください。各ストアは一つの境界コンテキストを所有します。

```typescript
// ✅ GOOD: ドメイン駆動のストア分割
stores/
├── useAuthStore.ts       # 認証: ログイン、ログアウト、セッション
├── useCartStore.ts       # ショッピングカート: アイテム、合計額、チェックアウト
├── useProductStore.ts    # 商品カタログ: 一覧、検索、フィルター
├── useOrderStore.ts      # 注文: 履歴、ステータス、トラッキング
└── useUIStore.ts         # UI 状態: モーダル、トースト、サイドバー

// ❌ BAD: モノリシックなストア
stores/useAppStore.ts     # すべてを一つのストアに
```

### pinia-plugin-persistedstate による永続化

```typescript
// ✅ GOOD: 選択的な永続化
// stores/useSettingsStore.ts
import { defineStore } from 'pinia'

export const useSettingsStore = defineStore(
  'settings',
  () => {
    const theme = ref<'light' | 'dark'>('light')
    const language = ref('en')
    const notificationsEnabled = ref(true)

    return { theme, language, notificationsEnabled }
  },
  {
    persist: {
      // 特定のフィールドのみ永続化
      pick: ['theme', 'language'],
      // localStorage の代わりに sessionStorage を使用
      storage: sessionStorage,
    },
  }
)
```

## ルーティング（Vue Router / Nuxt）

### 型安全なルーティング

```typescript
// ✅ GOOD: Nuxt の型付きルート（nuxt.config.ts で有効化）
// nuxt.config.ts
export default defineNuxtConfig({
  experimental: {
    typedPages: true,  // 型付きルートヘルパーを生成
  },
})

// コンポーネント内での使用
<script setup lang="ts">
const router = useRouter()

// 完全な型付け - TypeScript が各ルートのパラメーターを認識
await router.push({ name: 'users-id', params: { id: '42' } })
</script>
```

### ナビゲーションガード

```typescript
// ✅ GOOD: 認証のための Nuxt ミドルウェア
// middleware/auth.ts
export default defineNuxtRouteMiddleware((to) => {
  const authStore = useAuthStore()

  if (!authStore.isAuthenticated) {
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath },  // 意図した遷移先を保持
    })
  }

  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }
})
```

```typescript
// ✅ GOOD: onBeforeRouteLeave を使ったコンポーネント内ガード
<script setup lang="ts">
import { onBeforeRouteLeave } from 'vue-router'

const hasUnsavedChanges = ref(false)

onBeforeRouteLeave((to, from, next) => {
  if (hasUnsavedChanges.value) {
    const confirmed = window.confirm('You have unsaved changes. Leave anyway?')
    next(confirmed)
  } else {
    next()
  }
})
</script>
```

### 動的ルートとネストされたルート（Nuxt pages/）

```text
pages/
├── index.vue                     # /
├── about.vue                     # /about
├── users/
│   ├── index.vue                 # /users
│   └── [id]/
│       ├── index.vue             # /users/:id
│       └── settings.vue          # /users/:id/settings
├── products/
│   ├── [...slug].vue             # /products/*（キャッチオール）
│   └── [[category]].vue          # /products/:category?（省略可能パラメーター）
└── (auth)/                       # ルートグループ（Nuxt 3.9+ で URL セグメントなし）
    ├── login.vue
    └── register.vue
```

```typescript
// ✅ GOOD: 適切な型付きルートパラメーターへのアクセス
<script setup lang="ts">
const route = useRoute()

// Nuxt 型付きページは各ルートの型を生成
const userId = computed(() => route.params.id as string)

// ページレベルの設定には definePageMeta を使用
definePageMeta({
  middleware: ['auth'],
  layout: 'dashboard',
  keepalive: true,
})
</script>
```

## パフォーマンス最適化

### 遅延ロードのための defineAsyncComponent

```typescript
// ✅ GOOD: 重いコンポーネントを遅延ロード
<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const HeavyChart = defineAsyncComponent({
  loader: () => import('./HeavyChart.vue'),
  loadingComponent: ChartSkeleton,
  errorComponent: ChartError,
  delay: 200,       // 200ms 後にローディングコンポーネントを表示
  timeout: 10000,   // 10 秒でロードできない場合はエラー
})

// Nuxt: 自動的な遅延ロードには <LazyXxx> プレフィックスを使用
// <LazyHeavyChart /> は defineAsyncComponent と同等
</script>

<template>
  <Suspense>
    <HeavyChart :data="chartData" />
    <template #fallback>
      <ChartSkeleton />
    </template>
  </Suspense>
</template>
```

### v-once と v-memo

```typescript
// ✅ GOOD: 変化しない静的コンテンツには v-once を使用
<template>
  <header v-once>
    <!-- このブロックは初回レンダリング後に再レンダリングされない -->
    <AppLogo />
    <nav><!-- 静的ナビゲーションアイテム --></nav>
  </header>
</template>
```

```typescript
// ✅ GOOD: 特定の依存関係が変わらない場合に再レンダリングをスキップする v-memo
<template>
  <!-- item.id または selected が変わったときのみ再レンダリング -->
  <div
    v-for="item in list"
    :key="item.id"
    v-memo="[item.id, item === selected]"
  >
    <ItemRow :item="item" :is-selected="item === selected" />
  </div>
</template>
```

### shallowRef / shallowReactive

```typescript
// ✅ GOOD: 深いリアクティビティが不要な大きな配列/オブジェクトには shallowRef を使用
<script setup lang="ts">
import { shallowRef, triggerRef } from 'vue'

// 大規模データセット - 参照の変更のみ追跡し、深い変更は追跡しない
const rows = shallowRef<Row[]>([])

async function loadData() {
  const data = await fetchLargeDataset()
  rows.value = data  // 代入でリアクティビティをトリガー
}

// インプレースで変更する必要がある場合は手動でトリガー
function addRow(row: Row) {
  rows.value.push(row)
  triggerRef(rows)  // Vue に変更を手動で通知
}
</script>
```

### リストの仮想化

```typescript
// ✅ GOOD: vue-virtual-scroller を使った仮想スクロール
<script setup lang="ts">
import { RecycleScroller } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'

interface Props {
  items: Item[]
}

defineProps<Props>()
</script>

<template>
  <RecycleScroller
    class="scroller"
    :items="items"
    :item-size="72"
    key-field="id"
    v-slot="{ item }"
  >
    <ItemRow :item="item" />
  </RecycleScroller>
</template>

<style scoped>
.scroller {
  height: 600px;
}
</style>
```

### Nuxt ハイブリッドレンダリング

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  routeRules: {
    // SSG: ビルド時に事前レンダリング（マーケティングページ）
    '/': { prerender: true },
    '/about': { prerender: true },

    // ISR 付き SSR: 1 時間ごとに再生成
    '/products/**': { isr: 3600 },

    // SPA: クライアントのみのレンダリング（ダッシュボード、認証済みページ）
    '/dashboard/**': { ssr: false },

    // API: CDN エッジで 60 秒キャッシュ
    '/api/public/**': { cache: { maxAge: 60 } },
  },
})
```

## エラーハンドリング

### onErrorCaptured

```typescript
// ✅ GOOD: 子コンポーネントからのエラーをキャッチ
<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'

const error = ref<Error | null>(null)
const hasError = ref(false)

onErrorCaptured((err, instance, info) => {
  console.error(`Error in ${info}:`, err)
  error.value = err
  hasError.value = true

  // 親エラーハンドラーへの伝播を停止するには false を返す
  return false
})

function retry() {
  hasError.value = false
  error.value = null
}
</script>

<template>
  <div v-if="hasError" class="error-boundary" role="alert">
    <p>Something went wrong: {{ error?.message }}</p>
    <button @click="retry">Try Again</button>
  </div>
  <slot v-else />
</template>
```

### ErrorBoundary コンポーネント

```typescript
// ✅ GOOD: 再利用可能な ErrorBoundary コンポーネント
<!-- components/ErrorBoundary.vue -->
<script setup lang="ts">
interface Props {
  fallback?: string
}

const props = withDefaults(defineProps<Props>(), {
  fallback: 'An error occurred. Please try again.',
})

const error = ref<Error | null>(null)

onErrorCaptured((err) => {
  error.value = err
  return false
})
</script>

<template>
  <slot v-if="!error" />
  <div v-else class="error-fallback" role="alert" aria-live="assertive">
    <slot name="error" :error="error" :reset="() => (error = null)">
      <p>{{ fallback }}</p>
      <button @click="error = null">Retry</button>
    </slot>
  </div>
</template>

<!-- 使用例 -->
<ErrorBoundary>
  <template #error="{ error, reset }">
    <ErrorMessage :message="error.message" @retry="reset" />
  </template>
  <DataVisualization :data="chartData" />
</ErrorBoundary>
```

### グローバルエラーハンドラー

```typescript
// ✅ GOOD: Nuxt プラグインの app.config.errorHandler
// plugins/error-handler.client.ts
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.config.errorHandler = (error, instance, info) => {
    // モニタリングサービス（例: Sentry）にログを送信
    console.error('[Global Error Handler]', {
      error,
      component: instance?.$options.name ?? 'Anonymous',
      info,
    })

    // エラートラッキングに報告
    if (process.client) {
      // Sentry.captureException(error)
    }
  }

  // 未処理の Promise 拒否を処理
  nuxtApp.hook('app:error', (error) => {
    console.error('[Nuxt App Error]', error)
  })
})
```

## Nuxt 3 パターン

### サーバールート（server/api/）

```typescript
// ✅ GOOD: Zod バリデーション付きの型安全なサーバールート
// server/api/users/[id].get.ts
import { z } from 'zod'

const paramsSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
})

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)

  const user = await db.user.findUnique({ where: { id } })

  if (!user) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  return user
})
```

```typescript
// ✅ GOOD: ボディバリデーション付きの POST ルート
// server/api/users/index.post.ts
import { z } from 'zod'

const bodySchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(['admin', 'user']).default('user'),
})

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)

  const user = await db.user.create({ data: body })

  setResponseStatus(event, 201)
  return user
})
```

### useFetch / useAsyncData

```typescript
// ✅ GOOD: シンプルなケースには useFetch を使用（自動キー生成）
<script setup lang="ts">
const { data: posts, status } = await useFetch<Post[]>('/api/posts', {
  query: { page: 1, limit: 10 },
  // URL + クエリで自動的に重複排除
})
</script>
```

```typescript
// ✅ GOOD: 複雑なケースには useAsyncData を使用
<script setup lang="ts">
const route = useRoute()
const { user } = useAuthStore()

const { data, refresh, error } = await useAsyncData(
  // 一意キー - フェッチに影響するすべての変数を含める
  `post-${route.params.slug}-${user?.id}`,
  async () => {
    const [post, comments] = await Promise.all([
      $fetch<Post>(`/api/posts/${route.params.slug}`),
      $fetch<Comment[]>(`/api/posts/${route.params.slug}/comments`),
    ])
    return { post, comments }
  },
  {
    watch: [() => route.params.slug],
    getCachedData(key, nuxtApp) {
      // 利用可能ならキャッシュデータを使用（重複リクエストを回避）
      return nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]
    },
  }
)
</script>
```

### useState（SSR セーフな状態）

```typescript
// ✅ GOOD: SSR セーフな共有状態には useState を使用
// composables/useColorMode.ts
export function useColorMode() {
  // useState はペイロードにシリアライズされる - SSR/ハイドレーション境界を超えて安全
  const colorMode = useState<'light' | 'dark'>('colorMode', () => 'light')

  function toggle() {
    colorMode.value = colorMode.value === 'light' ? 'dark' : 'light'
  }

  return { colorMode: readonly(colorMode), toggle }
}

// ❌ BAD: モジュールレベルの ref() - SSR セーフではない（リクエスト間で共有される！）
const colorMode = ref<'light' | 'dark'>('light')  // 状態リークを引き起こす！
```

### ミドルウェア

```typescript
// ✅ GOOD: 名前付きミドルウェア（definePageMeta でページごとに適用）
// middleware/verified.ts
export default defineNuxtRouteMiddleware(() => {
  const { user } = useAuthStore()

  if (!user.value?.emailVerified) {
    return navigateTo('/verify-email')
  }
})

// pages/dashboard.vue
<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'verified'],  // 順番に適用
})
</script>
```

### プラグイン

```typescript
// ✅ GOOD: グローバルセットアップ用の Nuxt プラグイン
// plugins/analytics.client.ts  （.client = クライアントのみ）
export default defineNuxtPlugin({
  name: 'analytics',
  setup(nuxtApp) {
    const router = useRouter()

    // ページビューをトラッキング
    router.afterEach((to) => {
      // analytics.trackPageView(to.fullPath)
    })

    // アプリに提供
    return {
      provide: {
        track: (event: string, data?: Record<string, unknown>) => {
          // analytics.track(event, data)
        },
      },
    }
  },
})

// コンポーネント内での使用
<script setup lang="ts">
const { $track } = useNuxtApp()
$track('button_clicked', { label: 'Sign Up' })
</script>
```

## 避けるべきアンチパターン

```typescript
// ❌ BAD: 新規コードで Options API を使用
export default {
  data() { return { count: 0 } },
  methods: { increment() { this.count++ } },
}

// ✅ GOOD: <script setup> を使った Composition API
const count = ref(0)
const increment = () => count.value++
```

```typescript
// ❌ BAD: プリミティブを reactive でラップ
const count = reactive(0)  // TypeError!
const isLoading = reactive(false)  // TypeError!

// ✅ GOOD: プリミティブには ref を使用
const count = ref(0)
const isLoading = ref(false)
```

```typescript
// ❌ BAD: Props を直接変更
<script setup lang="ts">
const props = defineProps<{ modelValue: string }>()

function handleInput(e: Event) {
  props.modelValue = (e.target as HTMLInputElement).value  // 実行時警告！
}
</script>

// ✅ GOOD: 親の状態を更新するためにイベントを emit
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

function handleInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}
```

```typescript
// ❌ BAD: 同じ要素に v-if と v-for を使用
<template>
  <!-- v-for が先にスコープを作成し、その後 v-if が外部変数にアクセスできない -->
  <li v-for="user in users" v-if="user.isActive" :key="user.id">
    {{ user.name }}
  </li>
</template>

// ✅ GOOD: template でラップするか、computed でフィルタリング
<template>
  <template v-for="user in users" :key="user.id">
    <li v-if="user.isActive">{{ user.name }}</li>
  </template>
</template>

// またはより良い方法: computed でフィルタリング
const activeUsers = computed(() => users.value.filter(u => u.isActive))
```

```typescript
// ❌ BAD: Pinia での過度なグローバル状態
// すべてを一つのストアに、すべての状態がグローバル
export const useAppStore = defineStore('app', () => {
  const user = ref(null)
  const cart = ref([])
  const products = ref([])
  const orders = ref([])
  const theme = ref('light')
  // ... さらに 50 以上のフィールド
})

// ✅ GOOD: ドメイン分割されたストア
// useAuthStore, useCartStore, useProductStore, useOrderStore, useUIStore
```

```typescript
// ❌ BAD: Nuxt でのモジュールレベルの SSR 非安全な状態
// この ref はすべてのサーバーリクエスト間で共有される！
const globalData = ref<Data | null>(null)

// ✅ GOOD: SSR セーフなコンポーネント間状態には useState() を使用
const globalData = useState<Data | null>('global-data', () => null)
```

## クイックリファレンス

| パターン | API / ツール | 説明 |
|---------|-----------|-------|
| リアクティブなプリミティブ | `ref()` | スクリプト内では `.value` でアクセス |
| リアクティブなオブジェクト（全体として保持） | `reactive()` | `toRefs` なしで分割代入しない |
| 派生状態 | `computed()` | キャッシュ済み; 依存関係が変わったときのみ再計算 |
| 副作用 | `watchEffect()` | 依存関係を自動追跡; 明示的な場合は `watch()` |
| 浅いリアクティビティ | `shallowRef()` | 大きな配列/オブジェクト; パフォーマンス向上 |
| コンポーネント間の状態（Nuxt SSR） | `useState()` | ペイロードにシリアライズ; SSR セーフ |
| ローカルコンポーネント状態 | `ref()` / `computed()` | コンポーネントインスタンスにスコープ |
| グローバル状態 | Pinia Setup ストア | `defineStore('id', () => { ... })` |
| 非同期データ（Nuxt） | `useAsyncData()` | 重複排除、キャッシュ、SSR 対応 |
| シンプルなデータフェッチ（Nuxt） | `useFetch()` | `useAsyncData` + `$fetch` の省略形 |
| サーバールート | `server/api/*.ts` | `defineEventHandler`、Zod バリデーション |
| 遅延コンポーネント | `defineAsyncComponent()` | または Nuxt の `<LazyXxx />` |
| ルートミドルウェア | `middleware/*.ts` | `definePageMeta` で適用 |
| プラグイン | `plugins/*.ts` | `.client.ts` / `.server.ts` サフィックス |
| エラーバウンダリー | `onErrorCaptured()` | `return false` で伝播を停止 |
| Props バインディング | `defineProps<T>()` | 型のみ、ランタイムスキーマ不要 |
| 双方向バインディング | `defineModel()` | Vue 3.4+; `modelValue` パターンを置換 |
| 依存性の注入 | `provide` / `inject` + `InjectionKey<T>` | 型安全なシンボルキー |
| 再利用可能なロジック | `useXxx()` コンポーザブル | 状態とメソッドを一緒にカプセル化 |

**覚えておくべきこと**: すべてのコンポーネントで `<script setup>` と Composition API および TypeScript を優先してください - これはどんな代替手段よりも簡潔で、型が正確で、ツリーシェイクがしやすい構成です。

