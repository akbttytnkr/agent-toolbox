import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

/**
 * rules/ ディレクトリからルールを読み込み、systemPromptに注入する文字列を生成する。
 * @param projectDir ルールディレクトリの親ディレクトリ（通常 process.cwd()）
 * @param language 言語固有ルールを読み込む場合に指定（例: "typescript"）
 * @returns systemPromptに追加するルール文字列。ルールが存在しない場合は空文字。
 */
export function loadRules(projectDir: string, language?: string): string {
  const rulesDir = join(projectDir, "rules")
  if (!existsSync(rulesDir)) return ""

  const sections: string[] = []

  // 1. rules/common/ の全.mdファイルを読み込み（ファイル名順）
  const commonDir = join(rulesDir, "common")
  if (existsSync(commonDir)) {
    const files = readdirSync(commonDir)
      .filter((f) => f.endsWith(".md"))
      .sort()
    for (const file of files) {
      const content = readFileSync(join(commonDir, file), "utf-8").trim()
      if (content) sections.push(content)
    }
  }

  // 2. 言語固有ルールを読み込み（指定時）
  if (language) {
    const langDir = join(rulesDir, language)
    if (existsSync(langDir)) {
      const files = readdirSync(langDir)
        .filter((f) => f.endsWith(".md"))
        .sort()
      for (const file of files) {
        const content = readFileSync(join(langDir, file), "utf-8").trim()
        if (content) sections.push(content)
      }
    }
  }

  if (sections.length === 0) return ""

  return (
    "\n\n## プロジェクトルール（常時適用）\n" +
    "以下のルールはすべての作業に適用されます。必ず遵守してください。\n\n" +
    sections.join("\n\n---\n\n")
  )
}
