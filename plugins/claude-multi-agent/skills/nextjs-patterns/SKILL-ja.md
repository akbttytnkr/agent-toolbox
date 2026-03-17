---
name: nextjs-patterns-ja
description: Next.js 15+ / React 19+ のパターン集。App Router、Server Components、データフェッチ、状態管理、パフォーマンス最適化、本番環境のベストプラクティスを網羅。
user-invocable: false
---

# Next.js 開発パターン

Next.js 15+ および React 19+ において、App Router を使った高速・アクセシブル・保守しやすいアプリケーションを構築するためのパターン集です。

## 適用タイミング

- Next.js プロジェクトの構成設計（App Router のレイアウト、ファイル規約）
- Server Components と Client Components の選択判断
- データフェッチの実装（Server Components、Route Handlers、Server Actions）
- 状態管理（URL State、React Context、Zustand、Jotai）
- パフォーマンス最適化（画像、フォント、静的 vs 動的レンダリング、PPR）
- エラーと Not Found 状態の処理
- 認証・リダイレクト・ヘッダー操作のための Middleware 実装
- パフォーマンスや DX を低下させる一般的なアンチパターンの回避

## プロジェクト構成

### 推奨する App Router レイアウト

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
│   ├── ui/           # プリミティブで再利用可能な UI 要素
│   │   ├── Button.tsx
│   │   └── Card.tsx
│   └── features/     # 機能固有の複合コンポーネント
│       └── PostCard.tsx
├── lib/
│   ├── db.ts         # データベースクライアント
│   ├── auth.ts       # 認証ユーティリティ
│   └── utils.ts      # 共通ヘルパー
├── hooks/            # カスタムクライアントサイドフック
│   └── useDebounce.ts
├── types/            # 共通 TypeScript 型定義
│   └── index.ts
└── middleware.ts
```

### ファイル命名規約

| ファイル | 目的 |
|---|---|
| `page.tsx` | ルートセグメントの UI。ルートを公開アクセス可能にする |
| `layout.tsx` | 子ページをラップする共有 UI。状態を維持する |
| `loading.tsx` | そのセグメントの自動 Suspense バウンダリ |
| `error.tsx` | そのセグメントのエラーバウンダリ（Client Component 必須） |
| `not-found.tsx` | セグメント内の `notFound()` 呼び出し時の UI |
| `route.ts` | API Route Handler（GET、POST、PUT、DELETE 等） |
| `middleware.ts` | リクエスト前に実行される処理。プロジェクトルートに配置 |
| `template.tsx` | layout に似ているが、ナビゲーション時に再マウントされる |

## App Router パターン

### Server Components vs Client Components

App Router のデフォルトは Server Component です。ブラウザ API や React フックが必要な場合にのみ `'use client'` を追加してください。

```typescript
// ✅ GOOD: Server Component — ディレクティブ不要
// app/(dashboard)/posts/page.tsx
import { db } from '@/lib/db'
import { PostList } from '@/components/features/PostList'

export default async function PostsPage() {
  // DB に直接アクセス — API ラウンドトリップ不要
  const posts = await db.post.findMany({ orderBy: { createdAt: 'desc' } })
  return <PostList posts={posts} />
}
```

```typescript
// ✅ GOOD: Client Component — インタラクティブなリーフノードのみ
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
// ❌ BAD: 1 つのフックのためにページ全体を Client Component にしている
'use client'

import { useState } from 'react'
import { db } from '@/lib/db'  // これは失敗する — db はブラウザで実行できない

export default function PostsPage() {
  const [liked, setLiked] = useState(false)
  // ...
}
```

### `'use client'` ディレクティブのルール

- `'use client'` はファイルの先頭、インポートより前に記述する。
- Client Component ファイルにインポートされたものはすべてクライアントサイドのコードとして扱われる。
- `'use client'` はコンポーネントツリーの可能な限り末端に押し下げる。
- Server Components は Client Components をインポートできるが、Client Components は Server Components をインポートできない。

```typescript
// ✅ GOOD: Server Component が Client Component を合成する
// app/page.tsx (Server Component)
import { SearchBar } from '@/components/ui/SearchBar' // Client Component

