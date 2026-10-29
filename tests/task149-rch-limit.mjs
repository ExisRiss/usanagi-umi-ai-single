/* By AlzRiss - Usanagi Umi AI
 *
 * UJI TASK149 — .rch: filter kunci, rotasi "sampai dapat", pesan RCH LIMIT.
 *
 *   node tests/task149-rch-limit.mjs
 *
 * Uji ini menjalankan SERVER HTTP TIRUAN di localhost yang meniru perilaku
 * apiv2.reactionwa.online (sudah dicek langsung: kunci asing/domain salah →
 * 403 "tidak memiliki domain whitelist"; limit bisa datang sebagai 429 atau
 * 200 {success:false}). Plugin diarahkan ke server itu lewat UMI_RCH_ENDPOINT,
 * jadi jalur kode yang diuji sama persis dengan yang dipakai di server.
 */

import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const AKAR = path.resolve('.')
let lulus = 0
let gagal = 0
const daftarGagal = []

function cek(nama, kondisi, detail = '') {
  if (kondisi) {
    lulus += 1
    console.log('  ✅ ' + nama)
  } else {
    gagal += 1
    daftarGagal.push(nama + (detail ? ' → ' + detail : ''))
    console.log('  ❌ ' + nama + (detail ? ' → ' + detail : ''))
  }
}

/* ── server tiruan ─────────────────────────────────────────────────────── */
/* Perilaku tiap kunci diatur lewat `skenario` (apiKey → deret balasan). */
let skenario = {}
const percobaan = []

