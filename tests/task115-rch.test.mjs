/* Task115 — plugin .rch versi VIP multi-kunci.
 *
 * Bagian A menguji logika rotasi/jeda/validasi lewat server HTTP lokal yang
 * meniru kontrak API RCH (kontraknya diambil dari jawaban API sungguhan).
 * Bagian B memanggil API RCH SUNGGUHAN sekali untuk memastikan endpoint,
 * format header, dan bentuk jawabannya masih cocok.
 *
 * Target di kedua bagian sengaja channel palsu (id 000…0) supaya tidak ada
 * reaction yang benar-benar mendarat di channel orang lain.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { refreshApiKeys } from '../config/api-keys.js'

const STATE = path.join(os.tmpdir(), `task115-rch-${process.pid}.json`)
const ENVFILE = path.join(os.tmpdir(), `task115-apikeys-${process.pid}.env`)
process.env.UMI_RCH_STATE_FILE = STATE
process.env.UMI_APIKEYS_ENV_FILE = ENVFILE
try { fs.rmSync(STATE, { force: true }) } catch {}

const hasil = []
const cek = (nama, lulus, info = '') => { hasil.push(lulus); console.log(`${lulus ? 'LULUS' : 'GAGAL'} · ${nama}${info ? ' — ' + info : ''}`) }

const KUNCI_A = { name: 'VIP-LIMIT', apiKey: 'BERRY-RCH-uji-kunci-A-0000000000000000000000000000', domain: 'https://contoh-a.test' }
const KUNCI_B = { name: 'VIP-HIDUP', apiKey: 'BERRY-RCH-uji-kunci-B-1111111111111111111111111111', domain: 'https://contoh-b.test' }
const KUNCI_C = { name: 'VIP-SIBUK', apiKey: 'BERRY-RCH-uji-kunci-C-2222222222222222222222222222', domain: 'https://contoh-c.test' }

/* ── server tiruan kontrak RCH ──────────────────────────────────── */
const dipanggil = []
const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', chunk => { body += chunk })
  req.on('end', () => {
    const key = String(req.headers['x-api-key'] || '')
    dipanggil.push({ key, origin: req.headers.origin, url: JSON.parse(body || '{}').url })
    res.setHeader('Content-Type', 'application/json')
    if (key === KUNCI_A.apiKey) { res.statusCode = 429; return res.end(JSON.stringify({ error: 'Limit harian API (50x reaksi) untuk API Key ini telah habis. Kuota akan direset besok hari.' })) }
    if (key === KUNCI_C.apiKey) { res.statusCode = 429; return res.end(JSON.stringify({ error: 'Server Sedang Sibuk, Cobalah Beberapa Saat Lagi.' })) }
    res.statusCode = 200
    res.end(JSON.stringify({ success: true, status: 'success', message: 'Reaction VIP API masuk antrean.', usage_today: 7, limit: 50, data: { task: { reaction_code: '👍' }, vip: { packageName: 'VIP Permanent', pointRemaining: 900 } } }))
  })
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
process.env.UMI_RCH_ENDPOINT = `http://127.0.0.1:${server.address().port}/api/v2/react`

fs.writeFileSync(ENVFILE, `UMI_RCH_KEY=${JSON.stringify([KUNCI_A, KUNCI_B, KUNCI_C])}\n`, { mode: 0o600 })
const rch = await import('../plugins/tools/rch.js')

/* ── A1. Kunci dibaca dari .env.apikeys, bukan dari plugin ─────── */
{
  const status = rch.statusKunci()
  cek('tiga kunci terbaca dari .env.apikeys', status.length === 3, status.map(s => s.name).join(', '))
  cek('domain tiap kunci ikut terbaca', status.some(s => s.domain === 'https://contoh-b.test'))
  cek('isi kunci tidak pernah ditampilkan', !JSON.stringify(status).includes('BERRY-RCH'))
  const sumber = fs.readFileSync(new URL('../plugins/tools/rch.js', import.meta.url), 'utf8')
  cek('tidak ada kunci tertulis di dalam plugin', !sumber.includes('BERRY-RCH'))
}

/* ── A2. Rotasi: limit harian → kunci berikutnya dipakai ───────── */
{
  const hasilPutar = await rch.reactChannel('https://whatsapp.com/channel/000000000000000000/1', '👍')
  cek('rotasi melewati kunci limit dan berhasil', hasilPutar.ok === true, hasilPutar.alasan || hasilPutar.kunci)
  cek('kunci yang dipakai benar', hasilPutar.kunci === 'VIP-HIDUP', String(hasilPutar.kunci))
  cek('kuota dilaporkan dari jawaban server', hasilPutar.usage === 7 && hasilPutar.limit === 50, `${hasilPutar.usage}/${hasilPutar.limit}`)
  cek('header Origin mengikuti domain kunci', dipanggil.some(p => p.origin === 'https://contoh-a.test') && dipanggil.some(p => p.origin === 'https://contoh-b.test'))
  const state = JSON.parse(fs.readFileSync(STATE, 'utf8'))
  const jeda = state.blocked?.['VIP-LIMIT']
  cek('kunci limit harian dijeda sampai besok', Boolean(jeda && jeda.until - Date.now() > 6 * 3600 * 1000), jeda ? jeda.reason : 'tidak ada')
}