export default async function HomePage() {
  const featuredPosts = await db.post.findMany({ take: 5 })
  return (
    <main>
      <SearchBar />  {/* Server Component 内でレンダリングされる Client Component */}
      <FeaturedPosts posts={featuredPosts} />
    </main>
  )
}
```

```typescript
// ❌ BAD: Client Component に Server Component をインポートしている
'use client'
import { ServerOnlyComponent } from './ServerOnlyComponent' // ビルド時エラー
```

### Route Groups

Route Groups `(name)` は URL パスに影響を与えずにルートを整理します。特定のセグメントにまたがるレイアウトを共有する際に使用します。

```typescript
// app/(auth)/layout.tsx — /login と /register にのみ適用
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

// app/(dashboard)/layout.tsx — ダッシュボードルートにのみ適用
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

### 動的ルート

```typescript
// app/posts/[slug]/page.tsx
interface PageProps {
  params: Promise<{ slug: string }>       // Next.js 15: params は Promise
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function PostPage({ params }: PageProps) {
  const { slug } = await params          // params Promise を await する
  const post = await db.post.findUnique({ where: { slug } })

  if (!post) notFound()

  return <article>{post.content}</article>
}

// ビルド時に静的パスを生成する
export async function generateStaticParams() {
  const posts = await db.post.findMany({ select: { slug: true } })
  return posts.map(post => ({ slug: post.slug }))
}
```

```typescript
// app/docs/[...catchAll]/page.tsx — /docs/a、/docs/a/b、/docs/a/b/c にマッチ
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

### 並列ルートとルートのインターセプト

```typescript
// app/(dashboard)/layout.tsx — @slot 規約を使った並列ルート
export default function DashboardLayout({
  children,
  modal,    // @modal スロット
  sidebar,  // @sidebar スロット
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

// app/(dashboard)/@modal/(.)posts/[id]/page.tsx — インターセプトルート
// クライアントサイドナビゲーション時はモーダルとして、直接アクセス時はフルページとしてレンダリング
export default async function PostModal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const post = await db.post.findUnique({ where: { id } })
  return <PostDialog post={post} />
}
```

## Server Components

### async/await によるデータフェッチ

```typescript
// ✅ GOOD: Server Component での直接的な async/await
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

### 並列データフェッチ

```typescript
// ✅ GOOD: Promise.all で並列フェッチ — ウォーターフォールを回避
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
// ❌ BAD: 逐次フェッチ — 前の処理を待ってから次を実行
export default async function DashboardPage() {
  const user = await db.user.findFirst()        // 100ms
  const posts = await db.post.findMany()        // + 150ms
  const analytics = await getAnalyticsSummary() // + 200ms = 合計 450ms
  // ...
}
```

### Client Components に渡す際のシリアライズ制約

Server Components は Client Components にシリアライズ可能なデータのみ渡せます（関数、クラスインスタンス、Date オブジェクトはそのまま渡せません）。

```typescript
// ✅ GOOD: シリアライズ可能なプレーンオブジェクトを渡す
async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const post = await db.post.findUnique({ where: { id } })

  // Client Component に渡す前に Date を文字列に変換する
  return (
    <PostEditor
      post={{
        id: post.id,
        title: post.title,
        content: post.content,
        createdAt: post.createdAt.toISOString(), // ✅ シリアライズ可能
      }}
    />
  )
}
```

```typescript
// ❌ BAD: シリアライズ不可能な値を渡している
async function PostPage() {
  const post = await db.post.findUnique({ where: { id: '1' } })

  return (
    <PostEditor
      post={post}                     // ❌ Prisma モデルインスタンスはシリアライズ不可
      onSave={async () => { /* ... */ }} // ❌ 関数は Client Component に渡せない
    />
  )
}
```

## データフェッチパターン

### キャッシュ付き fetch（Next.js 拡張 fetch）

```typescript
// ✅ GOOD: デフォルトでキャッシュ済み — { cache: 'force-cache' } と同等
async function getPost(slug: string) {
  const res = await fetch(`https://api.example.com/posts/${slug}`)
  if (!res.ok) throw new Error('Failed to fetch post')
  return res.json()
}

// ✅ GOOD: 動的データのためにキャッシュを無効化する
async function getLivePrice(symbol: string) {
  const res = await fetch(`https://api.example.com/prices/${symbol}`, {
    cache: 'no-store',
  })
  return res.json()
}

