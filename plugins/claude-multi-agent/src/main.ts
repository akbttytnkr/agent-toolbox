import { generateFeedback } from './feedback.js'
import { plan, research, routeQuestions, selectWorkers } from './orchestrator.js'
import { ROLES } from './roles.js'
import { synthesize } from './synthesizer.js'
import type { QAAnswer, Question, WorkerEvent, WorkerResult } from './types.js'
import { answerQuestions, executeAllWorkers, executeAllWorkersTmux, isTmux } from './worker.js'

function printHeader(title: string): void {
  const line = '='.repeat(60)
  console.log(`\n${line}`)
  console.log(`  ${title}`)
  console.log(line)
}

function printPhaseTime(phase: string, ms: number): void {
  console.log(`  [${phase}] ${ms.toFixed(0)}ms`)
}

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

function handleWorkerEvent(event: WorkerEvent): void {
  const role = ROLES[event.subtask.role]
  if (event.type === 'start') {
    console.log(`  [....] ${role.emoji} ${role.name} — ${event.subtask.title} 開始`)
  } else {
    const icon = event.status === 'success' ? ' OK ' : ' NG '
    console.log(
      `  [${icon}] ${role.emoji} ${role.name} — ${event.subtask.title} 完了 (${formatElapsed(event.durationMs)})`,
    )
  }
}

function printTimeline(results: WorkerResult[], totalDurationMs: number): void {
  const BAR_WIDTH = 40

  console.log('\n  タイムライン:')
  console.log(`  ${'─'.repeat(BAR_WIDTH + 30)}`)

  for (const r of results) {
    const role = ROLES[r.subtask.role]
    const startRatio = r.startOffsetMs / totalDurationMs
    const durationRatio = r.durationMs / totalDurationMs

    const padLen = Math.round(startRatio * BAR_WIDTH)
    const barLen = Math.max(1, Math.round(durationRatio * BAR_WIDTH))

    const pad = ' '.repeat(padLen)
    const bar = (r.status === 'success' ? '█' : '░').repeat(barLen)
    const label = `${role.emoji}${r.subtask.id}`
    const time = formatElapsed(r.durationMs)

    console.log(`  ${label.padEnd(5)} |${pad}${bar}| ${time}`)
  }

  console.log(`  ${'─'.repeat(BAR_WIDTH + 30)}`)
  console.log(`  ${'     '}  0s${' '.repeat(BAR_WIDTH - 6)}${formatElapsed(totalDurationMs)}`)
  console.log(`  █ = 成功  ░ = エラー`)
}

