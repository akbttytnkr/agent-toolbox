---
name: vue-testing-ja
description: Vitest、Vue Test Utils、コンポーネントテスト、コンポーザブルテスト、Playwright を使った E2E テストなど、Vue 3 のテスト戦略。
user-invocable: false
---

# Vue テストパターン

Vitest、Vue Test Utils 2.x、Pinia、Playwright を使った Vue 3 アプリケーションの包括的なテスト戦略。

## 起動タイミング

- 新しい Vue 3 コンポーネント、コンポーザブル、Pinia ストアを実装するとき（TDD に従って red → green → refactor のサイクルを回す）
- Vue 3 / Nuxt 3 プロジェクトのテストスイートを設計するとき
- コンポーネントやコンポーザブルのテストカバレッジをレビューするとき
- Vitest または Playwright の環境をセットアップするとき
- Router のナビゲーションガードやルート依存コンポーネントをテストするとき
- Vue アプリケーションで MSW を使って API コールをモックするとき

## テストの基本方針

### テスト駆動開発（TDD）

常に TDD サイクルに従うこと:

1. **RED**: 期待する振る舞いを定義する失敗テストを書く
2. **GREEN**: テストをパスさせるための最小限のコンポーネント/コンポーザブルを実装する
3. **REFACTOR**: 全テストをグリーンに保ちながら、コードとテストを改善する

```typescript
// ステップ 1: 失敗テストを書く（RED）
// src/components/__tests__/Counter.spec.ts
import { mount } from '@vue/test-utils'
import Counter from '../Counter.vue'

describe('Counter', () => {
  it('increments count when button is clicked', async () => {
    const wrapper = mount(Counter)
    await wrapper.find('[data-testid="increment-btn"]').trigger('click')
    expect(wrapper.find('[data-testid="count"]').text()).toBe('1')
  })
})

// ステップ 2: 最小限の実装を書く（GREEN）
// src/components/Counter.vue
// <template>
//   <span data-testid="count">{{ count }}</span>
//   <button data-testid="increment-btn" @click="count++">+</button>
// </template>
// <script setup lang="ts">
// const count = ref(0)
// </script>

// ステップ 3: 必要に応じてリファクタリング（REFACTOR）
```

### カバレッジ要件

- **目標**: 全体で 80% 以上のコードカバレッジ
- **クリティカルパス**（認証、決済、コアビジネスロジック）: 100% カバレッジ必須
- **コンポーネント**: すべての props、emits、スロットをテストすること

```bash
# カバレッジレポートを生成する
npx vitest run --coverage

# 特定の閾値を指定してカバレッジを計測する
npx vitest run --coverage --coverage.thresholds.lines=80
```

### Vue アプリケーションのテストピラミッド

```
         /\
        /E2E\          <- Playwright: 重要なユーザーフロー
       /------\
      /  Integ  \      <- コンポーネントツリー、ルーター、ストアの統合テスト
     /------------\
    /  Unit Tests  \   <- コンポーネント、コンポーザブル、ストアの単体テスト
   /-----------------\
```

- **ユニット**: 70% — 個々のコンポーネント、コンポーザブル、ストアアクション
- **インテグレーション**: 20% — ルーター/ストアを組み合わせたコンポーネント、複数コンポーネントのフロー
- **E2E**: 10% — 重要なユーザージャーニー（ログイン、チェックアウト、コアワークフロー）

---

## テストのセットアップ

### Vitest の設定

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'e2e'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.d.ts', 'src/main.ts', 'src/router/index.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

### Vue Test Utils のグローバルセットアップ

```typescript
// tests/setup.ts
import { config } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { vi } from 'vitest'

// アイコンやサードパーティ UI コンポーネントのグローバルスタブ
config.global.stubs = {
  'font-awesome-icon': true,
  'router-view': true,
}

// fetch をグローバルに自動モック
global.fetch = vi.fn()

// 各テスト後にすべてのモックをリセット
afterEach(() => {
  vi.restoreAllMocks()
})
```

### 依存パッケージのインストール

```bash
# コアのテスト依存パッケージ
npm install -D vitest @vue/test-utils jsdom

# カバレッジ
npm install -D @vitest/coverage-v8

# Pinia テスト
npm install -D @pinia/testing

# API モック用 MSW
npm install -D msw

# E2E 用 Playwright
npm install -D @playwright/test
```

---

## コンポーネントテスト

### mount と shallowMount の使い分け

```typescript
import { mount, shallowMount } from '@vue/test-utils'
import ParentComponent from '../ParentComponent.vue'

// ✅ GOOD — mount: フルレンダリング、子コンポーネントの実際の振る舞いをテスト
it('renders child component output', () => {
  const wrapper = mount(ParentComponent)
  // 子コンポーネントが実際にレンダリングされる — 統合スタイルのコンポーネントテストに適している
  expect(wrapper.findComponent({ name: 'ChildComponent' }).exists()).toBe(true)
})

// ✅ GOOD — shallowMount: 子コンポーネントをスタブ化、高速なユニットテスト
it('calls onSubmit when form is submitted', async () => {
  const wrapper = shallowMount(ParentComponent)
  // 子コンポーネントはスタブ化される — ParentComponent のロジックにのみ焦点を当てる
  await wrapper.find('form').trigger('submit')
  expect(wrapper.emitted('form-submitted')).toBeTruthy()
})

// ❌ BAD — 親ロジックのみをテストする場合に mount を使う（低速で壊れやすい）
it('shows title text', () => {
  // API を呼び出す子コンポーネントを含むコンポーネントツリー全体を不必要にマウントしている
  const wrapper = mount(ParentComponent)
  expect(wrapper.find('h1').text()).toBe('Title')
})

// ✅ GOOD — 独立した親ロジックには shallowMount で十分
it('shows title text', () => {
  const wrapper = shallowMount(ParentComponent)
  expect(wrapper.find('h1').text()).toBe('Title')
})
```

