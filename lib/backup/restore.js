/* Task172 — pemulihan (restore) backup TANPA enkripsi.
 *
 * Dipanggil `scripts/boot.js` SEBELUM modul bot membuka database:
 *   applyPendingRestore(backupConfig(ROOT))
 *
 * Cara pakai:
 *   1. taruh berkas backup (`…tar.gz`) di dalam folder server, atau
 *   2. lewat WhatsApp: `.backup pulih <link>` / `.backup pulih <berkas>`
 *   3. restart bot → arsip diekstrak ke root.
 *
 * Arsip `.enc` lama (Task171) tidak didukung lagi — enkripsi dihapus atas
 * permintaan owner. Kalau ada arsip lama berakhiran `.enc`, pesannya jelas.
 *
 * Aman: kalau ekstrak gagal, data lama TIDAK disentuh; hasilnya ditulis ke
 * `data/backup-system/restore-hasil.json`.
 */

import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

function tulisHasil(cfg, data) {
  try {
    fs.mkdirSync(cfg.dir, { recursive: true })
    fs.writeFileSync(path.join(cfg.dir, 'restore-hasil.json'), JSON.stringify(data, null, 2), { mode: 0o600 })
  } catch (error) { }
}

/** Daftar isi arsip (untuk laporan sebelum/sesudah ekstrak). */
export function pratinjauArsip(berkas, batasMs = 120000) {
  const keluaran = execFileSync('tar', ['-tzf', berkas], { encoding: 'utf8', timeout: batasMs, stdio: ['ignore', 'pipe', 'ignore'] })
  const daftar = keluaran.split('\n').filter(Boolean)
  const ringkas = {
    jumlah: daftar.length,
    adaSesi: daftar.some((x) => x.startsWith('sessions/')),
    adaJadibot: daftar.some((x) => x.startsWith('sessions/jadibot/')),
    adaSitus: daftar.some((x) => x.startsWith('situs/')),
    adaData: daftar.some((x) => x.startsWith('data/')),
    adaTunnel: daftar.includes('.tunnel.env'),
  }
  return ringkas
}

export function applyPendingRestore(cfg) {
  let permintaan = null
  try {
    permintaan = JSON.parse(fs.readFileSync(cfg.pendingRestore, 'utf8'))
  } catch (error) {
    return { applied: false }
  }
  if (!permintaan || !permintaan.berkas) return { applied: false }

  const sumber = path.isAbsolute(permintaan.berkas)
    ? permintaan.berkas
    : path.join(cfg.root, String(permintaan.berkas).replace(/^[\\/]+/, ''))
  const mulai = Date.now()

  try {
    if (!fs.existsSync(sumber)) throw new Error(`berkas backup tidak ditemukan: ${permintaan.berkas}`)
    if (/\.enc$/i.test(sumber)) {
      throw new Error('Arsip terenkripsi (.enc) dari versi lama tidak didukung lagi — pakai arsip .tar.gz.')
    }
    const ringkas = pratinjauArsip(sumber)
    if (!ringkas.jumlah) throw new Error('Arsip kosong/tidak terbaca.')
    execFileSync('tar', ['-xzf', sumber, '-C', cfg.root], { stdio: 'ignore', timeout: 300000 })
    fs.rmSync(cfg.pendingRestore, { force: true })
    const hasil = {
      applied: true,
      restoreId: path.basename(sumber),
      isi: ringkas,
      durasiMs: Date.now() - mulai,
      waktu: new Date().toISOString(),
    }
    tulisHasil(cfg, hasil)
    return hasil
  } catch (error) {
    tulisHasil(cfg, { applied: false, galat: error.message, berkas: permintaan.berkas, waktu: new Date().toISOString() })
    return { applied: false, galat: error.message }
  }
}

export default { applyPendingRestore, pratinjauArsip }