// ✅ GOOD: 時間間隔でリバリデートする
async function getLatestNews() {
  const res = await fetch('https://api.example.com/news', {
    next: { revalidate: 3600 }, // 1 時間ごとにリバリデート
  })
  return res.json()
}

// ✅ GOOD: タグベースのリバリデーション
async function getPosts() {
  const res = await fetch('https://api.example.com/posts', {
    next: { tags: ['posts'] },
  })
  return res.json()
}
```

### Route Handlers（app/api/）

Route Handlers は Webhook、サードパーティ連携、外部クライアントが消費するエンドポイントに使用します。自分のアプリの UI から発生するミューテーションには Server Actions を優先してください。

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

Server Actions は、自分のアプリの UI からフォーム送信やミューテーションを処理するための推奨手段です。

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

  revalidateTag('posts')          // タグベースのキャッシュを無効化
  revalidatePath('/posts')        // パスベースのキャッシュを無効化
  redirect('/posts')              // 成功後にナビゲート
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

### ローディング UI と Suspense によるストリーミング

```typescript
// app/(dashboard)/posts/loading.tsx — 自動 Suspense バウンダリ
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
// app/(dashboard)/page.tsx — Suspense を使った細粒度ストリーミング
import { Suspense } from 'react'

export default function DashboardPage() {
  return (
    <main>
      {/* クリティカルなコンテンツは即座にレンダリング */}
      <h1>Dashboard</h1>

      {/* 非クリティカルなコンテンツは解決され次第ストリーミング */}
      <Suspense fallback={<AnalyticsSkeleton />}>
        <AnalyticsWidget />        {/* 非同期 Server Component */}
      </Suspense>

      <Suspense fallback={<PostListSkeleton />}>
        <RecentPosts />            {/* 非同期 Server Component */}
      </Suspense>
    </main>
  )
}
```

## 状態管理

### searchParams を使った URL State

URL State は共有・ブックマーク可能で、JavaScript なしでも機能します。フィルター、ページネーション、検索クエリに使用してください。

```typescript
// app/posts/page.tsx — Server Component で URL State を読み取る
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
// components/ui/SearchForm.tsx — Client Component で URL State を更新する
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
        params.delete('page')  // 新しい検索時にページネーションをリセット
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

### React Context — 狭いスコープでの使用

```typescript
// ✅ GOOD: アプリ全体ではなく特定の機能にスコープされた Context
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
// ❌ BAD: すべてを 1 つの巨大な Context に入れる — 不必要な再レンダリングを引き起こす
const AppContext = createContext<{
  user: User
  posts: Post[]
  theme: Theme
  cart: CartItem[]
  // ...
}>({})
```

### 複雑なクライアント状態には Zustand

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

### アトミックな状態には Jotai

```typescript
// lib/atoms/filters.ts
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

export const searchQueryAtom = atom('')
export const selectedTagsAtom = atom<string[]>([])
export const sortOrderAtom = atomWithStorage<'asc' | 'desc'>('sortOrder', 'desc')

// 派生アトム — 他のアトムから計算される
export const activeFilterCountAtom = atom(get => {
  const query = get(searchQueryAtom)
  const tags = get(selectedTagsAtom)
  return (query ? 1 : 0) + tags.length
})
```

## パフォーマンス最適化

### next/image による画像最適化

```typescript
import Image from 'next/image'

// ✅ GOOD: すべての画像に next/image を使う。WebP 自動変換、
// 遅延読み込み、サイズ予約による CLS 防止が得られる
export function HeroSection() {
  return (
    <section>
      {/* 優先度の高い LCP 画像 — 即座にプリロード */}
      <Image
        src="/hero.jpg"
        alt="Hero image describing the page purpose"
        width={1200}
        height={630}
        priority          // ファーストビューの LCP 画像に追加する
        sizes="(max-width: 768px) 100vw, 1200px"
        className="hero-image"
      />
    </section>
  )
}

// ✅ GOOD: レスポンシブコンテナには fill レイアウトを使用
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
// ❌ BAD: <img> タグを直接使っている
export function BadHero() {
  return <img src="/hero.jpg" alt="Hero" /> // 最適化なし、CLS を引き起こす
}
```

### next/font によるフォント最適化

