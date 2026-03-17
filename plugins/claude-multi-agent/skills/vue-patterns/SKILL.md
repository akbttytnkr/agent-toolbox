---
name: vue-patterns
description: Vue 3 Composition API, Pinia state management, Nuxt 3 patterns, and best practices for building robust, efficient, and maintainable Vue applications.
user-invocable: false
---

# Vue Development Patterns

Vue 3 Composition API patterns, Pinia state management, and Nuxt 3 best practices for building type-safe, performant, and maintainable applications.

## When to Activate

- Building Vue 3 components with Composition API and `<script setup>`
- Managing state with Pinia stores (Setup Store pattern)
- Implementing data fetching with `useFetch` / `useAsyncData` in Nuxt 3
- Designing composables (`useXxx`) to encapsulate reusable logic
- Setting up routing with Vue Router or Nuxt file-based routing
- Optimizing performance with lazy loading, `v-memo`, and virtual lists
- Handling errors with `onErrorCaptured` and global error handlers
- Structuring Nuxt 3 server routes, middleware, and plugins

## Core Principles

### Composition API First

Always use Composition API. Options API is legacy and should not be used in new code.

```typescript
// ✅ GOOD: Composition API with <script setup>
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
// ❌ BAD: Options API - avoid in new code
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

### TypeScript Integration

Always use TypeScript with `lang="ts"` in `<script setup>`. Define explicit interfaces for props, emits, and data shapes.

```typescript
// ✅ GOOD: Full TypeScript integration
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

## Project Structure

### Vue / Nuxt Recommended Layout

```text
my-nuxt-app/
├── assets/               # Static assets processed by Vite
├── components/
│   ├── base/             # Generic reusable components (BaseButton, BaseInput)
│   ├── ui/               # UI-specific components (Modal, Toast)
│   └── feature/          # Feature-specific components (UserCard, ProductList)
├── composables/          # Auto-imported composables (useAuth, useCart)
├── layouts/              # Nuxt layout components (default.vue, auth.vue)
├── middleware/           # Nuxt route middleware
├── pages/                # File-based routing (Nuxt)
│   ├── index.vue
│   ├── users/
│   │   ├── index.vue     # /users
│   │   └── [id].vue      # /users/:id
│   └── admin/
│       └── [...slug].vue # /admin/* (catch-all)
├── plugins/              # Nuxt plugins
├── public/               # Static files served as-is
├── server/
│   ├── api/              # Server routes (/api/*)
│   └── middleware/       # Server-side middleware
├── stores/               # Pinia stores
├── types/                # Shared TypeScript types
├── utils/                # Pure utility functions (auto-imported in Nuxt)
├── app.vue
├── nuxt.config.ts
└── tsconfig.json
```

### File Naming Conventions

```text
# Components: PascalCase
components/UserCard.vue
components/base/BaseButton.vue

# Composables: camelCase with 'use' prefix
composables/useAuth.ts
composables/useLocalStorage.ts

# Stores: camelCase with 'use' prefix
stores/useUserStore.ts
stores/useCartStore.ts

# Pages: kebab-case (Nuxt convention)
pages/user-profile.vue
pages/products/[id].vue

# Utils / Types: camelCase
utils/formatDate.ts
types/index.ts
```

## Composition API Patterns

### ref vs reactive

Prefer `ref` for all reactive state. Use `reactive` only for complex objects where you always access them as a whole and never need to replace the root reference.

```typescript
// ✅ GOOD: ref for primitives and objects
const count = ref(0)
const user = ref<User | null>(null)
const items = ref<Item[]>([])

// Access with .value in <script>, unwrapped in <template>
count.value++
user.value = { id: 1, name: 'Alice', email: 'alice@example.com', role: 'user' }
```

```typescript
// ❌ BAD: reactive with primitives - loses reactivity when destructured
const state = reactive({ count: 0, name: '' })
const { count } = state  // count is now a plain number, not reactive!

// ✅ GOOD: If you need reactive object, use toRefs when destructuring
const state = reactive({ count: 0, name: '' })
const { count, name } = toRefs(state)  // count and name are now Refs
```

