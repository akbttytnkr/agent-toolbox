/**
 * team-member.ts — tmux ペイン内の永続メンバーループ。
 *
 * 起動: bun src/team-member.ts <boardDir> <role>
 *
 * ループ:
 *   1. phase チェック → 'shutdown' なら終了
 *   2. inbox から未読メッセージ取得
 *   3. findNextTask で自分のタスクを探す
 *   4. タスクなし → sleep 1s → 1 に戻る
 *   5. タスク実行 (query + resume でセッション継続)
 *   6. 出力から <send to="..."> タグをパース → 配信
 *   7. タスクを completed に更新
 *   8. 1 に戻る
 */

import { join } from 'node:path'
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { runDebate } from './debate.js'
import { logSDKMessage } from './sdk-logger.js'
import { ROLES, type WorkerRole } from './roles.js'
import {
  type BoardMessage,
  type BoardTask,
  claimTask,
  createTask,
  findNextTask,
  getPhase,
  getSharedDir,
  getWorkdir,
  loadSessionId,
  readNewMessages,
  readTask,
  saveSessionId,
  sendMessage,
  updateTask,
} from './team-board.js'
import { loadRules } from './rules-loader.js'
import { savePattern, loadLearnedPatterns } from './learning.js'

// ─── ANSI カラー ───

const DIM = '\x1b[90m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const RESET = '\x1b[0m'

// ─── <send to="..."> パーサー ───

interface SendDirective {
  to: string
  content: string
}

function parseSendTags(output: string): SendDirective[] {
  const directives: SendDirective[] = []
  const regex = /<send\s+to="([^"]+)">([\s\S]*?)<\/send>/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(output)) !== null) {
    directives.push({ to: match[1], content: match[2].trim() })
  }
  return directives
}

// ─── <worker-feedback> パーサー ───

function parseWorkerFeedback(output: string): string | null {
  const match = /<worker-feedback>([\s\S]*?)<\/worker-feedback>/.exec(output)
  return match ? match[1].trim() : null
}

// ─── <request-changes> パーサー ───

function parseRequestChanges(output: string): string | null {
  const match = /<request-changes>([\s\S]*?)<\/request-changes>/.exec(output)
  return match ? match[1].trim() : null
}

// ─── レビューサイクル自動生成 ───

function handlePostCompletion(
  boardDir: string,
  task: BoardTask,
  output: string,
  label: string,
): void {
  // (A) task/revision が完了 → reviewBy があればレビュータスクを生成
  if ((task.taskType === 'task' || task.taskType === 'revision') && task.reviewBy) {
    const reviewTask = createTask(boardDir, {
      title: `[レビュー] ${task.title}`,
      instruction: `以下のタスク成果物をレビューしてください。\n\n## 元タスク\n**${task.title}**\n${task.instruction}\n\n## 成果物\n${output}\n\n## レビュー指示\n- 品質・正確性・完全性を評価してください\n- 問題がなければ承認理由を述べてください\n- 問題があれば <request-changes>具体的な修正指示</request-changes> タグで修正を依頼してください`,
      owner: task.reviewBy,
      blockedBy: [],
      originalTask: task.originalTask,
      taskType: 'review',
      parentTaskId: task.id,
    })
    console.log(
      `  ${CYAN}🔍 レビュータスク #${reviewTask.id} を自動生成 → ${task.reviewBy}${RESET}`,
    )
  }

  // (B) review が完了 → 修正依頼があれば revision タスクを生成
  if (task.taskType === 'review' && task.parentTaskId) {
    const changes = parseRequestChanges(output)
    if (changes) {
      const parentTask = readTask(boardDir, task.parentTaskId)
      if (parentTask) {
        const revisionTask = createTask(boardDir, {
          title: `[修正] ${parentTask.title}`,
          instruction: `レビューで以下の修正が求められました。修正してください。\n\n## 修正依頼\n${changes}\n\n## 元のタスク\n**${parentTask.title}**\n${parentTask.instruction}\n\n## 前回の成果物\n${parentTask.result ?? '(なし)'}`,
          owner: parentTask.owner,
          blockedBy: [],
          originalTask: parentTask.originalTask,
          taskType: 'revision',
          reviewBy: parentTask.reviewBy,
          parentTaskId: parentTask.id,
        })
        console.log(
          `  ${YELLOW}✏️  修正タスク #${revisionTask.id} を自動生成 → ${parentTask.owner}${RESET}`,
        )
      }
    } else {
      console.log(`  ${GREEN}✅ レビュー承認${RESET}`)
    }
  }
}

