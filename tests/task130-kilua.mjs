/* Tes Task130 — fitur Kilua (cek, quotes, stalk-github) + format plugin.
 * Jalankan: node --test tests/task130-kilua.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/* ── Conn tiruan: merekam semua pesan yang dikirim ───────────────────── */
function connTiruan() {
  const terkirim = []
  return {
    terkirim,
    async sendMessage(jid, isi, opsi) {
      terkirim.push({ jid, isi, opsi })
      return { key: { id: `MSG${terkirim.length}` } }
    },
    async getName() {
      return 'Alz Riss'
    },
    async profilePictureUrl() {
      throw new Error('tidak ada foto')
    },
  }
}

function pesan({ sender = '628111@s.whatsapp.net', text = '', pushName = 'Alz' } = {}) {
  return { chat: '628222-1@g.us', sender, text, pushName, mentionedJid: [], quoted: null }
}

/* ── CEK-CEKAN ───────────────────────────────────────────────────────── */
const cekMod = (await import('../plugins/fun/fun-cek130.js')).default
const cekLib = await import('../plugins/fun/fun-cek130.js')
const dataCek = await import('../lib/data-cek130.js')

const DAFTAR_CEK = ['cekgay', 'cekbego', 'cekdosa', 'cekharam', 'ceklesbi',
  'ceksadboy', 'ceksange', 'cekstres', 'cektolol', 'cekwatak', 'cekalim']

test('11 perintah cek baru terdaftar, tanpa kembar dengan plugin lama', () => {
  for (const k of DAFTAR_CEK) assert.ok(cekMod.command.test(k), `${k} harus cocok`)
  assert.ok(!cekMod.command.test('cekmotor'), 'perintah asing tidak boleh cocok')
  assert.ok(cekMod.command.test('sangecheck'), 'alias harus cocok')
  for (const kembar of ['cekbucin', 'cekjodoh', 'ceksial']) {
    assert.ok(!cekMod.command.test(kembar), `${kembar} sudah ada di repo, jangan didaftarkan`)
  }
})

