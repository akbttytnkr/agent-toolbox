/**
 * tmux ペイン内で単一ワーカーを実行するスタンドアロンスクリプト。
 * 引数: <input.json> <output.json>
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { callClaude } from './claude-cli.js'

const inputPath = process.argv[2]
const outputPath = process.argv[3]

if (!inputPath || !outputPath) {
  console.error('Usage: tsx worker-pane.ts <input.json> <output.json>')
  process.exit(1)
}

const { originalTask, subtask, systemPrompt, roleName, roleEmoji } = JSON.parse(
  readFileSync(inputPath, 'utf-8'),
)

// ヘッダー表示（ロール名付き）
console.log(`\x1b[1;36m${'━'.repeat(50)}\x1b[0m`)
console.log(
  `\x1b[1;36m  ${roleEmoji} ${roleName} — ワーカー ${subtask.id}: ${subtask.title}\x1b[0m`,
)
console.log(`\x1b[1;36m${'━'.repeat(50)}\x1b[0m`)
console.log(`\n\x1b[33m指示:\x1b[0m ${subtask.instruction}\n`)
console.log('\x1b[90m実行中...\x1b[0m\n')

const startTimestamp = Date.now()
const start = performance.now()

const userPrompt = `## 元のタスク\n${originalTask}\n\n## あなたの担当サブタスク\n**${subtask.title}**\n\n${subtask.instruction}`

async function run(): Promise<void> {
  try {
    const output = await callClaude(systemPrompt, userPrompt)
    const durationMs = performance.now() - start

    console.log(output)
    console.log(`\n\n\x1b[1;32m${'━'.repeat(50)}\x1b[0m`)
    console.log(
      `\x1b[1;32m  ${roleEmoji} ${roleName} ✓ 完了 (${(durationMs / 1000).toFixed(1)}s)\x1b[0m`,
    )
    writeFileSync(
      outputPath,
      JSON.stringify({ subtask, status: 'success', output, startTimestamp, durationMs }),
    )
  } catch (error) {
    const durationMs = performance.now() - start
    const message = error instanceof Error ? error.message : String(error)

    console.log(`\n\n\x1b[1;31m${'━'.repeat(50)}\x1b[0m`)
    console.log(
      `\x1b[1;31m  ${roleEmoji} ${roleName} ✗ エラー (${(durationMs / 1000).toFixed(1)}s)\x1b[0m`,
    )
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

run()
