/**
 * team-board.ts — ファイルベースの共有タスクボード + インボックス。
 *
 * 全プロセス（Leader + 各メンバー）がこのモジュール経由でボードにアクセスする。
 * アトミック書き込み（tmp → rename）で競合を防ぐ。
 *
 * ディレクトリ構造:
 *   /tmp/orchestra-{sessionId}/
 *   ├── tasks/          (タスクJSON)
 *   ├── inbox/          (メッセージJSONL + カーソル)
 *   ├── sessions/       (SDKセッションID保存)
 *   └── status.json     (フェーズ + タスクカウンタ)
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WorkerRole } from './roles.js'

// ─── 型定義 ───

export type TaskType = 'task' | 'review' | 'revision'

export interface BoardTask {
  id: number
  title: string
  instruction: string
  owner: WorkerRole
  status: 'pending' | 'in_progress' | 'completed' | 'error'
  blockedBy: number[]
  result: string | null
  error: string | null
  originalTask: string
  createdAt: string
  completedAt: string | null
  /** タスク種別 */
  taskType: TaskType
  /** レビューを依頼するロール（省略時はレビューなし） */
  reviewBy?: WorkerRole
  /** レビュー/修正タスクの場合、元タスクID */
  parentTaskId?: number
}

export interface BoardMessage {
  from: string
  to: string
  content: string
  timestamp: string
}

export type BoardPhase = 'idle' | 'working' | 'shutdown'

interface BoardStatus {
  phase: BoardPhase
  nextTaskId: number
}

// ─── ボード初期化 ───

export function initBoard(sessionId: string, workdir?: string): string {
  const boardDir = join(tmpdir(), `orchestra-${sessionId}`)
  mkdirSync(join(boardDir, 'tasks'), { recursive: true })
  mkdirSync(join(boardDir, 'inbox'), { recursive: true })
  mkdirSync(join(boardDir, 'sessions'), { recursive: true })

  // 共有ディレクトリはプロジェクト内に作成（CLAUDE_ALLOWED_DIR 制約を回避）
  const projectSharedDir = join(process.cwd(), '.orchestra-shared', sessionId)
  mkdirSync(projectSharedDir, { recursive: true })
  // ボードから共有ディレクトリへの参照を保存
  atomicWrite(join(boardDir, 'shared-dir.txt'), projectSharedDir)

  // 実装コードの出力先ディレクトリ（指定された場合のみ）
  if (workdir) {
    atomicWrite(join(boardDir, 'workdir.txt'), workdir)
  }

  const status: BoardStatus = { phase: 'idle', nextTaskId: 1 }
  writeFileSync(join(boardDir, 'status.json'), JSON.stringify(status))

  // アクティブボード一覧に登録
  registerBoard(boardDir)

  return boardDir
}

// ─── 共有ディレクトリ ───

export function getSharedDir(boardDir: string): string {
  const refPath = join(boardDir, 'shared-dir.txt')
  if (existsSync(refPath)) {
    return readFileSync(refPath, 'utf-8').trim()
  }
  // フォールバック（旧ボード互換）
  return join(boardDir, 'shared')
}

// ─── 作業ディレクトリ（実装コード出力先） ───

export function getWorkdir(boardDir: string): string | null {
  const refPath = join(boardDir, 'workdir.txt')
  if (!existsSync(refPath)) return null
  return readFileSync(refPath, 'utf-8').trim()
}

// ─── status.json ───

function readStatus(boardDir: string): BoardStatus {
  return JSON.parse(readFileSync(join(boardDir, 'status.json'), 'utf-8'))
}

function writeStatus(boardDir: string, status: BoardStatus): void {
  atomicWrite(join(boardDir, 'status.json'), JSON.stringify(status))
}

export function getPhase(boardDir: string): BoardPhase {
  return readStatus(boardDir).phase
}

export function setPhase(boardDir: string, phase: BoardPhase): void {
  const status = readStatus(boardDir)
  status.phase = phase
  writeStatus(boardDir, status)
}

// ─── アトミック書き込み ───

function atomicWrite(filePath: string, data: string): void {
  const tmp = `${filePath}.tmp.${process.pid}`
  writeFileSync(tmp, data)
  renameSync(tmp, filePath)
}

// ─── タスク CRUD ───

