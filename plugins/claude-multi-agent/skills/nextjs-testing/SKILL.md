---
name: nextjs-testing
description: Next.js and React testing patterns using Vitest, React Testing Library, and Playwright. Covers component tests, hook tests, API route tests, Server Actions, integration tests, and E2E tests with TDD methodology.
user-invocable: false
---

# Next.js Testing Patterns

Comprehensive testing strategies for Next.js applications using Vitest, React Testing Library, and Playwright following TDD methodology.

## When to Activate

- Writing new Next.js pages, components, or API routes
- Testing React Server Components or Client Components
- Setting up a testing infrastructure for a Next.js project
- Testing custom React hooks
- Mocking Next.js internals (router, navigation, Image, Link)
- Writing E2E tests for user flows with Playwright
- Reviewing test coverage in a Next.js codebase

## Core Testing Philosophy

### TDD Cycle: RED → GREEN → REFACTOR

```
RED     → Write a failing test that describes the desired behavior
GREEN   → Write the minimal implementation to make the test pass
REFACTOR → Clean up code and tests while keeping them green
REPEAT  → Move to the next requirement
```

```typescript
// Step 1: RED — failing test
import { render, screen } from '@testing-library/react'
import { UserCard } from './UserCard'

test('displays user name', () => {
  render(<UserCard name="Alice" />)
  expect(screen.getByText('Alice')).toBeInTheDocument()
})

// Step 2: GREEN — minimal implementation
export function UserCard({ name }: { name: string }) {
  return <div>{name}</div>
}

// Step 3: REFACTOR — improve without breaking the test
export function UserCard({ name }: { name: string }) {
  return (
    <article className="user-card">
      <span className="user-card__name">{name}</span>
    </article>
  )
}
```

### Coverage Requirements

| Code Type | Target |
|-----------|--------|
| Critical business logic | 100% |
| Public components and hooks | 90%+ |
| General application code | 80%+ |
| Generated / third-party code | Exclude |

### Test Pyramid

```
         /\
        /E2E\          <- Few, slow, high confidence (Playwright)
       /------\
      / Integr \       <- Moderate, page-level flows
     /----------\
    /  Unit Tests \    <- Many, fast, isolated (Vitest + RTL)
   /--------------\
```

Run the most tests at the unit level. Integration tests verify page-level
compositions. E2E tests cover critical user journeys end-to-end.

---

## Test Setup

### Vitest Configuration

Vitest is the recommended test runner for Next.js projects. It is faster than
Jest, natively supports ESM, and has a compatible API.

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'path'

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        'node_modules/**',
        '.next/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/generated/**',
      ],
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
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### Testing Library Global Setup

```typescript
// tests/setup.ts
import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Automatically unmount components after each test
afterEach(() => {
  cleanup()
})

// Mock next/navigation globally
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}))

// Mock next/image globally
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} {...props} />
  ),
}))
```

### Required Dependencies

```bash
# Install test dependencies
pnpm add -D vitest @vitejs/plugin-react vite-tsconfig-paths jsdom
pnpm add -D @testing-library/react @testing-library/user-event @testing-library/jest-dom
pnpm add -D @vitest/coverage-v8

# For MSW (API mocking)
pnpm add -D msw

# For E2E
pnpm add -D @playwright/test
```

### package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
  }
}
```

### Vitest vs Jest — Why Vitest

| Concern | Vitest | Jest + next/jest |
|---------|--------|-----------------|
| Speed | Native ESM, faster cold start | Requires Babel transform |
| Config | Single vite config | Separate jest.config.js + babel |
| ESM support | First-class | Requires workarounds |
| API compatibility | Jest-compatible | N/A |
| Watch mode | HMR-based, instant | Slower re-runs |
| SWC/Turbopack alignment | Better | Less aligned |

### Jest Configuration (When You Must Use Jest)

```typescript
// jest.config.ts
import type { Config } from 'jest'
import nextJest from 'next/jest'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  coverageThreshold: {
    global: { lines: 80, functions: 80, branches: 80, statements: 80 },
  },
}