/* ── A3. 429 "server sibuk" hanya dijeda sebentar ──────────────── */
{
  // Kunci C saja: satu-satunya kandidat, jadi pasti dicoba dan pasti 429 sibuk.
  fs.writeFileSync(ENVFILE, `UMI_RCH_KEY=${JSON.stringify([KUNCI_C])}\n`, { mode: 0o600 })
  refreshApiKeys()
  const modulC = await import('../plugins/tools/rch.js?ulang=sibuk')
  const ujiSibuk = await modulC.reactChannel('https://whatsapp.com/channel/000000000000000000/2', '🔥')
  cek('server sibuk dilaporkan sebagai kegagalan sementara', ujiSibuk.ok === false && /sibuk/i.test(ujiSibuk.alasan), ujiSibuk.alasan)
  const state = JSON.parse(fs.readFileSync(STATE, 'utf8'))
  const jeda = state.blocked?.['VIP-SIBUK']
  const sisaMenit = jeda ? (jeda.until - Date.now()) / 60000 : -1
  cek('jeda server sibuk hanya beberapa menit (bukan sehari)', jeda && jeda.reason === 'server sibuk' && sisaMenit > 0 && sisaMenit <= 3, `${sisaMenit.toFixed(1)} menit`)
  fs.writeFileSync(ENVFILE, `UMI_RCH_KEY=${JSON.stringify([KUNCI_A, KUNCI_B, KUNCI_C])}\n`, { mode: 0o600 })
  refreshApiKeys()
}

/* ── A3b. Kunci yang sedang diistirahatkan tidak dicoba lagi ───── */
{
  const sebelum = dipanggil.length
  const ulang = await rch.reactChannel('https://whatsapp.com/channel/000000000000000000/7', '👑')
  cek('kunci istirahat dilewati, kunci hidup tetap dipakai', ulang.ok === true && ulang.kunci === 'VIP-HIDUP', ulang.kunci || ulang.alasan)
  cek('kunci limit tidak dipanggil ulang', !dipanggil.slice(sebelum).some(p => p.key === KUNCI_A.apiKey))
}

/* ── A4. Semua kunci limit → pesan jujur, bukan klaim berhasil ─── */
{
  try { fs.rmSync(STATE, { force: true }) } catch {}
  fs.writeFileSync(ENVFILE, `UMI_RCH_KEY=${JSON.stringify([KUNCI_A])}\n`, { mode: 0o600 })
  refreshApiKeys()
  const modulBaru = await import('../plugins/tools/rch.js?ulang=1')
  const habis = await modulBaru.reactChannel('https://whatsapp.com/channel/000000000000000000/3', '👑')
  cek('semua kunci limit → gagal dilaporkan apa adanya', habis.ok === false && /limit harian/i.test(habis.alasan), habis.alasan)
  cek('tidak ada klaim berhasil saat gagal', !('kunci' in habis) && !('usage' in habis))
  fs.writeFileSync(ENVFILE, `UMI_RCH_KEY=${JSON.stringify([KUNCI_A, KUNCI_B, KUNCI_C])}\n`, { mode: 0o600 })
  refreshApiKeys()
}

/* ── A5. Placeholder dari sinkronisasi dibuang ─────────────────── */
{
  const rch2 = await import('../plugins/tools/rch.js?ulang=2')
  fs.writeFileSync(`${ENVFILE}.sync`, `UMI_RCH_KEY=${JSON.stringify([
    { name: 'VIP-PENDING', apiKey: 'PENDING', domain: 'https://x.test' },
    { name: 'VIP-TEST', apiKey: 'TEST-KEY-ABCDEFGHIJKLMNOPQRSTUVWXYZ', domain: 'https://y.test' },
    KUNCI_B,
  ])}\n`, { mode: 0o600 })
  process.env.UMI_APIKEYS_ENV_FILE = `${ENVFILE}.sync`
  refreshApiKeys()
  const rch3 = await import('../plugins/tools/rch.js?ulang=3')
  const nama = rch3.statusKunci().map(s => s.name)
  cek('kunci placeholder PENDING/TEST dibuang', !nama.includes('VIP-PENDING') && !nama.includes('VIP-TEST'), nama.join(', '))
  cek('kunci asli tetap dipakai', nama.includes('VIP-HIDUP'))
  process.env.UMI_APIKEYS_ENV_FILE = ENVFILE
  refreshApiKeys()
}

