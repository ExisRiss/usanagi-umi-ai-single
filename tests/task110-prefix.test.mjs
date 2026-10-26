/* Task110 — handler.js memakai lib/prefix-detect.js; pastikan modul itu
   benar-benar ada, bisa diimpor, dan berperilaku wajar. Sebelumnya berkas
   ini tidak ikut ter-deploy sehingga bot gagal boot setelah restart. */
import { detectAlternatePrefix, isKnownCommand, FALLBACK_PREFIXES } from '../lib/prefix-detect.js'
import fs from 'node:fs'

const hasil = []
const cek = (n, l, i = '') => { hasil.push(l); console.log(`${l ? 'LULUS' : 'GAGAL'} · ${n}${i ? ' — ' + i : ''}`) }

cek('berkas ada di repo', fs.existsSync(new URL('../lib/prefix-detect.js', import.meta.url).pathname))

const plugins = {
  'plugins/fun/usanagi-dimana.js': { command: /^(dimana|where|mana)$/i },
  'plugins/info/menu.js': { command: ['menu', 'help'] },
}

cek('nama perintah dikenali (string)', isKnownCommand('menu', plugins) === true)
cek('nama perintah dikenali (regex)', isKnownCommand('mana', plugins) === true)
cek('kata acak tidak dianggap perintah', isKnownCommand('halo-dunia-xyz', plugins) === false)

cek('pesan dengan prefix aktif → tidak dianggap nyasar', detectAlternatePrefix('!menu', plugins, '!') === '')
cek('prefix lain tapi perintah valid → terdeteksi', detectAlternatePrefix('.menu', plugins, '!') === '.')
cek('prefix lain dengan teks bukan perintah → diabaikan', detectAlternatePrefix('?halo semua', plugins, '!') === '')
cek('tanpa prefix → tidak terdeteksi', detectAlternatePrefix('menu', plugins, '.') === '')
cek('daftar prefix cadangan tersedia', Array.isArray(FALLBACK_PREFIXES) && FALLBACK_PREFIXES.includes('.'))

const gagal = hasil.filter(x => !x).length
console.log(`\n${hasil.length - gagal}/${hasil.length} lulus`)
process.exit(gagal ? 1 : 0)
