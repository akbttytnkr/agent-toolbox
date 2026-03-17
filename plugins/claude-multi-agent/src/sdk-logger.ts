/**
 * SDK メッセージのコンテキスト表示ユーティリティ。
 * query() のストリームから assistant テキスト、ツール呼び出し、
 * ツール結果サマリなどをコンソールに出力する。
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

const DIM = '\x1b[90m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const MAGENTA = '\x1b[35m'
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'

/**
 * SDK メッセージをコンソールに表示する。
 * result メッセージは呼び出し元で処理するためスキップする。
 */
export function logSDKMessage(msg: SDKMessage, indent = '  '): void {
  switch (msg.type) {
    case 'assistant': {
      const content = (msg as { message?: { content?: unknown[] } }).message?.content
      if (!Array.isArray(content)) break
      for (const block of content) {
        const b = block as { type: string; text?: string; name?: string; input?: unknown }
        if (b.type === 'text' && b.text) {
          // テキスト出力 — 長すぎる場合は省略
          const text = b.text.length > 500 ? b.text.slice(0, 500) + '…' : b.text
          const lines = text.split('\n')
          for (const line of lines) {
            console.log(`${indent}${line}`)
          }
        } else if (b.type === 'tool_use' && b.name) {
          // ツール呼び出し
          const inputStr = formatToolInput(b.name, b.input)
          console.log(`${indent}${CYAN}⚡ ${b.name}${RESET}${inputStr ? ` ${DIM}${inputStr}${RESET}` : ''}`)
        }
      }
      break
    }

    case 'tool_use_summary': {
      const summary = (msg as { summary?: string }).summary
      if (summary) {
        console.log(`${indent}${DIM}${summary}${RESET}`)
      }
      break
    }

    case 'system': {
      const subtype = (msg as { subtype?: string }).subtype
      if (subtype === 'status') {
        const status = (msg as { status?: string }).status
        if (status) {
          console.log(`${indent}${DIM}[${status}]${RESET}`)
        }
      }
      break
    }

    default:
      // result, stream_event, user, etc. はスキップ
      break
  }
}

/**
 * ツール入力を簡潔に表示用文字列にフォーマットする。
 */
function formatToolInput(toolName: string, input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const obj = input as Record<string, unknown>

  // よく使うツールのフォーマット
  switch (toolName) {
    case 'Read':
      return obj.file_path ? String(obj.file_path) : ''
    case 'Write':
      return obj.file_path ? String(obj.file_path) : ''
    case 'Edit':
      return obj.file_path ? String(obj.file_path) : ''
    case 'Glob':
      return obj.pattern ? String(obj.pattern) : ''
    case 'Grep':
      return obj.pattern ? `/${obj.pattern}/` : ''
    case 'Bash': {
      const cmd = obj.command ? String(obj.command) : ''
      return cmd.length > 80 ? cmd.slice(0, 80) + '…' : cmd
    }
    default: {
      // 汎用: 最初のstring値を表示
      const first = Object.values(obj).find(v => typeof v === 'string')
      if (first) {
        const s = String(first)
        return s.length > 80 ? s.slice(0, 80) + '…' : s
      }
      return ''
    }
  }
}
