---
name: vue-testing
description: Vue 3 testing strategies using Vitest, Vue Test Utils, component testing, composable testing, and E2E testing with Playwright.
user-invocable: false
---

# Vue Testing Patterns

Comprehensive testing strategies for Vue 3 applications using Vitest, Vue Test Utils 2.x, Pinia, and Playwright.

## When to Activate

- Writing new Vue 3 components, composables, or Pinia stores (follow TDD: red, green, refactor)
- Designing test suites for Vue 3 / Nuxt 3 projects
- Reviewing component or composable test coverage
- Setting up Vitest or Playwright infrastructure
- Testing Router navigation guards and route-aware components
- Mocking API calls with MSW in Vue applications

## Core Testing Philosophy

### Test-Driven Development (TDD)

Always follow the TDD cycle:

1. **RED**: Write a failing test that defines the desired behavior
2. **GREEN**: Write the minimal component/composable code to make the test pass
3. **REFACTOR**: Improve code and tests while keeping all tests green

```typescript
// Step 1: Write failing test (RED)
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

// Step 2: Write minimal implementation (GREEN)
// src/components/Counter.vue
// <template>
//   <span data-testid="count">{{ count }}</span>
//   <button data-testid="increment-btn" @click="count++">+</button>
// </template>
// <script setup lang="ts">
// const count = ref(0)
// </script>

// Step 3: Refactor if needed (REFACTOR)
```

### Coverage Requirements

- **Target**: 80%+ code coverage overall
- **Critical paths** (auth, payments, core business logic): 100% coverage required
- **Components**: All props, emits, and slots must be tested

```bash
# Generate coverage report
npx vitest run --coverage

# Coverage with specific thresholds
npx vitest run --coverage --coverage.thresholds.lines=80
```

### Test Pyramid for Vue Applications

```
         /\
        /E2E\          <- Playwright: critical user flows
       /------\
      /  Integ  \      <- Component trees, router, store integration
     /------------\
    /  Unit Tests  \   <- Components, composables, stores in isolation
   /-----------------\
```

- **Unit**: 70% — individual components, composables, store actions
- **Integration**: 20% — components with router/store, multi-component flows
- **E2E**: 10% — critical user journeys (login, checkout, core workflows)

---

## Test Setup

### Vitest Configuration

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

### Vue Test Utils Global Setup

```typescript
// tests/setup.ts
import { config } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { vi } from 'vitest'

// Global stubs for icons, third-party UI components
config.global.stubs = {
  'font-awesome-icon': true,
  'router-view': true,
}

// Auto-mock fetch globally
global.fetch = vi.fn()

// Reset all mocks after each test
afterEach(() => {
  vi.restoreAllMocks()
})
```

### Installing Dependencies

```bash
# Core testing dependencies
npm install -D vitest @vue/test-utils jsdom

# Coverage
npm install -D @vitest/coverage-v8

# Pinia testing
npm install -D @pinia/testing

# MSW for API mocking
npm install -D msw

# Playwright for E2E
npm install -D @playwright/test
```

---

## Component Testing

### mount vs shallowMount

```typescript
import { mount, shallowMount } from '@vue/test-utils'
import ParentComponent from '../ParentComponent.vue'

// ✅ GOOD — mount: full rendering, tests real child component behavior
it('renders child component output', () => {
  const wrapper = mount(ParentComponent)
  // Real child components render — good for integration-style component tests
  expect(wrapper.findComponent({ name: 'ChildComponent' }).exists()).toBe(true)
})

// ✅ GOOD — shallowMount: stubs all child components, faster unit tests
it('calls onSubmit when form is submitted', async () => {
  const wrapper = shallowMount(ParentComponent)
  // Child components are stubbed — focuses test on ParentComponent logic only
  await wrapper.find('form').trigger('submit')
  expect(wrapper.emitted('form-submitted')).toBeTruthy()
})

// ❌ BAD — using mount when testing only parent logic (slow, brittle)
it('shows title text', () => {
  // Unnecessarily mounts entire component tree including API-calling children
  const wrapper = mount(ParentComponent)
  expect(wrapper.find('h1').text()).toBe('Title')
})

// ✅ GOOD — shallowMount is sufficient for isolated parent logic
it('shows title text', () => {
  const wrapper = shallowMount(ParentComponent)
  expect(wrapper.find('h1').text()).toBe('Title')
})
```

