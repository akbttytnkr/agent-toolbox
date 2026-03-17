import type { WorkerRole } from './roles.js'

export interface Subtask {
  id: number
  role: WorkerRole
  title: string
  instruction: string
}

export interface TeamSelection {
  reasoning: string
  members: { role: WorkerRole; reason: string }[]
}

export interface OrchestratorOutput {
  plan: string
  subtasks: Subtask[]
}

export interface Question {
  fromWorkerId: number
  fromRole: WorkerRole
  text: string
}

export interface QuestionRoute {
  question: Question
  targetRole: WorkerRole
  reason: string
}

export interface QAAnswer {
  question: Question
  answeredByRole: WorkerRole
  answer: string
}

export interface WorkerResult {
  subtask: Subtask
  status: 'success' | 'error'
  output: string
  questions: Question[]
  startOffsetMs: number
  durationMs: number
}

export interface SynthesisResult {
  summary: string
  fullReport: string
}

export type WorkerEvent =
  | { type: 'start'; subtask: Subtask }
  | { type: 'done'; subtask: Subtask; status: 'success' | 'error'; durationMs: number }