export default createJestConfig(config)
```

```typescript
// jest.setup.ts
import '@testing-library/jest-dom'
```

---

## Component Testing

### React Testing Library Fundamentals

Always query by accessible roles or text visible to the user. Avoid
querying by CSS class names or internal implementation details.

```typescript
// ✅ GOOD: query by role and visible text
screen.getByRole('button', { name: /submit/i })
screen.getByRole('heading', { name: 'Profile' })
screen.getByLabelText('Email address')
screen.getByText('No results found')
screen.getByPlaceholderText('Search...')

// ❌ BAD: query by implementation detail
screen.getByTestId('submit-btn')           // fragile, not user-facing
document.querySelector('.submit-button')   // bypasses RTL entirely
screen.getByClassName('btn-primary')       // not an RTL API
```

### Client Component Test

```typescript
// components/Counter.tsx
'use client'

import { useState } from 'react'

interface CounterProps {
  initialCount?: number
  label?: string
}

export function Counter({ initialCount = 0, label = 'Count' }: CounterProps) {
  const [count, setCount] = useState(initialCount)

  return (
    <div>
      <p aria-live="polite">{label}: {count}</p>
      <button onClick={() => setCount(c => c - 1)}>Decrement</button>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
      <button onClick={() => setCount(initialCount)}>Reset</button>
    </div>
  )
}
```

```typescript
// components/Counter.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Counter } from './Counter'

describe('Counter', () => {
  it('renders with default count of 0', () => {
    render(<Counter />)
    expect(screen.getByText(/Count: 0/)).toBeInTheDocument()
  })

  it('renders with custom initial count', () => {
    render(<Counter initialCount={5} label="Items" />)
    expect(screen.getByText(/Items: 5/)).toBeInTheDocument()
  })

  it('increments count when increment button is clicked', async () => {
    const user = userEvent.setup()
    render(<Counter />)

    await user.click(screen.getByRole('button', { name: 'Increment' }))

    expect(screen.getByText(/Count: 1/)).toBeInTheDocument()
  })

  it('decrements count when decrement button is clicked', async () => {
    const user = userEvent.setup()
    render(<Counter initialCount={3} />)

    await user.click(screen.getByRole('button', { name: 'Decrement' }))

    expect(screen.getByText(/Count: 2/)).toBeInTheDocument()
  })

  it('resets count to initial value', async () => {
    const user = userEvent.setup()
    render(<Counter initialCount={10} />)

    await user.click(screen.getByRole('button', { name: 'Increment' }))
    await user.click(screen.getByRole('button', { name: 'Reset' }))

    expect(screen.getByText(/Count: 10/)).toBeInTheDocument()
  })
})
```

### Server Component Test

Server Components are async functions. Render them by awaiting the component
and passing the resolved JSX to `render`.

```typescript
// app/users/[id]/page.tsx (Server Component)
import { getUserById } from '@/lib/users'
import { notFound } from 'next/navigation'

interface UserPageProps {
  params: { id: string }
}

export default async function UserPage({ params }: UserPageProps) {
  const user = await getUserById(params.id)

  if (!user) notFound()

  return (
    <main>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
      <p>Member since {user.createdAt.toLocaleDateString()}</p>
    </main>
  )
}
```

```typescript
// app/users/[id]/page.test.tsx
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import UserPage from './page'

vi.mock('@/lib/users', () => ({
  getUserById: vi.fn(),
}))

const { getUserById } = await import('@/lib/users')