### Props のテスト

```typescript
// src/components/__tests__/UserCard.spec.ts
import { mount } from '@vue/test-utils'
import UserCard from '../UserCard.vue'

interface User {
  id: number
  name: string
  email: string
  role: 'admin' | 'user'
}

const defaultUser: User = {
  id: 1,
  name: 'Alice Smith',
  email: 'alice@example.com',
  role: 'user',
}

describe('UserCard', () => {
  // ✅ GOOD — 各 prop を個別にテストする
  it('renders user name', () => {
    const wrapper = mount(UserCard, {
      props: { user: defaultUser },
    })
    expect(wrapper.find('[data-testid="user-name"]').text()).toBe('Alice Smith')
  })

  it('shows admin badge when role is admin', () => {
    const wrapper = mount(UserCard, {
      props: { user: { ...defaultUser, role: 'admin' } },
    })
    expect(wrapper.find('[data-testid="admin-badge"]').exists()).toBe(true)
  })

  it('hides admin badge when role is user', () => {
    const wrapper = mount(UserCard, {
      props: { user: defaultUser },
    })
    expect(wrapper.find('[data-testid="admin-badge"]').exists()).toBe(false)
  })

  // ✅ GOOD — setProps で props の更新をテストする
  it('updates when user prop changes', async () => {
    const wrapper = mount(UserCard, {
      props: { user: defaultUser },
    })
    await wrapper.setProps({ user: { ...defaultUser, name: 'Bob Jones' } })
    expect(wrapper.find('[data-testid="user-name"]').text()).toBe('Bob Jones')
  })
})
```

### イベント（emit）のテスト

```typescript
// src/components/__tests__/DeleteButton.spec.ts
import { mount } from '@vue/test-utils'
import DeleteButton from '../DeleteButton.vue'

describe('DeleteButton', () => {
  // ✅ GOOD — emit されたイベント名とペイロードを検証する
  it('emits delete event with item id when clicked', async () => {
    const wrapper = mount(DeleteButton, {
      props: { itemId: 42 },
    })
    await wrapper.find('[data-testid="delete-btn"]').trigger('click')

    expect(wrapper.emitted('delete')).toBeTruthy()
    expect(wrapper.emitted('delete')?.[0]).toEqual([42])
  })

  // ✅ GOOD — emit 前に確認ダイアログが表示されることをテストする
  it('shows confirmation dialog before emitting delete', async () => {
    const wrapper = mount(DeleteButton, {
      props: { itemId: 42, requireConfirm: true },
    })
    await wrapper.find('[data-testid="delete-btn"]').trigger('click')

    // イベントはまだ emit されていないはず
    expect(wrapper.emitted('delete')).toBeFalsy()
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(true)

    // ダイアログを確認する
    await wrapper.find('[data-testid="confirm-yes"]').trigger('click')
    expect(wrapper.emitted('delete')?.[0]).toEqual([42])
  })

  // ❌ BAD — 内部メソッドを直接テストしている
  it('calls handleDelete method', () => {
    const wrapper = mount(DeleteButton, { props: { itemId: 1 } })
    // @ts-expect-error — 内部メソッドにアクセスしている
    wrapper.vm.handleDelete()
    // これは実装の詳細をテストしており、振る舞いではない
  })
})
```

### スロットのテスト

```typescript
// src/components/__tests__/Card.spec.ts
import { mount } from '@vue/test-utils'
import Card from '../Card.vue'

describe('Card', () => {
  // ✅ GOOD — デフォルトスロットのコンテンツがレンダリングされることをテストする
  it('renders default slot content', () => {
    const wrapper = mount(Card, {
      slots: {
        default: '<p data-testid="slot-content">Hello from slot</p>',
      },
    })
    expect(wrapper.find('[data-testid="slot-content"]').text()).toBe('Hello from slot')
  })

  // ✅ GOOD — 名前付きスロットをテストする
  it('renders header and footer named slots', () => {
    const wrapper = mount(Card, {
      slots: {
        header: '<h2>Card Title</h2>',
        default: '<p>Card Body</p>',
        footer: '<button>Action</button>',
      },
    })
    expect(wrapper.find('[data-testid="card-header"]').html()).toContain('Card Title')
    expect(wrapper.find('[data-testid="card-footer"]').html()).toContain('Action')
  })

  // ✅ GOOD — スロットプロップを持つスコープ付きスロットをテストする
  it('passes item data to scoped slot', () => {
    const wrapper = mount(Card, {
      props: { item: { id: 1, label: 'Test Item' } },
      slots: {
        default: `
          <template #default="{ item }">
            <span data-testid="item-label">{{ item.label }}</span>
          </template>
        `,
      },
    })
    expect(wrapper.find('[data-testid="item-label"]').text()).toBe('Test Item')
  })

  // ✅ GOOD — スロットが提供されていない場合のフォールバックコンテンツをテストする
  it('renders fallback content when default slot is empty', () => {
    const wrapper = mount(Card)
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
  })
})
```

### v-model のテスト

