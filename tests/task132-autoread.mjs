/* Task132 — autoread per sesi jadibot.
 *
 * Membuktikan tiga hal pada modul yang benar-benar dipakai server:
 *   1. setiap sesi punya nilainya sendiri (tidak saling menimpa),
 *   2. setelan tersimpan di `global.db.data.settings[<jid>].autoread`
 *      — tempat yang dibaca handler.js saat pesan masuk,
 *   3. input salah ditolak dengan pesan jelas, bukan diterima diam-diam.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { bacaAutoread, tulisAutoread, jidSesi, normalNomor } = await import(
  path.join(AKAR, 'lib/jadibot-session-autoread.js')
)

function siapkanDb() {
  const ditulis = []
  global.db = {
    data: { settings: {} },
    write: async () => { ditulis.push(Date.now()) },
  }
  return ditulis
}

test('jidSesi & normalNomor merapikan nomor apa pun', () => {
  assert.equal(jidSesi('+62 812-3456-7890'), '6281234567890@s.whatsapp.net')
  assert.equal(jidSesi('6281234567890@s.whatsapp.net'), '6281234567890@s.whatsapp.net')
  assert.equal(jidSesi(''), '')
  assert.equal(normalNomor(null), '')
})

test('autoread default mati dan tersimpan per sesi', () => {
  const ditulis = siapkanDb()
  assert.equal(bacaAutoread('628111'), false, 'default harus mati')

  tulisAutoread('628111', true)
  assert.equal(bacaAutoread('628111'), true)
  assert.equal(global.db.data.settings['628111@s.whatsapp.net'].autoread, true)
  assert.equal(ditulis.length, 1, 'database harus ditulis')

  // Sesi lain tidak boleh ikut menyala.
  assert.equal(bacaAutoread('628222'), false)
  tulisAutoread('628222', true)
  assert.equal(bacaAutoread('628111'), true)
  assert.equal(bacaAutoread('628222'), true)

  tulisAutoread('628111', false)
  assert.equal(bacaAutoread('628111'), false, 'bisa dimatikan lagi')
  assert.equal(bacaAutoread('628222'), true, 'sesi lain tetap menyala')
})

test('database belum siap → error 503, bukan diam-diam gagal', () => {
  delete global.db
  assert.equal(bacaAutoread('628111'), false)
  assert.throws(() => tulisAutoread('628111', true), (error) => error.status === 503)
})

test('nomor kosong ditolak', () => {
  siapkanDb()
  assert.throws(() => tulisAutoread('', true), (error) => error.status === 400)
})

test('server memakai modul ini (bukan salinan lain)', async () => {
  const fs = await import('node:fs')
  const sumber = fs.readFileSync(path.join(AKAR, 'lib/jadibot-platform-api.js'), 'utf8')
  assert.match(sumber, /import \{ bacaAutoread, tulisAutoread \} from '\.\/jadibot-session-autoread\.js'/)
  assert.match(sumber, /autoread: bacaAutoread\(profile\.number\)/)
  assert.match(sumber, /tulisAutoread\(profile\.number, input\.autoread\)/)
  // Perubahan autoread saja tidak boleh memicu restart sesi.
  assert.match(sumber, /'session_id', 'auto_ai', 'autoread'/)
})
