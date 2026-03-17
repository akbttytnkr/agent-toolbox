/**
 * callClaude アダプター。
 * デフォルトは Agent SDK 版を使用し、
 * USE_LEGACY_CLI=1 で従来の CLI spawn 版にフォールバック可能。
 */
import { callClaude as callClaudeLegacy } from './claude-cli.legacy.js'
import { callClaude as callClaudeSDK } from './claude-sdk.js'

export const callClaude = process.env.USE_LEGACY_CLI === '1' ? callClaudeLegacy : callClaudeSDK