```typescript
// src/components/__tests__/SearchInput.spec.ts
import { mount } from '@vue/test-utils'
import SearchInput from '../SearchInput.vue'

describe('SearchInput', () => {
  // ✅ GOOD — v-model の値レンダリングをテストする
  it('displays the modelValue prop', () => {
    const wrapper = mount(SearchInput, {
      props: { modelValue: 'initial query' },
    })
    const input = wrapper.find('input')
    expect((input.element as HTMLInputElement).value).toBe('initial query')
  })

  // ✅ GOOD — v-model の更新 emit をテストする
  it('emits update:modelValue when user types', async () => {
    const wrapper = mount(SearchInput, {
      props: { modelValue: '' },
    })
    await wrapper.find('input').setValue('new query')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['new query'])
  })

  // ✅ GOOD — 双方向バインディングのシミュレーションをテストする
  it('reflects external modelValue changes', async () => {
    const wrapper = mount(SearchInput, {
      props: { modelValue: 'first' },
    })
    await wrapper.setProps({ modelValue: 'updated' })
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('updated')
  })

  // ✅ GOOD — デバウンスされた v-model をテストする
  it('emits update:modelValue after debounce delay', async () => {
    vi.useFakeTimers()
    const wrapper = mount(SearchInput, {
      props: { modelValue: '', debounceMs: 300 },
    })
    await wrapper.find('input').setValue('debounced')

    // まだ emit されていない
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()

    vi.advanceTimersByTime(300)
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['debounced'])
    vi.useRealTimers()
  })
})
```

### flushPromises を使った非同期コンポーネントテスト

```typescript
// src/components/__tests__/UserList.spec.ts
import { mount, flushPromises } from '@vue/test-utils'
import { vi } from 'vitest'
import UserList from '../UserList.vue'
import * as userApi from '@/api/users'

vi.mock('@/api/users')

describe('UserList', () => {
  // ✅ GOOD — flushPromises を await して非同期処理を解決する
  it('renders users after fetching', async () => {
    vi.mocked(userApi.fetchUsers).mockResolvedValue([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ])

    const wrapper = mount(UserList)

    // 最初はローディング状態を表示する
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(true)

    // すべての Promise が解決されるまで待つ
    await flushPromises()

    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="user-item"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid="user-item"]')[0].text()).toBe('Alice')
  })

  // ✅ GOOD — エラー状態をテストする
  it('shows error message when fetch fails', async () => {
    vi.mocked(userApi.fetchUsers).mockRejectedValue(new Error('Network error'))

    const wrapper = mount(UserList)
    await flushPromises()

    expect(wrapper.find('[data-testid="error-message"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="error-message"]').text()).toContain('Network error')
  })

  // ✅ GOOD — 空の状態をテストする
  it('shows empty state when no users returned', async () => {
    vi.mocked(userApi.fetchUsers).mockResolvedValue([])

    const wrapper = mount(UserList)
    await flushPromises()

    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
  })
})
```

---

## コンポーザブルテスト

### コンポーザブルのユニットテスト

```typescript
// src/composables/__tests__/useCounter.spec.ts
import { useCounter } from '../useCounter'

describe('useCounter', () => {
  // ✅ GOOD — テスト内でコンポーザブルを直接呼び出す（コンポーネント不要）
  it('initializes with default count of 0', () => {
    const { count } = useCounter()
    expect(count.value).toBe(0)
  })

  it('initializes with provided initial value', () => {
    const { count } = useCounter(10)
    expect(count.value).toBe(10)
  })

  it('increments count', () => {
    const { count, increment } = useCounter()
    increment()
    expect(count.value).toBe(1)
  })

  it('decrements count', () => {
    const { count, decrement } = useCounter(5)
    decrement()
    expect(count.value).toBe(4)
  })

  it('resets count to initial value', () => {
    const { count, increment, reset } = useCounter(3)
    increment()
    increment()
    reset()
    expect(count.value).toBe(3)
  })

  it('does not decrement below zero when limited', () => {
    const { count, decrement } = useCounter(0, { min: 0 })
    decrement()
    expect(count.value).toBe(0)
  })
})
```

### withSetup ヘルパーパターン

ライフサイクルフック（`onMounted`、`onUnmounted`、`watch`）に依存するコンポーザブルには、アクティブな Vue インスタンスが必要なため `withSetup` を使うこと。

```typescript
// tests/helpers/withSetup.ts
import { createApp, App } from 'vue'

export function withSetup<T>(composable: () => T): [T, App] {
  let result: T
  const app = createApp({
    setup() {
      result = composable()
      return () => {}
    },
  })
  app.mount(document.createElement('div'))
  return [result!, app]
}
```

```typescript
// src/composables/__tests__/useWindowSize.spec.ts
import { withSetup } from '@/tests/helpers/withSetup'
import { useWindowSize } from '../useWindowSize'

describe('useWindowSize', () => {
  // ✅ GOOD — withSetup が onMounted/onUnmounted のライフサイクルコンテキストを提供する
  it('returns current window dimensions', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true })

    const [{ width, height }, app] = withSetup(() => useWindowSize())

    expect(width.value).toBe(1024)
    expect(height.value).toBe(768)

    app.unmount()
  })

  it('updates on window resize', async () => {
    const [{ width }, app] = withSetup(() => useWindowSize())

    Object.defineProperty(window, 'innerWidth', { value: 800, writable: true })
    window.dispatchEvent(new Event('resize'))

    await nextTick()
    expect(width.value).toBe(800)

    app.unmount()
  })

  // ✅ GOOD — アンマウント時のクリーンアップをテストする
  it('removes resize listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    const [, app] = withSetup(() => useWindowSize())
    app.unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
  })
})
```

### ref / computed の検証

