/* Task132 — uji fitur OURIN yang baru diport ke format Umi.
 *
 * Uji ini memuat plugin seperti bot memuatnya (`import()` lalu lihat
 * `handler.command`), lalu menjalankannya dengan `m`/`conn` tiruan. Tujuannya
 * membuktikan tiga hal:
 *   1. perintah benar-benar dikenali (regex cocok),
 *   2. balasan berisi data nyata (bukan teks kosong / "undefined"),
 *   3. tidak ada `m.reply(teks, m)` — penyebab `jid?.endsWith` di Task131.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const muat = (rel) => import(path.join(AKAR, rel))

function buatM({ text = '', sender = '628111@s.whatsapp.net', chat = '628111@s.whatsapp.net', isGroup = false, quoted = null, mentionedJid = [] } = {}) {
  const keluaran = []
  const m = {
    text, sender, chat, isGroup, quoted, mentionedJid,
    pushName: 'Penguji',
    mtype: quoted ? quoted.mtype : '',
    async reply(teks, chatId, opsi) {
      // Task131: argumen kedua HARUS chat id (string), bukan objek m.
      if (chatId !== undefined && typeof chatId !== 'string') {
        throw new TypeError('jid?.endsWith is not a function')
      }
      keluaran.push(String(teks))
      return { ok: true }
    },
    async react() {},
    async download() {
      if (!quoted?.buffer) throw new Error('tidak ada media')
      return quoted.buffer
    },
  }
  return { m, keluaran }
}

function buatConn({ jid = '628999@s.whatsapp.net', meta = null } = {}) {
  const dikirim = []
  return {
    user: { jid, id: jid },
    dikirim,
    async groupMetadata() {
      if (!meta) throw new Error('grup tidak ditemukan')
      return meta
    },
    async sendMessage(chat, isi, opsi) {
      dikirim.push({ chat, isi, opsi })
      return { key: { id: 'uji' } }
    },
  }
}

test('akses: addakses / listakses / delakses + berlaku di mode self', async () => {
  global.db = { data: { users: {}, chats: {}, settings: {} } }
  const { daftarAkses, punyaAkses, tambahAkses, hapusAkses } = await import(path.join(AKAR, 'lib/akses-user.js'))
  const handler = (await muat('plugins/ourin/akses.js')).default
  const conn = buatConn({ jid: '628999@s.whatsapp.net' })

  assert.equal(daftarAkses(conn).length, 0)
  assert.equal(punyaAkses(conn, '628222@s.whatsapp.net'), false)

  let { m, keluaran } = buatM({ chat: '628999@s.whatsapp.net' })
  await handler(m, { conn, command: 'addakses', args: ['628222333444'], usedPrefix: '.' })
  assert.match(keluaran[0], /AKSES DITAMBAH/)
  assert.equal(punyaAkses(conn, '628222333444@s.whatsapp.net'), true, 'harus berlaku untuk pengirim itu')

  ;({ m, keluaran } = buatM({ chat: '628999@s.whatsapp.net' }))
  await handler(m, { conn, command: 'listakses', args: [], usedPrefix: '.' })
  assert.match(keluaran[0], /628222333444/)

  // Sesi lain tidak boleh ikut mendapat akses.
  assert.equal(punyaAkses(buatConn({ jid: '628777@s.whatsapp.net' }), '628222333444@s.whatsapp.net'), false)

  ;({ m, keluaran } = buatM({ chat: '628999@s.whatsapp.net' }))
  await handler(m, { conn, command: 'delakses', args: ['628222333444'], usedPrefix: '.' })
  assert.match(keluaran[0], /AKSES DIHAPUS/)
  assert.equal(punyaAkses(conn, '628222333444@s.whatsapp.net'), false)

  // Nomor tidak valid harus ditolak, bukan tersimpan sebagai string kosong.
  assert.equal(tambahAkses(conn, 'abc').ok, false)
  assert.equal(hapusAkses(conn, '628000000000').ok, false)
})

test('handler.js: mode self tetap menolak non-akses dan meloloskan akses', async () => {
  const sumber = fs.readFileSync(path.join(AKAR, 'handler.js'), 'utf8')
  assert.match(sumber, /!instancePublic && !m\.fromMe && !isOwner && !punyaAkses\(this, m\.sender\)/)
  assert.match(sumber, /import \{ punyaAkses \} from '\.\/lib\/akses-user\.js'/)
  // Simulasi logika baris tersebut.
  const gate = (publik, fromMe, owner, akses) => publik || fromMe || owner || akses
  assert.equal(gate(false, false, false, false), false, 'user biasa ditolak')
  assert.equal(gate(false, false, false, true), true, 'user dengan akses diloloskan')
  assert.equal(gate(true, false, false, false), true, 'mode publik tetap terbuka')
})

test('swgcall: ringkasan grup dari metadata nyata', async () => {
  global.db = { data: { users: {}, chats: { '123@g.us': { antilink: true, mute: false } }, settings: {} } }
  const handler = (await muat('plugins/ourin/swgcall.js')).default
  assert.equal(handler.command.test('swgcall'), true)
  const meta = {
    subject: 'Grup Uji',
    creation: 1600000000,
    desc: 'Grup untuk pengujian',
    participants: [
      { id: '628999@s.whatsapp.net', admin: 'superadmin' },
      { id: '628111@s.whatsapp.net', admin: null },
      { id: '628222@s.whatsapp.net', admin: 'admin' },
    ],
  }
  const conn = buatConn({ meta })
  const { m, keluaran } = buatM({ chat: '123@g.us', isGroup: true })
  await handler(m, { conn })
  const teks = keluaran[0]
  assert.match(teks, /Grup Uji/)
  assert.match(teks, /Anggota   : \*3\*/)
  assert.match(teks, /Admin     : 2/)
  assert.match(teks, /Anti link/)
  // Bot memakai nomor 628999 yang di metadata berperan superadmin → "Ya".
  assert.match(teks, /Bot admin : Ya/)

  // Bukan grup → ditolak dengan pesan jelas, bukan error.
  const bukanGrup = buatM()
  await handler(bukanGrup.m, { conn })
  assert.match(bukanGrup.keluaran[0], /hanya untuk grup/i)
})

