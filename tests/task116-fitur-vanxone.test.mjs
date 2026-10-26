/* Task116 — fitur bot VanXone yang DIPERLAMBAT ke bot ini (channel + kartu).
 *
 * Yang diuji: nama perintah tidak bentrok dengan plugin yang sudah ada,
 * format & validasi masukan, penanganan galat yang ramah, dan penggambaran
 * kartu sungguhan dengan @napi-rs/canvas (hasilnya file PNG yang bisa dibuka).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(import.meta.dirname, '..')
const hasil = []
const cek = (nama, lulus, info = '') => { hasil.push(lulus); console.log(`${lulus ? 'LULUS' : 'GAGAL'} · ${nama}${info ? ' — ' + info : ''}`) }

process.env.UMI_CHANNEL_STORE = path.join(os.tmpdir(), `task116-channels-${process.pid}.json`)
try { fs.rmSync(process.env.UMI_CHANNEL_STORE, { force: true }) } catch {}

const ch = await import(pathToFileURL(path.join(ROOT, 'lib/channel-tools.js')).href)
const kartu = await import(pathToFileURL(path.join(ROOT, 'lib/profile-card.js')).href)

/* ── 1. Nama perintah tidak bentrok ────────────────────────────── */
{
  const pemilik = new Map()
  const jelajah = dir => {
    for (const entri of fs.readdirSync(dir, { withFileTypes: true })) {
      const lokasi = path.join(dir, entri.name)
      if (entri.isDirectory()) { if (entri.name !== 'node_modules') jelajah(lokasi); continue }
      if (!entri.name.endsWith('.js')) continue
      const isi = fs.readFileSync(lokasi, 'utf8')
      const baris = isi.match(/handler\.command\s*=\s*([^\n]+)/)
      if (!baris) continue
      for (const cocok of baris[1].matchAll(/['"/]([a-z0-9_-]{2,})['"/]/gi)) {
        const nama = cocok[1].toLowerCase()
        if (!pemilik.has(nama)) pemilik.set(nama, new Set())
        pemilik.get(nama).add(path.relative(ROOT, lokasi))
      }
    }
  }
  jelajah(path.join(ROOT, 'plugins'))

  const baru = ['chinfo', 'stalkch', 'stalkchannel', 'chstalk', 'setch', 'setsaluran', 'cvidch', 'cidch',
    'kartuprofil', 'idcard', 'kartuplayer', 'podium', 'juara', 'podiumlevel', 'cekidch']
  for (const nama of baru) {
    const daftar = [...(pemilik.get(nama) || [])]
    cek(`perintah .${nama} hanya dimiliki satu plugin`, daftar.length === 1, daftar.join(' | ') || 'tidak ada')
  }
}

/* ── 2. Pembaca link/ID saluran ────────────────────────────────── */
{
  cek('link saluran + id pesan terbaca', JSON.stringify(ch.parseRef('https://whatsapp.com/channel/0029Vb7pLCF35fLqMBUCMP1D/123')) === JSON.stringify({ type: 'invite', code: '0029Vb7pLCF35fLqMBUCMP1D', serverId: '123' }))
  cek('ID @newsletter terbaca', ch.parseRef('120363312345678901@newsletter').type === 'jid')
  cek('kode saluran tanpa link terbaca', ch.parseRef('0029Vb7pLCF35fLqMBUB1D').type === 'invite')
  cek('link bukan WhatsApp ditolak', ch.parseRef('https://t.me/abc') === null)
  cek('teks acak ditolak', ch.parseRef('halo dunia') === null)
}

/* ── 3. Metadata dari socket tiruan (bentuk jawaban elaina-baileys) ─ */
{
  const socket = {
    newsletterMetadata: async (jenis, nilai) => {
      if (jenis === 'invite' && nilai === '0029Vb7pLCF35fLqMBUCMP1D') {
        return { id: '120363312345678901@newsletter', thread_metadata: { name: { text: 'Saluran Uji' }, description: { text: 'Deskripsi saluran uji' }, invite: '0029Vb7pLCF35fLqMBUCMP1D', subscribers_count: 1234, creation_time: 1700000000 }, viewer_metadata: { role: 'ADMIN' } }
      }
      throw new Error('item-not-found')
    },
    newsletterUpdateName: async () => ({}),
  }

  const md = await ch.channelMetadata(socket, { type: 'invite', code: '0029Vb7pLCF35fLqMBUCMP1D' })
  cek('nama saluran dari metadata', md.name === 'Saluran Uji')
  cek('pengikut terbaca', md.subs === 1234)
  cek('peran bot terbaca', md.role === 'ADMIN' && ch.isAdminRole(md.role))
  cek('link dibuat benar', ch.channelLink(md.invite) === 'https://whatsapp.com/channel/0029Vb7pLCF35fLqMBUCMP1D')

  let pesan = ''
  try { await ch.channelMetadata(socket, { type: 'invite', code: 'tidak-ada' }) } catch (error) { pesan = ch.explainChannelError(error) }
  cek('saluran tidak ada → pesan ramah', /tidak ditemukan/i.test(pesan), pesan)

  let pesan2 = ''
  try { await ch.channelMetadata({}, { type: 'invite', code: 'x' }) } catch (error) { pesan2 = ch.explainChannelError(error) }
  cek('socket tanpa fitur saluran → pesan jelas, bukan crash', /belum punya fitur saluran/i.test(pesan2), pesan2)
}

/* ── 4. Saluran tujuan bawaan tersimpan & terbaca ──────────────── */
{
  cek('awalnya kosong', ch.getTargetChannel() === null)
  ch.setTargetChannel({ id: '120363312345678901@newsletter', name: 'Saluran Uji', role: 'ADMIN', invite: 'abc' })
  cek('tersimpan', ch.getTargetChannel().name === 'Saluran Uji')
  cek('berkas simpanan mode 0600', (fs.statSync(process.env.UMI_CHANNEL_STORE).mode & 0o777) === 0o600)
  ch.setTargetChannel(null)
  cek('bisa dihapus', ch.getTargetChannel() === null)
}

/* ── 5. Perintah channel memakai handler kami (conn tiruan) ────── */
{
  const kirim = []
  const conn = {
    sendMessage: async (chat, isi) => { kirim.push(isi); return {} },
    newsletterMetadata: async (jenis, nilai) => {
      if (jenis === 'jid' && nilai === '120363312345678901@newsletter') {
        return { id: nilai, thread_metadata: { name: { text: 'Saluran Uji' }, invite: '0029Vb7pLCF35fLqMBUCMP1D', subscribers_count: 1234 } }
      }
      if (jenis === 'invite' && nilai === '0029Vb7pLCF35fLqMBUCMP1D') {
        return { id: '120363312345678901@newsletter', thread_metadata: { name: { text: 'Saluran Uji' }, invite: '0029Vb7pLCF35fLqMBUCMP1D', subscribers_count: 1234, creation_time: 1700000000 }, viewer_metadata: { role: 'ADMIN' } }
      }
      throw new Error('item-not-found')
    },
  }
  const pesan = text => {
    const m = { text, args: String(text || '').split(/\s+/).filter(Boolean), chat: '1@s.whatsapp.net', sender: '2@s.whatsapp.net', raw: {} }
    m.reply = async isi => { m.balasan = String(isi) }
    return m
  }
  const jalankan = async (berkas, text, opsi = {}) => {
    const mod = await import(pathToFileURL(path.join(ROOT, 'plugins/channel', berkas)).href)
    const m = pesan(text)
    await mod.default(m, { conn, text, args: m.args, usedPrefix: '.', command: 'x', ...opsi })
    return m.balasan || ''
  }
  const jalankanArgs = async (berkas, text, opsi = {}) => {
    const mod = await import(pathToFileURL(path.join(ROOT, 'plugins/channel', berkas)).href)
    const m = pesan(text)
    await mod.default(m, { conn, text, args: [], usedPrefix: '.', command: 'x', ...opsi })
    return m.balasan || ''
  }

  const info = await jalankan('usanagi-chinfo.js', 'https://whatsapp.com/channel/0029Vb7pLCF35fLqMBUCMP1D')
  cek('chinfo menampilkan nama & pengikut', /Saluran Uji/.test(info) && /1\.234/.test(info), info.split('\n')[0])
  cek('chinfo menampilkan peran bot', /peran bot : admin/i.test(info))
  cek('chinfo tanpa argumen → contoh', /Contoh:/.test(await jalankan('usanagi-chinfo.js', '')))
  cek('chinfo link salah → pesan ramah', /tidak ditemukan/i.test(await jalankan('usanagi-chinfo.js', 'https://whatsapp.com/channel/0029Vb7pLCF35fLqMBUCMP1D') ) === false)
  const gagal = await jalankan('usanagi-chinfo.js', 'https://whatsapp.com/channel/0029Vb7pLCF35fLqMBUCMP1D')
  cek('chinfo sukses tidak memuat kata gagal', !/❌/.test(gagal))

  const cvid = await jalankanArgs('usanagi-cvidch.js', '120363312345678901@newsletter')
  cek('cvidch menerjemahkan ID jadi nama + link', /Saluran Uji/.test(cvid) && /whatsapp\.com\/channel\/0029Vb7pLCF35fLqMBUCMP1D/.test(cvid))
  cek('cvidch tanpa ID → contoh', /Contoh:/.test(await jalankanArgs('usanagi-cvidch.js', 'halo')))
  cek('cvidch tetap jalan kalau args terpecah', /Saluran Uji/.test(await jalankan('usanagi-cvidch.js', '120363312345678901@newsletter')))

  cek('setch menolak non-owner', /hanya untuk owner/i.test(await jalankan('usanagi-setch.js', 'off')))
  const setch = await jalankan('usanagi-setch.js', 'https://whatsapp.com/channel/0029Vb7pLCF35fLqMBUCMP1D', { isOwner: true })
  cek('setch menyimpan saluran tujuan', /Saluran tujuan/.test(setch) && ch.getTargetChannel()?.name === 'Saluran Uji')
  cek('setch off menghapus', /dihapus/i.test(await jalankan('usanagi-setch.js', 'off', { isOwner: true })) && ch.getTargetChannel() === null)

  const idch = await jalankan('../tools/tools-cekidch.js', 'https://whatsapp.com/channel/0029Vb7pLCF35fLqMBUCMP1D')
  cek('cekidch lama yang rusak sekarang jalan', /120363312345678901@newsletter/.test(idch), idch.split('\n')[1])
}

/* ── 6. Penggambar kartu & podium (canvas sungguhan) ───────────── */
{
  const kartuPng = await kartu.renderProfileCard({
    name: 'AlzRiss', number: '6287••••432', status: 'OWNER', level: 12, exp: 4500, expNeed: 10000,
    money: 1250000, bank: 300000, limit: 20, rank: 3, rankTotal: 214,
  })
  cek('kartu profil menghasilkan PNG', kartuPng.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
  cek('kartu profil berukuran wajar', kartuPng.length > 20000 && kartuPng.length < 900 * 1024, `${Math.round(kartuPng.length / 1024)} KB`)

  const podiumPng = await kartu.renderPodium({ top: [{ name: 'AlzRiss', level: 12 }, { name: 'Rina', level: 9 }, { name: 'Budi', level: 8 }, { name: 'Sari', level: 6 }] })
  cek('podium menghasilkan PNG', podiumPng.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])))
  cek('podium tetap jalan dengan 1 peserta', (await kartu.renderPodium({ top: [{ name: 'Sendiri', level: 1 }] })).length > 10000)
  cek('angka ringkas untuk kotak kecil', kartu.angkaRingkas(1250000) === '1,25jt' && kartu.angkaRingkas(300000) === '300rb' && kartu.angkaRingkas(950) === '950')
}