```typescript
// src/composables/__tests__/useFilters.spec.ts
import { ref } from 'vue'
import { useFilters } from '../useFilters'

describe('useFilters', () => {
  const items = [
    { id: 1, name: 'Apple', category: 'fruit', price: 1.5 },
    { id: 2, name: 'Banana', category: 'fruit', price: 0.8 },
    { id: 3, name: 'Carrot', category: 'vegetable', price: 0.5 },
  ]

  // ✅ GOOD — ref から派生した computed をテストする
  it('filteredItems computed returns all items initially', () => {
    const { filteredItems, searchQuery } = useFilters(items)
    expect(filteredItems.value).toHaveLength(3)
    expect(searchQuery.value).toBe('')
  })

  it('filteredItems updates reactively when searchQuery changes', async () => {
    const { filteredItems, searchQuery } = useFilters(items)

    searchQuery.value = 'apple'
    await nextTick()

    expect(filteredItems.value).toHaveLength(1)
    expect(filteredItems.value[0].name).toBe('Apple')
  })

  it('filters by category', async () => {
    const { filteredItems, selectedCategory } = useFilters(items)

    selectedCategory.value = 'fruit'
    await nextTick()

    expect(filteredItems.value).toHaveLength(2)
    expect(filteredItems.value.every(i => i.category === 'fruit')).toBe(true)
  })

  it('sortedItems computed sorts by price ascending', async () => {
    const { sortedItems, sortBy } = useFilters(items)

    sortBy.value = 'price'
    await nextTick()

    expect(sortedItems.value[0].price).toBe(0.5)
    expect(sortedItems.value[2].price).toBe(1.5)
  })
})
```

---

## Pinia ストアテスト

### コンポーネントでの createTestingPinia の使用

```typescript
// src/components/__tests__/CartSummary.spec.ts
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { vi } from 'vitest'
import CartSummary from '../CartSummary.vue'
import { useCartStore } from '@/stores/cart'

describe('CartSummary', () => {
  // ✅ GOOD — global plugins 経由で testingPinia を注入する
  it('renders cart item count from store', () => {
    const wrapper = mount(CartSummary, {
      global: {
        plugins: [
          createTestingPinia({
            initialState: {
              cart: {
                items: [
                  { id: 1, name: 'Widget', quantity: 2, price: 9.99 },
                  { id: 2, name: 'Gadget', quantity: 1, price: 19.99 },
                ],
              },
            },
          }),
        ],
      },
    })
    expect(wrapper.find('[data-testid="item-count"]').text()).toBe('3')
  })

  // ✅ GOOD — 削除ボタンクリック時にストアアクションが呼ばれることを検証する
  it('calls removeItem action when remove button clicked', async () => {
    const wrapper = mount(CartSummary, {
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            initialState: {
              cart: {
                items: [{ id: 1, name: 'Widget', quantity: 1, price: 9.99 }],
              },
            },
          }),
        ],
      },
    })

    const store = useCartStore()
    await wrapper.find('[data-testid="remove-btn"]').trigger('click')

    expect(store.removeItem).toHaveBeenCalledWith(1)
  })
})
```

### ストアのユニットテスト

```typescript
// src/stores/__tests__/cart.spec.ts
import { setActivePinia, createPinia } from 'pinia'
import { useCartStore } from '../cart'

describe('useCartStore', () => {
  beforeEach(() => {
    // ✅ GOOD — 各テスト前に新しい pinia を作成する
    setActivePinia(createPinia())
  })

  it('initializes with empty cart', () => {
    const store = useCartStore()
    expect(store.items).toEqual([])
    expect(store.totalPrice).toBe(0)
  })

  it('addItem adds item to cart', () => {
    const store = useCartStore()
    store.addItem({ id: 1, name: 'Widget', price: 9.99, quantity: 1 })

    expect(store.items).toHaveLength(1)
    expect(store.items[0].name).toBe('Widget')
  })

  it('addItem increments quantity for existing item', () => {
    const store = useCartStore()
    store.addItem({ id: 1, name: 'Widget', price: 9.99, quantity: 1 })
    store.addItem({ id: 1, name: 'Widget', price: 9.99, quantity: 1 })

    expect(store.items).toHaveLength(1)
    expect(store.items[0].quantity).toBe(2)
  })

  it('removeItem removes item from cart', () => {
    const store = useCartStore()
    store.addItem({ id: 1, name: 'Widget', price: 9.99, quantity: 1 })
    store.removeItem(1)

    expect(store.items).toHaveLength(0)
  })

  it('clearCart empties all items', () => {
    const store = useCartStore()
    store.addItem({ id: 1, name: 'Widget', price: 9.99, quantity: 2 })
    store.addItem({ id: 2, name: 'Gadget', price: 19.99, quantity: 1 })
    store.clearCart()

    expect(store.items).toHaveLength(0)
  })
})
```

### アクションのモック

```typescript
// src/stores/__tests__/user.spec.ts
import { setActivePinia, createPinia } from 'pinia'
import { vi } from 'vitest'
import { useUserStore } from '../user'
import * as authApi from '@/api/auth'

vi.mock('@/api/auth')

describe('useUserStore — 非同期アクション', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // ✅ GOOD — ストアアクションテストで API コールをモックする
  it('login action sets user on success', async () => {
    vi.mocked(authApi.login).mockResolvedValue({
      id: 1,
      name: 'Alice',
      token: 'jwt-token',
    })

    const store = useUserStore()
    await store.login({ email: 'alice@example.com', password: 'secret' })

    expect(store.currentUser?.name).toBe('Alice')
    expect(store.isAuthenticated).toBe(true)
    expect(store.token).toBe('jwt-token')
  })

  it('login action sets error on failure', async () => {
    vi.mocked(authApi.login).mockRejectedValue(new Error('Invalid credentials'))

    const store = useUserStore()
    await store.login({ email: 'bad@example.com', password: 'wrong' })

    expect(store.currentUser).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(store.error).toBe('Invalid credentials')
  })

  it('logout action clears user state', async () => {
    vi.mocked(authApi.login).mockResolvedValue({ id: 1, name: 'Alice', token: 'token' })
    vi.mocked(authApi.logout).mockResolvedValue(undefined)

    const store = useUserStore()
    await store.login({ email: 'alice@example.com', password: 'secret' })
    await store.logout()

    expect(store.currentUser).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    expect(store.token).toBeNull()
  })
})
```

