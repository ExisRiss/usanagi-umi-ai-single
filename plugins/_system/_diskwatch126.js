/* By AlzRiss - Usanagi Umi AI
 *
 * PENJAGA DISK (Task126b)
 *
 * Kenapa ada: 27/10 12.02–16.07 semua perintah error `ENOSPC: no space left
 * on device` — berasal dari `use-multi-file-auth-state.js` (Baileys menulis
 * kredensial sesi jadibot). Artinya DISK server habis, bukan memori.
 * Memori boleh naik-turun, tapi kalau disk habis bot tidak bisa menulis apa pun:
 * sesi putus, database gagal disimpan, media gagal diunduh, semua perintah gagal.
 *
 * Plugin ini:
 *   1. memeriksa sisa disk lewat `fs.statvfsSync` (tanpa memanggil `df`);
 *   2. membersihkan sampah yang AMAN: media lama di `tmp/`, log error lama,
 *      berkas `.tmp` sisa penulisan gagal, backup sesi lama;
 *   3. TIDAK PERNAH menyentuh `sessions/` (sesi hidup), `database.json`,
 *      `.env*`, atau `data/database/`;
 *   4. memberi perintah owner `.disk` (lihat) dan `.disk bersih` (bersihkan sekarang).
 *
 * Ambang: < 90% aman, >= 90% waspada, >= 97% kritis (pembersihan darurat jalan
 * tiap 5 menit dan semua berkas > 15 menit boleh dihapus dari tmp/).
 */

import fs from 'node:fs'
import path from 'node:path'

const MB = 1048576
const MENIT = 60 * 1000

const AMBANG_WASPADA = 0.9
const AMBANG_KRITIS = 0.97

// Umur minimum sebelum sebuah berkas sampah boleh dihapus (ms).
const UMUR_TMP = 45 * MENIT
const UMUR_TMP_DARURAT = 15 * MENIT
const UMUR_TMP_DB = 15 * MENIT
const UMUR_LOG = 3 * 24 * 60 * MENIT
const UMUR_BACKUP = 48 * 60 * MENIT

// Batas ukuran log error yang disimpan (sisanya dihapus dari yang tertua).
const MAKS_LOG_BYTE = 8 * MB

/**
 * Folder dasar bot. Dibaca saat dipanggil (bukan saat modul dimuat) supaya:
 *   - bisa diuji di folder tiruan, dan
 *   - tetap benar kalau bot mengubah process.cwd() setelah boot.
 */
function akarBot() {
  const env = String(process.env.UMI_ROOT || '').trim()
  return env ? path.resolve(env) : process.cwd()
}

function aman(n) {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v : 0
}

/** Ruang disk di sekitar folder bot. Tidak pernah melempar. */
function bacaStatfs(dir) {
  // Nama API berbeda antar versi Node: statfs (v18.15+) / statvfs (nama lama).
  if (typeof fs.statfsSync === 'function') return fs.statfsSync(dir)
  if (typeof fs.statvfsSync === 'function') return fs.statvfsSync(dir)
  return null
}

export function ruangDisk(dir = akarBot()) {
  try {
    const s = bacaStatfs(dir)
    if (!s) return { totalMb: 0, terpakaiMb: 0, bebasMb: 0, persen: 0, status: 'tak diketahui', galat: 'statfs tidak tersedia di Node ini' }
    const blok = aman(s.frsize || s.bsize)
    const total = blok * aman(s.blocks)
    const bebas = blok * aman(s.bavail || s.bfree)
    const terpakai = Math.max(0, total - bebas)
    return {
      totalMb: Math.round(total / MB),
      terpakaiMb: Math.round(terpakai / MB),
      bebasMb: Math.round(bebas / MB),
      persen: total ? Math.round((terpakai / total) * 1000) / 10 : 0,
      status: !total ? 'tak diketahui' : terpakai / total >= AMBANG_KRITIS ? 'kritis' : terpakai / total >= AMBANG_WASPADA ? 'waspada' : 'aman',
    }
  } catch (error) {
    return { totalMb: 0, terpakaiMb: 0, bebasMb: 0, persen: 0, status: 'tak diketahui', galat: error?.message || String(error) }
  }
}

export function sisaBebasMb() {
  const r = ruangDisk()
  return r.totalMb ? r.bebasMb : Infinity
}

async function hapus(jalur, hasil) {
  try {
    const info = await fs.promises.lstat(jalur)
    if (info.isDirectory()) {
      const isi = await fs.promises.readdir(jalur).catch(() => [])
      let byte = 0
      for (const anak of isi) byte += await hapus(path.join(jalur, anak), hasil)
      await fs.promises.rmdir(jalur).catch(() => {})
      hasil.dihapus += 1
      return byte
    }
    const ukuran = info.size
    await fs.promises.unlink(jalur)
    hasil.dihapus += 1
    hasil.byte += ukuran
    return ukuran
  } catch {
    return 0
  }
}

