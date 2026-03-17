/**
 * AgentDefinition マップ。
 * roles.ts の各ロール定義を Claude Agent SDK の AgentDefinition に変換する。
 */

import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk'
import {
  ROLES,
  SECURITY_BLUE_TEAM_PROMPT,
  SECURITY_CONSENSUS_PROMPT,
  SECURITY_RED_TEAM_PROMPT,
} from './roles.js'

export function buildAgents(): Record<string, AgentDefinition> {
  return {
    researcher: {
      description:
        '調査・分析の専門家。依頼内容の深掘り、背景調査、技術要件の明確化、リスク洗い出しを行う。',
      prompt: ROLES.researcher.systemPrompt,
      tools: [],
      model: ROLES.researcher.model,
      maxTurns: 1,
    },
    se: {
      description:
        'システムエンジニア。アーキテクチャ設計、技術選定、非機能要件の検討、コンポーネント間連携設計を行う。',
      prompt: ROLES.se.systemPrompt,
      tools: [],
      model: ROLES.se.model,
      maxTurns: 1,
    },
    programmer: {
      description:
        'プログラマー。具体的なコード設計、アルゴリズム設計、実装方針の策定、コードサンプルの提示を行う。',
      prompt: ROLES.programmer.systemPrompt,
      tools: [],
      model: ROLES.programmer.model,
      maxTurns: 1,
    },
    tester: {
      description:
        'テスター。テスト戦略・計画の策定、テストケース設計、エッジケース特定、テスト自動化方針を提案する。',
      prompt: ROLES.tester.systemPrompt,
      tools: [],
      model: ROLES.tester.model,
      maxTurns: 1,
    },
    ui_ux: {
      description:
        'UI/UXデザイナー。ユーザビリティ、アクセシビリティ、画面設計、インタラクション設計を担当する。',
      prompt: ROLES.ui_ux.systemPrompt,
      tools: [],
      model: ROLES.ui_ux.model,
      maxTurns: 1,
    },
    security_red_team: {
      description: 'セキュリティ Red Team。攻撃者視点で脆弱性を発見し、攻撃シナリオを提示する。',
      prompt: SECURITY_RED_TEAM_PROMPT,
      tools: [],
      model: ROLES.security_red.model,
      maxTurns: 1,
    },
    security_blue_team: {
      description:
        'セキュリティ Blue Team。Red Team の指摘に対する防御策を提案し、実装コストとリスクのバランスを考慮する。',
      prompt: SECURITY_BLUE_TEAM_PROMPT,
      tools: [],
      model: ROLES.security_blue.model,
      maxTurns: 1,
    },
    security_consensus: {
      description:
        'セキュリティ委員会議長。Red Team と Blue Team の討論を整理し、合意事項をまとめる。',
      prompt: SECURITY_CONSENSUS_PROMPT,
      tools: [],
      model: ROLES.security_committee.model,
      maxTurns: 1,
    },
  }
}
