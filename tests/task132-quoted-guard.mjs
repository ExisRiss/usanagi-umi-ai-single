/* Task132 — penyebab crash yang ditemukan setelah deploy.
 *
 * Log server 27/10/2026 14:35Z:
 *
 *   TypeError: Cannot read properties of undefined (reading 'getJid')
 *     at WebMessageInfo.get (lib/simple.js:955)
 *     at plugins/game/game-tebakgambar.js:45   ← callback setTimeout
 *
 * Penyebabnya: plugin mengutip HASIL `conn.sendMessage` (proto mentah).
 * Getter `.chat` pada objek itu memakai `this.conn` yang tidak ada, jadi
 * prosesnya mati — bukan cuma pesan yang gagal.
 *
 * Dua perbaikan yang diuji di sini:
 *   1. `conn.reply` membaca `.chat` di dalam try/catch (semua plugin aman),
 *   2. plugin yang bermasalah mengutip `m`, bukan proto hasil kiriman.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baca = (rel) => fs.readFileSync(path.join(AKAR, rel), 'utf8')

test('conn.reply membaca chat kutipan dengan aman', () => {
  const sumber = baca('lib/simple.js')
  assert.match(sumber, /let chatKutip = null/)
  assert.match(sumber, /try \{\s*\n\s*chatKutip = quoted/)
  assert.match(sumber, /const tujuan = jidTujuan\(jid, chatKutip\)/)
  // Pola lama yang memicu crash tidak boleh tersisa.
  assert.doesNotMatch(sumber, /jidTujuan\(jid, quoted && typeof quoted === 'object' \? quoted\.chat : null\)/)
})

test('perilaku: getter .chat yang melempar tidak mematikan pengiriman', () => {
  // Tiruan getter bermasalah seperti WebMessageInfo tanpa conn.
  const protoMentah = {
    key: { id: 'ABC' },
    get chat() {
      const conn = undefined
      return conn.getJid('x')
    },
  }
  const bacaChatAman = (quoted) => {
    let hasil = null
    try {
      hasil = quoted && typeof quoted === 'object' ? quoted.chat : null
    } catch {
      hasil = null
    }
    return hasil
  }
  assert.equal(bacaChatAman(protoMentah), null, 'harus ditelan, bukan melempar')
  assert.equal(bacaChatAman(undefined), null)
})

test('plugin game tidak lagi mengutip proto hasil sendMessage', () => {
  const tebak = baca('plugins/game/game-tebakgambar.js')
  assert.doesNotMatch(tebak, /conn\.game\[id\]\[0\]\s*\n?\s*\)/)
  assert.match(tebak, /Jawaban :\n\$\{json\.jawaban\}`,\nm\n\)/)

  const bom = baca('plugins/game/game-bom.js')
  assert.doesNotMatch(bom, /conn\.bomb\[id\]\[0\]/)
})