export function createTask(
  boardDir: string,
  params: {
    title: string
    instruction: string
    owner: WorkerRole
    blockedBy: number[]
    originalTask: string
    taskType?: TaskType
    reviewBy?: WorkerRole
    parentTaskId?: number
  },
): BoardTask {
  const status = readStatus(boardDir)
  const id = status.nextTaskId
  status.nextTaskId = id + 1
  writeStatus(boardDir, status)

  const task: BoardTask = {
    id,
    title: params.title,
    instruction: params.instruction,
    owner: params.owner,
    status: 'pending',
    blockedBy: params.blockedBy,
    result: null,
    error: null,
    originalTask: params.originalTask,
    createdAt: new Date().toISOString(),
    completedAt: null,
    taskType: params.taskType ?? 'task',
    reviewBy: params.reviewBy,
    parentTaskId: params.parentTaskId,
  }

  atomicWrite(join(boardDir, 'tasks', `${id}.json`), JSON.stringify(task, null, 2))
  return task
}

export function readTask(boardDir: string, id: number): BoardTask | null {
  const path = join(boardDir, 'tasks', `${id}.json`)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

export function updateTask(
  boardDir: string,
  id: number,
  patch: Partial<Pick<BoardTask, 'status' | 'result' | 'error' | 'completedAt'>>,
): void {
  const task = readTask(boardDir, id)
  if (!task) return
  Object.assign(task, patch)
  atomicWrite(join(boardDir, 'tasks', `${id}.json`), JSON.stringify(task, null, 2))
}

/** pending + owner一致 + blockedBy全完了 のタスクを1つ返す */
export function findNextTask(boardDir: string, role: WorkerRole): BoardTask | null {
  const status = readStatus(boardDir)
  for (let i = 1; i < status.nextTaskId; i++) {
    const task = readTask(boardDir, i)
    if (!task) continue
    if (task.status !== 'pending') continue
    if (task.owner !== role) continue

    // blockedBy のタスクが全て completed か確認
    const allResolved = task.blockedBy.every(depId => {
      const dep = readTask(boardDir, depId)
      return dep && (dep.status === 'completed' || dep.status === 'error')
    })
    if (!allResolved) continue

    return task
  }
  return null
}

/** タスクをアトミックに claim する（ファイルロックで排他制御） */
export function claimTask(boardDir: string, id: number): boolean {
  const lockPath = join(boardDir, 'tasks', `${id}.lock`)
  try {
    // 排他ロック取得（wx: ファイルが既に存在したら例外）
    writeFileSync(lockPath, String(process.pid), { flag: 'wx' })
  } catch {
    return false // 他プロセスがロック中
  }
  try {
    const task = readTask(boardDir, id)
    if (!task || task.status !== 'pending') return false
    task.status = 'in_progress'
    atomicWrite(join(boardDir, 'tasks', `${id}.json`), JSON.stringify(task, null, 2))
    return true
  } finally {
    try {
      unlinkSync(lockPath)
    } catch {
      /* ignore */
    }
  }
}

/** 全タスクが completed または error かどうか */
export function allTasksDone(boardDir: string): boolean {
  const status = readStatus(boardDir)
  if (status.nextTaskId <= 1) return true // タスクなし

  for (let i = 1; i < status.nextTaskId; i++) {
    const task = readTask(boardDir, i)
    if (!task) continue
    if (task.status !== 'completed' && task.status !== 'error') return false
  }
  return true
}

/** 全タスクの結果を取得 */
export function getAllTasks(boardDir: string): BoardTask[] {
  const status = readStatus(boardDir)
  const tasks: BoardTask[] = []
  for (let i = 1; i < status.nextTaskId; i++) {
    const task = readTask(boardDir, i)
    if (task) tasks.push(task)
  }
  return tasks
}

// ─── メッセージ（インボックス） ───

export function sendMessage(boardDir: string, msg: BoardMessage): void {
  const inboxPath = join(boardDir, 'inbox', `${msg.to}.jsonl`)
  appendFileSync(inboxPath, JSON.stringify(msg) + '\n')
  // 中央ログにも記録
  const logPath = join(boardDir, 'messages.jsonl')
  appendFileSync(logPath, JSON.stringify(msg) + '\n')
}

/** 全メッセージログを時系列で取得 */
export function readAllMessages(boardDir: string): BoardMessage[] {
  const logPath = join(boardDir, 'messages.jsonl')
  if (!existsSync(logPath)) return []
  const content = readFileSync(logPath, 'utf-8')
  return content
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line) as BoardMessage
      } catch {
        return null
      }
    })
    .filter((m): m is BoardMessage => m !== null)
}

/** カーソル位置から未読メッセージを読み取る */
export function readNewMessages(boardDir: string, role: string): BoardMessage[] {
  const inboxPath = join(boardDir, 'inbox', `${role}.jsonl`)
  const cursorPath = join(boardDir, 'inbox', `${role}.cursor`)

  if (!existsSync(inboxPath)) return []

  const content = readFileSync(inboxPath, 'utf-8')
  const cursor = existsSync(cursorPath) ? parseInt(readFileSync(cursorPath, 'utf-8').trim(), 10) : 0

  const lines = content.split('\n').filter(Boolean)
  if (cursor >= lines.length) return []

  const newLines = lines.slice(cursor)
  // カーソル更新
  writeFileSync(cursorPath, String(lines.length))

  return newLines
    .map(line => {
      try {
        return JSON.parse(line) as BoardMessage
      } catch {
        return null
      }
    })
    .filter((m): m is BoardMessage => m !== null)
}

