// Text helpers shared by the recall, brief and handoff paths.
//
// Everything here is deliberately allocation-light: the plugin formats memory
// records that can run to thousands of lines, and it must fit an answer into a
// character budget the caller controls.

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/

/** Collapse all whitespace so one memory record occupies exactly one line. */
export function oneLine(value) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Shorten `value` to at most `max` characters, preferring a sentence boundary.
 * The ellipsis counts toward the budget.
 */
export function clip(value, max) {
  const text = oneLine(value)
  if (text.length <= max) return text
  if (max <= 2) return '…'.slice(0, max)
  const room = max - 1
  const head = text.slice(0, room)
  const boundary = Math.max(
    head.lastIndexOf('。'),
    head.lastIndexOf('；'),
    head.lastIndexOf('，'),
    head.lastIndexOf('; '),
    head.lastIndexOf('. '),
    head.lastIndexOf(', ')
  )
  const cut = boundary > room * 0.55 ? head.slice(0, boundary + 1) : head
  return `${cut.trimEnd()}…`
}

/**
 * Rough token estimate. CJK ideographs cost about one token per 1.5 characters
 * on the tokenizers we target; latin text is closer to one token per 4.
 */
export function estimateTokens(value) {
  const text = String(value ?? '')
  let cjk = 0
  let other = 0
  for (const char of text) {
    if (CJK_RE.test(char)) cjk += 1
    else other += 1
  }
  return Math.ceil(cjk / 1.5 + other / 4)
}

/**
 * Turn a free-text question into search terms.
 *
 * Chinese has no word boundaries an SQL LIKE can use, so long runs are also cut
 * into overlapping bigrams: `部署目录在哪` matches a row that only says
 * `部署目录`. Terms are ordered longest-first so the scoring pass rewards
 * specific hits over incidental single-character ones.
 */
export function queryTerms(query, max = 8) {
  const raw = String(query ?? '').trim()
  if (!raw) return []
  const terms = new Set()
  for (const part of raw.split(/[\s,，、;；|/\\()（）[\]{}"'`]+/u)) {
    const piece = part.trim()
    if (!piece) continue
    if (piece.length === 1) continue
    terms.add(piece)
    if (CJK_RE.test(piece) && piece.length >= 5) {
      for (let index = 0; index + 2 <= piece.length; index += 1) {
        const bigram = piece.slice(index, index + 2)
        if (CJK_RE.test(bigram)) terms.add(bigram)
      }
    }
  }
  return [...terms].sort((left, right) => right.length - left.length).slice(0, max)
}

/** Escape the two LIKE wildcards so a literal `%` in a path stays literal. */
export function likePattern(value) {
  return `%${String(value ?? '').replace(/[\\%_]/g, (char) => `\\${char}`)}%`
}

/** Parse the JSON `metadata` column without letting one bad row break a call. */
export function readMetadata(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}
