---
name: nextjs-patterns
description: Next.js 15+ / React 19+ patterns for App Router, Server Components, data fetching, state management, performance optimization, and production best practices.
user-invocable: false
---

# Next.js Development Patterns

Next.js 15+ and React 19+ patterns for building fast, accessible, and maintainable applications with the App Router.

## When to Activate

- Structuring a Next.js project (App Router layout, file conventions)
- Deciding between Server Components and Client Components
- Implementing data fetching (Server Components, Route Handlers, Server Actions)
- Managing state (URL state, React Context, Zustand, Jotai)
- Optimizing performance (images, fonts, static vs dynamic rendering, PPR)
- Handling errors and not-found states
- Writing Middleware for auth, redirects, or header manipulation
- Avoiding common anti-patterns that degrade performance or DX

## Project Structure

### Recommended App Router Layout

```
my-app/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── register/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx
│   │   └── posts/
│   │       ├── page.tsx
│   │       ├── [slug]/
│   │       │   └── page.tsx
│   │       └── [...catchAll]/
│   │           └── page.tsx
│   ├── api/
│   │   └── webhooks/
│   │       └── route.ts
│   ├── error.tsx
│   ├── not-found.tsx
│   ├── loading.tsx
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/           # Primitive, reusable UI elements
│   │   ├── Button.tsx
│   │   └── Card.tsx
│   └── features/     # Feature-specific composite components
│       └── PostCard.tsx
├── lib/
│   ├── db.ts         # Database client
│   ├── auth.ts       # Auth utilities
│   └── utils.ts      # Shared helpers
├── hooks/            # Custom client-side hooks
│   └── useDebounce.ts
├── types/            # Shared TypeScript types
│   └── index.ts
└── middleware.ts
```

### File Naming Conventions

| File | Purpose |
|---|---|
| `page.tsx` | Route segment UI, makes route publicly accessible |
| `layout.tsx` | Shared UI that wraps child pages, preserves state |
| `loading.tsx` | Automatic Suspense boundary for the segment |
| `error.tsx` | Error boundary for the segment (must be Client Component) |
| `not-found.tsx` | UI for `notFound()` calls within the segment |
| `route.ts` | API Route Handler (GET, POST, PUT, DELETE, etc.) |
| `middleware.ts` | Runs before requests; placed at the project root |
| `template.tsx` | Like layout but re-mounts on navigation |

## App Router Patterns

### Server Components vs Client Components

The default in App Router is Server Component. Add `'use client'` only when you need browser APIs or React hooks.

```typescript
// ✅ GOOD: Server Component — no directive needed
// app/(dashboard)/posts/page.tsx
import { db } from '@/lib/db'
import { PostList } from '@/components/features/PostList'

export default async function PostsPage() {
  // Direct DB access — no API round-trip required
  const posts = await db.post.findMany({ orderBy: { createdAt: 'desc' } })
  return <PostList posts={posts} />
}
```

```typescript
// ✅ GOOD: Client Component — only the interactive leaf node
// components/features/LikeButton.tsx
'use client'

import { useState } from 'react'

interface LikeButtonProps {
  initialCount: number
  postId: string
}

export function LikeButton({ initialCount, postId }: LikeButtonProps) {
  const [count, setCount] = useState(initialCount)

  async function handleLike() {
    setCount(c => c + 1)
    await fetch(`/api/posts/${postId}/like`, { method: 'POST' })
  }

  return (
    <button onClick={handleLike} aria-label={`Like post, ${count} likes`}>
      {count}
    </button>
  )
}
```

```typescript
// ❌ BAD: Marking the entire page as a Client Component to use one hook
'use client'

import { useState } from 'react'
import { db } from '@/lib/db'  // This will fail — db cannot run in the browser

export default function PostsPage() {
  const [liked, setLiked] = useState(false)
  // ...
}
```

### `'use client'` Directive Rules

- Place `'use client'` at the top of the file, before imports.
- Everything imported into a Client Component file is treated as client-side code.
- Push `'use client'` as far down the component tree as possible.
- Server Components can import Client Components, but Client Components cannot import Server Components.

```typescript
// ✅ GOOD: Server Component composes a Client Component
// app/page.tsx (Server Component)
import { SearchBar } from '@/components/ui/SearchBar' // Client Component

export default async function HomePage() {
  const featuredPosts = await db.post.findMany({ take: 5 })
  return (
    <main>
      <SearchBar />  {/* Client Component rendered inside Server Component */}
      <FeaturedPosts posts={featuredPosts} />
    </main>
  )
}
```

