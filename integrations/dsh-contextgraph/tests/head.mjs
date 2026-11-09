// Regression test for the freshness comparison.
//
// The graph stores whatever `git rev-parse` printed when it was indexed. That
// used to be a 12-character sha while this plugin asked git for the full
// 40-character one, so `===` was never true and every project reported
// "HEAD changed" — which is the exact false alarm this plugin exists to stop.
//
//   node tests/head.mjs

import assert from 'node:assert/strict'
import { headMatches } from '../lib/project.js'

const full = '11a750e523a9d3405a4b7a1dc8025030837780b8'
const short = '11a750e523a9'

assert.equal(headMatches(short, short), true, 'identical shas match')
assert.equal(headMatches(full, short), true, 'abbreviated index value matches the full head')
assert.equal(headMatches(short, full), true, 'either side may be the abbreviated one')
assert.equal(headMatches(full, full), true, 'identical full shas match')

assert.equal(headMatches('6197eaea2007', short), false, 'different commits do not match')
assert.equal(headMatches(null, short), false, 'missing current head does not match')
assert.equal(headMatches(short, null), false, 'missing indexed head does not match')
assert.equal(headMatches('', ''), false, 'empty values do not match')

// A one- or two-character prefix would match half the history, so the floor
// matters as much as the prefix rule itself.
assert.equal(headMatches('11a75', full), false, 'too short to be a safe prefix')
assert.equal(headMatches('11a750e', full), true, 'seven characters is the floor')

console.log('head.mjs: 11 assertions passed')