describe('UserPage', () => {
  it('renders user details', async () => {
    vi.mocked(getUserById).mockResolvedValue({
      id: '1',
      name: 'Alice',
      email: 'alice@example.com',
      createdAt: new Date('2024-01-15'),
    })

    const jsx = await UserPage({ params: { id: '1' } })
    render(jsx)

    expect(screen.getByRole('heading', { name: 'Alice' })).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  it('calls notFound when user does not exist', async () => {
    const { notFound } = await import('next/navigation')
    vi.mocked(getUserById).mockResolvedValue(null)

    await UserPage({ params: { id: 'nonexistent' } })

    expect(notFound).toHaveBeenCalled()
  })
})
```

### userEvent vs fireEvent

Always prefer `userEvent` for realistic user interaction simulation.
Use `fireEvent` only when testing synthetic DOM events directly.

```typescript
// ✅ GOOD: userEvent simulates real browser behavior
const user = userEvent.setup()

await user.type(screen.getByRole('textbox', { name: 'Email' }), 'test@example.com')
await user.click(screen.getByRole('button', { name: 'Submit' }))
await user.keyboard('{Enter}')
await user.selectOptions(screen.getByRole('combobox'), 'option-value')
await user.clear(screen.getByRole('textbox'))

// fireEvent is appropriate for custom DOM events or lower-level control
import { fireEvent } from '@testing-library/react'
fireEvent.scroll(container, { target: { scrollTop: 200 } })
fireEvent.resize(window)
```

### Testing Async State and Loading States

```typescript
// components/UserList.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { UserList } from './UserList'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

describe('UserList', () => {
  it('shows loading state initially', () => {
    vi.mocked(api.fetchUsers).mockImplementation(
      () => new Promise(() => {}) // never resolves
    )
    render(<UserList />)

    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument()
  })

  it('renders users after loading', async () => {
    vi.mocked(api.fetchUsers).mockResolvedValue([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ])
    render(<UserList />)

    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
    })
  })

  it('shows error message on fetch failure', async () => {
    vi.mocked(api.fetchUsers).mockRejectedValue(new Error('Network error'))
    render(<UserList />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Network error')
    })
  })
})
```

---

## Hook Testing

### renderHook Basics

```typescript
// hooks/useCounter.ts
import { useState, useCallback } from 'react'

export function useCounter(initial = 0) {
  const [count, setCount] = useState(initial)
  const increment = useCallback(() => setCount(c => c + 1), [])
  const decrement = useCallback(() => setCount(c => c - 1), [])
  const reset = useCallback(() => setCount(initial), [initial])
  return { count, increment, decrement, reset }
}
```

```typescript
// hooks/useCounter.test.ts
import { renderHook, act } from '@testing-library/react'
import { useCounter } from './useCounter'

describe('useCounter', () => {
  it('returns initial count of 0', () => {
    const { result } = renderHook(() => useCounter())
    expect(result.current.count).toBe(0)
  })

  it('accepts a custom initial value', () => {
    const { result } = renderHook(() => useCounter(10))
    expect(result.current.count).toBe(10)
  })

  it('increments count', () => {
    const { result } = renderHook(() => useCounter())

    act(() => {
      result.current.increment()
    })

    expect(result.current.count).toBe(1)
  })

  it('resets to initial value', () => {
    const { result } = renderHook(() => useCounter(5))

    act(() => {
      result.current.increment()
      result.current.increment()
      result.current.reset()
    })

    expect(result.current.count).toBe(5)
  })
})
```

### Async Hook Testing

```typescript
// hooks/useFetch.ts
import { useState, useEffect } from 'react'

interface FetchState<T> {
  data: T | null
  loading: boolean
  error: Error | null
}

export function useFetch<T>(url: string): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<T>
      })
      .then(data => {
        if (!cancelled) setState({ data, loading: false, error: null })
      })
      .catch(error => {
        if (!cancelled) setState({ data: null, loading: false, error })
      })

    return () => { cancelled = true }
  }, [url])

  return state
}
```

```typescript
// hooks/useFetch.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import { useFetch } from './useFetch'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch

describe('useFetch', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('starts in loading state', () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => new Promise(() => {}),
    })

    const { result } = renderHook(() => useFetch('/api/data'))

    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('returns fetched data', async () => {
    const mockData = { id: 1, name: 'Test' }
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const { result } = renderHook(() => useFetch<typeof mockData>('/api/data'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.data).toEqual(mockData)
    expect(result.current.error).toBeNull()
  })

  it('returns error on failed fetch', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })

    const { result } = renderHook(() => useFetch('/api/data'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.data).toBeNull()
  })

  it('does not update state after unmount (no memory leak)', async () => {
    let resolvePromise!: (v: unknown) => void
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => new Promise(r => { resolvePromise = r }),
    })

    const { result, unmount } = renderHook(() => useFetch('/api/data'))
    unmount()

    // Resolve after unmount — should not trigger state update
    resolvePromise({ data: 'late' })

    // No assertion on state since component is gone; just ensure no error thrown
    expect(result.current.loading).toBe(true)
  })
})
```

### Hook with Context Dependency

```typescript
// hooks/useAuth.test.ts
import { renderHook } from '@testing-library/react'
import { AuthProvider } from '@/contexts/AuthContext'
import { useAuth } from './useAuth'

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider initialUser={{ id: '1', name: 'Alice', role: 'admin' }}>
      {children}
    </AuthProvider>
  )
}

describe('useAuth', () => {
  it('provides current user from context', () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    expect(result.current.user?.name).toBe('Alice')
    expect(result.current.user?.role).toBe('admin')
  })

  it('throws when used outside AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      'useAuth must be used within AuthProvider'
    )
  })
})
```

---

## API Route Testing

### App Router Route Handler

```typescript
// app/api/users/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUsersFromDb } from '@/lib/db'
import { z } from 'zod'

const querySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
})

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse({
    limit: searchParams.get('limit'),
    offset: searchParams.get('offset'),
  })

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const users = await getUsersFromDb(parsed.data)
  return NextResponse.json({ users, total: users.length })
}

export async function POST(request: NextRequest) {
  const body = await request.json()

  const bodySchema = z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
  })

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  // ... create user
  return NextResponse.json({ id: 'new-id', ...parsed.data }, { status: 201 })
}
```

```typescript
// app/api/users/route.test.ts
import { NextRequest } from 'next/server'
import { vi } from 'vitest'
import { GET, POST } from './route'

vi.mock('@/lib/db', () => ({
  getUsersFromDb: vi.fn(),
}))

const { getUsersFromDb } = await import('@/lib/db')

function makeRequest(url: string, options?: RequestInit): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'), options)
}

describe('GET /api/users', () => {
  it('returns users with default pagination', async () => {
    vi.mocked(getUsersFromDb).mockResolvedValue([
      { id: '1', name: 'Alice', email: 'alice@example.com' },
    ])

    const request = makeRequest('http://localhost/api/users')
    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.users).toHaveLength(1)
    expect(body.users[0].name).toBe('Alice')
  })

  it('returns 400 for invalid limit parameter', async () => {
    const request = makeRequest('http://localhost/api/users?limit=abc')
    const response = await GET(request)

    expect(response.status).toBe(400)
  })

  it('passes limit and offset to database', async () => {
    vi.mocked(getUsersFromDb).mockResolvedValue([])

    const request = makeRequest('http://localhost/api/users?limit=5&offset=10')
    await GET(request)

    expect(getUsersFromDb).toHaveBeenCalledWith({ limit: 5, offset: 10 })
  })
})

describe('POST /api/users', () => {
  it('creates user with valid payload', async () => {
    const request = makeRequest('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bob', email: 'bob@example.com' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.name).toBe('Bob')
  })

  it('returns 422 for invalid email', async () => {
    const request = makeRequest('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'Bob', email: 'not-an-email' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(422)
  })

  it('returns 422 when name is empty', async () => {
    const request = makeRequest('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ name: '', email: 'bob@example.com' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(422)
  })
})
```

---

## Server Actions Testing

Server Actions are plain async functions. Test them as pure units by mocking
their dependencies. The Next.js cache functions (`revalidatePath`,
`revalidateTag`) must also be mocked.

```typescript
// app/actions/createPost.ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

const schema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
})

export async function createPost(formData: FormData) {
  const session = await getSession()
  if (!session) redirect('/login')

  const parsed = schema.safeParse({
    title: formData.get('title'),
    content: formData.get('content'),
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const post = await db.post.create({
    data: { ...parsed.data, authorId: session.userId },
  })

  revalidatePath('/posts')
  return { success: true, postId: post.id }
}
```

```typescript
// app/actions/createPost.test.ts
import { vi } from 'vitest'
import { createPost } from './createPost'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/lib/db', () => ({
  db: { post: { create: vi.fn() } },
}))
vi.mock('@/lib/auth', () => ({ getSession: vi.fn() }))

