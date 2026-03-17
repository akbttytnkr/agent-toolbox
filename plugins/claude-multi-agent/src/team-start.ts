/**
 * team-start.ts — CLI サブコマンドツール。
 *
 * Claude Code 自体が PM として動作し、Bash コマンドでボードを操作する。
 *
 * Usage: bun src/team-start.ts <command> [options]
 *
 * Commands:
 *   init          ボード初期化。boardDir パスを stdout に出力。
 *   add-task      タスクをボードに追加。
 *   ensure-panes  指定ロールの tmux ペインを起動（既存なら再利用）。
 *   status        ボードの現在状態を JSON で出力。
 *   results       完了タスクの結果を出力。
 *   send          メンバーのインボックスにメッセージ送信。
 *   shutdown      メンバー停止 → ペイン kill → ボード削除。
 */

import { execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  advancePhase,
  getPhaseInputContext,
  initProject,
  loadProject,
  loadTaskDefinitions,
  saveMasterPlan,
  savePhaseBrief,
  savePhaseResult,
  saveProject,
  saveTaskDefinitions,
} from './project-board.js'
import type { PhaseBrief, PhaseResult, TaskDefinition } from './project-types.js'
import { ROLES, type WorkerRole } from './roles.js'
import {
  createTask,
  getAllTasks,
  getPhase,
  getSharedDir,
  getWorkdir,
  initBoard,
  listActiveBoards,
  loadPanes,
  readAllMessages,
  recoverStaleTasks,
  savePanes,
  sendMessage,
  setPhase,
  unregisterBoard,
} from './team-board.js'

// ─── 引数パーサー ───

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next
        i++
      } else {
        args[key] = 'true'
      }
    }
  }
  return args
}

function requireArg(args: Record<string, string>, key: string): string {
  const value = args[key]
  if (!value) {
    console.error(`Error: --${key} is required`)
    process.exit(1)
  }
  return value
}

// ─── パスヘルパー ───

/** 2つの絶対パスの共通親ディレクトリを返す */
function findCommonParent(dir1: string, dir2: string): string {
  const parts1 = dir1.split('/')
  const parts2 = dir2.split('/')
  const common: string[] = []
  for (let i = 0; i < Math.min(parts1.length, parts2.length); i++) {
    if (parts1[i] === parts2[i]) common.push(parts1[i])
    else break
  }
  return common.join('/') || '/'
}

// ─── tmux ヘルパー ───

function isPaneAlive(paneId: string): boolean {
  try {
    // has-session はセッション単位のチェックなのでペインIDには不正確。
    // display-message でペインIDを直接問い合わせることで正確に判定する。
    const result = execSync(
      `tmux display-message -p -t ${paneId} '#{pane_id}' 2>/dev/null`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] },
    ).trim()
    return result === paneId
  } catch {
    return false
  }
}

// ─── サブコマンド ───

function cmdInit(args: Record<string, string>): void {
  const sessionId = randomUUID().slice(0, 8)
  const workdir = args['workdir']
  const boardDir = initBoard(sessionId, workdir)
  // stdout にパスのみ出力（スクリプトで BOARD=$(... init) できるように）
  process.stdout.write(boardDir)
}

function cmdAddTask(args: Record<string, string>): void {
  const board = requireArg(args, 'board')
  const role = requireArg(args, 'role') as WorkerRole
  const title = requireArg(args, 'title')
  const instruction = requireArg(args, 'instruction')
  const originalTask = requireArg(args, 'original-task')
  const blockedByStr = args['blocked-by'] ?? ''
  const reviewBy = args['review-by'] as WorkerRole | undefined

  if (!ROLES[role]) {
    console.error(`Error: unknown role "${role}"`)
    process.exit(1)
  }

  if (reviewBy && !ROLES[reviewBy]) {
    console.error(`Error: unknown review-by role "${reviewBy}"`)
    process.exit(1)
  }

  const blockedBy = blockedByStr
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter(n => !isNaN(n))

  const task = createTask(board, {
    title,
    instruction,
    owner: role,
    blockedBy,
    originalTask,
    reviewBy,
  })

  console.log(
    JSON.stringify({
      id: task.id,
      status: task.status,
      owner: task.owner,
      title: task.title,
      reviewBy: task.reviewBy ?? null,
    }),
  )
}

