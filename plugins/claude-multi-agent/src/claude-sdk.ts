/**
 * Claude Agent SDK ラッパー。
 * CLI spawn 版 (claude-cli.legacy.ts) と同じシグネチャを維持しつつ、
 * @anthropic-ai/claude-agent-sdk の query() を使用する。
 */

import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { logSDKMessage } from './sdk-logger.js'

export interface CallClaudeOptions {
  model?: string
  maxTurns?: number
  timeoutMs?: number
}

export async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  options?: Partial<CallClaudeOptions>,
): Promise<string> {
  const timeoutMs = options?.timeoutMs ?? 120_000
  const abortController = new AbortController()
  const timer = setTimeout(() => abortController.abort(), timeoutMs)

  try {
    let resultText = ''

    for await (const message of query({
      prompt: userPrompt,
      options: {
        systemPrompt: {
          type: 'preset',
          preset: 'claude_code',
          append: systemPrompt,
        },
        model: options?.model ?? 'claude-sonnet-4-6',
        maxTurns: options?.maxTurns ?? 1,
        permissionMode: 'dontAsk',
        tools: [],
        abortController,
        persistSession: false,
      },
    })) {
      // コンテキスト表示（ツール呼び出し、テキスト出力など）
      logSDKMessage(message)
      if (message.type === 'result') {
        const result = message as SDKResultMessage
        if (result.subtype === 'success') {
          resultText = result.result
        } else {
          const errors = (result as { errors?: string[] }).errors ?? []
          throw new Error(
            `Claude SDK エラー (${result.subtype}): ${errors.join(', ') || '不明なエラー'}`,
          )
        }
      }
    }

    return resultText.trim()
  } catch (error) {
    if (abortController.signal.aborted) {
      throw new Error(`Claude SDK タイムアウト (${timeoutMs}ms)`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