### ゲッターのテスト

```typescript
// src/stores/__tests__/cart-getters.spec.ts
import { setActivePinia, createPinia } from 'pinia'
import { useCartStore } from '../cart'

describe('useCartStore — ゲッター', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('totalPrice getter calculates sum of all items', () => {
    const store = useCartStore()
    store.addItem({ id: 1, name: 'Widget', price: 10.0, quantity: 2 })
    store.addItem({ id: 2, name: 'Gadget', price: 5.0, quantity: 3 })

    // 2 * 10 + 3 * 5 = 35
    expect(store.totalPrice).toBe(35)
  })

  it('itemCount getter returns total quantity', () => {
    const store = useCartStore()
    store.addItem({ id: 1, name: 'Widget', price: 10.0, quantity: 3 })
    store.addItem({ id: 2, name: 'Gadget', price: 5.0, quantity: 2 })

    expect(store.itemCount).toBe(5)
  })

  it('isEmpty getter returns true when cart has no items', () => {
    const store = useCartStore()
    expect(store.isEmpty).toBe(true)
  })

  it('isEmpty getter returns false when cart has items', () => {
    const store = useCartStore()
    store.addItem({ id: 1, name: 'Widget', price: 10.0, quantity: 1 })
    expect(store.isEmpty).toBe(false)
  })
})
```

---

## ルーターテスト

### テストでの createRouter の使用

```typescript
// src/components/__tests__/NavBar.spec.ts
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory, type Router } from 'vue-router'
import NavBar from '../NavBar.vue'

describe('NavBar', () => {
  let router: Router

  beforeEach(async () => {
    // ✅ GOOD — コンポーネントのルーターテスト用に実際のルーターインスタンスを作成する
    router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
        { path: '/about', name: 'about', component: { template: '<div>About</div>' } },
        { path: '/profile', name: 'profile', component: { template: '<div>Profile</div>' } },
      ],
    })
    await router.push('/')
    await router.isReady()
  })

  it('renders navigation links', () => {
    const wrapper = mount(NavBar, {
      global: { plugins: [router] },
    })
    expect(wrapper.find('[data-testid="nav-home"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="nav-about"]').exists()).toBe(true)
  })

  it('highlights active route link', async () => {
    await router.push('/about')
    const wrapper = mount(NavBar, {
      global: { plugins: [router] },
    })
    expect(wrapper.find('[data-testid="nav-about"]').classes()).toContain('active')
  })

  it('navigates to route when link is clicked', async () => {
    const wrapper = mount(NavBar, {
      global: { plugins: [router] },
    })
    await wrapper.find('[data-testid="nav-about"]').trigger('click')
    expect(router.currentRoute.value.name).toBe('about')
  })
})
```

### ナビゲーションガードのテスト

```typescript
// src/router/__tests__/guards.spec.ts
import { createRouter, createWebHistory, type RouteLocationNormalized } from 'vue-router'
import { setActivePinia, createPinia } from 'pinia'
import { useUserStore } from '@/stores/user'
import { authGuard } from '../guards'

describe('authGuard', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const makeRoute = (path: string, meta: Record<string, unknown> = {}): RouteLocationNormalized => ({
    path,
    fullPath: path,
    meta,
    name: undefined,
    matched: [],
    hash: '',
    query: {},
    params: {},
    redirectedFrom: undefined,
  })

  // ✅ GOOD — コンポーネントをマウントせずにガードロジックを直接テストする
  it('allows navigation to public routes without authentication', () => {
    const store = useUserStore()
    store.isAuthenticated = false

    const to = makeRoute('/login', { requiresAuth: false })
    const from = makeRoute('/')
    const next = vi.fn()

    authGuard(to, from, next)

    expect(next).toHaveBeenCalledWith()
  })

  it('redirects unauthenticated users to login', () => {
    const store = useUserStore()
    store.isAuthenticated = false

    const to = makeRoute('/dashboard', { requiresAuth: true })
    const from = makeRoute('/')
    const next = vi.fn()

    authGuard(to, from, next)

    expect(next).toHaveBeenCalledWith({ name: 'login', query: { redirect: '/dashboard' } })
  })

  it('allows authenticated users to access protected routes', () => {
    const store = useUserStore()
    store.isAuthenticated = true

    const to = makeRoute('/dashboard', { requiresAuth: true })
    const from = makeRoute('/')
    const next = vi.fn()

    authGuard(to, from, next)

    expect(next).toHaveBeenCalledWith()
  })
})
```

### ルートパラメータとクエリのモック

```typescript
// src/components/__tests__/ProductDetail.spec.ts
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { flushPromises } from '@vue/test-utils'
import ProductDetail from '../ProductDetail.vue'

describe('ProductDetail', () => {
  it('fetches product by route param id', async () => {
    const router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/products/:id', name: 'product-detail', component: ProductDetail },
      ],
    })

    // ✅ GOOD — マウント前にパラメータ付きのルートをプッシュする
    await router.push('/products/42')
    await router.isReady()

    vi.mock('@/api/products', () => ({
      fetchProduct: vi.fn().mockResolvedValue({ id: 42, name: 'Widget Pro' }),
    }))

    const wrapper = mount(ProductDetail, {
      global: { plugins: [router] },
    })
    await flushPromises()

    expect(wrapper.find('[data-testid="product-name"]').text()).toBe('Widget Pro')
  })

  it('reads filter from query string', async () => {
    const router = createRouter({
      history: createWebHistory(),
      routes: [{ path: '/products', component: ProductDetail }],
    })

    // ✅ GOOD — クエリパラメータ付きのルートをプッシュする
    await router.push({ path: '/products', query: { sort: 'price', order: 'asc' } })
    await router.isReady()

    const wrapper = mount(ProductDetail, {
      global: { plugins: [router] },
    })

    expect(wrapper.find('[data-testid="sort-indicator"]').text()).toContain('price')
  })
})
```

