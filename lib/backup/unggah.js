/* Task172 — unggah arsip backup ke upload.gwenna.my.id TANPA enkripsi.
 *
 * Permintaan owner: "hapus aja enc" — arsip diunggah apa adanya (.tar.gz)
 * supaya bisa langsung diunduh, diekstrak, dan dipakai di server tunnel baru.
 *
 * Catatan keamanan (penting):
 *   Arsip berisi sessions/ (kredensial WhatsApp), .env, dan .tunnel.env.
 *   Siapa pun yang punya LINK bisa mengunduhnya. Karena itu arsip disimpan di
 *   folder ber-ID RANDOM yang hanya diketahui bot & owner (bukan id akun
 *   nomor HP yang bisa dihitung), dan link hanya dikirim ke nomor owner.
 */

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { namaBerkasAman, hostUpload, batasUkuranUpload, bacaKonfigUpload } from '../upload-publik.js'

const AKAR_UPLOAD = path.join(process.cwd(), 'data', 'upload-publik')

/** Folder rahasia untuk arsip backup — dibuat sekali, disimpan di data/. */
export function folderBackup(cfg) {
  const berkas = path.join(cfg.dir, 'folder-unggah.json')
  try {
    const isi = JSON.parse(fs.readFileSync(berkas, 'utf8'))
    if (isi && /^bk[a-z0-9]{8,}$/.test(String(isi.id || ''))) return String(isi.id)
  } catch (error) { }
  const id = `bk${crypto.randomBytes(6).toString('hex')}`
  try {
    fs.mkdirSync(cfg.dir, { recursive: true })
    fs.writeFileSync(berkas, JSON.stringify({ id, dibuat: Date.now() }, null, 2), { mode: 0o600 })
  } catch (error) { }
  return id
}

function namaUnik(folder, nama) {
  const ext = nama.endsWith('.tar.gz') ? '.tar.gz' : path.extname(nama)
  const dasar = nama.slice(0, nama.length - ext.length) || 'berkas'
  let calon = nama
  let n = 0
  while (fs.existsSync(path.join(folder, calon)) && n < 500) {
    n += 1
    calon = `${dasar}-${n}${ext}`
  }
  return calon
}

/**
 * @returns {Promise<{url:string, urlUnduh:string, nama:string, ukuran:number, folder:string, host:string, enkripsi:boolean}>}
 */
export async function unggahArsip(cfg, arsip) {
  const batas = Math.min(cfg.maksArsipByte, batasUkuranUpload())
  const ukuran = fs.statSync(arsip.berkas).size
  if (ukuran > batas) {
    throw new Error(`Arsip ${(ukuran / 1048576).toFixed(1)} MB melebihi batas unggah ${(batas / 1048576).toFixed(0)} MB.`)
  }

  const id = folderBackup(cfg)
  const folder = path.join(AKAR_UPLOAD, id)
  fs.mkdirSync(folder, { recursive: true, mode: 0o755 })

  const namaAman = namaUnik(folder, namaBerkasAman(arsip.nama, 'backup.tar.gz') || 'backup.tar.gz')
  const tujuan = path.join(folder, namaAman)
  fs.copyFileSync(arsip.berkas, tujuan)
  try { fs.chmodSync(tujuan, 0o644) } catch (error) { }

  try {
    fs.appendFileSync(path.join(folder, '.index.jsonl'), JSON.stringify({
      nama: namaAman, ukuran, mime: 'application/gzip', waktu: Date.now(), jenis: 'backup',
    }) + '\n')
  } catch (error) { }

  const host = hostUpload() || bacaKonfigUpload().host
  const url = `https://${host}/${id}/${encodeURIComponent(namaAman)}`
  return {
    url,
    urlUnduh: `${url}?dl=1`,
    nama: namaAman,
    ukuran,
    folder: id,
    host,
    enkripsi: false,
  }
}

export default unggahArsip