```typescript
// ❌ BAD: Importing a Server Component into a Client Component
'use client'
import { ServerOnlyComponent } from './ServerOnlyComponent' // Error at build time
```

### Route Groups

Route Groups `(name)` organize routes without affecting the URL path. Use them to share layouts across specific segments.

```typescript
// app/(auth)/layout.tsx — applies only to /login and /register
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-container">
      <header>
        <Logo />
      </header>
      <main>{children}</main>
    </div>
  )
}

// app/(dashboard)/layout.tsx — applies only to dashboard routes
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <div className="dashboard-grid">
      <Sidebar />
      <main>{children}</main>
    </div>
  )
}
```

### Dynamic Routes

```typescript
// app/posts/[slug]/page.tsx
interface PageProps {
  params: Promise<{ slug: string }>       // Next.js 15: params is a Promise
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params          // Await the params Promise
  const post = await db.post.findUnique({ where: { slug } })

  if (!post) notFound()

  return <article>{post.content}</article>
}

// Generate static paths at build time
export async function generateStaticParams() {
  const posts = await db.post.findMany({ select: { slug: true } })
  return posts.map(post => ({ slug: post.slug }))
}
```

```typescript
// app/docs/[...catchAll]/page.tsx — matches /docs/a, /docs/a/b, /docs/a/b/c
interface PageProps {
  params: Promise<{ catchAll: string[] }>
}

export default async function DocsPage({ params }: PageProps) {
  const { catchAll } = await params
  const path = catchAll.join('/')
  const doc = await getDocByPath(path)
  return <DocRenderer doc={doc} />
}
```

### Parallel Routes and Intercepting Routes

```typescript
// app/(dashboard)/layout.tsx — Parallel Routes with @slot convention
export default function DashboardLayout({
  children,
  modal,    // @modal slot
  sidebar,  // @sidebar slot
}: {
  children: React.ReactNode
  modal: React.ReactNode
  sidebar: React.ReactNode
}) {
  return (
    <div>
      {sidebar}
      {children}
      {modal}
    </div>
  )
}

// app/(dashboard)/@modal/(.)posts/[id]/page.tsx — Intercepting Route
// Renders as a modal when navigating client-side; full page on direct access
export default async function PostModal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const post = await db.post.findUnique({ where: { id } })
  return <PostDialog post={post} />
}
```

## Server Components

### Async/Await Data Fetching

```typescript
// ✅ GOOD: Direct async/await in Server Component
export default async function UserProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await db.user.findUnique({
    where: { id },
    include: { posts: { take: 5 } },
  })

  if (!user) notFound()

  return (
    <section>
      <h1>{user.name}</h1>
      <RecentPosts posts={user.posts} />
    </section>
  )
}
```

### Parallel Data Fetching

```typescript
// ✅ GOOD: Fetch in parallel with Promise.all — avoids waterfall
export default async function DashboardPage() {
  const [user, posts, analytics] = await Promise.all([
    db.user.findFirst(),
    db.post.findMany({ take: 10 }),
    getAnalyticsSummary(),
  ])

  return (
    <>
      <UserCard user={user} />
      <PostList posts={posts} />
      <AnalyticsWidget data={analytics} />
    </>
  )
}
```

```typescript
// ❌ BAD: Sequential fetching — each awaits the previous
export default async function DashboardPage() {
  const user = await db.user.findFirst()        // 100ms
  const posts = await db.post.findMany()        // + 150ms
  const analytics = await getAnalyticsSummary() // + 200ms = 450ms total
  // ...
}
```

### Serialization Constraints When Passing to Client Components

Server Components can pass only serializable data to Client Components (no functions, class instances, or Date objects as-is without conversion).

```typescript
// ✅ GOOD: Pass plain serializable objects
async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const post = await db.post.findUnique({ where: { id } })

  // Convert Date to string before passing to Client Component
  return (
    <PostEditor
      post={{
        id: post.id,
        title: post.title,
        content: post.content,
        createdAt: post.createdAt.toISOString(), // ✅ serializable
      }}
    />
  )
}
```

```typescript
// ❌ BAD: Passing non-serializable values
async function PostPage() {
  const post = await db.post.findUnique({ where: { id: '1' } })

  return (
    <PostEditor
      post={post}                     // ❌ Prisma model instance is not serializable
      onSave={async () => { /* ... */ }} // ❌ Cannot pass function to Client Component
    />
  )
}
```