// ─── ペインID永続化 ───
// boardDir/panes.json に { "se": "%5", "programmer": "%6" } を保存

export function savePanes(boardDir: string, panes: Record<string, string>): void {
  const existing = loadPanes(boardDir)
  const merged = { ...existing, ...panes }
  atomicWrite(join(boardDir, 'panes.json'), JSON.stringify(merged))
}

export function loadPanes(boardDir: string): Record<string, string> {
  const path = join(boardDir, 'panes.json')
  if (!existsSync(path)) return {}
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return {}
  }
}

export function removePaneEntry(boardDir: string, role: string): void {
  const panes = loadPanes(boardDir)
  delete panes[role]
  atomicWrite(join(boardDir, 'panes.json'), JSON.stringify(panes))
}

// ─── セッションID永続化 ───

export function saveSessionId(boardDir: string, role: string, sessionId: string): void {
  writeFileSync(join(boardDir, 'sessions', `${role}.txt`), sessionId)
}

export function loadSessionId(boardDir: string, role: string): string | undefined {
  const path = join(boardDir, 'sessions', `${role}.txt`)
  if (!existsSync(path)) return undefined
  const id = readFileSync(path, 'utf-8').trim()
  return id || undefined
}

// ─── タスクリカバリ ───

/** in_progress のタスクを pending に戻す（中断復旧用） */
export function recoverStaleTasks(boardDir: string): BoardTask[] {
  const status = readStatus(boardDir)
  const recovered: BoardTask[] = []

  for (let i = 1; i < status.nextTaskId; i++) {
    const task = readTask(boardDir, i)
    if (!task) continue
    if (task.status !== 'in_progress') continue

    task.status = 'pending'
    task.completedAt = null
    atomicWrite(join(boardDir, 'tasks', `${i}.json`), JSON.stringify(task, null, 2))
    recovered.push(task)

    // 残留ロックファイルも削除
    const lockPath = join(boardDir, 'tasks', `${i}.lock`)
    try {
      unlinkSync(lockPath)
    } catch {
      /* ignore */
    }
  }

  return recovered
}

// ─── ボード登録（永続化） ───
// アクティブなボードパスを registry ファイルに記録し、後から一覧・復旧できるようにする

function getRegistryPath(): string {
  return join(tmpdir(), 'orchestra-registry.jsonl')
}

interface BoardRegistryEntry {
  boardDir: string
  createdAt: string
  cwd: string
}

export function registerBoard(boardDir: string): void {
  const entry: BoardRegistryEntry = {
    boardDir,
    createdAt: new Date().toISOString(),
    cwd: process.cwd(),
  }
  appendFileSync(getRegistryPath(), JSON.stringify(entry) + '\n')
}

export function unregisterBoard(boardDir: string): void {
  const registryPath = getRegistryPath()
  if (!existsSync(registryPath)) return
  const content = readFileSync(registryPath, 'utf-8')
  const lines = content.split('\n').filter(Boolean)
  const remaining = lines.filter(line => {
    try {
      const entry = JSON.parse(line) as BoardRegistryEntry
      return entry.boardDir !== boardDir
    } catch {
      return true
    }
  })
  writeFileSync(registryPath, remaining.length > 0 ? remaining.join('\n') + '\n' : '')
}

/** 現存するアクティブなボード一覧を返す（status.json が存在するもののみ） */
export function listActiveBoards(): (BoardRegistryEntry & { phase: BoardPhase; taskSummary: { total: number; pending: number; inProgress: number; completed: number; error: number } })[] {
  const registryPath = getRegistryPath()
  if (!existsSync(registryPath)) return []

  const content = readFileSync(registryPath, 'utf-8')
  const lines = content.split('\n').filter(Boolean)
  const results: ReturnType<typeof listActiveBoards> = []

  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as BoardRegistryEntry
      if (!existsSync(join(entry.boardDir, 'status.json'))) continue

      const phase = getPhase(entry.boardDir)
      const tasks = getAllTasks(entry.boardDir)
      const taskSummary = {
        total: tasks.length,
        pending: tasks.filter(t => t.status === 'pending').length,
        inProgress: tasks.filter(t => t.status === 'in_progress').length,
        completed: tasks.filter(t => t.status === 'completed').length,
        error: tasks.filter(t => t.status === 'error').length,
      }

      results.push({ ...entry, phase, taskSummary })
    } catch {
      continue
    }
  }

  return results
}
