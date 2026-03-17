import { callClaude } from './claude-cli.js'
import { PM_SYNTHESIZER_PROMPT, ROLES } from './roles.js'
import type { QAAnswer, SynthesisResult, WorkerResult } from './types.js'

function formatWorkerResults(results: WorkerResult[]): string {
  return results
    .map(r => {
      const role = ROLES[r.subtask.role]
      const statusLabel = r.status === 'success' ? '成功' : 'エラー'
      return `### ${role.emoji} ${role.name} — ワーカー ${r.subtask.id}: ${r.subtask.title}\n- ロール: ${role.name}\n- ステータス: ${statusLabel}\n- 実行時間: ${r.durationMs.toFixed(0)}ms\n\n${r.output}`
    })
    .join('\n\n---\n\n')
}

function formatQAExchanges(qaAnswers: QAAnswer[]): string {
  if (qaAnswers.length === 0) return ''

  const exchanges = qaAnswers
    .map(qa => {
      const fromRole = ROLES[qa.question.fromRole]
      const answerRole = ROLES[qa.answeredByRole]
      return `**Q** (${fromRole.emoji} ${fromRole.name}): ${qa.question.text}\n**A** (${answerRole.emoji} ${answerRole.name}): ${qa.answer}`
    })
    .join('\n\n')

  return `\n\n## ワーカー間Q&A\n${exchanges}`
}

function extractXml(text: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)
  const match = regex.exec(text)
  return match ? match[1].trim() : ''
}

export async function synthesize(
  originalTask: string,
  results: WorkerResult[],
  qaAnswers: QAAnswer[] = [],
): Promise<SynthesisResult> {
  const formattedResults = formatWorkerResults(results)
  const qaSection = formatQAExchanges(qaAnswers)
  const userPrompt = `## 元のタスク\n${originalTask}\n\n## 各専門ワーカーの実行結果\n${formattedResults}${qaSection}`

  const text = await callClaude(PM_SYNTHESIZER_PROMPT, userPrompt)

  const summary = extractXml(text, 'summary')
  const fullReport = extractXml(text, 'report')

  return {
    summary: summary || '要約を生成できませんでした。',
    fullReport: fullReport || text,
  }
}