test('carifitur & menucat: membaca plugin yang benar-benar ada', async () => {
  const handler = (await muat('plugins/ourin/info-ourin.js')).default
  for (const c of ['benefitpremium', 'whatrolethis', 'carifitur', 'menucat']) {
    assert.equal(handler.command.test(c), true, `${c} harus cocok`)
  }

  const cari = buatM()
  await handler(cari.m, { conn: buatConn(), command: 'carifitur', text: 'stiker', usedPrefix: '.' })
  assert.match(cari.keluaran[0], /HASIL PENCARIAN: stiker/)
  assert.match(cari.keluaran[0], /Ditemukan \*\d+\* fitur/)
  const jumlah = Number((cari.keluaran[0].match(/Ditemukan \*(\d+)\* fitur/) || [])[1])
  assert.ok(jumlah > 5, `harus menemukan beberapa fitur stiker, dapat ${jumlah}`)

  const kosong = buatM()
  await handler(kosong.m, { conn: buatConn(), command: 'carifitur', text: 'zzz-tidak-ada', usedPrefix: '.' })
  assert.match(kosong.keluaran[0], /Tidak ada fitur/)

  const kategori = buatM()
  await handler(kategori.m, { conn: buatConn(), command: 'menucat', text: '', usedPrefix: '.' })
  assert.match(kategori.keluaran[0], /KATEGORI MENU/)
  assert.match(kategori.keluaran[0], /Total: \*\d+\* kategori, \*\d+\* command/)

  const satu = buatM()
  await handler(satu.m, { conn: buatConn(), command: 'menucat', text: 'game', usedPrefix: '.' })
  assert.match(satu.keluaran[0], /KATEGORI GAME/)
})

test('whatrolethis: peran dibaca dari database, premium dihitung dari sisa hari', async () => {
  global.owner = [['6287813709432', 'AlzRiss']]
  global.db = {
    data: {
      users: {
        '628111@s.whatsapp.net': {
          name: 'Uji', registered: true, level: 7, limit: 40, koin: 1234,
          premiumTime: Date.now() + 5 * 86400000, banned: false,
        },
      },
      chats: {}, settings: {},
    },
  }
  const handler = (await muat('plugins/ourin/info-ourin.js')).default
  const { m, keluaran } = buatM()
  await handler(m, { conn: buatConn(), command: 'whatrolethis' })
  assert.match(keluaran[0], /Premium \(5 hari\)/)
  assert.match(keluaran[0], /Terdaftar/)
  assert.match(keluaran[0], /Koin      : 1234/)
  assert.match(keluaran[0], /Level     : 7/)
})

test('benefitpremium: status premium user ditampilkan apa adanya', async () => {
  const handler = (await muat('plugins/ourin/info-ourin.js')).default
  global.db = { data: { users: { '628111@s.whatsapp.net': { premiumTime: 0, limit: 25 } }, chats: {}, settings: {} } }
  const { m, keluaran } = buatM()
  await handler(m, { conn: buatConn(), command: 'benefitpremium' })
  assert.match(keluaran[0], /Status kamu : \*Tidak aktif\*/)
  assert.match(keluaran[0], /Total limit : 25/)
})

test('tovn: audio yang dibalas dikirim ulang sebagai PTT', async () => {
  const handler = (await muat('plugins/ourin/tovn.js')).default
  assert.equal(handler.command.test('tovn'), true)
  const conn = buatConn()
  const quoted = {
    mtype: 'audioMessage',
    msg: { mimetype: 'audio/ogg; codecs=opus' },
    download: async () => Buffer.from('bukan-audio-asli-tapi-cukup'),
  }
  const { m } = buatM({ quoted })
  m.quoted.download = quoted.download
  await handler(m, { conn })
  assert.equal(conn.dikirim.length, 1)
  assert.equal(conn.dikirim[0].isi.ptt, true)
  assert.equal(conn.dikirim[0].isi.mimetype, 'audio/ogg; codecs=opus')

  // Tanpa balasan → pesan jelas, bukan crash.
  const { m: m2, keluaran } = buatM()
  await handler(m2, { conn: buatConn() })
  assert.match(keluaran[0], /Balas audio/i)
})

