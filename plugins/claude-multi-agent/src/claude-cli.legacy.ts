import { spawn } from 'node:child_process'

/**
 * claude CLI の --print モードでプロンプトを送信し、レスポンスを返す。
 * Claude Code のサブスクリプションを利用するため、API キー不要。
 * システムプロンプトは --append-system-prompt で渡し、
 * ユーザープロンプトは stdin 経由で渡す。
 */
export function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--output-format',
      'text',
      '--append-system-prompt',
      systemPrompt,
      '--model',
      'sonnet',
    ]

    const child = spawn('claude', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120_000,
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    child.on('error', error => {
      reject(new Error(`claude CLI 起動エラー: ${error.message}`))
    })

    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`claude CLI 終了コード ${code}: ${stderr || stdout}`))
        return
      }
      resolve(stdout.trim())
    })

    child.stdin.write(userPrompt)
    child.stdin.end()
  })
}
