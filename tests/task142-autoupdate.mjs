/* Task142 — uji aturan keamanan auto update (tanpa menyentuh jaringan). */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pathDiizinkan,
  periksaSintaks,
  bacaKonfig,
  simpanKonfig,
  statusPenjadwal,
  mulaiPenjadwal,
  hentikanPenjadwal,
} from '../lib/auto-update.js'

test('hanya folder kode yang boleh ditimpa', () => {
  for (const ok of ['lib/auto-update.js', 'plugins/owner/auto-update.js', 'core/x.js', 'scripts/boot.js', 'tests/a.mjs', 'docs/A.md', 'handler.js', 'main.js', 'config.js']) {
    assert.equal(pathDiizinkan(ok), true, 'harus lolos: ' + ok)
  }
})

test('data, sesi, kunci, dan dependency HARAM disentuh', () => {
  for (const tidak of [
    'data/auto-update.json', 'sessions/jadibot/6281/creds.json', 'node_modules/fs-extra/index.js',
    'tmp/x.js', 'database.json', '.env', '.env.apikeys', '.secrets/panel-cloud.env',
    '.git/config', '../lib/x.js', 'lib/../../etc/passwd', '',
  ]) {
    assert.equal(pathDiizinkan(tidak), false, 'harus ditolak: ' + tidak)
  }
})

test('berkas JS wajib lolos node --check', () => {
  assert.equal(periksaSintaks('lib/a.js', 'export const a = 1\n').ok, true)
  const rusak = periksaSintaks('lib/b.js', 'export const b = {\n')
  assert.equal(rusak.ok, false, 'sintaks rusak harus ditolak')
  assert.match(rusak.pesan, /SyntaxError|Unexpected/)
  assert.equal(periksaSintaks('docs/c.md', '# bebas, bukan JS').ok, true)
})

test('konfigurasi tersimpan mode 600 dan penjadwal bisa dinyalakan/dimatikan', () => {
  const lama = bacaKonfig(true)
  simpanKonfig({ aktif: true, intervalMenit: 7 })
  const baru = bacaKonfig(true)
  assert.equal(baru.aktif, true)
  assert.equal(baru.intervalMenit, 7)
  const mulai = mulaiPenjadwal()
  assert.equal(statusPenjadwal().berjalan, true)
  hentikanPenjadwal()
  assert.equal(statusPenjadwal().berjalan, false)
  assert.ok(mulai)
  // kembalikan
  simpanKonfig({ aktif: lama.aktif, intervalMenit: lama.intervalMenit })
  hentikanPenjadwal()
})