### Props Testing

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
  // ✅ GOOD — test each prop in isolation
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

  // ✅ GOOD — test prop updates with setProps
  it('updates when user prop changes', async () => {
    const wrapper = mount(UserCard, {
      props: { user: defaultUser },
    })
    await wrapper.setProps({ user: { ...defaultUser, name: 'Bob Jones' } })
    expect(wrapper.find('[data-testid="user-name"]').text()).toBe('Bob Jones')
  })
})
```

### Events (emit) Testing

```typescript
// src/components/__tests__/DeleteButton.spec.ts
import { mount } from '@vue/test-utils'
import DeleteButton from '../DeleteButton.vue'

describe('DeleteButton', () => {
  // ✅ GOOD — verify emitted event name and payload
  it('emits delete event with item id when clicked', async () => {
    const wrapper = mount(DeleteButton, {
      props: { itemId: 42 },
    })
    await wrapper.find('[data-testid="delete-btn"]').trigger('click')

    expect(wrapper.emitted('delete')).toBeTruthy()
    expect(wrapper.emitted('delete')?.[0]).toEqual([42])
  })

  // ✅ GOOD — test confirm dialog before emit
  it('shows confirmation dialog before emitting delete', async () => {
    const wrapper = mount(DeleteButton, {
      props: { itemId: 42, requireConfirm: true },
    })
    await wrapper.find('[data-testid="delete-btn"]').trigger('click')

    // Event should NOT be emitted yet
    expect(wrapper.emitted('delete')).toBeFalsy()
    expect(wrapper.find('[data-testid="confirm-dialog"]').exists()).toBe(true)

    // Confirm the dialog
    await wrapper.find('[data-testid="confirm-yes"]').trigger('click')
    expect(wrapper.emitted('delete')?.[0]).toEqual([42])
  })

  // ❌ BAD — testing internal method directly
  it('calls handleDelete method', () => {
    const wrapper = mount(DeleteButton, { props: { itemId: 1 } })
    // @ts-expect-error — accessing internal method
    wrapper.vm.handleDelete()
    // This tests implementation detail, not behavior
  })
})
```

### Slots Testing

```typescript
// src/components/__tests__/Card.spec.ts
import { mount } from '@vue/test-utils'
import Card from '../Card.vue'

describe('Card', () => {
  // ✅ GOOD — test default slot content renders
  it('renders default slot content', () => {
    const wrapper = mount(Card, {
      slots: {
        default: '<p data-testid="slot-content">Hello from slot</p>',
      },
    })
    expect(wrapper.find('[data-testid="slot-content"]').text()).toBe('Hello from slot')
  })

  // ✅ GOOD — test named slots
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

  // ✅ GOOD — test scoped slot with slot props
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

  // ✅ GOOD — test fallback content when no slot provided
  it('renders fallback content when default slot is empty', () => {
    const wrapper = mount(Card)
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
  })
})
```

### v-model Testing

```typescript
// src/components/__tests__/SearchInput.spec.ts
import { mount } from '@vue/test-utils'
import SearchInput from '../SearchInput.vue'

describe('SearchInput', () => {
  // ✅ GOOD — test v-model value rendering
  it('displays the modelValue prop', () => {
    const wrapper = mount(SearchInput, {
      props: { modelValue: 'initial query' },
    })
    const input = wrapper.find('input')
    expect((input.element as HTMLInputElement).value).toBe('initial query')
  })

  // ✅ GOOD — test v-model update emission
  it('emits update:modelValue when user types', async () => {
    const wrapper = mount(SearchInput, {
      props: { modelValue: '' },
    })
    await wrapper.find('input').setValue('new query')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['new query'])
  })

  // ✅ GOOD — test two-way binding simulation
  it('reflects external modelValue changes', async () => {
    const wrapper = mount(SearchInput, {
      props: { modelValue: 'first' },
    })
    await wrapper.setProps({ modelValue: 'updated' })
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('updated')
  })

  // ✅ GOOD — test debounced v-model
  it('emits update:modelValue after debounce delay', async () => {
    vi.useFakeTimers()
    const wrapper = mount(SearchInput, {
      props: { modelValue: '', debounceMs: 300 },
    })
    await wrapper.find('input').setValue('debounced')

    // Not emitted yet
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()

    vi.advanceTimersByTime(300)
    await nextTick()

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['debounced'])
    vi.useRealTimers()
  })
})
```

### Async Component Testing with flushPromises

```typescript
// src/components/__tests__/UserList.spec.ts
import { mount, flushPromises } from '@vue/test-utils'
import { vi } from 'vitest'
import UserList from '../UserList.vue'
import * as userApi from '@/api/users'