```typescript
// ❌ BAD: reactive wrapping a primitive
const count = reactive(0)  // TypeError in Vue 3

// ✅ GOOD: always ref for primitives
const count = ref(0)
```

### computed

```typescript
// ✅ GOOD: Derived state with computed
<script setup lang="ts">
const products = ref<Product[]>([])
const searchQuery = ref('')
const selectedCategory = ref<string | null>(null)

// Computed chains are efficient - each only re-runs when dependencies change
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
// ✅ GOOD: Writable computed for two-way derived state
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
// ✅ GOOD: watch for specific dependencies with old/new values
watch(
  () => route.params.id,
  async (newId, oldId) => {
    if (newId !== oldId) {
      await fetchUser(String(newId))
    }
  }
)

// ✅ GOOD: watch multiple sources
watch(
  [searchQuery, selectedFilter],
  ([query, filter]) => {
    performSearch(query, filter)
  },
  { debounce: 300 }  // VueUse-style; use manual debounce otherwise
)

// ✅ GOOD: watchEffect for automatic dependency tracking
watchEffect(async () => {
  // Automatically tracks: currentPage.value, pageSize.value, sortBy.value
  const result = await fetchItems({
    page: currentPage.value,
    size: pageSize.value,
    sort: sortBy.value,
  })
  items.value = result.data
})

// ✅ GOOD: Stop watcher manually
const stop = watchEffect(() => {
  console.log('count:', count.value)
})

// Stop when done
onUnmounted(() => stop())
```

```typescript
// ❌ BAD: watch without cleanup for async operations
watch(userId, async (id) => {
  // If userId changes quickly, responses may arrive out of order!
  const user = await fetchUser(id)
  currentUser.value = user
})

// ✅ GOOD: Cleanup with onWatcherCleanup (Vue 3.5+) or onCleanup
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
// ✅ GOOD: Type-safe provide/inject with InjectionKey
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
// ChildComponent.vue - deep in the tree
<script setup lang="ts">
import { inject } from 'vue'
import { ThemeKey } from '@/types/injection-keys'

const themeContext = inject(ThemeKey)
// themeContext is ThemeContext | undefined - handle missing case
if (!themeContext) throw new Error('ThemeKey not provided')

const { theme, toggleTheme } = themeContext
</script>
```

### defineProps / defineEmits / defineExpose

```typescript
// ✅ GOOD: Type-only declarations (Vue 3.3+)
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

// Expose only what parent needs (default: nothing is exposed)
const inputRef = ref<HTMLInputElement | null>(null)

defineExpose({
  focus: () => inputRef.value?.focus(),
  clear: () => { /* ... */ },
})
</script>
```

## Composables (Custom Hooks)

### useXxx Naming and State Encapsulation

```typescript
// ✅ GOOD: Composable with encapsulated state
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

### Reusable Logic Extraction

```typescript
// ✅ GOOD: useLocalStorage composable
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

// Usage
const theme = useLocalStorage<'light' | 'dark'>('theme', 'light')
```

```typescript
// ✅ GOOD: useFetch composable with abort support
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

### useAsyncData (Nuxt)

```typescript
// ✅ GOOD: Nuxt useAsyncData with proper typing and options
<script setup lang="ts">
const route = useRoute()

const { data: user, status, error, refresh } = await useAsyncData(
  `user-${route.params.id}`,  // Unique key for deduplication and caching
  () => $fetch<User>(`/api/users/${route.params.id}`),
  {
    watch: [() => route.params.id],  // Re-fetch when param changes
    transform: (user) => ({
      ...user,
      fullName: `${user.firstName} ${user.lastName}`,
    }),
  }
)

// Typed via generics - user is Ref<TransformedUser | null>
</script>
```

## Component Design

### SFC Best Practices

