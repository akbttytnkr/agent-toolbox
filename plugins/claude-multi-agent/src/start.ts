/**
 * インタラクティブ・オーケストレーター（Phase 2）。
 *
 * 構成:
 *   メインペイン: PM オーケストレーター（query + resume でセッション継続）
 *   tmux ペイン:  各ワーカーが callClaude()（= SDK query()）で並列実行
 *
 * 使い方:
 *   tmux 内: bun src/start.ts    → tmux マルチペインモード
 *   tmux 外: bun src/start.ts    → インラインモード
 */

import * as readline from 'node:readline'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { routeQuestions } from './orchestrator.js'
import { ROLES, type WorkerRole } from './roles.js'
import type { QAAnswer, Question, Subtask, WorkerEvent, WorkerResult } from './types.js'
import {
  answerQuestions,
  executeAllWorkers,
  executeAllWorkersTmux,
  isTmux,
  parseQuestions,
} from './worker.js'

// ─── PM オーケストレーター プロンプト ───

const PM_ORCHESTRATOR_PROMPT = `あなたはPM（プロジェクトマネージャー）兼オーケストレーターです。

## ターン1: タスク分析・計画（新しいタスクを受け取った場合）
以下を行い、必ずXML形式で出力してください:

1. タスクの調査・分析（リサーチャーの視点で背景・要件・リスクを洗い出す）
2. 必要な専門ワーカーの選定（タスクに応じて必要なワーカーだけ選ぶ）
3. サブタスクの作成・割り当て（2〜5個、各ワーカーの専門性を活かした具体的な指示）

出力フォーマット:
<analysis>
調査結果と分析（背景、要件、リスク、推奨アプローチ）
</analysis>
<team>
  <member role="se">選定理由</member>
  <member role="programmer">選定理由</member>
</team>
<subtasks>
  <subtask id="1" role="se">
    <title>サブタスクのタイトル</title>
    <instruction>具体的な実行指示（調査結果を踏まえた詳細な指示）</instruction>
  </subtask>
</subtasks>

利用可能なワーカー:
- se: システムエンジニア（アーキテクチャ設計、技術選定、非機能要件）
- programmer: プログラマー（コード設計、実装、アルゴリズム）
- tester: テスター（テスト戦略、テストケース、品質保証）
- ui_ux: UI/UXデザイナー（画面設計、アクセシビリティ）
- security_committee: セキュリティ委員会（Red Team vs Blue Team討論によるセキュリティ評価）

## ターン2: 結果統合（ワーカー結果を受け取った場合）
各専門ワーカーの成果を統合し、以下の構成で最終レポートを作成:

## 総合評価
## 各専門領域の成果
## セキュリティ評価（該当時）
## 推奨アクション（優先度順）
## リスクと注意事項

## ターン3+: フォローアップ（追加の質問を受けた場合）
前回の分析・統合結果の文脈を活用して回答。
新たなワーカー実行が必要なら、再度XMLフォーマットで計画を出力。

## 重要ルール
- 新しいタスクには必ず <analysis>, <team>, <subtasks> のXMLを出力
- フォローアップで追加分析が不要なら、直接テキストで回答
- セキュリティ関連タスクでは security_committee を必ず含める
- 日本語で出力`

// ─── XML パーサー ───

function extractXml(text: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)
  const match = regex.exec(text)
  return match ? match[1].trim() : ''
}

const VALID_ROLES = new Set<string>(Object.keys(ROLES))

function parseSubtasksFromXml(text: string): Subtask[] {
  const subtasksXml = extractXml(text, 'subtasks')
  if (!subtasksXml) return []

  const subtasks: Subtask[] = []
  const regex = /<subtask\s+id="(\d+)"\s+role="([^"]+)">([\s\S]*?)<\/subtask>/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(subtasksXml)) !== null) {
    const role = match[2]
    if (!VALID_ROLES.has(role)) continue
    subtasks.push({
      id: parseInt(match[1], 10),
      role: role as WorkerRole,
      title: extractXml(match[3], 'title'),
      instruction: extractXml(match[3], 'instruction'),
    })
  }
  return subtasks
}

// ─── PM セッション（query + resume） ───