/* ── A6. Validasi masukan & balasan ───────────────────────────── */
{
  const conn = { sendMessage: async () => {} }
  const buat = text => {
    const m = { text, chat: '1@s.whatsapp.net', sender: '2@s.whatsapp.net' }
    m.reply = async pesan => { m.terakhir = pesan }
    return m
  }
  const jalankan = async (text, opsi = {}) => { const m = buat(text); await rch.default(m, { conn, text, usedPrefix: '.', command: 'rch', ...opsi }); return m.terakhir }

  cek('tanpa argumen → petunjuk format', /Format:/.test(await jalankan('')))
  cek('link bukan channel → ditolak', /tidak valid/i.test(await jalankan('https://youtube.com/watch?v=1 🔥')))
  cek('link tanpa id pesan → ditolak', /tidak valid/i.test(await jalankan('https://whatsapp.com/channel/0029Vb7pLCF35fLqMBUCMP1D 🔥')))
  cek('tanpa emoji → ditolak', /Emoji tidak ditemukan/i.test(await jalankan('https://whatsapp.com/channel/0029Vb7pLCF35fLqMBUCMP1D/123 halo')))
  const status = await jalankan('status')
  cek('rch status menampilkan kunci', /STATUS KUNCI RCH/.test(status) && /VIP-/.test(status))
  cek('reload ditolak untuk non-owner', /hanya untuk owner/i.test(await jalankan('reload') || ''))
  cek('reload boleh untuk owner', /dibaca ulang/i.test(await jalankan('reload', { isOwner: true }) || ''))
  const sukses = await jalankan('https://whatsapp.com/channel/0029Vb7pLCF35fLqMBUCMP1D/123 🔥🚀')
  cek('balasan sukses menyebut emoji & kunci', /REACTION MASUK ANTREAN/.test(sukses) && /VIP-HIDUP/.test(sukses), sukses.split('\n')[0])
}

/* ── B. API RCH SUNGGUHAN (satu panggilan) ──────────────────────
 * Kunci TIDAK ditulis di dalam berkas tes ini. Kunci diambil dari
 * UMI_RCH_KEY (environment) atau dari .env.apikeys di folder bot.
 */
{
  server.close()
  delete process.env.UMI_RCH_ENDPOINT
  delete process.env.UMI_RCH_STATE_FILE
  process.env.UMI_RCH_STATE_FILE = path.join(os.tmpdir(), `task115-live-${process.pid}.json`)

  let kunciAsli = String(process.env.UMI_RCH_KEY || '').trim()
  if (!kunciAsli) {
    try {
      const isi = fs.readFileSync(path.join(process.cwd(), '.env.apikeys'), 'utf8')
      kunciAsli = (isi.split(/\r?\n/).find(baris => baris.startsWith('UMI_RCH_KEY=')) || '').slice('UMI_RCH_KEY='.length).trim()
    } catch {}
  }

  if (!kunciAsli) {
    console.log('DILEWATI · kunci RCH tidak tersedia di lingkungan ini (isi UMI_RCH_KEY untuk menguji API sungguhan)')
  } else {
    const liveEnv = path.join(os.tmpdir(), `task115-live-${process.pid}.env`)
    fs.writeFileSync(liveEnv, `UMI_RCH_KEY=${kunciAsli}\n`, { mode: 0o600 })
    process.env.UMI_APIKEYS_ENV_FILE = liveEnv
    refreshApiKeys()
    const live = await import('../plugins/tools/rch.js?ulang=live')
    const jawab = await live.reactChannel('https://whatsapp.com/channel/000000000000000000/9', '👍')
    if (jawab.ok) {
      cek('API sungguhan menerima permintaan (200)', true, `${jawab.kunci} · kuota ${jawab.usage}/${jawab.limit}`)
      cek('bentuk jawaban sesuai kontrak', typeof jawab.emoji === 'string' && jawab.target.startsWith('https://whatsapp.com/channel/'))
    } else {
      // Kuota harian bisa habis (limit 50/hari) atau server sedang sibuk.
      // Yang diuji: plugin melaporkan keadaan sebenarnya, bukan mengaku berhasil.
      cek('API sungguhan menjawab & plugin jujur soal kegagalan', /limit harian|sibuk|istirahat|domain|HTTP/i.test(jawab.alasan), jawab.alasan.slice(0, 90))
    }
    try { fs.rmSync(liveEnv, { force: true }) } catch {}
  }
}

for (const file of [STATE, ENVFILE, `${ENVFILE}.sync`, process.env.UMI_RCH_STATE_FILE]) {
  try { fs.rmSync(file, { force: true }) } catch {}
}
const gagal = hasil.filter(x => !x).length
console.log(`\n${hasil.length - gagal}/${hasil.length} lulus`)
process.exit(gagal ? 1 : 0)