```vue
<!-- ✅ GOOD: Well-structured SFC -->
<script setup lang="ts">
// 1. Imports
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

// 3. Stores & composables
const userStore = useUserStore()

// 4. Reactive state
const products = ref<Product[]>([])
const isLoading = ref(false)

// 5. Computed
const canPurchase = computed(() => userStore.isAuthenticated && products.value.length > 0)

// 6. Methods
async function loadProducts() {
  isLoading.value = true
  try {
    products.value = await $fetch(`/api/categories/${props.categoryId}/products`)
  } finally {
    isLoading.value = false
  }
}

// 7. Lifecycle
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

### Slots Patterns

```typescript
// ✅ GOOD: Default slot with fallback content
<!-- DataTable.vue -->
<template>
  <table>
    <thead>
      <tr>
        <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
      </tr>
    </thead>
    <tbody>
      <!-- Default slot: caller controls row rendering -->
      <slot v-if="$slots.default" />
      <!-- Fallback: auto-render rows -->
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
// ✅ GOOD: Named and scoped slots
<!-- CardLayout.vue -->
<template>
  <div class="card">
    <header v-if="$slots.header" class="card-header">
      <slot name="header" />
    </header>

    <main class="card-body">
      <!-- Scoped slot: expose internal state to caller -->
      <slot :is-loading="isLoading" :error="error" />
    </main>

    <footer v-if="$slots.footer" class="card-footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<!-- Usage -->
<CardLayout>
  <template #header>
    <h2>User Profile</h2>
  </template>

  <!-- Scoped slot with destructuring -->
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

### v-model Design Patterns

```typescript
// ✅ GOOD: v-model with defineModel (Vue 3.4+)
<!-- BaseInput.vue -->
<script setup lang="ts">
interface Props {
  placeholder?: string
  disabled?: boolean
}

defineProps<Props>()

// defineModel creates a two-way binding automatically
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

<!-- Usage: works exactly like native v-model -->
<BaseInput v-model="username" placeholder="Enter username" />
```

```typescript
// ✅ GOOD: Multiple named v-model bindings (Vue 3.4+)
<!-- DateRangePicker.vue -->
<script setup lang="ts">
const startDate = defineModel<string>('start', { required: true })
const endDate = defineModel<string>('end', { required: true })
</script>

<!-- Usage -->
<DateRangePicker v-model:start="rangeStart" v-model:end="rangeEnd" />
```

## State Management (Pinia)

### Setup Store (Recommended)

Prefer Setup Stores over Options Stores for better TypeScript support and composable integration.

```typescript
// ✅ GOOD: Setup Store pattern
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
  // State
  const currentUser = ref<User | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Getters (computed)
  const isAuthenticated = computed(() => currentUser.value !== null)
  const isAdmin = computed(() => currentUser.value?.role === 'admin')
  const displayName = computed(() => currentUser.value?.name ?? 'Guest')

  // Actions
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
    // State (expose as readonly where appropriate)
    currentUser: readonly(currentUser),
    isLoading: readonly(isLoading),
    error: readonly(error),
    // Getters
    isAuthenticated,
    isAdmin,
    displayName,
    // Actions
    login,
    logout,
    $reset,
  }
})
```

### Store Splitting

Organize stores by domain, not by data type. Each store owns one bounded context.

```typescript
// ✅ GOOD: Domain-driven store separation
stores/
├── useAuthStore.ts       # Authentication: login, logout, session
├── useCartStore.ts       # Shopping cart: items, totals, checkout
├── useProductStore.ts    # Product catalog: list, search, filters
├── useOrderStore.ts      # Orders: history, status, tracking
└── useUIStore.ts         # UI state: modals, toasts, sidebar

// ❌ BAD: Monolithic store
stores/useAppStore.ts     # Everything in one store
```

### Persistence with pinia-plugin-persistedstate

```typescript
// ✅ GOOD: Selective persistence
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
      // Persist only specific fields
      pick: ['theme', 'language'],
      // Use sessionStorage instead of localStorage
      storage: sessionStorage,
    },
  }
)
```