test('11 kunci data cek: judul, 5 vonis, 5 kategori, warna', () => {
  const kunci = Object.keys(dataCek.CEK)
  assert.deepEqual(kunci.sort(), DAFTAR_CEK.slice().sort())
  for (const k of kunci) {
    const d = dataCek.CEK[k]
    assert.ok(d.judul.length > 3, `${k} judul`)
    assert.equal(d.vonis.length, 5, `${k} harus 5 tingkat`)
    assert.equal(d.kategori.length, 5, `${k} 5 label kategori`)
    assert.match(d.warna, /^#[0-9a-f]{6}$/i, `${k} warna`)
    for (const v of d.vonis) assert.ok(v.length > 10, `${k} vonis terlalu pendek: ${v}`)
    assert.equal(new Set(d.vonis).size, 5, `${k} ada vonis kembar`)
  }
  assert.equal(Object.values(dataCek.CEK).reduce((n, v) => n + v.vonis.length, 0), 55)
})

test('vonis tidak tercampur antar-plugin (bug arsip Kilua)', () => {
  // Di arsip Kilua, ceklesbi berisi teks sadboy, cekharam berisi teks jodoh, dsb.
  const larangan = {
    ceklesbi: /sadboy|bucin|mantan/i,
    ceksadboy: /lesbi|yuri|sange|knalpot/i,
    cekbego: /bucin|ayang|gombal/i,
    cekharam: /jodoh|nikah|gamon/i,
    cekgay: /einstein|bego|jenius/i,
    cekstres: /tolol|raja tolol/i,
    cektolol: /stres|gila|refreshing/i,
  }
  for (const [k, pola] of Object.entries(larangan)) {
    for (const v of dataCek.CEK[k].vonis) {
      assert.ok(!pola.test(v), `${k} masih memuat teks plugin lain: "${v}"`)
    }
  }
})

test('tingkat paling ringan dan paling ekstrem masuk akal', () => {
  assert.match(dataCek.CEK.cekgay.vonis[0], /lurus/i)
  assert.match(dataCek.CEK.cekgay.vonis[4], /gay level maksimal/i)
  assert.match(dataCek.CEK.cektolol.vonis[0], /pinter/i)
  assert.match(dataCek.CEK.cektolol.vonis[4], /raja tolol/i)
  assert.match(dataCek.CEK.ceksange.vonis[4], /knalpot/i)
  assert.match(dataCek.CEK.cekalim.vonis[4], /alim tingkat tinggi/i)
})

test('skor stabil: sama di hari yang sama, beda antar nama', () => {
  const a = cekLib.skorStabil('cekgay', 'Alz')
  const b = cekLib.skorStabil('cekgay', 'Alz')
  const c = cekLib.skorStabil('cekgay', 'Budi')
  assert.equal(a, b, 'nama sama → skor sama')
  assert.notEqual(a, c, 'nama beda → skor beda (uji satu contoh)')
  for (const n of ['a', 'Budi', 'Siti Nur', '@628123456789']) {
    const s = cekLib.skorStabil('cekbucin', n)
    assert.ok(s >= 0 && s <= 100, `skor dalam 0..100 (${n}=${s})`)
  }
})

test('pilihVonis selalu mengembalikan vonis sah', () => {
  for (let s = 0; s <= 100; s += 10) {
    const { vonis, kategori } = cekLib.pilihVonis('cekdosa', s)
    assert.ok(dataCek.CEK.cekdosa.vonis.includes(vonis), `skor ${s} → vonis dari daftar`)
    assert.ok(dataCek.CEK.cekdosa.kategori.includes(kategori))
  }
})

test('targetCek: tag, balas, nomor, dan diri sendiri', async () => {
  const conn = connTiruan()
  const tag = await cekLib.targetCek(
    { ...pesan(), mentionedJid: ['628333@s.whatsapp.net'], sender: '628111@s.whatsapp.net' },
    '',
    conn
  )
  assert.equal(tag.jid, '628333@s.whatsapp.net')

  const balas = await cekLib.targetCek(
    { ...pesan(), quoted: { sender: '628444@s.whatsapp.net' } },
    '',
    conn
  )
  assert.equal(balas.jid, '628444@s.whatsapp.net')

  const nomor = await cekLib.targetCek(pesan(), '0812-3456-789', conn)
  assert.equal(nomor.jid, '08123456789@s.whatsapp.net')

  const sendiri = await cekLib.targetCek(pesan(), '', conn)
  assert.equal(sendiri.jid, '628111@s.whatsapp.net')
  assert.ok(sendiri.nama.length > 0)
})

test('handler cek benar-benar mengirim foto + caption', async () => {
  const conn = connTiruan()
  const hasil = await cekMod(pesan(), {
    conn,
    command: 'cekgay',
    text: '',
    usedPrefix: '.',
    m: pesan(),
  })
  assert.equal(conn.terkirim.length, 1, 'harus kirim tepat satu pesan')
  const kirim = conn.terkirim[0]
  assert.ok(Buffer.isBuffer(kirim.isi.image), 'isi.image harus Buffer')
  assert.ok(kirim.isi.image.length > 10000, `PNG terlalu kecil: ${kirim.isi.image.length}`)
  assert.match(kirim.isi.caption, /CEK TINGKAT GAY/i)
  assert.match(kirim.isi.caption, /Skor\s+:\s+\d+%/)
  assert.match(kirim.isi.caption, /hiburan/i)
  assert.equal(hasil.ok, true)
})

test('semua perintah cek baru jalan tanpa error', async () => {
  for (const perintah of DAFTAR_CEK) {
    const conn = connTiruan()
    const hasil = await cekMod(pesan(), { conn, command: perintah, text: '', usedPrefix: '.', m: pesan() })
    assert.equal(hasil.ok, true, `${perintah} gagal`)
    assert.equal(conn.terkirim.length, 1, `${perintah} tidak mengirim pesan`)
    assert.ok(Buffer.isBuffer(conn.terkirim[0].isi.image), `${perintah} tidak mengirim gambar`)
  }
})

test('canvas tanpa emoji → tidak ada kotak tofu', async () => {
  const { tanpaEmoji } = await import('../lib/canvas-fun.js')
  assert.equal(tanpaEmoji('🌈 CEK TINGKAT GAY 🌈'), 'CEK TINGKAT GAY')
  assert.equal(tanpaEmoji('Halo 💥 dunia ✨'), 'Halo dunia')
  assert.equal(tanpaEmoji('teks biasa'), 'teks biasa')
})

/* ── QUOTES ──────────────────────────────────────────────────────────── */
const quotesMod = (await import('../plugins/quotes/quotes130.js')).default
const { KUTIPAN } = dataCek

test('196 kutipan dalam 7 kategori', () => {
  assert.deepEqual(Object.keys(KUTIPAN).sort(), ['bacot', 'bijak', 'bucin', 'galau', 'gombal', 'heker', 'motivasi'])
  assert.equal(Object.values(KUTIPAN).reduce((n, v) => n + v.length, 0), 196)
  for (const [k, v] of Object.entries(KUTIPAN)) {
    assert.ok(v.length >= 20, `${k} cuma ${v.length}`)
    assert.equal(new Set(v).size, v.length, `${k} ada duplikat`)
  }
})

test('perintah kutipan: kutipan + 3 pintasan, tanpa kembar', () => {
  for (const k of ['kutipan', 'bijak', 'galau', 'heker']) {
    assert.ok(quotesMod.command.test(k), `${k} harus cocok`)
  }
  // Sudah dipakai plugin lain di repo → tidak boleh didaftarkan di sini.
  for (const kembar of ['quotes', 'bucin', 'gombal', 'motivasi', 'bacot']) {
    assert.ok(!quotesMod.command.test(kembar), `${kembar} jangan didaftarkan`)
  }
  assert.ok(!quotesMod.command.test('quote'), 'quote tanpa s tidak cocok')
})

test('handler kutipan mengirim kutipan dari kategori yang diminta', async () => {
  const conn = connTiruan()
  await quotesMod(pesan(), { conn, command: 'kutipan', text: 'bucin', usedPrefix: '.', m: pesan() })
  assert.equal(conn.terkirim.length, 1)
  const teks = conn.terkirim[0].isi.text
  assert.match(teks, /BUCIN/)
  assert.ok(KUTIPAN.bucin.some(q => teks.includes(q.replace(/^[\s"“”]+|[\s"“”]+$/g, '').slice(0, 20))),
    'isi kutipan harus berasal dari daftar bucin')
})

test('kutipan daftar menampilkan semua kategori', async () => {
  const conn = connTiruan()
  await quotesMod(pesan(), { conn, command: 'kutipan', text: 'daftar', usedPrefix: '.', m: pesan() })
  const teks = conn.terkirim[0].isi.text
  for (const k of Object.keys(KUTIPAN)) assert.ok(teks.includes(k), `${k} tidak ada di daftar`)
  assert.match(teks, /Total: 196/)
})

test('kutipan acak selalu dapat isi', async () => {
  for (let i = 0; i < 10; i += 1) {
    const conn = connTiruan()
    const hasil = await quotesMod(pesan(), { conn, command: 'kutipan', text: '', usedPrefix: '.', m: pesan() })
    assert.equal(hasil.ok, true)
    assert.ok(conn.terkirim[0].isi.text.length > 20)
  }
})

/* ── STALK GITHUB ────────────────────────────────────────────────────── */
const ghMod = await import('../plugins/stalker/stalk-github130.js')
const ghHandler = ghMod.default

test('perintah stalk github terdaftar', () => {
  for (const k of ['stalkgithub', 'githubstalk', 'ghstalk', 'ghuser']) assert.ok(ghHandler.command.test(k))
  assert.ok(!ghHandler.command.test('stalkig'))
})

test('username tidak valid ditolak sebelum memanggil API', async () => {
  const hasil = await ghMod.ambilProfilGitHub('bukan username!!')
  assert.equal(hasil.ok, false)
  assert.match(hasil.alasan, /tidak valid/i)
})

test('ambilProfilGitHub mengembalikan data nyata api.github.com', async () => {
  const hasil = await ghMod.ambilProfilGitHub('torvalds')
  assert.equal(hasil.ok, true, hasil.alasan)
  assert.equal(hasil.profil.login, 'torvalds')
  assert.ok(hasil.profil.repo > 0)
  assert.ok(hasil.profil.followers > 1000)
  assert.match(hasil.profil.dibuat, /\d{4}$/)
})

test('user tidak ada → pesan jelas, bukan lempar error', async () => {
  const nama = `tidak-ada-${Date.now()}`
  const hasil = await ghMod.ambilProfilGitHub(nama)
  assert.equal(hasil.ok, false)
  assert.match(hasil.alasan, /tidak ditemukan/i)
})

test('handler stalk github mengirim caption lengkap', async () => {
  const conn = connTiruan()
  await ghHandler(pesan(), { conn, command: 'stalkgithub', text: 'torvalds', usedPrefix: '.', m: pesan() })
  assert.equal(conn.terkirim.length, 1)
  const isi = conn.terkirim[0].isi
  const teks = isi.caption || isi.text
  assert.match(teks, /GITHUB STALKER/)
  assert.match(teks, /torvalds/i)
  assert.match(teks, /Followers/)
  assert.match(teks, /github\.com\/torvalds/)
})

test('handler stalk github tanpa argumen memberi format', async () => {
  const conn = connTiruan()
  await ghHandler(pesan(), { conn, command: 'stalkgithub', text: '', usedPrefix: '.', m: pesan() })
  assert.match(conn.terkirim[0].isi.text, /Format:/)
})

/* ── REGRESI FORMAT PLUGIN ───────────────────────────────────────────── */
test('lib/plugin-format.js masih mendeteksi 3 format', async () => {
  const { deteksiFormat } = await import('../lib/plugin-format.js')
  assert.equal(deteksiFormat("let h = async (m)=>{}\nh.command=/^a$/i\nexport default h"), 'plugin')
  assert.equal(deteksiFormat("module.exports = async (m) => {}"), 'cjs')
  assert.equal(deteksiFormat("module.exports = { command: /^x$/i, handler: async()=>{} }"), 'cjs')
})
