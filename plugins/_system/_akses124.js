/* By AlzRiss - Usanagi Umi AI
 *
 * SELF-TEST AKSES OWNER — Task124
 *
 * Membuktikan dengan data NYATA di server bahwa:
 *   1. nomor yang diisi pemilik bot (bot utama / sesi Jadibot) benar-benar
 *      diakui sebagai owner, termasuk nomor yang baru disimpan di website;
 *   2. owner bot boleh memakai perintah bertanda `rowner` (mis. .addowner,
 *      .addstok, .setpp);
 *   3. fitur platform/lintas akun tetap terkunci untuk owner bot;
 *   4. nomor asing tidak mendapat akses apa pun.
 *
 * Hasil ditulis ke /data/akses-selftest.json (bertahap) supaya bisa diperiksa
 * dari panel. Plugin ini tidak mengubah perilaku bot.
 */

import fs from 'node:fs'
import path from 'node:path'
import { canUseOwnerPlugin, ownerPluginAccess, PLATFORM_ONLY_PLUGINS } from '../../lib/owner-policy.js'
import {
  freshJadibotOwnerNumbers,
  freshMainOwnerNumbers,
  mergeOwnerNumbers,
  ownerDigits,
} from '../../lib/owner-source.js'

const BERKAS = (() => {
  const kandidat = [
    path.join(process.cwd(), 'data', 'akses-selftest.json'),
    '/data/akses-selftest.json',
  ]
  for (const jalur of kandidat) {
    try {
      fs.mkdirSync(path.dirname(jalur), { recursive: true })
      fs.appendFileSync(jalur, '')
      return jalur
    } catch {}
  }
  return null
})()

const TUNDA_MS = 12_000
const hasil = { at: new Date().toISOString(), versi: 'task124' }

function simpan(patch = {}) {
  Object.assign(hasil, patch, { diperbarui: new Date().toISOString() })
  hasil.berkas = BERKAS
  try {
    if (BERKAS) fs.writeFileSync(BERKAS, JSON.stringify(hasil, null, 2))
  } catch {}
}

/** Daftar plugin ber-gate rowner yang benar-benar termuat di proses ini. */
function pluginRowner() {
  const daftar = global.plugins && typeof global.plugins === 'object' ? global.plugins : {}
  const out = []
  for (const [name, handler] of Object.entries(daftar)) {
    if (!handler || typeof handler !== 'function') continue
    if (handler.rowner === true) out.push(name)
  }
  return out.sort()
}

/** Perkiraan akses untuk satu nomor terhadap daftar plugin nyata. */
function hitungAkses(nomor, { isROwner = false, isOwner = true, botUtama = false } = {}) {
  const rowner = pluginRowner()
  const dicoba = rowner.length ? rowner : [...PLATFORM_ONLY_PLUGINS.keys()]
  const ditolak = []
  let boleh = 0
  for (const name of dicoba) {
    if (canUseOwnerPlugin(name, { isROwner, isOwner, botUtama })) boleh += 1
    else ditolak.push({ plugin: name, alasan: ownerPluginAccess(name, { isROwner, isOwner, botUtama }).reason })
  }
  return {
    nomor,
    jumlahPluginRowner: dicoba.length,
    boleh,
    ditolak: ditolak.slice(0, 12),
    jumlahDitolak: ditolak.length,
  }
}

