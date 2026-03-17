import { callClaude } from './claude-cli.js'
import type { WorkerRole } from './roles.js'
import { PM_PLANNING_PROMPT, PM_ROUTING_PROMPT, PM_SELECTION_PROMPT, ROLES } from './roles.js'
import type {
  OrchestratorOutput,
  Question,
  QuestionRoute,
  Subtask,
  TeamSelection,
} from './types.js'

function extractXml(text: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g')
  const match = regex.exec(text)
  return match ? match[1].trim() : ''
}

function extractText(text: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)
  const match = regex.exec(text)
  return match ? match[1].trim() : ''
}

const VALID_ROLES = new Set<string>(Object.keys(ROLES))

function parseSubtasks(xml: string): Subtask[] {
  const subtasks: Subtask[] = []
  const subtaskRegex = /<subtask\s+id="(\d+)"\s+role="([^"]+)">([\s\S]*?)<\/subtask>/g
  let match: RegExpExecArray | null

  while ((match = subtaskRegex.exec(xml)) !== null) {
    const id = parseInt(match[1], 10)
    const role = match[2] as WorkerRole
    const content = match[3]

    if (!VALID_ROLES.has(role)) continue

    subtasks.push({
      id,
      role,
      title: extractText(content, 'title'),
      instruction: extractText(content, 'instruction'),
    })
  }

  return subtasks
}

function parseTeamMembers(xml: string): { role: WorkerRole; reason: string }[] {
  const members: { role: WorkerRole; reason: string }[] = []
  const memberRegex = /<member\s+role="([^"]+)">([\s\S]*?)<\/member>/g
  let match: RegExpExecArray | null

  while ((match = memberRegex.exec(xml)) !== null) {
    const role = match[1] as WorkerRole
    if (!VALID_ROLES.has(role)) continue
    members.push({ role, reason: match[2].trim() })
  }

  return members
}

function parseRoutes(xml: string, questions: Question[]): QuestionRoute[] {
  const routes: QuestionRoute[] = []
  const routeRegex = /<route\s+target="([^"]+)">([\s\S]*?)<\/route>/g
  let match: RegExpExecArray | null

  while ((match = routeRegex.exec(xml)) !== null) {
    const targetRole = match[1] as WorkerRole
    const content = match[2]
    const questionText = extractText(content, 'question')
    const reason = extractText(content, 'reason')

    // 対応する質問を見つける
    const question = questions.find(q => questionText.includes(q.text.slice(0, 30)))

    if (question) {
      routes.push({ question, targetRole, reason })
    }
  }

  return routes
}

/** Phase 1: Researcher — 依頼内容を調査・展開 */
export async function research(task: string): Promise<string> {
  return callClaude(ROLES.researcher.systemPrompt, task)
}

/** Phase 2: PM — ワーカー選定 */
export async function selectWorkers(task: string, researchResult: string): Promise<TeamSelection> {
  const userPrompt = `## 元の依頼\n${task}\n\n## リサーチャーの調査結果\n${researchResult}`
  const text = await callClaude(PM_SELECTION_PROMPT, userPrompt)

  const reasoning = extractXml(text, 'reasoning')
  const teamXml = extractXml(text, 'team')
  const members = parseTeamMembers(teamXml)

  if (members.length === 0) {
    throw new Error('PM がワーカーを選定できませんでした。LLMの出力を確認してください。')
  }

  return { reasoning, members }
}

/** Phase 3: PM — 選定済みワーカーにサブタスク割り当て */
export async function plan(
  task: string,
  researchResult: string,
  team: TeamSelection,
): Promise<OrchestratorOutput> {
  const teamSummary = team.members
    .map(m => {
      const role = ROLES[m.role]
      return `- ${role.emoji} ${role.name} (${m.role}): ${m.reason}`
    })
    .join('\n')

  const userPrompt = `## 元の依頼\n${task}\n\n## リサーチャーの調査結果\n${researchResult}\n\n## 選定済みチーム\n${teamSummary}`
  const text = await callClaude(PM_PLANNING_PROMPT, userPrompt)

  const planText = extractXml(text, 'plan')
  const subtasksXml = extractXml(text, 'subtasks')
  const subtasks = parseSubtasks(subtasksXml)

  if (subtasks.length === 0) {
    throw new Error('PM がサブタスクを生成できませんでした。LLMの出力を確認してください。')
  }

  return { plan: planText, subtasks }
}

/** Phase 5: PM — 質問をルーティング */
export async function routeQuestions(
  task: string,
  questions: Question[],
): Promise<QuestionRoute[]> {
  if (questions.length === 0) return []

  const questionList = questions
    .map(
      (q, i) =>
        `${i + 1}. [${ROLES[q.fromRole].emoji} ${ROLES[q.fromRole].name} ワーカー${q.fromWorkerId}]\n   質問: ${q.text}`,
    )
    .join('\n\n')

  const userPrompt = `## 元のタスク\n${task}\n\n## ワーカーからの質問一覧\n${questionList}`
  const text = await callClaude(PM_ROUTING_PROMPT, userPrompt)

  const routesXml = extractXml(text, 'routes')
  const routes = parseRoutes(routesXml, questions)

  // パースに失敗した質問にはフォールバック
  for (const q of questions) {
    if (!routes.find(r => r.question === q)) {
      // PMが直接対応
      routes.push({ question: q, targetRole: q.fromRole, reason: 'PMによるフォールバック' })
    }
  }

  return routes
}