const { revalidatePath } = await import('next/cache')
const { redirect } = await import('next/navigation')
const { db } = await import('@/lib/db')
const { getSession } = await import('@/lib/auth')

function makeFormData(data: Record<string, string>): FormData {
  const fd = new FormData()
  Object.entries(data).forEach(([k, v]) => fd.append(k, v))
  return fd
}

describe('createPost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getSession).mockResolvedValue({ userId: 'user-1' })
    vi.mocked(db.post.create).mockResolvedValue({ id: 'post-1' } as never)
  })

  it('creates post with valid data', async () => {
    const formData = makeFormData({ title: 'Hello', content: 'World' })
    const result = await createPost(formData)

    expect(result).toEqual({ success: true, postId: 'post-1' })
    expect(db.post.create).toHaveBeenCalledWith({
      data: { title: 'Hello', content: 'World', authorId: 'user-1' },
    })
  })

  it('revalidates /posts path on success', async () => {
    const formData = makeFormData({ title: 'Hello', content: 'World' })
    await createPost(formData)

    expect(revalidatePath).toHaveBeenCalledWith('/posts')
  })

  it('redirects to /login when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null)

    const formData = makeFormData({ title: 'Hello', content: 'World' })
    await createPost(formData)

    expect(redirect).toHaveBeenCalledWith('/login')
    expect(db.post.create).not.toHaveBeenCalled()
  })

  it('returns field errors for empty title', async () => {
    const formData = makeFormData({ title: '', content: 'World' })
    const result = await createPost(formData)

    expect(result).toHaveProperty('errors.title')
    expect(db.post.create).not.toHaveBeenCalled()
  })

  it('returns field errors for missing content', async () => {
    const formData = makeFormData({ title: 'Hello', content: '' })
    const result = await createPost(formData)

    expect(result).toHaveProperty('errors.content')
  })
})
```

---

## Integration Testing

### Page-Level Integration Test

Integration tests render full pages including their data-fetching and
routing context. Mock only external I/O (database, fetch).

```typescript
// app/posts/page.tsx (Server Component page)
import { getPosts } from '@/lib/posts'
import { PostList } from '@/components/PostList'

export default async function PostsPage() {
  const posts = await getPosts()
  return (
    <main>
      <h1>Posts</h1>
      {posts.length === 0 ? (
        <p>No posts yet.</p>
      ) : (
        <PostList posts={posts} />
      )}
    </main>
  )
}
```

```typescript
// app/posts/page.test.tsx
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import PostsPage from './page'

vi.mock('@/lib/posts', () => ({ getPosts: vi.fn() }))

const { getPosts } = await import('@/lib/posts')

describe('PostsPage', () => {
  it('renders heading', async () => {
    vi.mocked(getPosts).mockResolvedValue([])
    render(await PostsPage())

    expect(screen.getByRole('heading', { name: 'Posts' })).toBeInTheDocument()
  })

  it('shows empty state when no posts', async () => {
    vi.mocked(getPosts).mockResolvedValue([])
    render(await PostsPage())

    expect(screen.getByText('No posts yet.')).toBeInTheDocument()
  })

  it('renders list of posts', async () => {
    vi.mocked(getPosts).mockResolvedValue([
      { id: '1', title: 'First Post', excerpt: 'Intro...' },
      { id: '2', title: 'Second Post', excerpt: 'More...' },
    ])
    render(await PostsPage())

    expect(screen.getByText('First Post')).toBeInTheDocument()
    expect(screen.getByText('Second Post')).toBeInTheDocument()
  })
})
```

### Mocking next/navigation in Integration Tests

```typescript
// tests/utils/router-mock.ts
import { vi } from 'vitest'

export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
  refresh: vi.fn(),
}