```typescript
// app/layout.tsx
import { Inter, Noto_Sans_JP } from 'next/font/google'
import localFont from 'next/font/local'

// ✅ GOOD: next/font は FOUT を排除し、フォントを自動的にセルフホストする
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
// app/layout.tsx — サイト全体のデフォルト設定
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

// app/posts/[slug]/page.tsx — ページごとの動的メタデータ
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

### 静的生成 vs 動的レンダリング

```typescript
// ✅ GOOD: 静的 — 動的関数を使わない場合のデフォルト。ビルド時に生成される
export default async function StaticPage() {
  const data = await fetch('https://api.example.com/data', {
    next: { revalidate: 3600 },
  }).then(r => r.json())
  return <DataView data={data} />
}

// ✅ GOOD: 動的 — リクエストごとに最新データが必要な場合に明示的にオプトイン
import { unstable_noStore as noStore } from 'next/cache'

export default async function DynamicPage() {
  noStore()  // ページ全体に { cache: 'no-store' } を適用するのと同等
  const data = await db.livePrice.findMany()
  return <LivePriceBoard data={data} />
}

// ✅ GOOD: generateStaticParams — ビルド時に動的ルートを静的生成する
export async function generateStaticParams() {
  const posts = await db.post.findMany({ select: { slug: true } })
  return posts.map(p => ({ slug: p.slug }))
}
```

### Partial Prerendering（PPR）— Next.js 15+

PPR により、1 つのルートで静的シェルを即座に配信しつつ、動的セクションをストリーミングできます。

```typescript
// next.config.ts — PPR を実験的に有効化する
import type { NextConfig } from 'next'

const config: NextConfig = {
  experimental: {
    ppr: 'incremental', // ルートごとのオプトインを有効にする
  },
}

export default config
```

```typescript
// app/posts/page.tsx — このルートを PPR にオプトインする
export const experimental_ppr = true

import { Suspense } from 'react'

export default function PostsPage() {
  return (
    <main>
      {/* 静的シェル — ビルド時にレンダリングされ即座に配信 */}
      <StaticHeader />
      <StaticNav />

      {/* 動的アイランド — 初回静的レスポンスの後にストリーミング */}
      <Suspense fallback={<PostListSkeleton />}>
        <PersonalizedPostFeed />   {/* Cookie/ヘッダーを読む — 動的 */}
      </Suspense>
    </main>
  )
}
```

## エラーハンドリング

### セグメントエラーバウンダリ

```typescript
// app/(dashboard)/error.tsx — Client Component である必要がある
'use client'

