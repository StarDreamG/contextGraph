// Deciding which rows are memory and which are just text that got indexed.
//
// The upstream classifier assigns a type from regexes over a block, and it is
// generous: a markdown heading becomes a `Rule`, and a JSON policy document
// becomes four `P0` rules whose titles are `chapters`. Those rows are in the
// graph, but they are not memory — they are documents. Feeding them to an agent
// is worse than an empty answer, because a `P0` badge on a policy PDF teaches
// the model to distrust the whole mechanism.
//
// This module is the filter both the brief and the recall path share.

const DATA_EXTENSION = /\.(json|jsonl|ndjson|csv|tsv|xlsx?|lock|map|snap|svg|min\.js|min\.css)$/i
const WEAK_EXTENSION = /\.(txt|log|po|pot)$/i

/** Titles the classifier falls back to when it only found a heading. */
const NOISE_TITLE = /^(rule|note|file|files|chapters?|sections?|untitled|无标题|正文|内容|目录|表格|数据)$/i

/** Cheap proxy for "this is a command the reader can paste". */
const COMMAND_HINT = /(^|[\s`])(npm|pnpm|yarn|bun|docker|docker-compose|make|just|systemctl|ssh|scp|curl|wget|python3?|pip|uv|poetry|go|cargo|mvn|gradle|npx)\s/i

/** Absolute or project-relative paths. */
const PATH_HINT = /(^|[\s`"'（(])(\/[\w.@+-]+){2,}|[\w.@+-]+\/[\w.@+/-]+\.\w{1,6}\b/

/** Prohibitions and obligations are the highest-value sentence in a project. */
const OBLIGATION = /(禁止|不得|不允许|不能|只能|必须|应当|严禁|切记|never|must not|do not|don't)/i

const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/
const PORT = /(?:端口|port|:)\s*\d{2,5}\b/i
const URL = /https?:\/\/[^\s)）]+/i

/** A path whose whole point is to be machine-read, not remembered. */
export function looksLikeDataFile(blockPath) {
  return typeof blockPath === 'string' && DATA_EXTENSION.test(blockPath)
}

/** A `.txt` may still be prose; it just starts life suspect. */
export function looksLikeWeakSource(blockPath) {
  return typeof blockPath === 'string' && WEAK_EXTENSION.test(blockPath)
}

/**
 * Vendored READMEs and build output describe somebody else's software. They are
 * indexed because they live in the repo, but they are not this project's rules.
 */
const VENDORED_PATH = /(^|\/)(vendor|vendors|node_modules|third[_-]?party|dist|build|out|coverage|\.next)\//i

export function looksLikeVendored(blockPath) {
  return typeof blockPath === 'string' && VENDORED_PATH.test(blockPath)
}

/**
 * True when the body is serialized data rather than a statement.
 * @param {string} content
 */
export function looksLikeStructuredData(content) {
  const text = String(content ?? '').trimStart()
  if (!text) return false
  const first = text[0]
  if (first === '[' || first === '{') return true
  const head = text.slice(0, 240)
  return /"(?:content|title|data|items|rows)"\s*:/.test(head)
}

/**
 * Drop records that carry no transferable meaning.
 * @param {{type: string, title: string, content: string, blockPath?: string|null}} record
 */
export function isNoiseRecord(record) {
  const title = String(record.title ?? '').trim()
  const content = String(record.content ?? '').trim()

  if (looksLikeDataFile(record.blockPath)) return true
  if (title.length < 2) return true
  if (NOISE_TITLE.test(title)) return true
  if (/^\d+[.、)．]?$/.test(title)) return true
  if (looksLikeStructuredData(content)) return true
  if (content.length < 12) return true
  // A heading repeated as its own body carries nothing.
  if (content === title && record.type !== 'Test' && record.type !== 'Command') return true
  // Long single-line blobs are almost always scraped/exported data.
  if (content.length > 1200 && !content.includes('\n') && !/[。！？；]/.test(content)) return true
  return false
}

/**
 * How much a record reads like a reusable fact: an address, a port, a command,
 * a path, a rule. Range 0..10.
 */
export function factDensity(text) {
  const value = String(text ?? '')
  let score = 0
  if (IPV4.test(value)) score += 3
  if (PORT.test(value)) score += 2.5
  if (COMMAND_HINT.test(value)) score += 2
  if (PATH_HINT.test(value)) score += 1.5
  if (OBLIGATION.test(value)) score += 2.5
  if (URL.test(value)) score += 1
  return Math.min(score, 10)
}

/**
 * Preference for records short enough to quote and long enough to say
 * something. Plans and specs run long and are usually re-derivable from the
 * repository; a deployment fact is not.
 */
export function lengthPreference(length) {
  if (length < 20) return -2
  if (length <= 220) return 2
  if (length <= 450) return 0
  return -Math.min(6, (length - 450) / 150)
}
