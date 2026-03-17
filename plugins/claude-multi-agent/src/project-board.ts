/**
 * project-board.ts — プロジェクト状態管理。
 *
 * team-board.ts のアトミック書き込みパターンを踏襲し、
 * プロジェクト全体の状態（フェーズ、計画、結果）を管理する。
 *
 * ディレクトリ構造:
 *   /tmp/project-{projectId}/
 *   ├── project.json
 *   ├── master-plan.md
 *   └── phases/
 *       ├── 1/
 *       │   ├── brief.md
 *       │   ├── task-definitions.json
 *       │   └── result.json
 *       ├── 2/ ...
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { PhaseBrief, PhaseResult, ProjectState, TaskDefinition } from './project-types.js'

// ─── アトミック書き込み ───

function atomicWrite(filePath: string, data: string): void {
  const tmp = `${filePath}.tmp.${process.pid}`
  writeFileSync(tmp, data)
  renameSync(tmp, filePath)
}

// ─── プロジェクト初期化 ───

export function initProject(projectId: string, goal: string): string {
  const projectDir = join(tmpdir(), `project-${projectId}`)
  mkdirSync(join(projectDir, 'phases'), { recursive: true })

  const state: ProjectState = {
    projectId,
    goal,
    masterPlan: '',
    phases: [],
    phaseResults: [],
    currentPhaseIndex: 0,
    status: 'initializing',
    createdAt: new Date().toISOString(),
    projectDir,
  }

  atomicWrite(join(projectDir, 'project.json'), JSON.stringify(state, null, 2))
  return projectDir
}

// ─── 読み書き ───

export function loadProject(projectDir: string): ProjectState {
  return JSON.parse(readFileSync(join(projectDir, 'project.json'), 'utf-8'))
}

export function saveProject(projectDir: string, state: ProjectState): void {
  atomicWrite(join(projectDir, 'project.json'), JSON.stringify(state, null, 2))
}

// ─── マスタープラン ───

export function saveMasterPlan(projectDir: string, plan: string): void {
  atomicWrite(join(projectDir, 'master-plan.md'), plan)
  const state = loadProject(projectDir)
  state.masterPlan = plan
  saveProject(projectDir, state)
}

// ─── フェーズ brief ───

export function savePhaseBrief(projectDir: string, phaseId: number, brief: string): void {
  const phaseDir = join(projectDir, 'phases', String(phaseId))
  mkdirSync(phaseDir, { recursive: true })
  atomicWrite(join(phaseDir, 'brief.md'), brief)
}

// ─── フェーズ結果 ───

export function savePhaseResult(projectDir: string, phaseId: number, result: PhaseResult): void {
  const phaseDir = join(projectDir, 'phases', String(phaseId))
  mkdirSync(phaseDir, { recursive: true })
  atomicWrite(join(phaseDir, 'result.json'), JSON.stringify(result, null, 2))

  // project.json の phaseResults も更新
  const state = loadProject(projectDir)
  const idx = state.phaseResults.findIndex(r => r.phaseId === phaseId)
  if (idx >= 0) {
    state.phaseResults[idx] = result
  } else {
    state.phaseResults.push(result)
  }
  saveProject(projectDir, state)
}

export function loadPhaseResult(projectDir: string, phaseId: number): PhaseResult | null {
  const path = join(projectDir, 'phases', String(phaseId), 'result.json')
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

// ─── タスク定義 ───

export function saveTaskDefinitions(
  projectDir: string,
  phaseId: number,
  defs: TaskDefinition[],
): void {
  const phaseDir = join(projectDir, 'phases', String(phaseId))
  mkdirSync(phaseDir, { recursive: true })
  atomicWrite(join(phaseDir, 'task-definitions.json'), JSON.stringify(defs, null, 2))
}

export function loadTaskDefinitions(projectDir: string, phaseId: number): TaskDefinition[] {
  const path = join(projectDir, 'phases', String(phaseId), 'task-definitions.json')
  if (!existsSync(path)) return []
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return []
  }
}

// ─── フェーズ進行 ───

export function advancePhase(projectDir: string): PhaseBrief | null {
  const state = loadProject(projectDir)
  const nextIndex = state.currentPhaseIndex + 1

  if (nextIndex >= state.phases.length) {
    state.status = 'completed'
    saveProject(projectDir, state)
    return null
  }

  state.currentPhaseIndex = nextIndex
  state.status = 'planning_phase'
  saveProject(projectDir, state)
  return state.phases[nextIndex]
}

// ─── フェーズ入力コンテキスト（フィードフォワード） ───

export function getPhaseInputContext(projectDir: string, phaseId: number): string {
  const state = loadProject(projectDir)
  const phase = state.phases.find(p => p.id === phaseId)

  const sections: string[] = []

  // 元の目標
  sections.push(`## プロジェクト目標\n${state.goal}`)

  // マスタープラン
  if (state.masterPlan) {
    sections.push(`## マスタープラン\n${state.masterPlan}`)
  }

  // 現フェーズの brief
  if (phase) {
    sections.push(
      `## 現フェーズ: ${phase.name}\n${phase.description}\n\n### スコープ\n${phase.scope}\n\n### 成功基準\n${phase.successCriteria.map(c => `- ${c}`).join('\n')}\n\n### 期待される成果物\n${phase.expectedDeliverables.map(d => `- ${d}`).join('\n')}`,
    )
  }

  // 完了フェーズの結果サマリー
  const completedResults = state.phaseResults.filter(r => r.status === 'completed')
  if (completedResults.length > 0) {
    const resultsSummary = completedResults
      .map(r => {
        const phaseName = state.phases.find(p => p.id === r.phaseId)?.name ?? `Phase ${r.phaseId}`
        return `### ${phaseName}\n${r.summary}\n\n成果物:\n${r.deliverables.map(d => `- ${d}`).join('\n')}`
      })
      .join('\n\n')
    sections.push(`## 完了済みフェーズの結果\n${resultsSummary}`)
  }

  return sections.join('\n\n---\n\n')
}