function cmdEnsurePanes(args: Record<string, string>): void {
  const board = requireArg(args, 'board')
  const rolesStr = requireArg(args, 'roles')
  const roleInputs = rolesStr.split(',').map(s => s.trim())

  // ベースロールを検証
  for (const input of roleInputs) {
    const baseRole = input.replace(/-\d+$/, '')
    if (!ROLES[baseRole as WorkerRole]) {
      console.error(`Error: unknown role "${baseRole}"`)
      process.exit(1)
    }
  }

  // インスタンスID を生成
  // "programmer,programmer,se" → ["programmer-1","programmer-2","se-1"]
  // "programmer-1,programmer-2" → そのまま使う（明示的指定）
  const instanceIds: string[] = []
  const hasExplicitIds = roleInputs.some(r => /-\d+$/.test(r))

  if (hasExplicitIds) {
    // 明示的なインスタンスID（programmer-1, programmer-2 等）
    instanceIds.push(...roleInputs)
  } else {
    // ロール名の重複をカウントしてインスタンスIDを自動生成
    const roleCounts = new Map<string, number>()
    for (const role of roleInputs) {
      roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1)
    }
    const roleCounters = new Map<string, number>()
    for (const role of roleInputs) {
      const total = roleCounts.get(role) ?? 1
      const current = (roleCounters.get(role) ?? 0) + 1
      roleCounters.set(role, current)
      // 単一なら "se"、複数なら "programmer-1", "programmer-2"
      instanceIds.push(total === 1 ? role : `${role}-${current}`)
    }
  }

  // phase を working に設定
  setPhase(board, 'working')

  // 既存ペインIDを読み込み
  const panes = loadPanes(board)
  const orchestraDir = resolve(process.cwd())
  // workdir が指定されていればワーカーはそのディレクトリで起動する
  const workdir = getWorkdir(board)
  const workerCwd = workdir ?? orchestraDir

  for (const instanceId of instanceIds) {
    const existingPaneId = panes[instanceId]

    // 既存ペインが生きていればスキップ
    if (existingPaneId && isPaneAlive(existingPaneId)) {
      continue
    }

    // 新しいペインを起動（instanceId を team-member に渡す）
    // team-member.ts は orchestraDir にあるので絶対パスで指定
    const memberScript = resolve(orchestraDir, 'src/team-member.ts')
    const bunPath = process.env.BUN_PATH || 'bun'
    // workdir が orchestraDir と異なる場合、共通親を CLAUDE_ALLOWED_DIR に設定
    const allowedDir =
      workdir && resolve(workdir) !== orchestraDir
        ? findCommonParent(orchestraDir, resolve(workdir))
        : orchestraDir
    const cmd = `cd ${workerCwd} && CLAUDE_ALLOWED_DIR=${allowedDir} ${bunPath} ${memberScript} ${board} ${instanceId}`
    const paneId = execSync(
      `tmux split-window -d -P -F "#{pane_id}" '${cmd.replace(/'/g, "'\\''")}'`,
      { encoding: 'utf-8' },
    ).trim()

    panes[instanceId] = paneId

    // レイアウト調整
    try {
      execSync('tmux select-layout tiled', { stdio: 'ignore' })
    } catch {
      // ignore layout errors
    }
  }

  // ペインIDを永続化
  savePanes(board, panes)

  // 結果を出力
  const result: Record<string, string> = {}
  for (const id of instanceIds) {
    result[id] = panes[id]
  }
  console.log(JSON.stringify(result))
}

function cmdStatus(args: Record<string, string>): void {
  const board = requireArg(args, 'board')
  const tasks = getAllTasks(board)
  const phase = getPhase(board)

  console.log(
    JSON.stringify({
      phase,
      sharedDir: getSharedDir(board),
      tasks: tasks.map(t => ({
        id: t.id,
        owner: t.owner,
        title: t.title,
        status: t.status,
      })),
    }),
  )
}

function cmdResults(args: Record<string, string>): void {
  const board = requireArg(args, 'board')
  const taskIdStr = args['task']
  const tasks = getAllTasks(board)

  const targetTasks = taskIdStr
    ? tasks.filter(t => t.id === Number(taskIdStr))
    : tasks.filter(t => t.status === 'completed' || t.status === 'error')

  if (targetTasks.length === 0) {
    console.log('No completed tasks.')
    return
  }

  const output = targetTasks
    .map(t => {
      const role = ROLES[t.owner]
      const statusLabel = t.status === 'completed' ? 'completed' : 'error'
      const content = t.result ?? t.error ?? '(no output)'
      return `### ${role.emoji} ${role.name} — ${t.title}\nStatus: ${statusLabel}\n\n${content}`
    })
    .join('\n\n---\n\n')

  console.log(output)
}