---

## API / サーバーテスト

### useFetch / useAsyncData のテスト（Nuxt 3）

```typescript
// composables/__tests__/useProducts.spec.ts
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useProducts } from '../useProducts'

// ✅ GOOD — mockNuxtImport を使って Nuxt の自動インポートをモックする
mockNuxtImport('useFetch', () => {
  return vi.fn().mockResolvedValue({
    data: ref([
      { id: 1, name: 'Widget', price: 9.99 },
      { id: 2, name: 'Gadget', price: 19.99 },
    ]),
    error: ref(null),
    pending: ref(false),
    refresh: vi.fn(),
  })
})

describe('useProducts', () => {
  it('returns product list', async () => {
    const { products, isLoading } = await useProducts()
    expect(products.value).toHaveLength(2)
    expect(isLoading.value).toBe(false)
  })
})
```

### MSW を使った fetch のモック

```typescript
// tests/msw/handlers.ts
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ])
  }),

  http.post('/api/users', async ({ request }) => {
    const body = await request.json() as { name: string }
    return HttpResponse.json({ id: 3, name: body.name }, { status: 201 })
  }),

  http.get('/api/users/:id', ({ params }) => {
    const { id } = params
    if (id === '999') {
      return HttpResponse.json({ message: 'Not Found' }, { status: 404 })
    }
    return HttpResponse.json({ id: Number(id), name: 'Alice' })
  }),
]
```

```typescript
// tests/setup.ts（Vitest 用の MSW セットアップ）
import { setupServer } from 'msw/node'
import { handlers } from './msw/handlers'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

```typescript
// src/components/__tests__/UserList.spec.ts — MSW を使用
import { mount, flushPromises } from '@vue/test-utils'
import { http, HttpResponse } from 'msw'
import { server } from '@/tests/setup'
import UserList from '../UserList.vue'

describe('UserList with MSW', () => {
  // ✅ GOOD — MSW が実際の fetch コールをインターセプト、vi.mock 不要
  it('renders users from API', async () => {
    const wrapper = mount(UserList)
    await flushPromises()

    expect(wrapper.findAll('[data-testid="user-item"]')).toHaveLength(2)
  })

  // ✅ GOOD — 特定のテストシナリオ向けにハンドラーを上書きする
  it('shows error when API returns 500', async () => {
    server.use(
      http.get('/api/users', () => {
        return HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 })
      })
    )

    const wrapper = mount(UserList)
    await flushPromises()

    expect(wrapper.find('[data-testid="error-message"]').exists()).toBe(true)
  })
})
```

### サーバールートのテスト（Nuxt 3）

```typescript
// server/api/__tests__/users.spec.ts
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils'

// ✅ GOOD — @nuxt/test-utils を使ってサーバールートをフルテストする
await setup({
  server: true,
})

describe('GET /api/users', () => {
  it('returns list of users', async () => {
    const users = await $fetch('/api/users')
    expect(Array.isArray(users)).toBe(true)
    expect(users.length).toBeGreaterThan(0)
  })

  it('returns 401 without auth token', async () => {
    await expect($fetch('/api/users/me')).rejects.toMatchObject({
      response: { status: 401 },
    })
  })

  it('returns user by id', async () => {
    const user = await $fetch('/api/users/1')
    expect(user).toMatchObject({ id: 1 })
  })
})
```

---

## Playwright を使った E2E テスト

### Playwright の設定

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

### ページ遷移のテスト

```typescript
// e2e/navigation.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Page Navigation', () => {
  test('navigates from home to about page', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Home/)

    await page.click('[data-testid="nav-about"]')
    await expect(page).toHaveURL('/about')
    await expect(page.locator('h1')).toContainText('About')
  })

  test('browser back button restores previous page', async ({ page }) => {
    await page.goto('/')
    await page.click('[data-testid="nav-about"]')
    await expect(page).toHaveURL('/about')

    await page.goBack()
    await expect(page).toHaveURL('/')
  })

  test('redirects to 404 page for unknown routes', async ({ page }) => {
    await page.goto('/this-route-does-not-exist')
    await expect(page.locator('[data-testid="not-found"]')).toBeVisible()
    await expect(page).toHaveURL('/404')
  })
})
```

### フォーム操作のテスト

```typescript
// e2e/contact-form.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Contact Form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact')
  })

  test('submits form with valid data', async ({ page }) => {
    await page.fill('[data-testid="name-input"]', 'Alice Smith')
    await page.fill('[data-testid="email-input"]', 'alice@example.com')
    await page.fill('[data-testid="message-input"]', 'Hello, this is a test message.')

    await page.click('[data-testid="submit-btn"]')

    await expect(page.locator('[data-testid="success-message"]')).toBeVisible()
    await expect(page.locator('[data-testid="success-message"]')).toContainText('Message sent')
  })

  test('shows validation errors for empty fields', async ({ page }) => {
    await page.click('[data-testid="submit-btn"]')

    await expect(page.locator('[data-testid="name-error"]')).toBeVisible()
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible()
    await expect(page.locator('[data-testid="message-error"]')).toBeVisible()
  })

  test('shows error for invalid email format', async ({ page }) => {
    await page.fill('[data-testid="email-input"]', 'not-an-email')
    await page.click('[data-testid="submit-btn"]')

    await expect(page.locator('[data-testid="email-error"]')).toContainText('valid email')
  })
})
```

### 認証フローのテスト

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('logs in with valid credentials', async ({ page }) => {
    await page.goto('/login')

    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-btn"]')

    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('[data-testid="user-greeting"]')).toContainText('Welcome')
  })

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login')

    await page.fill('[data-testid="email-input"]', 'wrong@example.com')
    await page.fill('[data-testid="password-input"]', 'wrongpassword')
    await page.click('[data-testid="login-btn"]')

    await expect(page.locator('[data-testid="login-error"]')).toBeVisible()
    await expect(page).toHaveURL('/login')
  })

  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/login')
    await expect(page.locator('[data-testid="redirect-notice"]')).toBeVisible()
  })

  test('logs out and clears session', async ({ page }) => {
    // まずログインする
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-btn"]')
    await expect(page).toHaveURL('/dashboard')

    // ログアウトする
    await page.click('[data-testid="logout-btn"]')
    await expect(page).toHaveURL('/login')

    // セッションがクリアされていることを確認する
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/login')
  })
})
```