// ─── メッセージコンテキスト構築 ───

function buildMessageContext(messages: BoardMessage[]): string {
  if (messages.length === 0) return ''
  const lines = messages.map(m => `[${m.from}]: ${m.content}`).join('\n')
  return `\n## チームメンバーからのメッセージ\n${lines}\n`
}

// ─── タスク実行（query + resume） ───

async function executeTask(
  boardDir: string,
  role: WorkerRole,
  task: BoardTask,
  messageContext: string,
): Promise<string> {
  const roleInfo = ROLES[role]

  // セキュリティ委員会は討論モード
  if (roleInfo.isDebate) {
    console.log(`  ${YELLOW}⚖️  討論モード（4ラウンド）${RESET}`)
    return runDebate(task.originalTask, task.instruction)
  }

  // 通信プロトコル + 共有ディレクトリ + 作業ディレクトリをsystemPromptに追加
  const sharedDir = getSharedDir(boardDir)
  const workdir = getWorkdir(boardDir)

  const workdirSection = workdir
    ? `

## 作業ディレクトリ（実装コード出力先）
実装コード出力先: ${workdir}

**実装コード（ソースコード、テストコード、設定ファイル等）は必ずこのディレクトリ配下に配置してください。**
既存のディレクトリ構造・命名規則に従って適切なパスに保存すること。

## 共有ディレクトリ（ドキュメント・設計書用）
チーム共有ディレクトリ: ${sharedDir}

**設計書・テスト計画・調査レポート等のドキュメント** はこのディレクトリに保存してください。
他メンバーのドキュメントもここから読み取れます。

ファイル命名規則: <ロール名>-<内容>.<拡張子>
例:
  ${sharedDir}/se-architecture.md          — アーキテクチャ設計書
  ${sharedDir}/tester-test-plan.md         — テスト計画
  ${sharedDir}/ui_ux-wireframe.md          — ワイヤーフレーム`
    : `

## 共有ディレクトリ
チーム共有ディレクトリ: ${sharedDir}

成果物（設計書、コード、テスト計画、図など）はこのディレクトリに保存してください。
他メンバーの成果物もここから読み取れます。

ファイル命名規則: <ロール名>-<内容>.<拡張子>
例:
  ${sharedDir}/se-architecture.md          — アーキテクチャ設計書
  ${sharedDir}/programmer-auth-api.ts      — 実装コード
  ${sharedDir}/tester-test-plan.md         — テスト計画
  ${sharedDir}/ui_ux-wireframe.md          — ワイヤーフレーム`

  const teamProtocol = `

## チーム通信プロトコル
他のメンバーにメッセージを送る場合、以下のXMLタグを出力に含めてください:
<send to="ロール名">メッセージ内容</send>
送信先ロール: se, programmer, frontend, backend, tester, ui_ux, security_red, security_blue, pm
例: <send to="programmer">JWT認証を推奨します。理由は...</send>
複数のメンバーに送信可能です。通常の回答の中に含めてください。
${workdirSection}

成果物を保存したら、関連メンバーに <send> で通知してください。
例: <send to="programmer">設計書を ${sharedDir}/se-architecture.md に保存しました。参照してください。</send>`

  const rules = loadRules(process.cwd(), 'typescript')
  const learned = loadLearnedPatterns()
  const systemPrompt = roleInfo.systemPrompt + teamProtocol + rules + learned

  const modelMap = {
    opus: 'claude-opus-4-6',
    sonnet: 'claude-sonnet-4-6',
    haiku: 'claude-haiku-4-5-20251001',
  } as const

  // 共有ディレクトリのファイル一覧を取得
  let sharedDirListing = ''
  if (existsSync(sharedDir)) {
    try {
      const files = readdirSync(sharedDir).filter(f => !f.startsWith('.'))
      if (files.length > 0) {
        sharedDirListing = `\n\n以下のファイルが共有ディレクトリに存在します。作業開始前に関連するファイルを必ず読んでください:\n${files.map(f => `- ${sharedDir}/${f}`).join('\n')}`
      }
    } catch { /* ignore */ }
  }

  const workdirContext = workdir
    ? `\n\n## 作業ディレクトリ\n実装コードは ${workdir} 配下に配置してください。\n\n## 共有ディレクトリ\n${sharedDir}\n他メンバーのドキュメントがある場合は参照してから作業してください。${sharedDirListing}`
    : `\n\n## 共有ディレクトリ\n${sharedDir}\n他メンバーの成果物がある場合は参照してから作業してください。${sharedDirListing}`
  const userPrompt = `## 元のタスク\n${task.originalTask}\n${messageContext}\n## あなたの担当タスク\n**${task.title}**\n\n${task.instruction}${workdirContext}`

  // セッションID の読み込み（resume 用）
  const existingSessionId = loadSessionId(boardDir, role)

  let resultText = ''
  let newSessionId = existingSessionId ?? ''

  for await (const msg of query({
    prompt: userPrompt,
    options: {
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: systemPrompt,
      },
      model: modelMap[roleInfo.model],
      maxTurns: 35,
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      persistSession: true,
      ...(existingSessionId ? { resume: existingSessionId } : {}),
    },
  })) {
    if ('session_id' in msg && typeof msg.session_id === 'string') {
      newSessionId = msg.session_id
    }
    // コンテキスト表示（ツール呼び出し、テキスト出力など）
    logSDKMessage(msg, '    ')
    if (msg.type === 'result') {
      const result = msg as { result?: string }
      if (result.result) resultText = result.result
    }
  }

  // セッションID を保存
  if (newSessionId) {
    saveSessionId(boardDir, role, newSessionId)
  }

  return resultText.trim()
}

