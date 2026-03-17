import { callClaude } from './claude-cli.js'
import {
  SECURITY_BLUE_TEAM_PROMPT,
  SECURITY_CONSENSUS_PROMPT,
  SECURITY_RED_TEAM_PROMPT,
} from './roles.js'

export interface DebateRound {
  speaker: 'red' | 'blue' | 'consensus'
  label: string
  content: string
}

/**
 * セキュリティ委員会の討論を実行する。
 * Red Team → Blue Team → Red Team（反論） → 議長（合意形成）の4ラウンド。
 *
 * @param onRound 各ラウンド完了時のコールバック（tmuxペインでの表示用）
 */
export async function runDebate(
  originalTask: string,
  instruction: string,
  onRound?: (round: DebateRound) => void,
): Promise<string> {
  const taskContext = `## 対象タスク\n${originalTask}\n\n## セキュリティ評価の指示\n${instruction}`
  const rounds: DebateRound[] = []
  const debateTimeout = { timeoutMs: 300_000 } // 討論は1ラウンド最大5分

  // Round 1: Red Team — 脆弱性の指摘
  const red1 = await callClaude(SECURITY_RED_TEAM_PROMPT, taskContext, debateTimeout)
  const round1: DebateRound = { speaker: 'red', label: '🔴 Red Team — 脆弱性分析', content: red1 }
  rounds.push(round1)
  onRound?.(round1)

  // Round 2: Blue Team — 防御策の提案
  const blue1 = await callClaude(
    SECURITY_BLUE_TEAM_PROMPT,
    `${taskContext}\n\n## 🔴 Red Team の指摘:\n${red1}\n\n上記の指摘に対して、防御策を提案してください。`,
    debateTimeout,
  )
  const round2: DebateRound = {
    speaker: 'blue',
    label: '🔵 Blue Team — 防御策提案',
    content: blue1,
  }
  rounds.push(round2)
  onRound?.(round2)

  // Round 3: Red Team — 反論・追加指摘
  const red2 = await callClaude(
    SECURITY_RED_TEAM_PROMPT,
    `${taskContext}\n\n## これまでの討論:\n### 🔴 Red Team（1回目）:\n${red1}\n\n### 🔵 Blue Team:\n${blue1}\n\nBlue Teamの防御策に対して、まだ不十分な点や追加の懸念を指摘してください。`,
    debateTimeout,
  )
  const round3: DebateRound = {
    speaker: 'red',
    label: '🔴 Red Team — 反論・追加指摘',
    content: red2,
  }
  rounds.push(round3)
  onRound?.(round3)

  // Round 4: Consensus — 議長による合意形成
  const consensus = await callClaude(
    SECURITY_CONSENSUS_PROMPT,
    `${taskContext}\n\n## 討論の全記録:\n### 🔴 Round 1 — Red Team（脆弱性分析）:\n${red1}\n\n### 🔵 Round 2 — Blue Team（防御策）:\n${blue1}\n\n### 🔴 Round 3 — Red Team（反論）:\n${red2}\n\n上記の討論を踏まえ、合意事項をまとめてください。`,
    debateTimeout,
  )
  const round4: DebateRound = {
    speaker: 'consensus',
    label: '⚖️ 議長 — 合意形成',
    content: consensus,
  }
  rounds.push(round4)
  onRound?.(round4)

  // 全ラウンドをフォーマット
  return rounds.map(r => `### ${r.label}\n${r.content}`).join('\n\n---\n\n')
}