export function setupRouterMock(overrides?: Partial<typeof mockRouter>) {
  vi.mock('next/navigation', () => ({
    useRouter: () => ({ ...mockRouter, ...overrides }),
    usePathname: vi.fn(() => '/'),
    useSearchParams: vi.fn(() => new URLSearchParams()),
    useParams: vi.fn(() => ({})),
    redirect: vi.fn(),
    notFound: vi.fn(),
  }))

  beforeEach(() => {
    Object.values(mockRouter).forEach(fn => fn.mockClear())
  })
}
```

```typescript
// components/NavButtons.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { NavButtons } from './NavButtons'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  usePathname: () => '/home',
}))

describe('NavButtons', () => {
  it('navigates to profile page on button click', async () => {
    const user = userEvent.setup()
    render(<NavButtons />)

    await user.click(screen.getByRole('button', { name: 'My Profile' }))

    expect(pushMock).toHaveBeenCalledWith('/profile')
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
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'mobile', use: { ...devices['iPhone 14'] } },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

### Page Navigation Test

```typescript
// e2e/navigation.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('home page loads and has correct title', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveTitle(/My App/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('navigates from home to about page', async ({ page }) => {
    await page.goto('/')

    await page.getByRole('link', { name: 'About' }).click()

    await expect(page).toHaveURL('/about')
    await expect(page.getByRole('heading', { name: 'About Us' })).toBeVisible()
  })

  test('back navigation works', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'About' }).click()
    await page.goBack()

    await expect(page).toHaveURL('/')
  })
})
```

### Form Submission Test

```typescript
// e2e/contact-form.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Contact Form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/contact')
  })

  test('submits form with valid data', async ({ page }) => {
    await page.getByLabel('Name').fill('Alice Smith')
    await page.getByLabel('Email').fill('alice@example.com')
    await page.getByLabel('Message').fill('Hello, I have a question.')

    await page.getByRole('button', { name: 'Send Message' }).click()

    await expect(page.getByRole('alert')).toHaveText('Message sent successfully!')
  })

  test('shows validation errors for empty submission', async ({ page }) => {
    await page.getByRole('button', { name: 'Send Message' }).click()

    await expect(page.getByText('Name is required')).toBeVisible()
    await expect(page.getByText('Email is required')).toBeVisible()
    await expect(page.getByText('Message is required')).toBeVisible()
  })

  test('shows error for invalid email', async ({ page }) => {
    await page.getByLabel('Name').fill('Alice')
    await page.getByLabel('Email').fill('not-an-email')
    await page.getByLabel('Message').fill('Hello')

    await page.getByRole('button', { name: 'Send Message' }).click()

    await expect(page.getByText('Please enter a valid email')).toBeVisible()
  })
})
```

### Authentication Flow Test

```typescript
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('successful login redirects to dashboard', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill('user@example.com')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page).toHaveURL('/dashboard')
    await expect(page.getByText('Welcome back')).toBeVisible()
  })

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login')

    await page.getByLabel('Email').fill('user@example.com')
    await page.getByLabel('Password').fill('wrong-password')
    await page.getByRole('button', { name: 'Sign In' }).click()

    await expect(page.getByRole('alert')).toContainText('Invalid credentials')
    await expect(page).toHaveURL('/login')
  })

  test('protected page redirects unauthenticated users', async ({ page }) => {
    await page.goto('/dashboard')

    await expect(page).toHaveURL('/login')
  })

  test('logout clears session and redirects to home', async ({ page, context }) => {
    // Set up authenticated state via storage state
    await page.goto('/login')
    await page.getByLabel('Email').fill('user@example.com')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: 'Sign In' }).click()
    await expect(page).toHaveURL('/dashboard')

    await page.getByRole('button', { name: 'Sign Out' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible()
  })
})

// Re-use authenticated state across tests with storageState
// playwright.config.ts project setup:
// { name: 'authenticated', use: { storageState: 'e2e/.auth/user.json' } }
```

---

## Mocking Patterns

### Module Mocking with vi.mock

```typescript
// ✅ GOOD: mock at the module level, outside describe/it
import { vi } from 'vitest'

vi.mock('@/lib/stripe', () => ({
  createCheckoutSession: vi.fn(),
  getSubscription: vi.fn(),
}))

// Access mocked functions after import
const { createCheckoutSession } = await import('@/lib/stripe')

describe('CheckoutService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a session', async () => {
    vi.mocked(createCheckoutSession).mockResolvedValue({ url: 'https://stripe.com/pay' })
    // ...
  })
})

// ❌ BAD: mocking inside test blocks — unreliable hoisting behavior
test('bad pattern', () => {
  vi.mock('@/lib/stripe', () => ({ ... })) // hoisting issues
})
```

### Mocking fetch with MSW (Recommended)

MSW intercepts at the network level, making tests realistic without
changing component code.

```typescript
// tests/msw/handlers.ts
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/api/users', () => {
    return HttpResponse.json([
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ])
  }),

  http.post('/api/users', async ({ request }) => {
    const body = await request.json() as { name: string; email: string }
    return HttpResponse.json({ id: 'new-id', ...body }, { status: 201 })
  }),

  http.get('/api/users/:id', ({ params }) => {
    if (params.id === '999') {
      return HttpResponse.json({ message: 'Not found' }, { status: 404 })
    }
    return HttpResponse.json({ id: params.id, name: 'Alice' })
  }),
]
```

```typescript
// tests/msw/server.ts
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

```typescript
// tests/setup.ts (add MSW lifecycle)
import { server } from './msw/server'
import { beforeAll, afterAll, afterEach } from 'vitest'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

```typescript
// Override handlers per test
import { http, HttpResponse } from 'msw'
import { server } from '@/tests/msw/server'

test('handles API error gracefully', async () => {
  server.use(
    http.get('/api/users', () =>
      HttpResponse.json({ message: 'Internal error' }, { status: 500 })
    )
  )

  render(<UserList />)

  await waitFor(() => {
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
```

### Environment Variable Mocking

```typescript
// ✅ GOOD: use vi.stubEnv for environment variables
import { vi } from 'vitest'

describe('feature flag', () => {
  it('enables feature when flag is set', () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_X', 'true')

    render(<FeatureGate feature="x"><div>Content</div></FeatureGate>)

    expect(screen.getByText('Content')).toBeInTheDocument()

    vi.unstubAllEnvs()
  })
})

// ✅ GOOD: set in vitest.config.ts for all tests
// test: { env: { NEXT_PUBLIC_API_URL: 'http://localhost:4000' } }
```

### Partial Module Mocking

```typescript
// ✅ GOOD: mock only what you need with importOriginal
vi.mock('@/lib/utils', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/utils')>()
  return {
    ...actual,
    generateId: vi.fn(() => 'test-id-123'),
  }
})
```

---

## Test Organization

### Recommended Directory Structure

```
my-next-app/
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── page.test.tsx        # Co-located unit/integration test
│   │   ├── api/
│   │   │   └── users/
│   │   │       ├── route.ts
│   │   │       └── route.test.ts
│   │   └── actions/
│   │       ├── createPost.ts
│   │       └── createPost.test.ts
│   ├── components/
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   └── Button.test.tsx  # Co-locate with component
│   │   └── UserCard/
│   │       ├── UserCard.tsx
│   │       └── UserCard.test.tsx
│   └── hooks/
│       ├── useAuth.ts
│       └── useAuth.test.ts
├── tests/
│   ├── setup.ts                 # Global test setup
│   └── msw/
│       ├── handlers.ts
│       └── server.ts
├── e2e/
│   ├── auth.spec.ts
│   ├── navigation.spec.ts
│   └── .auth/
│       └── user.json            # Saved auth state for Playwright
├── vitest.config.ts
└── playwright.config.ts
```

### Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Unit / component test | `<Name>.test.tsx` | `Button.test.tsx` |
| Integration test | `<Name>.test.tsx` | `PostsPage.test.tsx` |
| E2E test | `<name>.spec.ts` | `auth.spec.ts` |
| Test utility | `<name>.ts` in `tests/` | `render-helpers.ts` |
| MSW handler | `handlers.ts` | `tests/msw/handlers.ts` |

### Describe / It Naming Pattern

```typescript
describe('<ComponentName>', () => {
  describe('when <condition>', () => {
    it('<expected behavior>', () => { ... })
  })
})

// Examples:
describe('LoginForm', () => {
  describe('when submitting with valid credentials', () => {
    it('calls onSuccess with the user object', async () => { ... })
    it('clears the form fields', async () => { ... })
  })

  describe('when submitting with invalid credentials', () => {
    it('displays an error message', async () => { ... })
    it('does not call onSuccess', async () => { ... })
  })
})
```

### Shared Render Helpers

```typescript
// tests/render-helpers.tsx
import { render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient
}

export function renderWithProviders(
  ui: ReactNode,
  { queryClient = createTestQueryClient(), ...options }: CustomRenderOptions = {}
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }

  return render(ui, { wrapper: Wrapper, ...options })
}
```

---

## Best Practices

**DO:**

- Follow TDD: write the test before the implementation
- Query by accessible roles, labels, and visible text (`getByRole`, `getByLabelText`, `getByText`)
- Use `userEvent` over `fireEvent` for realistic interaction simulation
- Mock at the module boundary, not deep inside implementation
- Use MSW for fetch/API mocking instead of mocking `fetch` globally
- Keep unit tests fast; reserve Playwright for critical user journeys
- Co-locate test files with the source files they test
- Use `vi.clearAllMocks()` in `beforeEach` to prevent test pollution
- Use `waitFor` and `findBy*` for assertions on async state
- Test error states and loading states, not just the happy path
- Set coverage thresholds in CI to prevent regressions

**DON'T:**

- Query by `data-testid` unless absolutely no other option exists — it does not reflect user experience
- Import and call internal implementation functions directly in tests
- Assert on CSS class names or inline styles
- Use `fireEvent.click` for button interactions that trigger navigation or form submission
- Mock `next/router` (pages router) — use `next/navigation` for the App Router
- Test Server Components by importing them as client components
- Write tests that depend on execution order
- Leave `console.error` suppression in test setup without a documented reason
- Skip writing tests for error branches — they are the most valuable tests

---

## Quick Reference

| Task | Tool / API |
|------|-----------|
| Unit test runner | Vitest |
| Component rendering | `@testing-library/react` — `render` |
| Query by role | `screen.getByRole(role, { name })` |
| Query by label | `screen.getByLabelText(label)` |
| Query async element | `screen.findByRole(...)` |
| User interaction | `@testing-library/user-event` — `userEvent.setup()` |
| Assert DOM presence | `expect(el).toBeInTheDocument()` |
| Assert text content | `expect(el).toHaveTextContent(text)` |
| Assert form value | `expect(input).toHaveValue(value)` |
| Assert focus | `expect(el).toHaveFocus()` |
| Async assertion | `await waitFor(() => expect(...))` |
| Module mock | `vi.mock('module', () => ({ ... }))` |
| Spy on function | `vi.spyOn(obj, 'method')` |
| Partial mock | `vi.mock(..., async orig => ({ ...await orig(), fn: vi.fn() }))` |
| Env variable mock | `vi.stubEnv('KEY', 'value')` |
| Test hook | `renderHook(() => useMyHook())` |
| Hook with context | `renderHook(() => useHook(), { wrapper })` |
| State change in hook | `act(() => result.current.fn())` |
| API/fetch mock | MSW — `http.get('/path', () => HttpResponse.json(...))` |
| Server Action mock | `vi.mock('next/cache')` + mock function deps |
| E2E navigation | `page.goto(url)` + `expect(page).toHaveURL(url)` |
| E2E form input | `page.getByLabel('Name').fill('Alice')` |
| E2E click | `page.getByRole('button', { name: 'Submit' }).click()` |
| E2E assertion | `expect(locator).toBeVisible()` / `toHaveText()` |
| Coverage report | `vitest run --coverage` |
| E2E report | `playwright show-report` |

**Remember**: Tests are executable specifications. Write them to describe behavior from the user's perspective, not to describe implementation details.