/** Hapus isi folder yang lebih tua dari `umurMs`. */
async function bersihFolder(folder, umurMs, hasil, { batasByte = 0, hanyaBiasa = false } = {}) {
  let isi
  try {
    isi = await fs.promises.readdir(folder, { withFileTypes: true })
  } catch {
    return
  }
  const sekarang = Date.now()
  const daftar = []
  for (const entri of isi) {
    // Jangan pernah menyentuh entri tersembunyi (socket/.X11-unix/.font-unix dsb).
    if (hanyaBiasa && entri.name.startsWith('.')) continue
    const jalur = path.join(folder, entri.name)
    let info
    try {
      info = await fs.promises.lstat(jalur)
    } catch {
      continue
    }
    daftar.push({ jalur, waktu: info.mtimeMs || 0, ukuran: info.size || 0, folder: entri.isDirectory() })
  }
  // Urut tertua → terbaru, supaya kalau kena batas ukuran yang dihapus memang yang lama.
  daftar.sort((a, b) => a.waktu - b.waktu)

  let totalByte = daftar.reduce((n, d) => n + (d.folder ? 0 : d.ukuran), 0)
  for (const d of daftar) {
    const terlaluTua = sekarang - d.waktu > umurMs
    const kelebihanUkuran = batasByte > 0 && totalByte > batasByte
    if (!terlaluTua && !kelebihanUkuran) continue
    await hapus(d.jalur, hasil)
    totalByte -= d.folder ? 0 : d.ukuran
  }
}

/**
 * Bersihkan sampah disk. Aman dijalankan berulang.
 * @param {{darurat?:boolean, kering?:boolean}} opsi
 */
export async function bersihkanDisk(opsi = {}) {
  const darurat = opsi.darurat === true
  const hasil = { dihapus: 0, byte: 0, rincian: {} }
  const sebelum = ruangDisk()

  const akar = akarBot()
  const target = [
    { nama: 'tmp', folder: path.join(akar, 'tmp'), umur: darurat ? UMUR_TMP_DARURAT : UMUR_TMP },
  ]
  // /tmp sistem SENGAJA tidak disentuh: di container sering tmpfs (RAM, bukan
  // disk → tidak menambah ruang) dan bisa berisi socket proses lain.
  // Media milik bot disimpan di <folder bot>/tmp yang tetap dibersihkan di atas.
  target.push(
    { nama: 'log-error', folder: path.join(akar, 'data', 'errors'), umur: UMUR_LOG, batasByte: MAKS_LOG_BYTE },
    { nama: 'backup-jadibot', folder: path.join(akar, 'data', 'jadibot-backups'), umur: UMUR_BACKUP },
  )

  for (const t of target) {
    const awal = hasil.dihapus
    if (!opsi.kering) await bersihFolder(t.folder, t.umur, hasil, { batasByte: t.batasByte || 0, hanyaBiasa: t.hanyaBiasa === true })
    hasil.rincian[t.nama] = hasil.dihapus - awal
  }

  // Sisa berkas sementara penulisan database/JSON yang gagal.
  const akarKandidat = [akar, path.join(akar, 'data')]
  for (const folder of akarKandidat) {
    let isi = []
    try {
      isi = await fs.promises.readdir(folder)
    } catch {
      continue
    }
    for (const nama of isi) {
      if (!nama.endsWith('.tmp')) continue
      const jalur = path.join(folder, nama)
      try {
        const info = await fs.promises.lstat(jalur)
        if (Date.now() - info.mtimeMs < UMUR_TMP_DB) continue
        if (!opsi.kering) {
          await fs.promises.unlink(jalur)
          hasil.dihapus += 1
          hasil.byte += info.size || 0
        }
        hasil.rincian.tmp_db = (hasil.rincian.tmp_db || 0) + 1
      } catch {}
    }
  }

  const sesudah = ruangDisk()
  return {
    ...hasil,
    mbDibebaskan: Math.round((hasil.byte / MB) * 10) / 10,
    bebasSebelumMb: sebelum.bebasMb,
    bebasSesudahMb: sesudah.bebasMb,
    persenSesudah: sesudah.persen,
    statusSesudah: sesudah.status,
  }
}

function berkasCatatan() {
  return path.join(akarBot(), 'data', 'disk-watch.json')
}

/** Simpan kondisi disk supaya bisa diperiksa dari luar (tanpa buka console). */
function catatDisk(tambahan = {}) {
  try {
    const berkas = berkasCatatan()
    const isi = {
      at: new Date().toISOString(),
      uptimeMenit: Math.round(process.uptime() / 60),
      ...ruangDisk(),
      ...tambahan,
    }
    fs.mkdirSync(path.dirname(berkas), { recursive: true })
    fs.writeFileSync(berkas, JSON.stringify(isi, null, 1))
  } catch (error) {
    console.warn('[DISKWATCH] gagal mencatat:', error?.message || error)
  }
}

let putaranAman = 0
let galatBeruntun = 0

function bar(persen) {
  const penuh = Math.max(0, Math.min(10, Math.round(persen / 10)))
  return `${'■'.repeat(penuh)}${'□'.repeat(10 - penuh)}`
}