function cmdLog(args: Record<string, string>): void {
  const board = requireArg(args, 'board')
  const filterFrom = args['from']
  const filterTo = args['to']

  let messages = readAllMessages(board)

  if (filterFrom) {
    messages = messages.filter(m => m.from === filterFrom)
  }
  if (filterTo) {
    messages = messages.filter(m => m.to === filterTo)
  }

  if (messages.length === 0) {
    console.log('No messages.')
    return
  }

  const output = messages
    .map(m => {
      const time = m.timestamp.replace('T', ' ').replace(/\.\d+Z$/, '')
      return `**[${time}] ${m.from} → ${m.to}**\n${m.content}`
    })
    .join('\n\n---\n\n')

  console.log(output)
}

function cmdSend(args: Record<string, string>): void {
  const board = requireArg(args, 'board')
  const to = requireArg(args, 'to')
  const from = requireArg(args, 'from')
  const message = requireArg(args, 'message')

  sendMessage(board, {
    from,
    to,
    content: message,
    timestamp: new Date().toISOString(),
  })

  console.log(JSON.stringify({ sent: true, to }))
}

function cmdShutdown(args: Record<string, string>): void {
  const board = requireArg(args, 'board')
  const keepBoard = args['keep-board'] === 'true'

  // 1. shutdown シグナル → メンバーの永続ループが自然終了
  setPhase(board, 'shutdown')

  // 2. メンバーが shutdown を検知する時間を確保
  try {
    execSync('sleep 2', { stdio: 'ignore' })
  } catch {
    /* ignore */
  }

  // 3. 全ペインを kill
  const panes = loadPanes(board)
  for (const [, paneId] of Object.entries(panes)) {
    try {
      execSync(`tmux kill-pane -t ${paneId}`, { stdio: 'ignore' })
    } catch {
      // already closed
    }
  }

  // 4. 共有ディレクトリは保持（成果物を参照できるようにする）

  if (keepBoard) {
    // ソフトシャットダウン: ペインのみ停止、ボードは保持（再開可能）
    console.log('Shutdown complete (board preserved for recovery).')
  } else {
    // 通常シャットダウン: ボードディレクトリ削除
    try {
      rmSync(board, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    // レジストリからも削除
    unregisterBoard(board)
    console.log('Shutdown complete.')
  }
}

// ─── リカバリ系サブコマンド ───

/** in_progress タスクを pending に戻す */
function cmdRecoverTasks(args: Record<string, string>): void {
  const board = requireArg(args, 'board')
  const recovered = recoverStaleTasks(board)

  if (recovered.length === 0) {
    console.log(JSON.stringify({ recovered: 0, message: 'No stale in_progress tasks found.' }))
  } else {
    console.log(
      JSON.stringify({
        recovered: recovered.length,
        tasks: recovered.map(t => ({ id: t.id, owner: t.owner, title: t.title })),
      }),
    )
  }
}

/** 現存するアクティブなボード一覧を表示 */
function cmdListBoards(): void {
  const boards = listActiveBoards()

  if (boards.length === 0) {
    console.log(JSON.stringify({ boards: [], message: 'No active boards found.' }))
    return
  }

  console.log(
    JSON.stringify({
      boards: boards.map(b => ({
        boardDir: b.boardDir,
        createdAt: b.createdAt,
        cwd: b.cwd,
        phase: b.phase,
        tasks: b.taskSummary,
      })),
    }),
  )
}

/** ボードの中断復旧: in_progress タスクをリセットし、ペインを再起動する */
function cmdResume(args: Record<string, string>): void {
  const board = requireArg(args, 'board')
  const rolesStr = args['roles']

  // 1. phase が shutdown なら working に戻す
  const phase = getPhase(board)
  if (phase === 'shutdown') {
    setPhase(board, 'working')
    console.error('Phase reset: shutdown → working')
  }

  // 2. in_progress タスクをリカバリ
  const recovered = recoverStaleTasks(board)
  if (recovered.length > 0) {
    console.error(
      `Recovered ${recovered.length} stale task(s): ${recovered.map(t => `#${t.id}`).join(', ')}`,
    )
  }

  // 3. 死んだペインをクリーンアップ
  const panes = loadPanes(board)
  const deadPanes: string[] = []
  for (const [role, paneId] of Object.entries(panes)) {
    if (!isPaneAlive(paneId)) {
      deadPanes.push(role)
      delete panes[role]
    }
  }
  if (deadPanes.length > 0) {
    savePanes(board, panes)
    console.error(`Cleaned up ${deadPanes.length} dead pane(s): ${deadPanes.join(', ')}`)
  }

  // 4. ペインを再起動（roles が指定されていればそれを使用、なければタスクから推定）
  let roleInputs: string[]
  if (rolesStr) {
    roleInputs = rolesStr.split(',').map(s => s.trim())
  } else {
    // 未完了タスクの owner から必要なロールを自動推定
    const tasks = getAllTasks(board)
    const pendingRoles = new Set<string>()
    for (const task of tasks) {
      if (task.status === 'pending' || task.status === 'in_progress') {
        pendingRoles.add(task.owner)
      }
    }
    roleInputs = [...pendingRoles]
  }

  if (roleInputs.length === 0) {
    console.log(JSON.stringify({ resumed: true, recovered: recovered.length, panes: {} }))
    return
  }

  // ensure-panes と同じロジックを呼ぶ
  cmdEnsurePanes({ board, roles: roleInputs.join(',') })
}

// ─── プロジェクト系サブコマンド ───

function cmdProjectInit(args: Record<string, string>): void {
  const goal = requireArg(args, 'goal')
  const projectId = randomUUID().slice(0, 8)
  const projectDir = initProject(projectId, goal)
  process.stdout.write(projectDir)
}

function cmdProjectStatus(args: Record<string, string>): void {
  const projectDir = requireArg(args, 'project')
  const state = loadProject(projectDir)

  console.log(
    JSON.stringify({
      projectId: state.projectId,
      goal: state.goal,
      status: state.status,
      currentPhaseIndex: state.currentPhaseIndex,
      totalPhases: state.phases.length,
      currentPhase: state.phases[state.currentPhaseIndex] ?? null,
      phaseResults: state.phaseResults.map(r => ({
        phaseId: r.phaseId,
        status: r.status,
        summary: r.summary.slice(0, 200),
      })),
    }),
  )
}

function cmdProjectSetPhases(args: Record<string, string>): void {
  const projectDir = requireArg(args, 'project')
  const phasesJson = requireArg(args, 'phases')

  const phases: PhaseBrief[] = JSON.parse(phasesJson)
  const state = loadProject(projectDir)
  state.phases = phases
  state.phaseResults = phases.map(p => ({
    phaseId: p.id,
    summary: '',
    deliverables: [],
    status: 'pending' as const,
    startedAt: null,
    completedAt: null,
  }))
  state.status = 'planning_phase'
  saveProject(projectDir, state)

  // 各フェーズの brief も保存
  for (const phase of phases) {
    const brief = `# ${phase.name}\n\n${phase.description}\n\n## スコープ\n${phase.scope}\n\n## 成功基準\n${phase.successCriteria.map(c => `- ${c}`).join('\n')}\n\n## 期待される成果物\n${phase.expectedDeliverables.map(d => `- ${d}`).join('\n')}`
    savePhaseBrief(projectDir, phase.id, brief)
  }

  console.log(JSON.stringify({ phasesSet: phases.length }))
}

function cmdProjectSavePlan(args: Record<string, string>): void {
  const projectDir = requireArg(args, 'project')
  const plan = requireArg(args, 'plan')

  saveMasterPlan(projectDir, plan)
  console.log(JSON.stringify({ saved: true }))
}

function cmdProjectPhaseContext(args: Record<string, string>): void {
  const projectDir = requireArg(args, 'project')
  const phaseId = Number(requireArg(args, 'phase'))

  const context = getPhaseInputContext(projectDir, phaseId)
  console.log(context)
}

function cmdProjectAdvance(args: Record<string, string>): void {
  const projectDir = requireArg(args, 'project')

  const nextPhase = advancePhase(projectDir)
  if (nextPhase) {
    console.log(JSON.stringify({ advanced: true, nextPhase }))
  } else {
    console.log(JSON.stringify({ advanced: false, completed: true }))
  }
}

function cmdProjectSaveResult(args: Record<string, string>): void {
  const projectDir = requireArg(args, 'project')
  const resultJson = requireArg(args, 'result')

  const result: PhaseResult = JSON.parse(resultJson)
  savePhaseResult(projectDir, result.phaseId, result)
  console.log(JSON.stringify({ saved: true, phaseId: result.phaseId }))
}

function cmdProjectLoadTasks(args: Record<string, string>): void {
  const projectDir = requireArg(args, 'project')
  const board = requireArg(args, 'board')
  const phaseId = Number(requireArg(args, 'phase'))

  const defs = loadTaskDefinitions(projectDir, phaseId)
  if (defs.length === 0) {
    console.error('No task definitions found.')
    process.exit(1)
  }

  const state = loadProject(projectDir)
  const originalTask = state.goal

  const created: { id: number; role: string; title: string }[] = []
  for (const def of defs) {
    const task = createTask(board, {
      title: def.title,
      instruction: def.instruction,
      owner: def.role,
      blockedBy: def.blockedBy,
      originalTask,
      reviewBy: def.reviewBy,
    })
    created.push({ id: task.id, role: task.owner, title: task.title })
  }

  console.log(JSON.stringify({ loaded: created.length, tasks: created }))
}

function cmdProjectSaveTaskDefs(args: Record<string, string>): void {
  const projectDir = requireArg(args, 'project')
  const phaseId = Number(requireArg(args, 'phase'))
  const defsJson = requireArg(args, 'definitions')

  const defs: TaskDefinition[] = JSON.parse(defsJson)
  saveTaskDefinitions(projectDir, phaseId, defs)
  console.log(JSON.stringify({ saved: defs.length }))
}

function printUsage(): void {
  console.error(`Usage: bun src/team-start.ts <command> [options]

Commands:
  init          [--workdir <path>]      Initialize a new board
  add-task  --board --role --title --instruction --original-task [--blocked-by] [--review-by]
  ensure-panes  --board --roles <role1,role2>
  status    --board
  results   --board [--task <id>]
  log       --board [--from <role>] [--to <role>]
  send      --board --to --from --message
  shutdown  --board [--keep-board]

Recovery Commands:
  list-boards                           List all active boards
  recover-tasks  --board                Reset stale in_progress tasks to pending
  resume         --board [--roles <role1,role2>]  Recover tasks + restart panes

Project Commands:
  project-init        --goal <goal>
  project-status      --project <dir>
  project-set-phases  --project <dir> --phases <json>
  project-save-plan   --project <dir> --plan <text>
  project-phase-context --project <dir> --phase <id>
  project-advance     --project <dir>
  project-save-result --project <dir> --result <json>
  project-load-tasks  --project <dir> --board <boardDir> --phase <id>
  project-save-task-defs --project <dir> --phase <id> --definitions <json>`)
}

// ─── メイン ───

const command = process.argv[2]
const args = parseArgs(process.argv.slice(3))

switch (command) {
  case 'init':
    cmdInit(args)
    break
  case 'add-task':
    cmdAddTask(args)
    break
  case 'ensure-panes':
    cmdEnsurePanes(args)
    break
  case 'status':
    cmdStatus(args)
    break
  case 'results':
    cmdResults(args)
    break
  case 'log':
    cmdLog(args)
    break
  case 'send':
    cmdSend(args)
    break
  case 'shutdown':
    cmdShutdown(args)
    break
  case 'list-boards':
    cmdListBoards()
    break
  case 'recover-tasks':
    cmdRecoverTasks(args)
    break
  case 'resume':
    cmdResume(args)
    break
  case 'project-init':
    cmdProjectInit(args)
    break
  case 'project-status':
    cmdProjectStatus(args)
    break
  case 'project-set-phases':
    cmdProjectSetPhases(args)
    break
  case 'project-save-plan':
    cmdProjectSavePlan(args)
    break
  case 'project-phase-context':
    cmdProjectPhaseContext(args)
    break
  case 'project-advance':
    cmdProjectAdvance(args)
    break
  case 'project-save-result':
    cmdProjectSaveResult(args)
    break
  case 'project-load-tasks':
    cmdProjectLoadTasks(args)
    break
  case 'project-save-task-defs':
    cmdProjectSaveTaskDefs(args)
    break
  default:
    printUsage()
    process.exit(1)
}