### 再利用可能な認証フィクスチャ（Playwright）

```typescript
// e2e/fixtures/auth.ts
import { test as base, expect } from '@playwright/test'

type AuthFixtures = {
  authenticatedPage: import('@playwright/test').Page
}

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // このフィクスチャを使う各テストの前にログインする
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', process.env.TEST_USER_EMAIL!)
    await page.fill('[data-testid="password-input"]', process.env.TEST_USER_PASSWORD!)
    await page.click('[data-testid="login-btn"]')
    await expect(page).toHaveURL('/dashboard')
    await use(page)
  },
})

// 使い方:
// import { test } from '@/e2e/fixtures/auth'
// test('accesses protected resource', async ({ authenticatedPage }) => { ... })
```

---

## モックパターン

### vi.mock によるモジュールモック

```typescript
// ✅ GOOD — モジュールレベルでモック、Vitest によってホイスティングされる
vi.mock('@/api/products', () => ({
  fetchProducts: vi.fn(),
  createProduct: vi.fn(),
  deleteProduct: vi.fn(),
}))

// ✅ GOOD — ファクトリーを使った部分モック、他のエクスポートは実際のものを保持する
vi.mock('@/utils/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/date')>()
  return {
    ...actual,
    formatDate: vi.fn().mockReturnValue('2026-01-01'),
  }
})

// ❌ BAD — テスト関数内でモックする（モックがホイスティングされず、問題を引き起こす可能性がある）
it('test', () => {
  vi.mock('@/api/products') // 信頼できない — モジュールスコープでモックすること
})
```

### コンポーネントのスタブ

```typescript
// ✅ GOOD — 重いコンポーネントや外部コンポーネントをグローバルにスタブ化する
const wrapper = mount(MyPage, {
  global: {
    stubs: {
      // 空のコンポーネントとしてスタブ化
      HeavyChartComponent: true,
      // カスタムテンプレートでスタブ化
      RouterLink: {
        template: '<a :href="to"><slot /></a>',
        props: ['to'],
      },
      // テスト中の DOM 問題を防ぐために Teleport をスタブ化
      Teleport: true,
    },
  },
})

// ✅ GOOD — 親の振る舞いを切り離すために子コンポーネントをスタブ化する
const wrapper = mount(ParentComponent, {
  global: {
    stubs: {
      ChildComponent: {
        template: '<div data-testid="child-stub" />',
      },
    },
  },
})
expect(wrapper.find('[data-testid="child-stub"]').exists()).toBe(true)
```

### グローバルプラグインのモック

```typescript
// ✅ GOOD — グローバル設定で i18n プラグインをモックする
import { createI18n } from 'vue-i18n'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: { greeting: 'Hello', submit: 'Submit' },
  },
})

const wrapper = mount(MyComponent, {
  global: {
    plugins: [i18n],
  },
})

// ✅ GOOD — i18n をフルセットアップせずにテストで $t をスタブ化する
const wrapper = mount(MyComponent, {
  global: {
    mocks: {
      $t: (key: string) => key, // 翻訳キーをそのまま返す
    },
  },
})
expect(wrapper.find('[data-testid="title"]').text()).toBe('page.title')
```

### provide/inject のモック

```typescript
// ✅ GOOD — inject を使うコンポーネントをテストするため、mount 時に値を provide する
import { mount } from '@vue/test-utils'
import { THEME_KEY } from '@/symbols'
import ThemedButton from '../ThemedButton.vue'

describe('ThemedButton', () => {
  it('applies dark theme class when theme is dark', () => {
    const wrapper = mount(ThemedButton, {
      global: {
        provide: {
          [THEME_KEY as symbol]: ref('dark'),
        },
      },
    })
    expect(wrapper.find('button').classes()).toContain('theme-dark')
  })

  it('applies light theme class when theme is light', () => {
    const wrapper = mount(ThemedButton, {
      global: {
        provide: {
          [THEME_KEY as symbol]: ref('light'),
        },
      },
    })
    expect(wrapper.find('button').classes()).toContain('theme-light')
  })
})
```

---

## テストの構成

### ディレクトリ構造

```
src/
├── components/
│   ├── UserCard.vue
│   ├── CartSummary.vue
│   └── __tests__/            # コンポーネントと同じ場所にテストを配置
│       ├── UserCard.spec.ts
│       └── CartSummary.spec.ts
├── composables/
│   ├── useCounter.ts
│   └── __tests__/
│       └── useCounter.spec.ts
├── stores/
│   ├── cart.ts
│   └── __tests__/
│       └── cart.spec.ts
└── router/
    ├── index.ts
    └── __tests__/
        └── guards.spec.ts

tests/
├── setup.ts                  # グローバルテストセットアップ、MSW サーバー
├── helpers/
│   └── withSetup.ts          # withSetup コンポーザブルヘルパー
└── msw/
    └── handlers.ts           # MSW リクエストハンドラー

e2e/
├── fixtures/
│   └── auth.ts               # Playwright 認証フィクスチャ
├── auth.spec.ts
├── navigation.spec.ts
└── contact-form.spec.ts
```