// ─── インスタンスID → ベースロール ───

/** "programmer-1" → "programmer", "se" → "se" */
function parseInstanceId(instanceId: string): { role: WorkerRole; label: string } {
  const match = instanceId.match(/^(.+)-(\d+)$/)
  const role = (match ? match[1] : instanceId) as WorkerRole
  const label = match ? `${instanceId}` : instanceId
  return { role, label }
}

// ─── フィードバック蓄積・書き出し ───

interface FeedbackEntry {
  taskId: number
  taskTitle: string
  content: string
}

function appendFeedbackToFile(feedbackDir: string, instanceId: string, roleName: string, entry: FeedbackEntry): void {
  mkdirSync(feedbackDir, { recursive: true })
  const filePath = join(feedbackDir, `${instanceId}.md`)
  const now = new Date().toISOString()

  // ファイルが存在しなければヘッダーを書く
  let content = ''
  try {
    content = require('node:fs').readFileSync(filePath, 'utf-8')
  } catch {
    // ファイルなし → ヘッダー付きで新規作成
    content = `# ${roleName} (${instanceId}) フィードバック\n\n`
  }

  content += `---\n\n### タスク #${entry.taskId}: ${entry.taskTitle}\n\n> ${now}\n\n${entry.content}\n\n`
  writeFileSync(filePath, content, 'utf-8')
  console.log(`  ${CYAN}📝 フィードバックを ${filePath} に保存${RESET}`)
}

// ─── メインループ ───