## Data Fetching Patterns

### fetch with Caching (Next.js extended fetch)

```typescript
// ✅ GOOD: Cached by default — equivalent to { cache: 'force-cache' }
async function getPost(slug: string) {
  const res = await fetch(`https://api.example.com/posts/${slug}`)
  if (!res.ok) throw new Error('Failed to fetch post')
  return res.json()
}

// ✅ GOOD: Opt out of caching for dynamic data
async function getLivePrice(symbol: string) {
  const res = await fetch(`https://api.example.com/prices/${symbol}`, {
    cache: 'no-store',
  })
  return res.json()
}

// ✅ GOOD: Revalidate on a time interval
async function getLatestNews() {
  const res = await fetch('https://api.example.com/news', {
    next: { revalidate: 3600 }, // Revalidate every 1 hour
  })
  return res.json()
}

// ✅ GOOD: Tag-based revalidation
async function getPosts() {
  const res = await fetch('https://api.example.com/posts', {
    next: { tags: ['posts'] },
  })
  return res.json()
}
```

### Route Handlers (app/api/)

Use Route Handlers for webhooks, third-party integrations, and endpoints consumed by external clients. Prefer Server Actions for mutations triggered from within your own UI.

```typescript
// app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
})

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const page = Number(searchParams.get('page') ?? '1')
  const limit = Number(searchParams.get('limit') ?? '20')

  const posts = await db.post.findMany({
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ posts })
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const result = createPostSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 })
  }

  const post = await db.post.create({
    data: { ...result.data, authorId: session.userId },
  })

  return NextResponse.json({ post }, { status: 201 })
}
```

### Server Actions

Server Actions are the recommended way to handle form submissions and mutations from your own UI.

```typescript
// lib/actions/posts.ts
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getSession } from '@/lib/auth'

const postSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  content: z.string().min(1, 'Content is required'),
})

export type ActionState = {
  success: boolean
  errors?: Record<string, string[]>
  message?: string
}

export async function createPost(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await getSession()
  if (!session) return { success: false, message: 'Unauthorized' }

  const raw = {
    title: formData.get('title'),
    content: formData.get('content'),
  }

  const result = postSchema.safeParse(raw)
  if (!result.success) {
    return { success: false, errors: result.error.flatten().fieldErrors }
  }

  await db.post.create({
    data: { ...result.data, authorId: session.userId },
  })

  revalidateTag('posts')          // Invalidate tag-based cache
  revalidatePath('/posts')        // Invalidate path-based cache
  redirect('/posts')              // Navigate after success
}
```

```typescript
// components/features/CreatePostForm.tsx
'use client'

import { useActionState } from 'react'  // React 19
import { createPost, type ActionState } from '@/lib/actions/posts'

const initialState: ActionState = { success: false }

export function CreatePostForm() {
  const [state, formAction, isPending] = useActionState(createPost, initialState)

  return (
    <form action={formAction}>
      <div>
        <label htmlFor="title">Title</label>
        <input id="title" name="title" type="text" required />
        {state.errors?.title && (
          <p role="alert" className="error">{state.errors.title[0]}</p>
        )}
      </div>

      <div>
        <label htmlFor="content">Content</label>
        <textarea id="content" name="content" required />
        {state.errors?.content && (
          <p role="alert" className="error">{state.errors.content[0]}</p>
        )}
      </div>

      <button type="submit" disabled={isPending} aria-busy={isPending}>
        {isPending ? 'Creating...' : 'Create Post'}
      </button>

      {state.message && <p role="status">{state.message}</p>}
    </form>
  )
}
```

### Loading UI and Streaming with Suspense

```typescript
// app/(dashboard)/posts/loading.tsx — automatic Suspense boundary
export default function PostsLoading() {
  return (
    <div aria-label="Loading posts">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton-card" aria-hidden="true" />
      ))}
    </div>
  )
}
```

```typescript
// app/(dashboard)/page.tsx — granular streaming with Suspense
import { Suspense } from 'react'

export default function DashboardPage() {
  return (
    <main>
      {/* Critical content renders immediately */}
      <h1>Dashboard</h1>

      {/* Non-critical content streams in as it resolves */}
      <Suspense fallback={<AnalyticsSkeleton />}>
        <AnalyticsWidget />        {/* async Server Component */}
      </Suspense>

      <Suspense fallback={<PostListSkeleton />}>
        <RecentPosts />            {/* async Server Component */}
      </Suspense>
    </main>
  )
}
```

## State Management

### URL State with searchParams

URL state is shareable, bookmark-able, and works without JavaScript. Use it for filters, pagination, and search queries.

```typescript
// app/posts/page.tsx — reading URL state in Server Component
interface PageProps {
  searchParams: Promise<{ q?: string; page?: string; tag?: string }>
}