const handler = async (m, { conn, args, usedPrefix }) => {
  const aksi = String(args[0] || '').toLowerCase()
  if (aksi === 'bersih' || aksi === 'clean') {
    const h = await bersihkanDisk({ darurat: true })
    catatDisk({ aksi: 'bersih-manual', hasil: { dihapus: h.dihapus, mb: h.mbDibebaskan } })
    const teks = [
      '🧹 *BERSIH DISK SELESAI*',
      '',
      `Dihapus      : ${h.dihapus} entri (${h.mbDibebaskan} MB)`,
      `rincian      : ${Object.entries(h.rincian).map(([k, v]) => `${k}=${v}`).join(', ') || '-'}`,
      `Bebas        : ${h.bebasSebelumMb} → ${h.bebasSesudahMb} MB`,
      `Status       : ${h.statusSesudah}`,
    ]
    return conn.sendMessage(m.chat, { text: teks.join('\n') }, { quoted: m.raw })
  }

  const r = ruangDisk()
  catatDisk({ aksi: 'cek-manual' })
  const teks = [
    '💾 *PENJAGA DISK*',
    '',
    `Kapasitas    : ${r.totalMb} MB`,
    `Terpakai     : ${r.terpakaiMb} MB (${r.persen}%)`,
    `Bebas        : ${r.bebasMb} MB`,
    `[${bar(r.persen)}]`,
    `Status       : ${r.status === 'aman' ? '✅ aman' : r.status === 'waspada' ? '⚠️ waspada' : r.status === 'kritis' ? '🛑 kritis' : '❔ tak diketahui'}`,
    '',
    'Pembersihan otomatis: tmp 45 mnt · log error 3 hari / maks 8 MB · backup 48 jam',
    `Perintah     : ${usedPrefix}disk bersih — bersihkan sekarang`,
    r.status === 'kritis' ? '🛑 Disk hampir habis — jalankan `.disk bersih` atau hubungi host.' : '',
  ].filter(Boolean)
  await conn.sendMessage(m.chat, { text: teks.join('\n') }, { quoted: m.raw })
}

handler.command = /^(disk|cekdisk|cekruang|diskwatch)$/i
handler.help = ['disk', 'disk bersih']
handler.tags = ['system', 'owner']
handler.owner = true
handler.description = 'Melihat sisa disk server & membersihkan sampah (penjaga ENOSPC)'
handler.limit = false

export default handler

/**
 * Satu putaran pemeriksaan. Dipisah dari setInterval supaya bisa diuji
 * dan dipanggil manual dari tempat lain.
 * @param {{status:string, bebasMb:number, totalMb:number}} [kondisi] hasil ruangDisk()
 */
export async function periksaSekali(kondisi) {
  const r = kondisi || ruangDisk()
  if (!r.totalMb) return { aksi: 'tak-terbaca' }

  // Disk lega: catat saja. Pembersihan ringan cukup tiap 30 menit (6 putaran).
  if (r.status === 'aman') {
    putaranAman += 1
    let hasil = null
    if (putaranAman >= 6) {
      putaranAman = 0
      hasil = await bersihkanDisk({})
    }
    catatDisk({ aksi: 'berkala', hasil: hasil ? { dihapus: hasil.dihapus, mb: hasil.mbDibebaskan } : undefined })
    galatBeruntun = 0
    return { aksi: 'berkala', hasil }
  }

  const darurat = r.status === 'kritis' || Number(r.bebasMb) < 200
  const hasil = await bersihkanDisk({ darurat })
  if (hasil.dihapus) {
    console.log(`[DISKWATCH] ${darurat ? 'darurat' : 'waspada'}: hapus ${hasil.dihapus} entri, bebas ${hasil.bebasSesudahMb} MB`)
  }
  catatDisk({ aksi: darurat ? 'otomatis-darurat' : 'otomatis', hasil: { dihapus: hasil.dihapus, mb: hasil.mbDibebaskan } })
  putaranAman = 0
  galatBeruntun = 0
  return { aksi: darurat ? 'otomatis-darurat' : 'otomatis', hasil }
}

const JARAK_PERIKSA = 5 * 60 * 1000
setInterval(() => {
  periksaSekali().catch(error => {
    galatBeruntun += 1
    if (galatBeruntun < 3) console.warn('[DISKWATCH]', error?.message || error)
  })
}, JARAK_PERIKSA).unref?.()

// Catat kondisi awal sekali saat boot (membantu diagnosa dari console).
// .unref() supaya timer ini tidak menahan proses tetap hidup (mis. saat diuji).
const timerBoot = setTimeout(() => {
  try {
    const r = ruangDisk()
    catatDisk({ aksi: 'boot' })
    console.log(`[DISKWATCH] disk ${r.terpakaiMb}/${r.totalMb} MB (${r.persen}%), bebas ${r.bebasMb} MB — ${r.status}`)
  } catch {}
}, 25_000)
timerBoot.unref?.()