### テストの命名規則

```typescript
// ✅ GOOD — describe ブロックでコンポーネント/コンポーザブル/ストアを名前付けする
describe('UserCard', () => {
  // ✅ GOOD — it/test で検証する具体的な振る舞いを説明する
  it('renders user name from props', () => { ... })
  it('shows admin badge when user role is admin', () => { ... })
  it('emits click event with user id when card is clicked', () => { ... })
})

// ✅ GOOD — 関連するシナリオをグループ化するためにネストした describe を使う
describe('useCartStore', () => {
  describe('addItem', () => {
    it('adds new item to empty cart', () => { ... })
    it('increments quantity when same item added twice', () => { ... })
  })

  describe('removeItem', () => {
    it('removes item by id', () => { ... })
    it('does nothing when item id does not exist', () => { ... })
  })
})

// ❌ BAD — 曖昧で説明不足なテスト名
it('works', () => { ... })
it('test 1', () => { ... })
it('should render', () => { ... })
```

### セットアップファイル

```typescript
// tests/setup.ts — Vitest グローバルセットアップファイル
import { config } from '@vue/test-utils'
import { setupServer } from 'msw/node'
import { handlers } from './msw/handlers'
import { vi, afterEach, beforeAll, afterAll } from 'vitest'

// MSW サーバー
export const server = setupServer(...handlers)
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Vue Test Utils グローバル設定
config.global.stubs = {
  Teleport: true,
  Transition: false,
}

// 各テスト後にすべての vi モックをリセットする
afterEach(() => {
  vi.restoreAllMocks()
})
```

---

## ベストプラクティス

### DO

- **TDD に従う**: まずテストを書いてから実装する
- **テストを同じ場所に置く**: テスト対象のソースファイルの隣に `__tests__/` を配置する
- **`data-testid` を使う**: CSS クラスや DOM 構造ではなくテスト ID で要素を選択する
- **`flushPromises` を使う**: Vue Test Utils での非同期コンポーネント更新は常に await する
- **子の振る舞いが重要な場合は `mount` を優先**し、純粋なユニット分離には `shallowMount` を使う
- **テスト間で状態をリセットする**: 各ストアテストの前に `setActivePinia(createPinia())` を実行する
- **API モックには MSW を使う**: モジュールをモックするのではなく HTTP レベルでネットワークをインターセプトする
- **振る舞いをテストし、実装をテストしない**: ユーザーが見て操作するものを検証する
- **ライフサイクルフックに依存するコンポーザブルには `withSetup` を使う**

### DON'T

- **`wrapper.vm` の内部メソッドにアクセスしない**: 公開 DOM インターフェースを通じてテストする
- **テストで `setTimeout` を使わない**: `vi.useFakeTimers()` と `vi.advanceTimersByTime()` を使う
- **コンポーネント HTML 全体のスナップショットを撮らない**: スナップショットは壊れやすくノイズが多い；特定の要素をテストすること
- **`await nextTick()` を省略しない**: Vue の DOM 更新は非同期なので、変更をトリガーした後は常に await する
- **テスト間でミュータブルな状態を共有しない**: 各テストは完全に独立していること
- **コンポーネントテストから Pinia ストアの内部をテストしない**: ストアのユニットテストは別途行う
- **`vue-router` を完全にモックしない**: `createRouter` で実際のルーターインスタンスを作成する

---

## クイックリファレンス

| パターン | ツール / API | ユースケース |
|---|---|---|
| コンポーネントをフルツリーでマウント | `mount()` | 統合スタイルのコンポーネントテスト |
| 子コンポーネントをスタブ化してマウント | `shallowMount()` | 単一コンポーネントの純粋なユニットテスト |
| DOM イベントをトリガー | `wrapper.trigger('click')` | ユーザー操作のシミュレーション |
| 入力値を設定 | `wrapper.find('input').setValue('x')` | フォーム入力のテスト |
| 非同期更新を待つ | `await flushPromises()` | API コールや非同期ステートの後 |
| DOM 更新を待つ | `await nextTick()` | リアクティブなステート変更の後 |
| emit されたイベントを確認 | `wrapper.emitted('event-name')` | emit とペイロードを検証する |
| props を更新 | `await wrapper.setProps({ prop: value })` | props のリアクティビティをテストする |
| コンポーザブルのライフサイクルをテスト | `withSetup()` ヘルパー | onMounted/onUnmounted を持つコンポーザブル |
| ストアの独立テスト | `setActivePinia(createPinia())` | テストごとに新しいストアステート |
| コンポーネントテストでのストア | `createTestingPinia()` | マウントされたコンポーネントでストアをモック |
| モジュールをモック | `vi.mock('@/api/module')` | 実際の API コールから切り離す |
| タイマーをモック | `vi.useFakeTimers()` | デバウンス、スロットル、setTimeout |
| HTTP リクエストをインターセプト | MSW `http.get('/api/...')` | モジュールモックなしのリアルな API モック |
| E2E ページナビゲーション | `page.goto('/path')` | Playwright フルブラウザテスト |
| E2E 要素操作 | `page.click('[data-testid="btn"]')` | Playwright ユーザーアクション |
| E2E アサーション | `expect(page.locator(...)).toBeVisible()` | Playwright 要素アサーション |
| カバレッジレポート | `vitest run --coverage` | テストされていないコードパスの特定 |

**Remember**: ユーザーの振る舞いをテストし、実装の詳細はテストしないこと — 振る舞いを変えずにリファクタリングしたときにテストが壊れるなら、そのテストは間違ったものをテストしている。