export default async function PostsPage({ searchParams }: PageProps) {
  const { q, page = '1', tag } = await searchParams

  const posts = await db.post.findMany({
    where: {
      ...(q && { title: { contains: q, mode: 'insensitive' } }),
      ...(tag && { tags: { has: tag } }),
    },
    skip: (Number(page) - 1) * 20,
    take: 20,
  })

  return (
    <>
      <SearchForm defaultQuery={q} />
      <PostList posts={posts} />
      <Pagination currentPage={Number(page)} />
    </>
  )
}
```

```typescript
// components/ui/SearchForm.tsx — updating URL state in Client Component
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

export function SearchForm({ defaultQuery }: { defaultQuery?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const updateQuery = useCallback(
    (q: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (q) {
        params.set('q', q)
        params.delete('page')  // Reset pagination on new search
      } else {
        params.delete('q')
      }
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, pathname, searchParams]
  )

  return (
    <input
      type="search"
      defaultValue={defaultQuery}
      onChange={e => updateQuery(e.target.value)}
      placeholder="Search posts..."
      aria-label="Search posts"
    />
  )
}
```

### React Context — Narrow Scope Usage

```typescript
// ✅ GOOD: Context scoped to a specific feature, not the entire app
// components/features/ThemeProvider.tsx
'use client'

import { createContext, useContext, useState } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')
  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'))

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
```

```typescript
// ❌ BAD: Putting everything in one giant context — causes unnecessary re-renders
const AppContext = createContext<{
  user: User
  posts: Post[]
  theme: Theme
  cart: CartItem[]
  // ...
}>({})
```

### Zustand for Complex Client State

```typescript
// lib/stores/cart.ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
}

interface CartStore {
  items: CartItem[]
  addItem: (item: Omit<CartItem, 'quantity'>) => void
  removeItem: (id: string) => void
  clearCart: () => void
  total: () => number
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: item =>
        set(state => {
          const existing = state.items.find(i => i.id === item.id)
          if (existing) {
            return {
              items: state.items.map(i =>
                i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
              ),
            }
          }
          return { items: [...state.items, { ...item, quantity: 1 }] }
        }),

      removeItem: id =>
        set(state => ({ items: state.items.filter(i => i.id !== id) })),

      clearCart: () => set({ items: [] }),

      total: () =>
        get().items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    }),
    {
      name: 'cart-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
```

### Jotai for Atomic State

```typescript
// lib/atoms/filters.ts
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

export const searchQueryAtom = atom('')
export const selectedTagsAtom = atom<string[]>([])
export const sortOrderAtom = atomWithStorage<'asc' | 'desc'>('sortOrder', 'desc')

// Derived atom — computed from other atoms
export const activeFilterCountAtom = atom(get => {
  const query = get(searchQueryAtom)
  const tags = get(selectedTagsAtom)
  return (query ? 1 : 0) + tags.length
})
```

## Performance Optimization

### Image Optimization with next/image

```typescript
import Image from 'next/image'

// ✅ GOOD: Use next/image for all images to get automatic WebP conversion,
// lazy loading, and CLS prevention via reserved dimensions
export function HeroSection() {
  return (
    <section>
      {/* Priority LCP image — preloads immediately */}
      <Image
        src="/hero.jpg"
        alt="Hero image describing the page purpose"
        width={1200}
        height={630}
        priority          // Add for above-the-fold LCP images
        sizes="(max-width: 768px) 100vw, 1200px"
        className="hero-image"
      />
    </section>
  )
}

// ✅ GOOD: fill layout for responsive containers
export function PostThumbnail({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative aspect-video">
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        className="object-cover"
      />
    </div>
  )
}
```

```typescript
// ❌ BAD: Using <img> tag directly
export function BadHero() {
  return <img src="/hero.jpg" alt="Hero" /> // No optimization, causes CLS
}
```

### Font Optimization with next/font

```typescript
// app/layout.tsx
import { Inter, Noto_Sans_JP } from 'next/font/google'
import localFont from 'next/font/local'

// ✅ GOOD: next/font eliminates FOUT and self-hosts fonts automatically
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const notoSansJP = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-noto',
})