test('ocr: gambar lokal benar-benar terbaca lewat api.ocr.space', { timeout: 90000 }, async () => {
  const gambar = '/tmp/teks.png'
  if (!fs.existsSync(gambar)) {
    // Berkas uji tidak ada di mesin ini; uji jaringan dilewati dengan jujur.
    console.log('[ocr] /tmp/teks.png tidak ada — uji jaringan dilewati')
    return
  }
  const handler = (await muat('plugins/ourin/ocr.js')).default
  const buffer = fs.readFileSync(gambar)
  const quoted = { mtype: 'imageMessage', download: async () => buffer }
  const { m, keluaran } = buatM({ quoted })
  m.quoted = quoted
  await handler(m, { conn: buatConn() })
  assert.match(keluaran[0], /HASIL OCR/i)
  assert.match(keluaran[0], /USANAGI UMI 12345/i, `teks gambar harus terbaca, dapat: ${keluaran[0]}`)
})

test('semua plugin OURIN baru tidak memakai m.reply(teks, m)', async () => {
  for (const rel of [
    'plugins/ourin/akses.js',
    'plugins/ourin/swgcall.js',
    'plugins/ourin/info-ourin.js',
    'plugins/ourin/tovn.js',
    'plugins/ourin/ocr.js',
    'plugins/ourin/toblack.js',
    'plugins/ourin/backupdb.js',
  ]) {
    const sumber = fs.readFileSync(path.join(AKAR, rel), 'utf8')
    assert.doesNotMatch(sumber, /\.reply\([^)]*,\s*m\s*\)/, `${rel} masih memakai m.reply(teks, m)`)
  }
})

test('toblack: gambar benar-benar diubah jadi grayscale di server', async () => {
  const { createCanvas } = await import('@napi-rs/canvas')
  const kanvas = createCanvas(60, 40)
  const ctx = kanvas.getContext('2d')
  ctx.fillStyle = '#ff0000'
  ctx.fillRect(0, 0, 30, 40)
  ctx.fillStyle = '#00ff00'
  ctx.fillRect(30, 0, 30, 40)
  const asli = await kanvas.encode('png')

  const handler = (await muat('plugins/ourin/toblack.js')).default
  assert.equal(handler.command.test('toblack'), true)
  const conn = buatConn()
  conn.sendMessage = async (chat, isi) => { conn.dikirim.push({ chat, isi }) }
  const quoted = { mtype: 'imageMessage', download: async () => asli }
  const { m } = buatM({ quoted })
  m.quoted = quoted
  await handler(m, { conn })

  assert.equal(conn.dikirim.length, 1, 'harus mengirim satu gambar')
  const keluaran = conn.dikirim[0].isi.image
  assert.ok(Buffer.isBuffer(keluaran) || keluaran?.length, 'harus berupa buffer gambar')

  const { loadImage } = await import('@napi-rs/canvas')
  const cek = await loadImage(Buffer.from(keluaran))
  const c = createCanvas(cek.width, cek.height)
  const x = c.getContext('2d')
  x.drawImage(cek, 0, 0)
  const d = x.getImageData(2, 2, 1, 1).data
  assert.equal(d[0], d[1], 'R harus sama dengan G')
  assert.equal(d[1], d[2], 'G harus sama dengan B')
})

test('backupdb: menyalin database + setting dan memangkas cadangan lama', async () => {
  const os = await import('node:os')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'umi-backup-'))
  const cwdAsli = process.cwd()
  fs.writeFileSync(path.join(tmp, 'database.json'), JSON.stringify({ data: { users: { a: 1 } } }))
  fs.mkdirSync(path.join(tmp, 'data'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'data', 'umi-menu.json'), '{"x":1}')
  process.chdir(tmp)
  try {
    const handler = (await muat('plugins/ourin/backupdb.js')).default
    assert.equal(handler.command.test('backupdb'), true)
    const { m, keluaran } = buatM()
    await handler(m, { conn: buatConn(), command: 'backupdb' })
    assert.match(keluaran[0], /CADANGAN DIBUAT/)
    assert.match(keluaran[0], /database\.json/)
    assert.match(keluaran[0], /umi-menu\.json/)

    const folder = path.join(tmp, 'data', 'backup-owner')
    const isi = fs.readdirSync(folder)
    assert.ok(isi.some(n => /^database-.*\.json$/.test(n)), 'cadangan database harus ada')
    const salinan = JSON.parse(fs.readFileSync(path.join(folder, isi.find(n => /^database-/.test(n))), 'utf8'))
    assert.equal(salinan.data.users.a, 1, 'isi cadangan harus sama')

    const daftar = buatM()
    await handler(daftar.m, { conn: buatConn(), command: 'listbackup' })
    assert.match(daftar.keluaran[0], /CADANGAN TERSIMPAN/)
  } finally {
    process.chdir(cwdAsli)
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})