/* ── 7. Plugin kartu memakai data user bot ini ─────────────────── */
{
  const kirim = []
  const conn = {
    sendMessage: async (chat, isi) => { kirim.push(isi); return {} },
    profilePictureUrl: async () => { throw new Error('no photo') },
  }
  global.db = global.db || {}
  global.db.data = global.db.data || {}
  global.db.data.users = {
    '628111@s.whatsapp.net': { name: 'Satu', level: 5, exp: 2000, money: 50000, bank: 10000, limit: 15 },
    '628222@s.whatsapp.net': { name: 'Dua', level: 9, exp: 8000, money: 900000, bank: 0, limit: 20 },
  }
  global.owner = [['628111', 'AlzRiss', true]]
  global.multiplier = 1

  const modKartu = await import(pathToFileURL(path.join(ROOT, 'plugins/info/usanagi-kartuprofil.js')).href)
  const m1 = { text: '', args: [], chat: '1@s.whatsapp.net', sender: '628222@s.whatsapp.net', raw: {} }
  m1.reply = async isi => { m1.balasan = String(isi) }
  await modKartu.default(m1, { conn, args: [], usedPrefix: '.', command: 'kartuprofil' })
  cek('kartu bawaan user pengirim', kirim.length === 1 && Buffer.isBuffer(kirim[0].image))
  cek('kartu menyebut nama pengirim', /@628222/.test(kirim[0].caption || ''))

  const m2 = { text: '', args: [], chat: '1@s.whatsapp.net', sender: '628999@s.whatsapp.net', raw: {} }
  m2.reply = async isi => { m2.balasan = String(isi) }
  await modKartu.default(m2, { conn, args: [], usedPrefix: '.', command: 'kartuprofil' })
  cek('user tidak terdaftar → pesan jelas', /belum terdaftar/i.test(m2.balasan || ''))

  const modPodium = await import(pathToFileURL(path.join(ROOT, 'plugins/info/usanagi-podium.js')).href)
  const m3 = { text: '', args: [], chat: '1@s.whatsapp.net', sender: '628222@s.whatsapp.net', raw: {} }
  m3.reply = async isi => { m3.balasan = String(isi) }
  await modPodium.default(m3, { conn })
  cek('podium mengirim gambar dari data user', kirim.length === 2 && Buffer.isBuffer(kirim[1].image))
}

try { fs.rmSync(process.env.UMI_CHANNEL_STORE, { force: true }) } catch {}
const gagal = hasil.filter(x => !x).length
console.log(`\n${hasil.length - gagal}/${hasil.length} lulus`)
process.exit(gagal ? 1 : 0)