async function queryPM(
  prompt: string,
  sessionId?: string,
): Promise<{ text: string; sessionId: string }> {
  let resultText = ''
  let newSessionId = sessionId ?? ''

  for await (const msg of query({
    prompt,
    options: {
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: PM_ORCHESTRATOR_PROMPT,
      },
      model: 'claude-sonnet-4-6',
      tools: [],
      permissionMode: 'dontAsk',
      persistSession: true,
      ...(sessionId ? { resume: sessionId } : {}),
    },
  })) {
    if ('session_id' in msg && typeof msg.session_id === 'string') {
      newSessionId = msg.session_id
    }
    if (msg.type === 'result') {
      const result = msg as { result?: string }
      if (result.result) resultText = result.result
    }
  }

  return { text: resultText, sessionId: newSessionId }
}

// ─── ワーカー結果フォーマット ───

function formatWorkerResults(results: WorkerResult[]): string {
  return results
    .map(r => {
      const role = ROLES[r.subtask.role]
      const status = r.status === 'success' ? '成功' : 'エラー'
      return `### ${role.emoji} ${role.name} — ${r.subtask.title}\nステータス: ${status}\n実行時間: ${r.durationMs.toFixed(0)}ms\n\n${r.output}`
    })
    .join('\n\n---\n\n')
}

function formatQAExchanges(qaAnswers: QAAnswer[]): string {
  if (qaAnswers.length === 0) return ''
  const exchanges = qaAnswers
    .map(qa => {
      const from = ROLES[qa.question.fromRole]
      const answerer = ROLES[qa.answeredByRole]
      return `**Q** (${from.emoji} ${from.name}): ${qa.question.text}\n**A** (${answerer.emoji} ${answerer.name}): ${qa.answer}`
    })
    .join('\n\n')
  return `\n\n## ワーカー間Q&A\n${exchanges}`
}

// ─── 表示ヘルパー ───

const DIM = '\x1b[90m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

function handleWorkerEvent(event: WorkerEvent): void {
  const role = ROLES[event.subtask.role]
  if (event.type === 'start') {
    console.log(`  ⚡ ${role.emoji} ${role.name} — ${event.subtask.title}`)
  } else {
    const icon = event.status === 'success' ? `${GREEN}✅${RESET}` : `${RED}❌${RESET}`
    console.log(
      `  ${icon} ${role.emoji} ${role.name} — ${event.subtask.title} ${DIM}(${formatElapsed(event.durationMs)})${RESET}`,
    )
  }
}

function printTimeline(results: WorkerResult[], totalMs: number): void {
  const BAR_WIDTH = 40
  console.log(`\n  ${DIM}タイムライン:${RESET}`)

  for (const r of results) {
    const role = ROLES[r.subtask.role]
    const startRatio = r.startOffsetMs / totalMs
    const durRatio = r.durationMs / totalMs
    const pad = ' '.repeat(Math.round(startRatio * BAR_WIDTH))
    const bar = (r.status === 'success' ? '█' : '░').repeat(
      Math.max(1, Math.round(durRatio * BAR_WIDTH)),
    )
    const label = `${role.emoji}${r.subtask.id}`
    console.log(`  ${label.padEnd(5)} |${pad}${bar}| ${formatElapsed(r.durationMs)}`)
  }

  const seqTime = results.reduce((s, r) => s + r.durationMs, 0)
  if (totalMs > 0) {
    console.log(
      `\n  ${DIM}並列: ${formatElapsed(totalMs)} / 逐次: ${formatElapsed(seqTime)} → ${(seqTime / totalMs).toFixed(1)}x 高速化${RESET}`,
    )
  }
}

function printPhase(title: string): void {
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log('─'.repeat(60))
}

// ─── メインループ ───