import { useEffect } from 'react'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function DashboardError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // エラーレポートサービスに記録する
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
// app/not-found.tsx — グローバル 404 ページ
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
// app/posts/[slug]/page.tsx — ルート内で not-found をトリガーする
import { notFound } from 'next/navigation'

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await db.post.findUnique({ where: { slug } })

  if (!post) notFound()  // 最も近い not-found.tsx をレンダリングする

  return <PostDetail post={post} />
}
```

### グローバルエラーバウンダリ

```typescript
// app/global-error.tsx — ルートレイアウトのエラーをキャッチする
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
// middleware.ts — マッチするすべてのリクエストの前に Edge Runtime で実行される
import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. 認証チェック — ダッシュボードルートを保護する
  if (pathname.startsWith('/dashboard')) {
    const token = await getToken({ req: request })
    if (!token) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('callbackUrl', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // 2. リダイレクト — レガシー URL のサポート
  if (pathname.startsWith('/blog/')) {
    return NextResponse.redirect(
      new URL(pathname.replace('/blog/', '/posts/'), request.url),
      { status: 301 }
    )
  }

  // 3. ヘッダー操作 — Server Components に識別情報を渡す
  const response = NextResponse.next()
  response.headers.set('x-pathname', pathname)
  return response
}

// マッチしたパスのみで Middleware を実行する — パフォーマンスを保つ
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/blog/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
```

## 避けるべきアンチパターン

### 不要な `'use client'`

```typescript
// ❌ BAD: 動的データをレンダリングするだけのためにページ全体を Client Component にしている
'use client'

import { useEffect, useState } from 'react'

export default function PostsPage() {
  const [posts, setPosts] = useState([])

  useEffect(() => {
    fetch('/api/posts').then(r => r.json()).then(setPosts)
  }, [])

  return <PostList posts={posts} />
}

// ✅ GOOD: Server Component でデータをフェッチ — クライアント JS 不要
export default async function PostsPage() {
  const posts = await db.post.findMany()
  return <PostList posts={posts} />
}
```

### Server Components での useState/useEffect

```typescript
// ❌ BAD: React フックは Client Components でのみ動作する
import { useState } from 'react'  // ビルドエラー

export default async function ServerPage() {
  const [count, setCount] = useState(0)  // 実行時 TypeError
  // ...
}
```

### API Routes の過剰使用 — Server Actions を優先する

```typescript
// ❌ BAD: 自分のアプリのフォームを処理するためだけに API Route を作っている
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

// ✅ GOOD: Server Action がミューテーションを直接処理 — ネットワークホップ不要
// lib/actions/posts.ts
'use server'
export async function createPost(formData: FormData) {
  await db.post.create({ data: { title: formData.get('title') as string } })
  revalidatePath('/posts')
}
```

### サーバーサイドで十分な場面でのクライアントサイドデータフェッチ

```typescript
// ❌ BAD: インタラクティビティが不要なのに Client Component でフェッチしている
'use client'

export function PostList() {
  const [posts, setPosts] = useState<Post[]>([])

  useEffect(() => {
    fetch('/api/posts').then(r => r.json()).then(setPosts)
  }, [])

  return posts.map(p => <PostCard key={p.id} post={p} />)
}

// ✅ GOOD: サーバーサイドでフェッチし、インタラクティビティが必要な場合のみ
// Client Component に props として渡す。不要ならすべてサーバーサイドでレンダリングする
export default async function PostsPage() {
  const posts = await db.post.findMany()
  return posts.map(p => <PostCard key={p.id} post={p} />)
}
```

## クイックリファレンス

### コンポーネントレンダリングの判断基準

| シナリオ | コンポーネント種別 | 理由 |
|---|---|---|
| DB や API からデータをフェッチする | Server Component | クライアント JS 不要、TTFB が高速 |
| Cookie やヘッダーにアクセスする | Server Component | サーバー専用 API |
| `useState` / `useEffect` を使う | Client Component | React フックはブラウザが必要 |
| ユーザーイベント（onClick）を処理する | Client Component | ブラウザのイベントモデルが必要 |
| ブラウザ API（localStorage）を使う | Client Component | サーバーでは利用不可 |
| 重い静的コンテンツをレンダリングする | Server Component | JS バンドルを削減できる |
| オプティミスティック UI を持つインタラクティブフォーム | Client Component | React の状態が必要 |

### データフェッチの意思決定ツリー

| シナリオ | 解決策 |
|---|---|
| ページでデータを読み取る | `async` Server Component + `await` |
| フォームからデータをミューテートする | Server Action（`'use server'`） |
| サードパーティ向けエンドポイントを公開する | Route Handler（`route.ts`） |
| Webhook を受信する | Route Handler（`route.ts`） |
| ミューテーション後にキャッシュを無効化する | `revalidatePath()` または `revalidateTag()` |
| リクエストごとに最新データを取得する | `cache: 'no-store'` または `noStore()` |

### キャッシュチートシート

| メカニズム | スコープ | 無効化方法 |
|---|---|---|
| `fetch` デフォルト | リクエストごとのメモ化 | 各リクエストで自動的に |
| `next: { revalidate: N }` | 時間ベースの ISR | N 秒経過後 |
| `next: { tags: ['x'] }` | タグベースの ISR | `revalidateTag('x')` |
| `cache: 'no-store'` | キャッシュの無効化 | 該当なし（常に動的） |
| `revalidatePath('/path')` | パスの無効化 | Server Action 内で呼び出す |

### パフォーマンスチェックリスト

| 課題 | 解決策 |
|---|---|
| LCP が遅い | ヒーロー画像に `<Image priority>` を使用、`next/font` を活用 |
| JS バンドルが大きい | `'use client'` をリーフノードに押し下げ、重い依存には `dynamic()` を使用 |
| CLS が発生する | `width`/`height` または `fill` + `aspect-ratio` でサイズを予約する |
| TTFB が遅い | `Promise.all` で並列フェッチ、PPR を有効化、ISR を活用 |
| フェッチのウォーターフォール | データを所有する Server Component でフェッチを行う |

**覚えておきたいこと**: デフォルトは Server Components にして、データはそれを使う場所でフェッチし、`'use client'` は可能な限り小さなリーフノードに押し下げ、API Routes を作る前に Server Actions を検討してください。

