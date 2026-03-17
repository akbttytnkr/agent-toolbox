import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { callClaude } from './claude-cli.js'
import { ROLES } from './roles.js'
import type { QAAnswer, WorkerResult } from './types.js'

const FEEDBACK_PROMPT = `## フィードバック依頼

今回のタスクを振り返り、以下の観点で率直にフィードバックを書いてください。
あなた自身の専門家としての立場から、職場やプロセスに対する本音を述べてください。

### 書くべき内容
1. **不満・課題** — 今回の作業で感じた不満、非効率だった点、改善が必要な点
2. **改善提案** — 具体的にどうすれば良くなるか、プロセスやツールの改善案
3. **良かった点** — 今回うまくいったこと、今後も続けるべきこと
4. **他のワーカーへの意見** — 他の専門家の成果物に対するコメント（あれば）

### 出力形式
Markdown形式で、率直かつ具体的に記述してください。`

function getTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/:/g, '-')
    .replace(/\.\d+Z$/, '')
}

export async function generateFeedback(
  originalTask: string,
  workerResults: WorkerResult[],
  qaAnswers: QAAnswer[],
): Promise<string[]> {
  const feedbackDir = process.env.FEEDBACK_DIR ?? './feedback'

  const successfulResults = workerResults.filter(r => r.status === 'success')

  const qaSection =
    qaAnswers.length > 0
      ? `\n\n## Q&A交換\n${qaAnswers.map(qa => `- ${ROLES[qa.question.fromRole].name}: ${qa.question.text}\n  → ${ROLES[qa.answeredByRole].name}: ${qa.answer.slice(0, 200)}`).join('\n')}`
      : ''

  const timestamp = getTimestamp()
  const filePaths: string[] = []

  const promises = successfulResults.map(async result => {
    const role = ROLES[result.subtask.role]
    const roleDir = join(feedbackDir, result.subtask.role)
    mkdirSync(roleDir, { recursive: true })

    const userPrompt = `## 元のタスク\n${originalTask}\n\n## あなたの作業結果\n${result.output.slice(0, 2000)}${qaSection}\n\n${FEEDBACK_PROMPT}`

    const feedback = await callClaude(role.systemPrompt, userPrompt)

    const filePath = join(roleDir, `${timestamp}.md`)
    writeFileSync(filePath, feedback, 'utf-8')
    return filePath
  })

  const settled = await Promise.allSettled(promises)

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      filePaths.push(result.value)
    } else {
      console.error(`  フィードバック生成エラー: ${result.reason}`)
    }
  }

  return filePaths
}