## Routing (Vue Router / Nuxt)

### Type-Safe Routing

```typescript
// ✅ GOOD: Nuxt typed routes (enabled via nuxt.config.ts)
// nuxt.config.ts
export default defineNuxtConfig({
  experimental: {
    typedPages: true,  // Generates typed route helpers
  },
})

// Usage in component
<script setup lang="ts">
const router = useRouter()

// Fully typed - TypeScript knows the params for each route
await router.push({ name: 'users-id', params: { id: '42' } })
</script>
```

### Navigation Guards

```typescript
// ✅ GOOD: Nuxt middleware for authentication
// middleware/auth.ts
export default defineNuxtRouteMiddleware((to) => {
  const authStore = useAuthStore()

  if (!authStore.isAuthenticated) {
    return navigateTo({
      path: '/login',
      query: { redirect: to.fullPath },  // Preserve intended destination
    })
  }

  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }
})
```

```typescript
// ✅ GOOD: In-component guard with onBeforeRouteLeave
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

### Dynamic and Nested Routes (Nuxt pages/)

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
│   ├── [...slug].vue             # /products/* (catch-all)
│   └── [[category]].vue          # /products/:category? (optional param)
└── (auth)/                       # Route groups (no URL segment in Nuxt 3.9+)
    ├── login.vue
    └── register.vue
```

```typescript
// ✅ GOOD: Access route params with proper typing
<script setup lang="ts">
const route = useRoute()

// Nuxt typed pages generate specific types per route
const userId = computed(() => route.params.id as string)

// Prefer definePageMeta for page-level configuration
definePageMeta({
  middleware: ['auth'],
  layout: 'dashboard',
  keepalive: true,
})
</script>
```

## Performance Optimization

### defineAsyncComponent for Lazy Loading

```typescript
// ✅ GOOD: Lazy load heavy components
<script setup lang="ts">
import { defineAsyncComponent } from 'vue'

const HeavyChart = defineAsyncComponent({
  loader: () => import('./HeavyChart.vue'),
  loadingComponent: ChartSkeleton,
  errorComponent: ChartError,
  delay: 200,       // Show loading component after 200ms
  timeout: 10000,   // Error if not loaded in 10s
})

// Nuxt: use <LazyXxx> prefix for automatic lazy loading
// <LazyHeavyChart /> is equivalent to defineAsyncComponent
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

### v-once and v-memo

```typescript
// ✅ GOOD: v-once for static content that never changes
<template>
  <header v-once>
    <!-- This block will never re-render after initial render -->
    <AppLogo />
    <nav><!-- Static nav items --></nav>
  </header>
</template>
```

```typescript
// ✅ GOOD: v-memo to skip re-renders when specific deps unchanged
<template>
  <!-- Only re-renders when item.id or selected changes -->
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
// ✅ GOOD: shallowRef for large arrays/objects where deep reactivity is unnecessary
<script setup lang="ts">
import { shallowRef, triggerRef } from 'vue'

// Large dataset - only track reference change, not deep mutations
const rows = shallowRef<Row[]>([])

async function loadData() {
  const data = await fetchLargeDataset()
  rows.value = data  // Assignment triggers reactivity
}

// If you must mutate in place, trigger manually
function addRow(row: Row) {
  rows.value.push(row)
  triggerRef(rows)  // Manually notify Vue of the change
}
</script>
```

### List Virtualization

```typescript
// ✅ GOOD: Virtual scrolling with vue-virtual-scroller
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

### Nuxt Hybrid Rendering

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  routeRules: {
    // SSG: Pre-render at build time (marketing pages)
    '/': { prerender: true },
    '/about': { prerender: true },

    // SSR with ISR: Re-generate every hour
    '/products/**': { isr: 3600 },

    // SPA: Client-only rendering (dashboards, authenticated pages)
    '/dashboard/**': { ssr: false },

    // API: Cache at CDN edge for 60 seconds
    '/api/public/**': { cache: { maxAge: 60 } },
  },
})
```

## Error Handling

### onErrorCaptured

```typescript
// ✅ GOOD: Catch errors from child components
<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'