const brandFont = localFont({
  src: '../public/fonts/BrandFont.woff2',
  variable: '--font-brand',
  display: 'swap',
})

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${notoSansJP.variable} ${brandFont.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  )
}
```

### Metadata API

```typescript
// app/layout.tsx — site-wide defaults
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'My App',
    template: '%s | My App',
  },
  description: 'A production-ready Next.js application.',
  metadataBase: new URL('https://example.com'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://example.com',
    siteName: 'My App',
  },
  twitter: {
    card: 'summary_large_image',
  },
}

// app/posts/[slug]/page.tsx — dynamic per-page metadata
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = await db.post.findUnique({ where: { slug } })

  if (!post) return { title: 'Post Not Found' }

  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      images: [{ url: post.coverImage, width: 1200, height: 630 }],
    },
  }
}
```

### Static Generation vs Dynamic Rendering

```typescript
// ✅ GOOD: Static — page is generated at build time (default when no dynamic functions are used)
export default async function StaticPage() {
  const data = await fetch('https://api.example.com/data', {
    next: { revalidate: 3600 },
  }).then(r => r.json())
  return <DataView data={data} />
}

// ✅ GOOD: Dynamic — opts in explicitly when data must be fresh on every request
import { unstable_noStore as noStore } from 'next/cache'

export default async function DynamicPage() {
  noStore()  // Equivalent to { cache: 'no-store' } for the whole page
  const data = await db.livePrice.findMany()
  return <LivePriceBoard data={data} />
}

// ✅ GOOD: generateStaticParams — statically generate dynamic routes at build time
export async function generateStaticParams() {
  const posts = await db.post.findMany({ select: { slug: true } })
  return posts.map(p => ({ slug: p.slug }))
}
```

### Partial Prerendering (PPR) — Next.js 15+

PPR allows a single route to serve a static shell instantly while streaming dynamic sections.

```typescript
// next.config.ts — enable PPR experimentally
import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: {
    ppr: 'incremental', // Enable per-route opt-in
  },
}

export default config
```

```typescript
// app/posts/page.tsx — opt this route into PPR
export const experimental_ppr = true

import { Suspense } from 'react'

export default function PostsPage() {
  return (
    <main>
      {/* Static shell — rendered at build time, served instantly */}
      <StaticHeader />
      <StaticNav />

      {/* Dynamic island — streamed in after the initial static response */}
      <Suspense fallback={<PostListSkeleton />}>
        <PersonalizedPostFeed />   {/* reads cookies/headers — dynamic */}
      </Suspense>
    </main>
  )
}
```

## Error Handling

### Segment Error Boundary

```typescript
// app/(dashboard)/error.tsx — must be a Client Component
'use client'

import { useEffect } from 'react'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function DashboardError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to an error reporting service
    console.error('Dashboard error:', error)
  }, [error])

  return (
    <div role="alert" aria-live="assertive">
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  )
}
```

### Not Found

```typescript
// app/not-found.tsx — global 404 page
import Link from 'next/link'

export default function NotFound() {
  return (
    <main>
      <h1>404 — Page Not Found</h1>
      <p>The page you are looking for does not exist.</p>
      <Link href="/">Return home</Link>
    </main>
  )
}
```

```typescript
// app/posts/[slug]/page.tsx — trigger not-found within a route
import { notFound } from 'next/navigation'

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await db.post.findUnique({ where: { slug } })

  if (!post) notFound()  // Renders the nearest not-found.tsx

  return <PostDetail post={post} />
}
```

### Global Error Boundary

```typescript
// app/global-error.tsx — catches errors in the root layout
'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body>
        <div role="alert">
          <h1>Critical error</h1>
          <p>{error.digest}</p>
          <button onClick={reset}>Reload</button>
        </div>
      </body>
    </html>
  )
}
```

## Middleware

```typescript
// middleware.ts — runs on the Edge Runtime before every matching request
import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Auth check — protect dashboard routes
  if (pathname.startsWith('/dashboard')) {
    const token = await getToken({ req: request })
    if (!token) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // 2. Redirect — legacy URL support
  if (pathname.startsWith('/blog/')) {
    return NextResponse.redirect(
      new URL(pathname.replace('/blog/', '/posts/'), request.url),
      { status: 301 }
    )
  }

  // 3. Header manipulation — pass identity to Server Components
  const response = NextResponse.next()
  response.headers.set('x-pathname', pathname)
  return response
}