export async function jalankanPemeriksaanAkses() {
  hasil.at = new Date().toISOString()
  simpan({ tahap: 'mulai' })

  try {
    const { getAllOwnerEntries, getAllOwnerNumbers, isOwner } = await import('../../lib/awang-cekakses.js')
    const conn = global.conn
    const botConfig = conn?.botConfig || null

    /* ── 1. Nomor owner yang terbaca sekarang ─────────────────────────── */
    const botUtamaSegar = freshMainOwnerNumbers()
    const sesiPath = path.join(process.cwd(), 'sessions', 'jadibot')
    const sesi = (() => {
      try {
        return fs.readdirSync(sesiPath, { withFileTypes: true })
          .filter(item => item.isDirectory())
          .map(item => item.name)
      } catch { return [] }
    })()

    const jadibot = sesi.map(nomor => {
      const file = path.join(sesiPath, nomor, 'bot-config.json')
      const segar = freshJadibotOwnerNumbers(file)
      let tersimpan = []
      try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'))
        tersimpan = Array.isArray(data?.ownerNumbers) ? data.ownerNumbers.map(ownerDigits) : []
      } catch {}
      return {
        sesi: nomor,
        tersimpan,
        segar,
        ownerAktif: mergeOwnerNumbers(tersimpan, segar),
        adaBerkas: fs.existsSync(file),
      }
    })
    simpan({
      tahap: 'sumber-owner',
      botUtama: {
        jenisBot: botConfig?.type || 'main',
        ownerDariSetelan: botUtamaSegar,
        ownerDariSnapshot: (botConfig?.ownerNumbers || []).map(ownerDigits),
        jumlahSesiJadibot: jadibot.length,
        sesiTanpaOwner: jadibot.filter(item => !item.ownerAktif.length).map(item => item.sesi),
      },
    })

    /* ── 2. Owner bot yang SEDANG berjalan boleh apa saja? ─────────────── */
    const ownersSekarang = typeof getAllOwnerNumbers === 'function' ? getAllOwnerNumbers(conn) : []
    const entries = typeof getAllOwnerEntries === 'function' ? getAllOwnerEntries(conn) : []
    const uji = []

    for (const number of ownersSekarang.slice(0, 20)) {
      const sample = [`${number}@s.whatsapp.net`, `${number}@s.whatsapp.net:12`]
      let diakui = false
      for (const jid of sample) {
        if (await isOwner(jid, conn)) { diakui = true; break }
      }
      // Bot utama: pemilik bot = pemilik deployment → semua fitur.
      // Jadibot: dibatasi hanya pada fitur platform/lintas akun.
      const akses = hitungAkses(number, { isOwner: true, botUtama: botConfig?.type !== 'jadibot' })
      uji.push({ nomor: number, diakuiOwner: diakui, ...akses })
    }

    simpan({ tahap: 'uji-owner', ownerAktif: ownersSekarang.length, entries, uji })

    /* ── 3. Nomor asing & fitur platform ──────────────────────────────── */
    const asing = '6280000000001'
    const asingDiakui = await isOwner(`${asing}@s.whatsapp.net`, conn)
    const contohBoleh = ['usanagi-addowner.js', 'umi-addstok.js', 'umi-setpp.js', 'umi-selfthisgc.js']
    const contohPlatform = ['umi-bcgc.js', 'umi-dellalluser.js', 'umi-gantiapi.js', 'usanagi-boost.js']

    simpan({
      tahap: 'uji-batas',
      nomorAsing: { nomor: asing, diakuiOwner: asingDiakui },
      contohPerBbot: contohBoleh.map(name => ({
        plugin: name,
        ownerBot: canUseOwnerPlugin(name, { isOwner: true }),
        platform: canUseOwnerPlugin(name, { isROwner: true }),
      })),
      contohPlatform: contohPlatform.map(name => ({
        plugin: name,
        ownerBot: canUseOwnerPlugin(name, { isOwner: true }),
        alasan: ownerPluginAccess(name, { isOwner: true }).reason,
        platform: canUseOwnerPlugin(name, { isROwner: true }),
      })),
    })

    /* ── 4. Ringkasan ─────────────────────────────────────────────────── */
    const semuaDiakui = uji.length > 0 && uji.every(item => item.diakuiOwner)
    const adaAkses = uji.every(item => item.boleh > 0)
    const platformTerkunci = contohPlatform.every(name => !canUseOwnerPlugin(name, { isOwner: true }))
    const perBotTerbuka = contohBoleh.every(name => canUseOwnerPlugin(name, { isOwner: true }))
    simpan({
      tahap: 'selesai',
      ringkasan: {
        ok: Boolean(semuaDiakui && adaAkses && platformTerkunci && perBotTerbuka && !asingDiakui),
        ownerDiakui: semuaDiakui,
        ownerPunyaPerintahRowner: adaAkses,
        fiturPlatformTerkunci: platformTerkunci,
        fiturBotTerbuka: perBotTerbuka,
        nomorAsingDitolak: !asingDiakui,
      },
      at: new Date().toISOString(),
    })
    return hasil
  } catch (error) {
    simpan({ tahap: 'gagal', error: String(error?.message || error).slice(0, 300) })
    return hasil
  }
}

const handler = async (m, { conn }) => {
  const r = await jalankanPemeriksaanAkses()
  const ringkas = r.ringkasan || {}
  const baris = [
    '🔐 *SELF-TEST AKSES OWNER (Task124)*',
    '',
    `Owner aktif   : ${r.ownerAktif ?? '-'}`,
    `Diakui owner  : ${ringkas.ownerDiakui ? 'YA' : 'TIDAK'}`,
    `Perintah rowner: ${ringkas.ownerPunyaPerintahRowner ? 'TERBUKA' : 'TERKUNCI'}`,
    `Fitur platform : ${ringkas.fiturPlatformTerkunci ? 'TERKUNCI (benar)' : 'TERBUKA (salah!)'}`,
    `Nomor asing    : ${ringkas.nomorAsingDitolak ? 'DITOLAK' : 'DIIZINKAN (salah!)'}`,
    `Hasil          : ${ringkas.ok ? '✅ LULUS' : '❌ ADA MASALAH'}`,
    `Berkas         : ${r.berkas || '-'}`,
  ]
  await conn.sendMessage(m.chat, { text: baris.join('\n') }, { quoted: m.raw })
}

handler.command = /^(aksescheck|cekaksesowner|owneraccess)$/i
handler.help = ['aksescheck']
handler.tags = ['system']
handler.owner = true
handler.description = 'Self-test akses owner bot (bot utama & Jadibot)'
handler.limit = false

export default handler

// Jalankan otomatis sekali setelah bot hidup (mirip _menu120).
setTimeout(() => { jalankanPemeriksaanAkses().catch(() => {}) }, TUNDA_MS)