async function main(): Promise<void> {
  const task = process.argv.slice(2).join(' ')

  if (!task) {
    console.error(
      '使い方: bun src/main.ts <タスク>\n例: bun src/main.ts "ユーザー認証機能を設計して"',
    )
    process.exit(1)
  }

  const useTmux = isTmux()
  const totalStart = performance.now()

  console.log(`\nタスク: "${task}"`)
  if (useTmux) {
    console.log('  \x1b[36m[tmux モード] ワーカーを別ペインで表示\x1b[0m')
  }

  // Phase 1: Researcher
  printHeader('Phase 1: 🔍 リサーチャー — 調査・分析')
  const researchStart = performance.now()

  const researchResult = await research(task)

  const researchDuration = performance.now() - researchStart

  console.log(`\n${researchResult.slice(0, 300)}...`)

  // Phase 2: PM — ワーカー選定
  printHeader('Phase 2: 📋 PM — ワーカー選定')
  const selectionStart = performance.now()

  const team = await selectWorkers(task, researchResult)

  const selectionDuration = performance.now() - selectionStart

  console.log(`\n方針: ${team.reasoning}`)
  console.log(`\n選定チーム (${team.members.length}名):`)
  for (const member of team.members) {
    const role = ROLES[member.role]
    console.log(`  ${role.emoji} ${role.name} — ${member.reason}`)
  }

  // Phase 3: PM — タスク分解・割り当て
  printHeader('Phase 3: 📋 PM — タスク分解・ワーカー割り当て')
  const planStart = performance.now()

  const planOutput = await plan(task, researchResult, team)

  const planDuration = performance.now() - planStart

  console.log(`\n方針: ${planOutput.plan}`)
  console.log(`\nサブタスク (${planOutput.subtasks.length}個):`)
  for (const st of planOutput.subtasks) {
    const role = ROLES[st.role]
    console.log(`  ${st.id}. ${role.emoji} [${role.name}] ${st.title}`)
    console.log(`     → ${st.instruction.slice(0, 80)}...`)
  }

  // Phase 4: Workers (並列実行)
  printHeader('Phase 4: ⚡ 専門ワーカー — 並列実行')
  const workerStart = performance.now()

  const workerResults = useTmux
    ? await executeAllWorkersTmux(task, planOutput.subtasks, handleWorkerEvent)
    : await executeAllWorkers(task, planOutput.subtasks, handleWorkerEvent)

  const workerDuration = performance.now() - workerStart

  printTimeline(workerResults, workerDuration)

  const sequentialTime = workerResults.reduce((sum, r) => sum + r.durationMs, 0)
  console.log(`\n  並列実行時間: ${formatElapsed(workerDuration)}`)
  console.log(`  逐次実行した場合: ${formatElapsed(sequentialTime)}`)
  console.log(`  速度向上: ${(sequentialTime / workerDuration).toFixed(1)}x`)

  // Phase 5: Q&A — 質問解決ループ
  const allQuestions: Question[] = workerResults.flatMap(r => r.questions)
  let qaAnswers: QAAnswer[] = []
  let qaDuration = 0

  if (allQuestions.length > 0) {
    printHeader('Phase 5: 💬 Q&A — 質問解決')
    const qaStart = performance.now()

    console.log(`\n  質問数: ${allQuestions.length}件`)
    for (const q of allQuestions) {
      const role = ROLES[q.fromRole]
      console.log(`  ${role.emoji} ワーカー${q.fromWorkerId}: ${q.text.slice(0, 80)}...`)
    }

    // PM に質問をルーティングさせる
    console.log('\n  📋 PM がルーティング中...')
    const routes = await routeQuestions(task, allQuestions)

    for (const route of routes) {
      const from = ROLES[route.question.fromRole]
      const to = ROLES[route.targetRole]
      console.log(
        `  ${from.emoji} → ${to.emoji} ${to.name}: ${route.question.text.slice(0, 50)}...`,
      )
    }

    // 回答者ワーカーに質問を転送
    console.log('\n  回答中...')
    qaAnswers = await answerQuestions(task, routes)

    for (const qa of qaAnswers) {
      const from = ROLES[qa.question.fromRole]
      const answerer = ROLES[qa.answeredByRole]
      console.log(
        `  [回答] ${answerer.emoji} ${answerer.name} → ${from.emoji}: ${qa.answer.slice(0, 80)}...`,
      )
    }

    qaDuration = performance.now() - qaStart
    console.log(`\n  Q&A 完了 (${formatElapsed(qaDuration)})`)
  } else {
    console.log('\n  (ワーカーからの質問なし — Phase 5 スキップ)')
  }

  // Phase 6: PM (Integration)
  printHeader('Phase 6: 📋 PM — 結果統合')
  const synthStart = performance.now()

  const synthesis = await synthesize(task, workerResults, qaAnswers)

  const synthDuration = performance.now() - synthStart

  console.log(`\n要約:\n${synthesis.summary}`)
  console.log(`\n--- 統合レポート ---\n${synthesis.fullReport}`)

  // Phase 7: フィードバック
  printHeader('Phase 7: 📝 フィードバック')
  const feedbackStart = performance.now()

  const feedbackPaths = await generateFeedback(task, workerResults, qaAnswers)

  const feedbackDuration = performance.now() - feedbackStart

  console.log(`\n  生成ファイル (${feedbackPaths.length}件):`)
  for (const path of feedbackPaths) {
    console.log(`  📄 ${path}`)
  }

  // 統計
  const totalDuration = performance.now() - totalStart
  printHeader('実行統計')
  printPhaseTime('🔍 リサーチャー', researchDuration)
  printPhaseTime('📋 PM (選定)', selectionDuration)
  printPhaseTime('📋 PM (計画)', planDuration)
  printPhaseTime('⚡ 専門ワーカー (並列)', workerDuration)
  if (qaDuration > 0) {
    printPhaseTime('💬 Q&A', qaDuration)
  }
  printPhaseTime('📋 PM (統合)', synthDuration)
  printPhaseTime('📝 フィードバック', feedbackDuration)
  console.log(`  ${'─'.repeat(30)}`)
  printPhaseTime('合計', totalDuration)
}

main().catch(error => {
  console.error('予期しないエラー:', error)
  process.exit(1)
})