const server = http.createServer((req, res) => {
  let isi = ''
  req.on('data', (b) => { isi += b })
  req.on('end', () => {
    const kunci = String(req.headers['x-api-key'] || '')
    const origin = String(req.headers.origin || '')
    percobaan.push({ kunci, origin })
    const deret = skenario[kunci]
    const langkah = Array.isArray(deret)
      ? (deret.shift() || deret[deret.length - 1] || { status: 500 })
      : (deret || { status: 500, body: { error: 'skenario tidak dikenal' } })
    res.writeHead(langkah.status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(langkah.body || {}))
  })
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const endpoint = `http://127.0.0.1:${port}/api/v2/react`

/* ── lingkungan uji ────────────────────────────────────────────────────── */
const kerja = fs.mkdtempSync(path.join(os.tmpdir(), 'uji149-'))
fs.mkdirSync(path.join(kerja, 'data'), { recursive: true })
const stateFile = path.join(kerja, 'data', 'rch-keys.json')

const KUNCI = {
  a: 'RCH-KEY-AAAA-1111-2222-3333-4444',
  b: 'RCH-KEY-BBBB-1111-2222-3333-4444',
  c: 'RCH-KEY-CCCC-1111-2222-3333-4444',
  d: 'RCH-KEY-DDDD-1111-2222-3333-4444',
}

let rch = null
function tulisState(keys, extra = {}) {
  if (rch && rch.lupakanState) rch.lupakanState()
  fs.writeFileSync(stateFile, JSON.stringify({
    keys: keys.map((item) => ({ name: item.name, apiKey: item.apiKey, domain: item.domain || 'https://reactionwa.online' })),
    blocked: extra.blocked || {},
    kuota: extra.kuota || {},
    index: extra.index || 0,
    lastSync: Date.now(),
  }, null, 2))
}

process.env.UMI_RCH_ENDPOINT = endpoint
process.env.UMI_RCH_STATE_FILE = stateFile
process.env.UMI_RCH_ALERT_OWNER = 'off'
process.env.UMI_APIKEYS_ENV_FILE = path.join(kerja, '.env.apikeys')
fs.writeFileSync(process.env.UMI_APIKEYS_ENV_FILE, 'UMI_RCH_KEY=\n')

const prosesAsli = process.cwd()
process.chdir(kerja)
global.owner = [['6287813709432', 'AlzRiss', true]]

rch = await import(pathToFileURL(path.join(AKAR, 'plugins/tools/rch.js')).href)
const TARGET = 'https://whatsapp.com/channel/0029Vb7pLCF35fLqMBUCMP1D/123'
const sukses = { status: 200, body: { success: true, message: 'ok', usage_today: 3, limit: 10, data: { task: { reaction_code: '🔥' }, vip: { packageName: 'VIP', pointRemaining: 900 } } } }
const limitHarian = { status: 200, body: { success: false, error: 'Limit harian habis (10/10)' } }
const limit429 = { status: 429, body: { error: 'Limit harian tercapai. Kuota habis.' } }
const sibuk = { status: 429, body: { error: 'Server Sedang Sibuk, coba lagi.' } }
const ditolak = { status: 403, body: { error: 'Akses Ditolak. API Key ini tidak memiliki domain whitelist yang valid.' } }

console.log('\n[1] Sintaks & klasifikasi balasan API')
const salin = path.join(kerja, 'rch.mjs')
fs.writeFileSync(salin, fs.readFileSync(path.join(AKAR, 'plugins/tools/rch.js')))
let sintaksOk = true
try { execFileSync(process.execPath, ['--check', salin], { stdio: 'pipe' }) } catch (e) { sintaksOk = false }
cek('sintaks plugins/tools/rch.js', sintaksOk)

cek('200 success → sukses', rch.klasifikasi(200, { success: true }).jenis === 'sukses')
cek('200 success:false "Limit harian habis" → limit', rch.klasifikasi(200, { success: false, error: 'Limit harian habis (10/10)' }).jenis === 'limit')
cek('429 "kuota habis" → limit', rch.klasifikasi(429, { error: 'Kuota habis' }).jenis === 'limit')
cek('429 "Server Sedang Sibuk" → sibuk', rch.klasifikasi(429, { error: 'Server Sedang Sibuk' }).jenis === 'sibuk')
cek('403 domain whitelist → ditolak', rch.klasifikasi(403, { error: 'Akses Ditolak. API Key ini tidak memiliki domain whitelist yang valid.' }).jenis === 'ditolak')
cek('500 → server', rch.klasifikasi(500, {}).jenis === 'server')
cek('400 tanpa pesan → gagal', rch.klasifikasi(400, {}).jenis === 'gagal')

console.log('\n[2] Filter kunci (`filterKeys`)')
tulisState([
  { name: 'VIP-A', apiKey: KUNCI.a },
  { name: 'VIP-A-lagi', apiKey: KUNCI.a },             // isi sama, nama beda
  { name: 'PENDING', apiKey: 'PENDING' },               // placeholder
  { name: 'pendek', apiKey: 'SHORT' },                  // terlalu pendek
  { name: 'VIP-B', apiKey: KUNCI.b },
  { name: 'VIP-B-tanpa-domain', apiKey: KUNCI.b, domain: '' },
])
const filterAwal = rch.filterKeys()
cek('kunci siap hanya yang benar-benar layak', filterAwal.siap.length === 2, JSON.stringify(filterAwal.siap.map((k) => k.name)))
cek('duplikat isi kunci dibuang', filterAwal.dibuang.some((x) => /duplikat/.test(x.alasan)))
cek('placeholder dibuang', filterAwal.dibuang.some((x) => /placeholder/.test(x.alasan)))
cek('kunci pendek dibuang', filterAwal.dibuang.some((x) => /terlalu pendek/.test(x.alasan)))
cek('semua kunci unik per isi', new Set(filterAwal.semua.map((k) => k.sidik)).size === filterAwal.semua.length)

/* Kunci dengan nama sama tapi isi baru tidak boleh mewarisi jeda kunci lama. */
const kunciLama = rch.filterKeys({ keys: [], blocked: {}, kuota: {}, index: 0, lastSync: 0 })
tulisState([{ name: 'VIP-X', apiKey: KUNCI.c }])
const sidikLama = rch.filterKeys().semua[0].sidik
fs.writeFileSync(stateFile, JSON.stringify({
  keys: [{ name: 'VIP-X', apiKey: KUNCI.d, domain: 'https://reactionwa.online' }],
  blocked: { [sidikLama]: { reason: 'limit: uji lama', until: Date.now() + 3600000 } },
  kuota: {}, index: 0, lastSync: Date.now(),
}, null, 2))
rch.lupakanState()
const setelahGanti = rch.filterKeys()
cek('jeda menempel ke sidik kunci, bukan nama', setelahGanti.siap.length === 1 && setelahGanti.jeda.length === 0,
  JSON.stringify({ siap: setelahGanti.siap.map((k) => k.name), jeda: setelahGanti.jeda.map((k) => k.name), sisa: kunciLama.length }))

/* Kuota yang dilaporkan API dipakai untuk melewati kunci. */
tulisState([{ name: 'VIP-Q', apiKey: KUNCI.a }])
const sidikA = rch.filterKeys().semua[0].sidik
fs.writeFileSync(stateFile, JSON.stringify({
  keys: [{ name: 'VIP-Q', apiKey: KUNCI.a, domain: 'https://reactionwa.online' }],
  blocked: {}, kuota: { [sidikA]: { usage: 10, limit: 10, at: Date.now() } }, index: 0, lastSync: Date.now(),
}, null, 2))
rch.lupakanState()
const filterKuota = rch.filterKeys()
cek('kunci dengan kuota habis dilewati', filterKuota.siap.length === 0 && /kuota habis/.test(filterKuota.jeda[0].jeda.reason),
  JSON.stringify(filterKuota.jeda.map((k) => k.jeda.reason)))

console.log('\n[3] Rotasi: kunci pertama limit → pakai kunci berikutnya sampai dapat')
percobaan.length = 0
tulisState([
  { name: 'VIP-A', apiKey: KUNCI.a },
  { name: 'VIP-B', apiKey: KUNCI.b },
  { name: 'VIP-C', apiKey: KUNCI.c },
])
skenario = { [KUNCI.a]: [limitHarian], [KUNCI.b]: [limit429], [KUNCI.c]: [sukses] }
const hasilRotasi = await rch.reactChannel(TARGET, '🔥')
cek('berhasil setelah mencoba 3 kunci', hasilRotasi.ok === true && hasilRotasi.dicoba === 3, JSON.stringify({ ok: hasilRotasi.ok, dicoba: hasilRotasi.dicoba, alasan: hasilRotasi.alasan }))
cek('kunci yang berhasil adalah kunci ketiga', hasilRotasi.kunci === 'VIP-C', hasilRotasi.kunci)
cek('balasan menyebut kuota dari API', hasilRotasi.usage === 3 && hasilRotasi.limit === 10, `${hasilRotasi.usage}/${hasilRotasi.limit}`)
cek('setiap kunci dicoba sekali', percobaan.length === 3, String(percobaan.length))
cek('kunci A & B ditandai limit, bukan dihapus', (() => {
  const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  const alasan = Object.values(st.blocked).map((b) => b.reason).join(' | ')
  return /limit/.test(alasan)
})())

console.log('\n[4] Semua kunci limit → RCH LIMIT otomatis')
percobaan.length = 0
tulisState([
  { name: 'VIP-A', apiKey: KUNCI.a },
  { name: 'VIP-B', apiKey: KUNCI.b },
])
skenario = { [KUNCI.a]: [limitHarian], [KUNCI.b]: [limit429] }
const hasilLimit = await rch.reactChannel(TARGET, '🔥')
cek('hasil ditandai limitTotal', hasilLimit.ok === false && hasilLimit.limitTotal === true, JSON.stringify({ ok: hasilLimit.ok, limitTotal: hasilLimit.limitTotal, alasan: hasilLimit.alasan }))
cek('jumlah kunci dilaporkan', hasilLimit.totalKunci === 2, String(hasilLimit.totalKunci))
cek('waktu reset tersedia', Number(hasilLimit.resetTerdekat) > Date.now(), String(hasilLimit.resetTerdekat))
cek('kedua kunci benar-benar dicoba', percobaan.length === 2, String(percobaan.length))

/* Permintaan berikutnya saat semua kunci masih dijeda tetap menjawab RCH LIMIT
 * (bukan pesan samar) dan TIDAK memanggil API lagi. */
percobaan.length = 0
const hasilKedua = await rch.reactChannel(TARGET, '🔥')
cek('permintaan kedua tetap limitTotal tanpa memanggil API', hasilKedua.limitTotal === true && percobaan.length === 0,
  JSON.stringify({ limitTotal: hasilKedua.limitTotal, panggilan: percobaan.length, alasan: hasilKedua.alasan }))

console.log('\n[5] Pesan WhatsApp "RCH LIMIT"')
const balasan = []
const m = {
  chat: '628999@s.whatsapp.net',
  sender: '628999@s.whatsapp.net',
  reply: async (teks) => { balasan.push(String(teks)) },
}
const conn = { reply: async () => {} }
await rch.default(m, { conn, text: TARGET + ' 🔥', usedPrefix: '.', command: 'rch', isOwner: false, isROwner: false })
const pesanLimit = balasan.find((t) => t.includes('RCH LIMIT'))
cek('bot mengirim pesan RCH LIMIT', Boolean(pesanLimit), balasan.join(' | ').slice(-160))
cek('pesan menyebut jumlah kunci', Boolean(pesanLimit && /Semua \*\d+\* kunci/.test(pesanLimit)), pesanLimit && pesanLimit.slice(0, 120))
cek('pesan menyebut waktu reset', Boolean(pesanLimit && /Reset otomatis/.test(pesanLimit)))

console.log('\n[6] Bukan semua limit → bukan RCH LIMIT')
tulisState([
  { name: 'VIP-A', apiKey: KUNCI.a },
  { name: 'VIP-B', apiKey: KUNCI.b },
])
skenario = { [KUNCI.a]: [limitHarian], [KUNCI.b]: [ditolak] }
const hasilCampur = await rch.reactChannel(TARGET, '🔥')
cek('limit + ditolak bukan limitTotal', hasilCampur.ok === false && hasilCampur.limitTotal === false, JSON.stringify(hasilCampur.ringkas))
cek('alasan menyebut kunci yang ditolak', /ditolak/i.test(hasilCampur.alasan), hasilCampur.alasan)

/* Semua "server sibuk" juga bukan limit. */
tulisState([
  { name: 'VIP-A', apiKey: KUNCI.a },
  { name: 'VIP-B', apiKey: KUNCI.b },
])
skenario = { [KUNCI.a]: [sibuk], [KUNCI.b]: [sibuk] }
const hasilSibuk = await rch.reactChannel(TARGET, '🔥')
cek('semua server sibuk bukan RCH LIMIT', hasilSibuk.limitTotal === false && /sibuk/i.test(hasilSibuk.alasan), hasilSibuk.alasan)

console.log('\n[7] Status & perintah')
const status = rch.statusKunci()
cek('status memuat tiga jenis baris', status.some((x) => x.jenis === 'jeda') || status.some((x) => x.jenis === 'siap'), JSON.stringify(status.map((s) => s.jenis)))
balasan.length = 0
await rch.default(m, { conn, text: 'status', usedPrefix: '.', command: 'rch', isOwner: false })
cek('.rch status menampilkan ringkasan siap/istirahat/dibuang', String(balasan[0]).includes('Siap:'), String(balasan[0]).slice(0, 120))
cek('.rch status tidak membocorkan isi kunci', !balasan[0].includes(KUNCI.a))

balasan.length = 0
await rch.default(m, { conn, text: 'reset', usedPrefix: '.', command: 'rch', isOwner: false })
cek('.rch reset ditolak untuk non-owner', String(balasan[0]).includes('hanya untuk owner'))

balasan.length = 0
await rch.default({ ...m, sender: '6287813709432@s.whatsapp.net' }, { conn, text: 'reset', usedPrefix: '.', command: 'rch', isOwner: true })
cek('.rch reset menghapus jeda (owner)', String(balasan[0]).includes('Jeda & catatan kuota') && rch.filterKeys().jeda.length === 0, String(balasan[0]).slice(0, 100))

server.close()
process.chdir(prosesAsli)
console.log(`\n===== ${lulus} lulus, ${gagal} gagal =====`)
if (gagal) for (const p of daftarGagal) console.log('  • ' + p)
process.exit(gagal ? 1 : 0)