vi.mock('@/api/users')

describe('UserList', () => {
  // ✅ GOOD — await flushPromises to resolve async operations
  it('renders users after fetching', async () => {
    vi.mocked(userApi.fetchUsers).mockResolvedValue([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ])

    const wrapper = mount(UserList)

    // Initially shows loading state
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(true)

    // Wait for all promises to resolve
    await flushPromises()

    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-testid="user-item"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid="user-item"]')[0].text()).toBe('Alice')
  })

  // ✅ GOOD — test error state
  it('shows error message when fetch fails', async () => {
    vi.mocked(userApi.fetchUsers).mockRejectedValue(new Error('Network error'))

    const wrapper = mount(UserList)
    await flushPromises()

    expect(wrapper.find('[data-testid="error-message"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="error-message"]').text()).toContain('Network error')
  })

  // ✅ GOOD — test empty state
  it('shows empty state when no users returned', async () => {
    vi.mocked(userApi.fetchUsers).mockResolvedValue([])

    const wrapper = mount(UserList)
    await flushPromises()

    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true)
  })
})
```

---

## Composable Testing

### Composable Unit Test

```typescript
// src/composables/__tests__/useCounter.spec.ts
import { useCounter } from '../useCounter'

describe('useCounter', () => {
  // ✅ GOOD — call composable directly in test (no component needed)
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

### withSetup Helper Pattern

Use `withSetup` when composables rely on lifecycle hooks (`onMounted`, `onUnmounted`, `watch`) that require an active Vue instance.

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
  // ✅ GOOD — withSetup provides lifecycle context for onMounted/onUnmounted
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

  // ✅ GOOD — test cleanup on unmount
  it('removes resize listener on unmount', () => {
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener')

    const [, app] = withSetup(() => useWindowSize())
    app.unmount()

    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
  })
})
```

### ref / computed Verification

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

  // ✅ GOOD — test computed derived from ref
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

## Pinia Store Testing

### createTestingPinia Usage in Components

```typescript
// src/components/__tests__/CartSummary.spec.ts
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { vi } from 'vitest'
import CartSummary from '../CartSummary.vue'
import { useCartStore } from '@/stores/cart'

