import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"

export interface LearnedPattern {
  category: "success" | "failure" | "convention"
  pattern: string
  context: string
  source: string
  timestamp: string
}

const LEARNING_DIR = join(process.cwd(), ".learned")
const PATTERNS_FILE = join(LEARNING_DIR, "patterns.json")
const MAX_PATTERNS = 50

function readPatterns(): LearnedPattern[] {
  if (!existsSync(PATTERNS_FILE)) return []
  try {
    return JSON.parse(readFileSync(PATTERNS_FILE, "utf-8")) as LearnedPattern[]
  } catch {
    return []
  }
}

/**
 * パターンを保存する。
 * - 同じ pattern 文字列が既存の場合は上書き（重複排除）
 * - MAX_PATTERNS 超過時は最古のパターンを削除
 */
export function savePattern(pattern: LearnedPattern): void {
  if (!existsSync(LEARNING_DIR)) mkdirSync(LEARNING_DIR, { recursive: true })

  const patterns = readPatterns()

  const existingIdx = patterns.findIndex((p) => p.pattern === pattern.pattern)
  if (existingIdx >= 0) {
    patterns[existingIdx] = pattern
  } else {
    patterns.push(pattern)
    // 上限超過時は古いものから削除
    while (patterns.length > MAX_PATTERNS) {
      patterns.shift()
    }
  }

  writeFileSync(PATTERNS_FILE, JSON.stringify(patterns, null, 2))
}

/**
 * 保存済みパターンを systemPrompt 注入用テキストに変換する。
 * ファイルが存在しない場合・パターンが0件の場合は空文字を返す。
 */
export function loadLearnedPatterns(): string {
  const patterns = readPatterns()
  if (patterns.length === 0) return ""

  const lines = patterns.map((p) => {
    const icon =
      p.category === "success" ? "✅" : p.category === "failure" ? "❌" : "📌"
    return `- ${icon} ${p.pattern} (${p.context})`
  })

  return `\n\n## 過去の学習パターン\n以下は過去のセッションから学んだパターンです:\n${lines.join("\n")}`
}