async function main(): Promise<void> {
  const [boardDir, instanceArg] = process.argv.slice(2)

  if (!boardDir || !instanceArg) {
    console.error('Usage: bun src/team-member.ts <boardDir> <instanceId>')
    console.error('  instanceId: role name (e.g. "programmer") or instance (e.g. "programmer-1")')
    process.exit(1)
  }

  const { role, label } = parseInstanceId(instanceArg)
  const roleInfo = ROLES[role]
  if (!roleInfo) {
    console.error(`Unknown role: ${role} (from instance "${instanceArg}")`)
    process.exit(1)
  }

  console.log(`\n${CYAN}━━━ ${roleInfo.emoji} ${roleInfo.name} (${label}) ━━━${RESET}`)
  console.log(`${DIM}永続ループ開始 — タスク待機中...${RESET}\n`)

  const feedbackDir = join(process.cwd(), 'feedback')

  // 永続ループ
  while (true) {
    // 1. phase チェック
    const phase = getPhase(boardDir)
    if (phase === 'shutdown') {
      console.log(`\n${DIM}🛑 shutdown シグナル受信 — 終了します${RESET}`)
      break
    }

    // 2. 未読メッセージ取得（インスタンスID宛 + ベースロール宛の両方）
    const messages: BoardMessage[] = []
    messages.push(...readNewMessages(boardDir, label))
    if (label !== role) {
      messages.push(...readNewMessages(boardDir, role))
    }
    if (messages.length > 0) {
      console.log(`\n  ${YELLOW}📨 ${messages.length}件の新着メッセージ${RESET}`)
      for (const m of messages) {
        const preview = m.content.length > 200 ? m.content.slice(0, 200) + '...' : m.content
        console.log(`  ${DIM}┌ from: ${m.from}${RESET}`)
        console.log(`  ${DIM}│${RESET} ${preview.replace(/\n/g, `\n  ${DIM}│${RESET} `)}`)
        console.log(`  ${DIM}└────${RESET}`)
      }
    }

    // 3. 次のタスクを探す（ベースロールで検索）
    const task = findNextTask(boardDir, role)

    if (!task) {
      // タスクなし → 待機
      await new Promise(resolve => setTimeout(resolve, 1000))
      continue
    }

    // 4. アトミックに claim（他インスタンスとの競合を防ぐ）
    if (!claimTask(boardDir, task.id)) {
      // 他のインスタンスが先に取った → 次のタスクを探す
      continue
    }

    console.log(`\n  ${GREEN}▶ タスク #${task.id}: ${task.title}${RESET}`)
    const start = performance.now()

    try {
      // 5. 実行
      const messageContext = buildMessageContext(messages)
      const output = await executeTask(boardDir, role, task, messageContext)
      const durationMs = performance.now() - start

      // 6. <send> タグをパース → 配信
      const directives = parseSendTags(output)
      for (const directive of directives) {
        sendMessage(boardDir, {
          from: label,
          to: directive.to,
          content: directive.content,
          timestamp: new Date().toISOString(),
        })
        const preview =
          directive.content.length > 200
            ? directive.content.slice(0, 200) + '...'
            : directive.content
        console.log(`  ${YELLOW}📤 → ${directive.to}${RESET}`)
        console.log(`  ${DIM}┌${RESET} ${preview.replace(/\n/g, `\n  ${DIM}│${RESET} `)}`)
        console.log(`  ${DIM}└────${RESET}`)
      }

      // 7. completed に更新
      updateTask(boardDir, task.id, {
        status: 'completed',
        result: output,
        completedAt: new Date().toISOString(),
      })

      console.log(
        `  ${GREEN}✅ タスク #${task.id} 完了${RESET} ${DIM}(${(durationMs / 1000).toFixed(1)}s)${RESET}`,
      )

      // 8. フィードバック即時保存
      const feedback = parseWorkerFeedback(output)
      if (feedback) {
        appendFeedbackToFile(feedbackDir, label, roleInfo.name, { taskId: task.id, taskTitle: task.title, content: feedback })
      }

      // 9. レビューサイクル自動生成
      handlePostCompletion(boardDir, task, output, label)
    } catch (error) {
      const durationMs = performance.now() - start
      const message = error instanceof Error ? error.message : String(error)

      savePattern({
        category: 'failure',
        pattern: `${role}タスク「${task.title}」エラー: ${message}`,
        context: task.instruction.slice(0, 200),
        source: `board:${boardDir} task:${task.id}`,
        timestamp: new Date().toISOString(),
      })

      updateTask(boardDir, task.id, {
        status: 'error',
        error: message,
        completedAt: new Date().toISOString(),
      })

      console.log(
        `  ${RED}❌ タスク #${task.id} エラー: ${message}${RESET} ${DIM}(${(durationMs / 1000).toFixed(1)}s)${RESET}`,
      )
    }
  }
}

main().catch(error => {
  console.error(`致命的エラー: ${error}`)
  process.exit(1)
})
