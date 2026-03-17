/**
 * tmux ペイン内でセキュリティ委員会の討論を実行するスタンドアロンスクリプト。
 * Red Team vs Blue Team の4ラウンド討論をリアルタイム表示する。
 * 引数: <input.json> <output.json>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { callClaude } from './claude-cli.js'
import {
  SECURITY_BLUE_TEAM_PROMPT,
  SECURITY_CONSENSUS_PROMPT,
  SECURITY_RED_TEAM_PROMPT,
} from './roles.js'

const inputPath = process.argv[2]
const outputPath = process.argv[3]

if (!inputPath || !outputPath) {
  console.error('Usage: tsx debate-pane.ts <input.json> <output.json>')
  process.exit(1)
}

const { originalTask, subtask } = JSON.parse(readFileSync(inputPath, 'utf-8'))

// ヘッダー
console.log(`\x1b[1;33m${'━'.repeat(50)}\x1b[0m`)
console.log(`\x1b[1;33m  🛡️ セキュリティ委員会 — ${subtask.title}\x1b[0m`)
console.log(`\x1b[1;33m${'━'.repeat(50)}\x1b[0m`)
console.log(`\n\x1b[33m指示:\x1b[0m ${subtask.instruction}\n`)

const startTimestamp = Date.now()
const start = performance.now()

const taskContext = `## 対象タスク\n${originalTask}\n\n## セキュリティ評価の指示\n${subtask.instruction}`

async function runDebateInPane(): Promise<void> {
  try {
    // Round 1: Red Team
    console.log(`\n\x1b[1;31m${'─'.repeat(50)}\x1b[0m`)
    console.log(`\x1b[1;31m  🔴 Round 1: Red Team — 脆弱性分析\x1b[0m`)
    console.log(`\x1b[1;31m${'─'.repeat(50)}\x1b[0m\n`)

    const red1 = await callClaude(SECURITY_RED_TEAM_PROMPT, taskContext)
    console.log(red1)

    // Round 2: Blue Team
    console.log(`\n\x1b[1;34m${'─'.repeat(50)}\x1b[0m`)
    console.log(`\x1b[1;34m  🔵 Round 2: Blue Team — 防御策提案\x1b[0m`)
    console.log(`\x1b[1;34m${'─'.repeat(50)}\x1b[0m\n`)

    const blue1 = await callClaude(
      SECURITY_BLUE_TEAM_PROMPT,
      `${taskContext}\n\n## 🔴 Red Team の指摘:\n${red1}\n\n上記の指摘に対して、防御策を提案してください。`,
    )
    console.log(blue1)

    // Round 3: Red Team 反論
    console.log(`\n\x1b[1;31m${'─'.repeat(50)}\x1b[0m`)
    console.log(`\x1b[1;31m  🔴 Round 3: Red Team — 反論・追加指摘\x1b[0m`)
    console.log(`\x1b[1;31m${'─'.repeat(50)}\x1b[0m\n`)

    const red2 = await callClaude(
      SECURITY_RED_TEAM_PROMPT,
      `${taskContext}\n\n## これまでの討論:\n### 🔴 Red Team（1回目）:\n${red1}\n\n### 🔵 Blue Team:\n${blue1}\n\nBlue Teamの防御策に対して、まだ不十分な点や追加の懸念を指摘してください。`,
    )
    console.log(red2)

    // Round 4: 合意形成
    console.log(`\n\x1b[1;35m${'─'.repeat(50)}\x1b[0m`)
    console.log(`\x1b[1;35m  ⚖️ Round 4: 議長 — 合意形成\x1b[0m`)
    console.log(`\x1b[1;35m${'─'.repeat(50)}\x1b[0m\n`)

    const consensus = await callClaude(
      SECURITY_CONSENSUS_PROMPT,
      `${taskContext}\n\n## 討論の全記録:\n### 🔴 Round 1 — Red Team:\n${red1}\n\n### 🔵 Round 2 — Blue Team:\n${blue1}\n\n### 🔴 Round 3 — Red Team（反論）:\n${red2}\n\n上記の討論を踏まえ、合意事項をまとめてください。`,
    )
    console.log(consensus)

    // 完了
    const durationMs = performance.now() - start
    const output = [
      `### 🔴 Red Team — 脆弱性分析\n${red1}`,
      `### 🔵 Blue Team — 防御策提案\n${blue1}`,
      `### 🔴 Red Team — 反論・追加指摘\n${red2}`,
      `### ⚖️ 議長 — 合意形成\n${consensus}`,
    ].join('\n\n---\n\n')

    console.log(`\n\x1b[1;32m${'━'.repeat(50)}\x1b[0m`)
    console.log(
      `\x1b[1;32m  🛡️ セキュリティ委員会 ✓ 討論完了 (${(durationMs / 1000).toFixed(1)}s / 4ラウンド)\x1b[0m`,
    )

    writeFileSync(
      outputPath,
      JSON.stringify({ subtask, status: 'success', output, startTimestamp, durationMs }),
    )
  } catch (error) {
    const durationMs = performance.now() - start
    const message = error instanceof Error ? error.message : String(error)

    console.log(`\n\x1b[1;31m${'━'.repeat(50)}\x1b[0m`)
    console.log(`\x1b[1;31m  🛡️ セキュリティ委員会 ✗ エラー\x1b[0m`)

    writeFileSync(
      outputPath,
      JSON.stringify({
        subtask,
        status: 'error',
        output: `エラー: ${message}`,
        startTimestamp,
        durationMs,
      }),
    )
  }

  // ペインを維持
  setInterval(() => {}, 60_000)
}

runDebateInPane()