// Only run Middleware on matched paths — keep it performant
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/blog/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
```

## Anti-Patterns to Avoid

### Unnecessary `'use client'`

```typescript
// ❌ BAD: Entire page marked as Client Component just to render dynamic data
'use client'

import { useEffect, useState } from 'react'

export default function PostsPage() {
  const [posts, setPosts] = useState([])

  useEffect(() => {
    fetch('/api/posts').then(r => r.json()).then(setPosts)
  }, [])

  return <PostList posts={posts} />
}

// ✅ GOOD: Data fetched in a Server Component — no client JS needed
export default async function PostsPage() {
  const posts = await db.post.findMany()
  return <PostList posts={posts} />
}
```

### useState/useEffect in Server Components

```typescript
// ❌ BAD: React hooks only work in Client Components
import { useState } from 'react'  // Build error

export default async function ServerPage() {
  const [count, setCount] = useState(0)  // TypeError at runtime
  // ...
}
```

### Overusing API Routes — Prefer Server Actions

```typescript
// ❌ BAD: Creating an API Route just to handle a form in your own app
// app/api/posts/route.ts
export async function POST(req: NextRequest) {
  const body = await req.json()
  await db.post.create({ data: body })
  return NextResponse.json({ ok: true })
}

// components/CreatePostForm.tsx
async function handleSubmit(data: FormData) {
  await fetch('/api/posts', { method: 'POST', body: JSON.stringify(data) })
}

// ✅ GOOD: Server Action handles mutation directly — no network hop
// lib/actions/posts.ts
'use server'
export async function createPost(formData: FormData) {
  await db.post.create({ data: { title: formData.get('title') as string } })
  revalidatePath('/posts')
}
```

### Client-Side Data Fetching When Server-Side Suffices

```typescript
// ❌ BAD: Fetching in a Client Component when no interactivity requires it
'use client'

export function PostList() {
  const [posts, setPosts] = useState<Post[]>([])

  useEffect(() => {
    fetch('/api/posts').then(r => r.json()).then(setPosts)
  }, [])

  return posts.map(p => <PostCard key={p.id} post={p} />)
}

// ✅ GOOD: Fetch server-side; pass data as props to a Client Component
// only if interactivity is needed, otherwise render everything server-side
export default async function PostsPage() {
  const posts = await db.post.findMany()
  return posts.map(p => <PostCard key={p.id} post={p} />)
}
```

## Quick Reference

### Component Rendering Decisions

| Scenario | Component Type | Reason |
|---|---|---|
| Fetch data from DB or API | Server Component | No client JS, faster TTFB |
| Access cookies or headers | Server Component | Server-only APIs |
| Use `useState` / `useEffect` | Client Component | React hooks require browser |
| Handle user events (onClick) | Client Component | Browser event model |
| Use browser APIs (localStorage) | Client Component | Not available on server |
| Render heavy static content | Server Component | Reduces JS bundle |
| Interactive form with optimistic UI | Client Component | Needs React state |

### Data Fetching Decision Tree

| Scenario | Solution |
|---|---|
| Read data in a page | `async` Server Component + `await` |
| Mutate data from a form | Server Action (`'use server'`) |
| Expose an endpoint for 3rd parties | Route Handler (`route.ts`) |
| Webhook receiver | Route Handler (`route.ts`) |
| Invalidate cache after mutation | `revalidatePath()` or `revalidateTag()` |
| Fresh data on every request | `cache: 'no-store'` or `noStore()` |

### Caching Cheat Sheet

| Mechanism | Scope | How to invalidate |
|---|---|---|
| `fetch` default | Per-request memoization | Automatic on each request |
| `next: { revalidate: N }` | Time-based ISR | After N seconds |
| `next: { tags: ['x'] }` | Tag-based ISR | `revalidateTag('x')` |
| `cache: 'no-store'` | Opt-out of caching | N/A (always dynamic) |
| `revalidatePath('/path')` | Path invalidation | Called in Server Action |

### Performance Checklist

| Concern | Solution |
|---|---|
| Slow LCP | `<Image priority>` for hero images, use `next/font` |
| Large JS bundle | Push `'use client'` to leaf nodes, use `dynamic()` for heavy deps |
| CLS | Reserve dimensions with `width`/`height` or `fill` + `aspect-ratio` |
| Slow TTFB | Parallel `Promise.all`, enable PPR, use ISR |
| Waterfall fetches | Move fetching to the Server Component that owns the data |

**Remember**: Default to Server Components, fetch data where it is used, push `'use client'` to the smallest possible leaf node, and reach for Server Actions before creating API Routes.