describe('CartSummary', () => {
  // ✅ GOOD — inject testingPinia via global plugins
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

  // ✅ GOOD — verify store action is called
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

### Store Unit Testing

```typescript
// src/stores/__tests__/cart.spec.ts
import { setActivePinia, createPinia } from 'pinia'
import { useCartStore } from '../cart'

describe('useCartStore', () => {
  beforeEach(() => {
    // ✅ GOOD — create a fresh pinia before each test
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

### Actions Mocking

```typescript
// src/stores/__tests__/user.spec.ts
import { setActivePinia, createPinia } from 'pinia'
import { vi } from 'vitest'
import { useUserStore } from '../user'
import * as authApi from '@/api/auth'

vi.mock('@/api/auth')

describe('useUserStore — async actions', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  // ✅ GOOD — mock API calls in store action tests
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

### Getters Testing

```typescript
// src/stores/__tests__/cart-getters.spec.ts
import { setActivePinia, createPinia } from 'pinia'
import { useCartStore } from '../cart'

describe('useCartStore — getters', () => {
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

## Router Testing

### createRouter in Tests

```typescript
// src/components/__tests__/NavBar.spec.ts
import { mount } from '@vue/test-utils'
import { createRouter, createWebHistory, type Router } from 'vue-router'
import NavBar from '../NavBar.vue'

describe('NavBar', () => {
  let router: Router

  beforeEach(async () => {
    // ✅ GOOD — create a real router instance for component router tests
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

### Navigation Guard Testing

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

  // ✅ GOOD — test guard logic directly without mounting a component
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

### Route Params and Query Mocking

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

    // ✅ GOOD — push route with params before mounting
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

    // ✅ GOOD — push route with query params
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

## API / Server Testing

### useFetch / useAsyncData Testing (Nuxt 3)

```typescript
// composables/__tests__/useProducts.spec.ts
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { useProducts } from '../useProducts'

// ✅ GOOD — use mockNuxtImport to mock Nuxt auto-imports
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

### fetch Mocking with MSW

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
// tests/setup.ts (MSW setup for Vitest)
import { setupServer } from 'msw/node'
import { handlers } from './msw/handlers'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

```typescript
// src/components/__tests__/UserList.spec.ts — with MSW
import { mount, flushPromises } from '@vue/test-utils'
import { http, HttpResponse } from 'msw'
import { server } from '@/tests/setup'
import UserList from '../UserList.vue'

describe('UserList with MSW', () => {
  // ✅ GOOD — MSW intercepts real fetch calls, no vi.mock needed
  it('renders users from API', async () => {
    const wrapper = mount(UserList)
    await flushPromises()

    expect(wrapper.findAll('[data-testid="user-item"]')).toHaveLength(2)
  })

  // ✅ GOOD — override handler for specific test scenarios
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

### Server Routes Testing (Nuxt 3)

```typescript
// server/api/__tests__/users.spec.ts
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils'

// ✅ GOOD — use @nuxt/test-utils for full server route testing
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

## E2E Testing with Playwright

### Playwright Configuration

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

### Page Transition Testing

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

### Form Interaction Testing

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

### Authentication Flow Testing

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
    // Login first
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-btn"]')
    await expect(page).toHaveURL('/dashboard')

    // Logout
    await page.click('[data-testid="logout-btn"]')
    await expect(page).toHaveURL('/login')

    // Verify session cleared
    await page.goto('/dashboard')
    await expect(page).toHaveURL('/login')
  })
})
```

### Reusable Auth Fixture (Playwright)

```typescript
// e2e/fixtures/auth.ts
import { test as base, expect } from '@playwright/test'

type AuthFixtures = {
  authenticatedPage: import('@playwright/test').Page
}

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Login before each test that uses this fixture
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', process.env.TEST_USER_EMAIL!)
    await page.fill('[data-testid="password-input"]', process.env.TEST_USER_PASSWORD!)
    await page.click('[data-testid="login-btn"]')
    await expect(page).toHaveURL('/dashboard')
    await use(page)
  },
})

// Usage:
// import { test } from '@/e2e/fixtures/auth'
// test('accesses protected resource', async ({ authenticatedPage }) => { ... })
```

---

## Mocking Patterns

### vi.mock for Module Mocking

```typescript
// ✅ GOOD — mock at module level, hoisted by Vitest
vi.mock('@/api/products', () => ({
  fetchProducts: vi.fn(),
  createProduct: vi.fn(),
  deleteProduct: vi.fn(),
}))

// ✅ GOOD — partial mock with factory, keep other exports real
vi.mock('@/utils/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/date')>()
  return {
    ...actual,
    formatDate: vi.fn().mockReturnValue('2026-01-01'),
  }
})

// ❌ BAD — mocking inside test function (mock is not hoisted, may cause issues)
it('test', () => {
  vi.mock('@/api/products') // This is unreliable — mock in module scope
})
```

### Component Stubs

```typescript
// ✅ GOOD — stub heavy or external components globally
const wrapper = mount(MyPage, {
  global: {
    stubs: {
      // Stub as empty component
      HeavyChartComponent: true,
      // Stub with custom template
      RouterLink: {
        template: '<a :href="to"><slot /></a>',
        props: ['to'],
      },
      // Stub Teleport to avoid DOM issues in tests
      Teleport: true,
    },
  },
})

// ✅ GOOD — stub child component to isolate parent behavior
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

### Global Plugin Mocking

```typescript
// ✅ GOOD — mock i18n plugin in global config
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

// ✅ GOOD — stub $t in tests without full i18n setup
const wrapper = mount(MyComponent, {
  global: {
    mocks: {
      $t: (key: string) => key, // Returns translation key as-is
    },
  },
})
expect(wrapper.find('[data-testid="title"]').text()).toBe('page.title')
```

### provide/inject Mocking

```typescript
// ✅ GOOD — test component that uses inject by providing value in mount
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

## Test Organization

### Directory Structure

```
src/
├── components/
│   ├── UserCard.vue
│   ├── CartSummary.vue
│   └── __tests__/            # Co-located component tests
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
├── setup.ts                  # Global test setup, MSW server
├── helpers/
│   └── withSetup.ts          # withSetup composable helper
└── msw/
    └── handlers.ts           # MSW request handlers

e2e/
├── fixtures/
│   └── auth.ts               # Playwright auth fixture
├── auth.spec.ts
├── navigation.spec.ts
└── contact-form.spec.ts
```

### Test Naming Conventions

```typescript
// ✅ GOOD — describe block names the component/composable/store
describe('UserCard', () => {
  // ✅ GOOD — it/test describes the specific behavior being verified
  it('renders user name from props', () => { ... })
  it('shows admin badge when user role is admin', () => { ... })
  it('emits click event with user id when card is clicked', () => { ... })
})

// ✅ GOOD — nested describe for grouping related scenarios
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

// ❌ BAD — vague, non-descriptive test names
it('works', () => { ... })
it('test 1', () => { ... })
it('should render', () => { ... })
```

### Setup Files

```typescript
// tests/setup.ts — global Vitest setup file
import { config } from '@vue/test-utils'
import { setupServer } from 'msw/node'
import { handlers } from './msw/handlers'
import { vi, afterEach, beforeAll, afterAll } from 'vitest'

// MSW server
export const server = setupServer(...handlers)
beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

// Vue Test Utils global config
config.global.stubs = {
  Teleport: true,
  Transition: false,
}

// Reset all vi mocks after each test
afterEach(() => {
  vi.restoreAllMocks()
})
```

---

## Best Practices

### DO

- **Follow TDD**: write the test first, then the implementation
- **Co-locate tests**: keep `__tests__/` next to the source files they test
- **Use `data-testid`**: select elements by test IDs, not CSS classes or DOM structure
- **Use `flushPromises`**: always await async component updates in Vue Test Utils
- **Prefer `mount` over `shallowMount`** when child behavior matters; use `shallowMount` for pure unit isolation
- **Reset state between tests**: use `setActivePinia(createPinia())` before each store test
- **Use MSW for API mocking**: intercept network at the HTTP level rather than mocking modules
- **Test behavior, not implementation**: verify what the user sees and interacts with
- **Use `withSetup`** for composables that rely on lifecycle hooks

### DON'T

- **Don't access `wrapper.vm` internal methods**: test through the public DOM interface
- **Don't use `setTimeout` in tests**: use `vi.useFakeTimers()` and `vi.advanceTimersByTime()`
- **Don't snapshot entire component HTML**: snapshots become brittle and noisy; test specific elements
- **Don't skip `await nextTick()`**: Vue DOM updates are async; always await after triggering changes
- **Don't share mutable state between tests**: each test should be fully independent
- **Don't test Pinia store internals from component tests**: test the store unit separately
- **Don't mock `vue-router` entirely**: create a real router instance with `createRouter`

---

## Quick Reference

| Pattern | Tool / API | Use Case |
|---|---|---|
| Mount component with full tree | `mount()` | Integration-style component tests |
| Mount component with stubbed children | `shallowMount()` | Pure unit tests of single component |
| Trigger DOM event | `wrapper.trigger('click')` | Simulate user interaction |
| Set input value | `wrapper.find('input').setValue('x')` | Form input testing |
| Wait for async updates | `await flushPromises()` | After API calls or async state |
| Wait for DOM update | `await nextTick()` | After reactive state changes |
| Check emitted events | `wrapper.emitted('event-name')` | Verify emits and payloads |
| Update props | `await wrapper.setProps({ prop: value })` | Test prop reactivity |
| Test composable lifecycle | `withSetup()` helper | Composables with onMounted/onUnmounted |
| Isolated store tests | `setActivePinia(createPinia())` | Fresh store state per test |
| Store in component tests | `createTestingPinia()` | Mock store in mounted component |
| Mock module | `vi.mock('@/api/module')` | Isolate from real API calls |
| Mock timers | `vi.useFakeTimers()` | Debounce, throttle, setTimeout |
| Intercept HTTP requests | MSW `http.get('/api/...')` | Realistic API mocking without module mocks |
| E2E page navigation | `page.goto('/path')` | Playwright full browser tests |
| E2E element interaction | `page.click('[data-testid="btn"]')` | Playwright user actions |
| E2E assertions | `expect(page.locator(...)).toBeVisible()` | Playwright element assertions |
| Coverage report | `vitest run --coverage` | Identify untested code paths |

**Remember**: Test user behavior, not implementation details — if your tests break when you refactor without changing behavior, your tests are testing the wrong thing.

