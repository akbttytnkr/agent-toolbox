import type { WorkerRole } from './roles.js'

export interface PhaseBrief {
  id: number
  name: string
  description: string
  scope: string
  successCriteria: string[]
  expectedDeliverables: string[]
}

export interface PhaseResult {
  phaseId: number
  summary: string
  deliverables: string[]
  status: 'pending' | 'planning' | 'executing' | 'completed' | 'error'
  startedAt: string | null
  completedAt: string | null
}

export interface ProjectState {
  projectId: string
  goal: string
  masterPlan: string
  phases: PhaseBrief[]
  phaseResults: PhaseResult[]
  currentPhaseIndex: number
  status:
    | 'initializing'
    | 'planning_phase'
    | 'executing_phase'
    | 'awaiting_confirmation'
    | 'completed'
  createdAt: string
  projectDir: string
}

export interface TaskDefinition {
  role: WorkerRole
  title: string
  instruction: string
  blockedBy: number[]
  reviewBy?: WorkerRole
  priority: 'high' | 'medium' | 'low'
}
