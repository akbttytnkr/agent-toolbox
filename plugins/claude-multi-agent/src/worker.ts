import { execSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { callClaude } from './claude-cli.js'
import { runDebate } from './debate.js'
import { ROLES } from './roles.js'
import type {
  QAAnswer,
  Question,
  QuestionRoute,
  Subtask,
  WorkerEvent,
  WorkerResult,
} from './types.js'

// --- 質問パース ---

export function parseQuestions(output: string, subtask: Subtask): Question[] {
  const questionsXml = output.match(/<questions>([\s\S]*?)<\/questions>/)
  if (!questionsXml) return []

  const questions: Question[] = []
  const questionRegex = /<question>([\s\S]*?)<\/question>/g
  let match: RegExpExecArray | null

  while ((match = questionRegex.exec(questionsXml[1])) !== null) {
    questions.push({
      fromWorkerId: subtask.id,
      fromRole: subtask.role,
      text: match[1].trim(),
    })
  }

  return questions
}

// --- Q&A 回答実行 ---

export async function answerQuestions(
  originalTask: string,
  routes: QuestionRoute[],
): Promise<QAAnswer[]> {
  const grouped = new Map<string, QuestionRoute[]>()

  for (const route of routes) {
    const key = route.targetRole
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(route)
  }

  const promises = Array.from(grouped.entries()).map(async ([targetRole, routeGroup]) => {
    const role = ROLES[targetRole as keyof typeof ROLES]
    const questionList = routeGroup
      .map((r, i) => `${i + 1}. [${ROLES[r.question.fromRole].name}からの質問] ${r.question.text}`)
      .join('\n')

    const userPrompt = `## 元のタスク\n${originalTask}\n\n## あなたへの質問\n以下の質問に回答してください。\n\n${questionList}`

    const answer = await callClaude(role.systemPrompt, userPrompt)

    return routeGroup.map(r => ({
      question: r.question,
      answeredByRole: targetRole as keyof typeof ROLES,
      answer,
    }))
  })

  const results = await Promise.allSettled(promises)
  return results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
}

// --- 通常モード ---

async function executeWorker(
  originalTask: string,
  subtask: Subtask,
  epochStart: number,
  onEvent: (event: WorkerEvent) => void,
): Promise<WorkerResult> {
  onEvent({ type: 'start', subtask })
  const startOffsetMs = performance.now() - epochStart
  const start = performance.now()

  const role = ROLES[subtask.role]
  try {
    let output: string

    if (role.isDebate) {
      // セキュリティ委員会: 討論モード
      output = await runDebate(originalTask, subtask.instruction)
    } else {
      const userPrompt = `## 元のタスク\n${originalTask}\n\n## あなたの担当サブタスク\n**${subtask.title}**\n\n${subtask.instruction}`
      output = await callClaude(role.systemPrompt, userPrompt)
    }

    const durationMs = performance.now() - start
    const questions = parseQuestions(output, subtask)

    onEvent({ type: 'done', subtask, status: 'success', durationMs })
    return { subtask, status: 'success', output, questions, startOffsetMs, durationMs }
  } catch (error) {
    const durationMs = performance.now() - start
    const message = error instanceof Error ? error.message : String(error)

    onEvent({ type: 'done', subtask, status: 'error', durationMs })
    return {
      subtask,
      status: 'error',
      output: `エラー: ${message}`,
      questions: [],
      startOffsetMs,
      durationMs,
    }
  }
}

export async function executeAllWorkers(
  originalTask: string,
  subtasks: Subtask[],
  onEvent: (event: WorkerEvent) => void,
): Promise<WorkerResult[]> {
  const epochStart = performance.now()

  const promises = subtasks.map(subtask =>
    executeWorker(originalTask, subtask, epochStart, onEvent),
  )

  const settled = await Promise.allSettled(promises)

  return settled.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value
    }
    return {
      subtask: subtasks[index],
      status: 'error' as const,
      output: `予期しないエラー: ${result.reason}`,
      questions: [],
      startOffsetMs: 0,
      durationMs: 0,
    }
  })
}

// --- tmux ペインモード ---

interface PaneRawResult {
  subtask: Subtask
  status: 'success' | 'error'
  output: string
  startTimestamp: number
  durationMs: number
}

export function isTmux(): boolean {
  return !!process.env.TMUX
}

export async function executeAllWorkersTmux(
  originalTask: string,
  subtasks: Subtask[],
  onEvent: (event: WorkerEvent) => void,
): Promise<WorkerResult[]> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'orchestration-'))
  const paneIds: string[] = []
  const projectDir = resolve(process.cwd())

  try {
    for (const subtask of subtasks) {
      const inputPath = join(tmpDir, `input-${subtask.id}.json`)
      const outputPath = join(tmpDir, `output-${subtask.id}.json`)

      const role = ROLES[subtask.role]
      writeFileSync(
        inputPath,
        JSON.stringify({
          originalTask,
          subtask,
          systemPrompt: role.systemPrompt,
          roleName: role.name,
          roleEmoji: role.emoji,
          isDebate: role.isDebate ?? false,
        }),
      )

      onEvent({ type: 'start', subtask })

      // 討論モードは debate-pane.ts、通常は worker-pane.ts
      const script = role.isDebate ? 'src/debate-pane.ts' : 'src/worker-pane.ts'
      const scriptPath = join(projectDir, script)
      const bunPath = process.env.BUN_PATH || 'bun'
      const cmd = `cd ${projectDir} && ${bunPath} ${scriptPath} ${inputPath} ${outputPath}`
      const paneId = execSync(
        `tmux split-window -d -P -F "#{pane_id}" '${cmd.replace(/'/g, "'\\''")}'`,
        { encoding: 'utf-8' },
      ).trim()

      paneIds.push(paneId)
    }

    execSync('tmux select-layout tiled')

    const completed = new Map<number, PaneRawResult>()

    while (completed.size < subtasks.length) {
      await new Promise(resolve => setTimeout(resolve, 500))

      for (const subtask of subtasks) {
        if (completed.has(subtask.id)) continue

        const outputPath = join(tmpDir, `output-${subtask.id}.json`)
        if (existsSync(outputPath)) {
          try {
            const raw = JSON.parse(readFileSync(outputPath, 'utf-8')) as PaneRawResult
            completed.set(subtask.id, raw)
            onEvent({ type: 'done', subtask, status: raw.status, durationMs: raw.durationMs })
          } catch {
            // JSON 書き込み途中
          }
        }
      }
    }

    const allResults = Array.from(completed.values())
    const minStart = Math.min(...allResults.map(r => r.startTimestamp))

    const results: WorkerResult[] = subtasks.map(subtask => {
      const raw = completed.get(subtask.id)!
      return {
        subtask: raw.subtask,
        status: raw.status,
        output: raw.output,
        questions: parseQuestions(raw.output, subtask),
        startOffsetMs: raw.startTimestamp - minStart,
        durationMs: raw.durationMs,
      }
    })

    console.log('\n  \x1b[90m3秒後にワーカーペインを閉じます...\x1b[0m')
    await new Promise(resolve => setTimeout(resolve, 3000))

    return results
  } finally {
    for (const paneId of paneIds) {
      try {
        execSync(`tmux kill-pane -t ${paneId}`, { stdio: 'ignore' })
      } catch {
        // already closed
      }
    }
    rmSync(tmpDir, { recursive: true, force: true })
  }
}
