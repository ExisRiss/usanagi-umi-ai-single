/* Task110 — pesan error yang dilihat pengguna tidak boleh berupa teks mentah. */
import { describeError, errorReplyText } from '../lib/umi-error.js'
import { format } from 'node:util'

const hasil = []
const cek = (n, l, i = '') => { hasil.push(l); console.log(`${l ? 'LULUS' : 'GAGAL'} · ${n}${i ? ' — ' + i : ''}`) }

const kasus = [
  ['Error: forbidden', 'grup-terlarang'],
  ['ENOSPC: no space left on device, write', 'disk-penuh'],
  ['item-not-found', 'grup-tidak-ada'],
  ['API HTTP 401 Unauthorized: Invalid token', 'api-401'],
  ["ERROR: Sign in to confirm you're not a bot", 'youtube-blokir'],
  ['ENOENT: no such file or directory, open /x', 'berkas-hilang'],
]

for (const [pesan, harap] of kasus) {
  const e = Object.assign(new Error(pesan), /ENOSPC/.test(pesan) ? { code: 'ENOSPC' } : {})
  const r = describeError(e)
  cek(`"${pesan.slice(0, 34)}" → ${harap}`, r.kind === harap, r.kind)
  cek(`  …tidak memuat teks teknis mentah`, !/ENOSPC|forbidden|item-not-found|ENOENT|invalid token/i.test(r.text || ''), String(r.text).slice(0, 40))
}

// Error tak dikenal tetap memakai format lama (jangan menelan bug baru).
{
  const e = new Error('kesalahan tak terduga xyz')
  const teks = errorReplyText(e, format)
  cek('error tak dikenal → memakai format lama', /kesalahan tak terduga xyz/.test(teks), teks.slice(0, 40))
}

// describeError tidak boleh melempar untuk input aneh.
for (const aneh of [null, undefined, {}, 'teks', 0]) {
  let melempar = false
  try { describeError(aneh) } catch { melempar = true }
  cek(`describeError(${String(aneh)}) tidak melempar`, melempar === false)
}

const gagal = hasil.filter(x => !x).length
console.log(`\n${hasil.length - gagal}/${hasil.length} lulus`)
process.exit(gagal ? 1 : 0)