const error = ref<Error | null>(null)
const hasError = ref(false)

onErrorCaptured((err, instance, info) => {
  console.error(`Error in ${info}:`, err)
  error.value = err
  hasError.value = true

  // Return false to stop propagation to parent error handlers
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

### ErrorBoundary Component

```typescript
// ✅ GOOD: Reusable ErrorBoundary component
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

<!-- Usage -->
<ErrorBoundary>
  <template #error="{ error, reset }">
    <ErrorMessage :message="error.message" @retry="reset" />
  </template>
  <DataVisualization :data="chartData" />
</ErrorBoundary>
```

### Global Error Handler

```typescript
// ✅ GOOD: app.config.errorHandler in Nuxt plugin
// plugins/error-handler.client.ts
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.config.errorHandler = (error, instance, info) => {
    // Log to monitoring service (e.g., Sentry)
    console.error('[Global Error Handler]', {
      error,
      component: instance?.$options.name ?? 'Anonymous',
      info,
    })

    // Report to error tracking
    if (process.client) {
      // Sentry.captureException(error)
    }
  }

  // Handle unhandled promise rejections
  nuxtApp.hook('app:error', (error) => {
    console.error('[Nuxt App Error]', error)
  })
})
```

## Nuxt 3 Patterns

### Server Routes (server/api/)

```typescript
// ✅ GOOD: Typed server route with Zod validation
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
// ✅ GOOD: POST route with body validation
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
// ✅ GOOD: useFetch for simple cases (auto key generation)
<script setup lang="ts">
const { data: posts, status } = await useFetch<Post[]>('/api/posts', {
  query: { page: 1, limit: 10 },
  // Deduplicated automatically by URL + query
})
</script>
```

```typescript
// ✅ GOOD: useAsyncData for complex cases
<script setup lang="ts">
const route = useRoute()
const { user } = useAuthStore()

const { data, refresh, error } = await useAsyncData(
  // Unique key - include all variables that affect the fetch
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
      // Use cached data if available (avoids duplicate requests)
      return nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]
    },
  }
)
</script>
```

### useState (SSR-Safe State)

```typescript
// ✅ GOOD: useState for SSR-safe shared state
// composables/useColorMode.ts
export function useColorMode() {
  // useState is serialized to payload - safe across SSR/hydration boundary
  const colorMode = useState<'light' | 'dark'>('colorMode', () => 'light')

  function toggle() {
    colorMode.value = colorMode.value === 'light' ? 'dark' : 'light'
  }

  return { colorMode: readonly(colorMode), toggle }
}

// ❌ BAD: ref() at module level - NOT SSR-safe (shared between requests!)
const colorMode = ref<'light' | 'dark'>('light')  // Causes state leakage!
```

### Middleware

```typescript
// ✅ GOOD: Named middleware (applied per-page via definePageMeta)
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
  middleware: ['auth', 'verified'],  // Applied in order
})
</script>
```

### Plugins

```typescript
// ✅ GOOD: Nuxt plugin for global setup
// plugins/analytics.client.ts  (.client = client-only)
export default defineNuxtPlugin({
  name: 'analytics',
  setup(nuxtApp) {
    const router = useRouter()

    // Track page views
    router.afterEach((to) => {
      // analytics.trackPageView(to.fullPath)
    })

    // Provide to app
    return {
      provide: {
        track: (event: string, data?: Record<string, unknown>) => {
          // analytics.track(event, data)
        },
      },
    }
  },
})

// Usage in component
<script setup lang="ts">
const { $track } = useNuxtApp()
$track('button_clicked', { label: 'Sign Up' })
</script>
```

## Anti-Patterns to Avoid

```typescript
// ❌ BAD: Options API in new code
export default {
  data() { return { count: 0 } },
  methods: { increment() { this.count++ } },
}

// ✅ GOOD: Composition API with <script setup>
const count = ref(0)
const increment = () => count.value++
```

```typescript
// ❌ BAD: reactive wrapping a primitive
const count = reactive(0)  // TypeError!
const isLoading = reactive(false)  // TypeError!

// ✅ GOOD: ref for primitives
const count = ref(0)
const isLoading = ref(false)
```

```typescript
// ❌ BAD: Mutating props directly
<script setup lang="ts">
const props = defineProps<{ modelValue: string }>()

function handleInput(e: Event) {
  props.modelValue = (e.target as HTMLInputElement).value  // Runtime warning!
}
</script>

// ✅ GOOD: Emit events to update parent state
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

function handleInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value)
}
```

```typescript
// ❌ BAD: v-if and v-for on the same element
<template>
  <!-- v-for creates scope first, then v-if can't access outer variables -->
  <li v-for="user in users" v-if="user.isActive" :key="user.id">
    {{ user.name }}
  </li>
</template>

// ✅ GOOD: Wrap with template, or use computed to filter
<template>
  <template v-for="user in users" :key="user.id">
    <li v-if="user.isActive">{{ user.name }}</li>
  </template>
</template>

// Or better: filter in computed
const activeUsers = computed(() => users.value.filter(u => u.isActive))
```

```typescript
// ❌ BAD: Excessive global state in Pinia
// Everything in one store, all state global
export const useAppStore = defineStore('app', () => {
  const user = ref(null)
  const cart = ref([])
  const products = ref([])
  const orders = ref([])
  const theme = ref('light')
  // ... 50 more fields
})

// ✅ GOOD: Domain-split stores
// useAuthStore, useCartStore, useProductStore, useOrderStore, useUIStore
```

```typescript
// ❌ BAD: SSR-unsafe module-level state in Nuxt
// This ref is shared across ALL server requests!
const globalData = ref<Data | null>(null)

// ✅ GOOD: useState() for SSR-safe cross-component state
const globalData = useState<Data | null>('global-data', () => null)
```

## Quick Reference

| Pattern | API / Tool | Notes |
|---------|-----------|-------|
| Reactive primitive | `ref()` | Access with `.value` in script |
| Reactive object (keep as whole) | `reactive()` | Do not destructure without `toRefs` |
| Derived state | `computed()` | Cached; only re-runs when deps change |
| Side effects | `watchEffect()` | Auto-tracks deps; `watch()` for explicit |
| Shallow reactivity | `shallowRef()` | Large arrays/objects; better perf |
| Cross-component state (Nuxt SSR) | `useState()` | Serialized in payload; SSR-safe |
| Local component state | `ref()` / `computed()` | Scoped to component instance |
| Global state | Pinia Setup Store | `defineStore('id', () => { ... })` |
| Async data (Nuxt) | `useAsyncData()` | Deduplicated, cached, SSR-aware |
| Simple data fetch (Nuxt) | `useFetch()` | Shorthand for `useAsyncData` + `$fetch` |
| Server route | `server/api/*.ts` | `defineEventHandler`, Zod validation |
| Lazy component | `defineAsyncComponent()` | Or `<LazyXxx />` in Nuxt |
| Route middleware | `middleware/*.ts` | Apply with `definePageMeta` |
| Plugin | `plugins/*.ts` | `.client.ts` / `.server.ts` suffix |
| Error boundary | `onErrorCaptured()` | Stops propagation with `return false` |
| Props binding | `defineProps<T>()` | Type-only, no runtime schema needed |
| Two-way binding | `defineModel()` | Vue 3.4+; replaces `modelValue` pattern |
| Dependency injection | `provide` / `inject` + `InjectionKey<T>` | Type-safe symbol keys |
| Reusable logic | `useXxx()` composable | Encapsulate state + methods together |

**Remember**: Prefer `<script setup>` with Composition API and TypeScript for every component - it is more concise, better typed, and easier to tree-shake than any alternative.