async function main(): Promise<void> {
  const useTmux = isTmux()
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  let sessionId: string | undefined

  console.log('🎯 マルチエージェント・オーケストレーター')
  console.log(`   モード: ${useTmux ? `${CYAN}tmux マルチペイン${RESET}` : 'インライン'}`)
  console.log(`   PM セッション: query() + resume${DIM}（セッション継続）${RESET}`)
  console.log(
    `   ワーカー実行: ${useTmux ? 'tmux ペイン × ' : ''}callClaude()${DIM}（SDK query()）${RESET}`,
  )
  console.log('   タスクを入力してください（exit で終了）\n')

  const ask = (): Promise<string> => new Promise(resolve => rl.question('> ', resolve))

  while (true) {
    const input = await ask()
    const trimmed = input.trim()
    if (!trimmed || trimmed === 'exit') break

    rl.pause()
    const totalStart = performance.now()

    try {
      // ── Phase 1: PM が分析・チーム選定・計画（query） ──
      printPhase('📋 PM — タスク分析・チーム選定・計画')
      const pmStart = performance.now()
      const pmResult = await queryPM(trimmed, sessionId)
      sessionId = pmResult.sessionId
      const pmDuration = performance.now() - pmStart
      console.log(`  ${DIM}(${formatElapsed(pmDuration)})${RESET}`)

      // 分析結果の表示
      const analysis = extractXml(pmResult.text, 'analysis')
      if (analysis) {
        console.log(`\n  ${analysis.slice(0, 300)}${analysis.length > 300 ? '...' : ''}`)
      }

      // サブタスクのパース
      const subtasks = parseSubtasksFromXml(pmResult.text)

      if (subtasks.length > 0) {
        // チーム表示
        console.log(`\n  チーム → サブタスク (${subtasks.length}個):`)
        for (const st of subtasks) {
          const role = ROLES[st.role]
          console.log(`    ${st.id}. ${role.emoji} [${role.name}] ${st.title}`)
        }

        // ── Phase 2: ワーカー並列実行（tmux ペイン or インライン） ──
        printPhase(`⚡ ワーカー — ${useTmux ? 'tmux マルチペイン' : 'インライン'}並列実行`)
        const workerStart = performance.now()
        const results = useTmux
          ? await executeAllWorkersTmux(trimmed, subtasks, handleWorkerEvent)
          : await executeAllWorkers(trimmed, subtasks, handleWorkerEvent)
        const workerDuration = performance.now() - workerStart

        printTimeline(results, workerDuration)

        // ── Phase 2.5: Q&A（質問があれば） ──
        const allQuestions: Question[] = results.flatMap(r => parseQuestions(r.output, r.subtask))
        let qaAnswers: QAAnswer[] = []

        if (allQuestions.length > 0) {
          printPhase('💬 Q&A — 質問解決')
          console.log(`  質問数: ${allQuestions.length}件`)

          const routes = await routeQuestions(trimmed, allQuestions)
          qaAnswers = await answerQuestions(trimmed, routes)
          console.log(`  ${GREEN}✅${RESET} ${qaAnswers.length}件の回答完了`)
        }

        // ── Phase 3: PM が結果統合（resume で同一セッション継続） ──
        printPhase('📋 PM — 結果統合')
        const synthPrompt = `以下のワーカー実行結果を統合し、最終レポートを作成してください。\n\n${formatWorkerResults(results)}${formatQAExchanges(qaAnswers)}`
        const synthStart = performance.now()
        const synthesis = await queryPM(synthPrompt, sessionId)
        sessionId = synthesis.sessionId
        const synthDuration = performance.now() - synthStart
        console.log(`  ${DIM}(${formatElapsed(synthDuration)})${RESET}`)

        // 最終レポート
        const totalDuration = performance.now() - totalStart
        console.log(`\n${'═'.repeat(60)}`)
        console.log(synthesis.text)
        console.log('═'.repeat(60))
        console.log(
          `${DIM}  PM: ${formatElapsed(pmDuration)} / ワーカー: ${formatElapsed(workerDuration)} / 統合: ${formatElapsed(synthDuration)} / 合計: ${formatElapsed(totalDuration)}${RESET}\n`,
        )
      } else {
        // サブタスクなし → PM が直接回答（フォローアップ）
        console.log(`\n${pmResult.text}\n`)
      }
    } catch (error) {
      console.error(
        `\n${RED}❌ エラー: ${error instanceof Error ? error.message : String(error)}${RESET}`,
      )
    } finally {
      rl.resume()
    }
  }

  rl.close()
  console.log('👋 終了しました')
}

main().catch(error => {
  console.error('致命的エラー:', error)
  process.exit(1)
})
