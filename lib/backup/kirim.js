/* Task171 — kirim link hasil upload ke nomor owner.
 *
 * Memakai soket bot yang sedang hidup (`global.conn`, disetel main.js).
 * Kalau bot sedang tidak terhubung, pesan disimpan ke
 * `data/backup-system/antre-notif.json` dan dikirim pada kesempatan berikutnya.
 * Tidak pernah mencetak kredensial ke log.
 */

import fs from 'fs'
import path from 'path'

function bacaAntre(berkas) {
  try {
    const isi = JSON.parse(fs.readFileSync(berkas, 'utf8'))
    return Array.isArray(isi) ? isi : []
  } catch (error) {
    return []
  }
}

function simpanAntre(berkas, data) {
  try {
    fs.mkdirSync(path.dirname(berkas), { recursive: true })
    fs.writeFileSync(berkas, JSON.stringify(data.slice(-20), null, 2), { mode: 0o600 })
  } catch (error) { }
}

function soket() {
  const conn = global.conn
  if (!conn || typeof conn.sendMessage !== 'function') return null
  if (!conn.user || !conn.user.id) return null
  return conn
}

export async function kirimKeOwner(cfg, teks) {
  const tujuan = `${cfg.owner}@s.whatsapp.net`
  const conn = soket()
  if (!conn) {
    const antre = bacaAntre(cfg.antreNotif)
    antre.push({ waktu: Date.now(), teks })
    simpanAntre(cfg.antreNotif, antre)
    return { terkirim: false, alasan: 'bot belum terhubung — masuk antre' }
  }
  try {
    const hasil = await conn.sendMessage(tujuan, { text: teks })
    return { terkirim: true, pesanId: (hasil && hasil.key && hasil.key.id) || '' }
  } catch (error) {
    const antre = bacaAntre(cfg.antreNotif)
    antre.push({ waktu: Date.now(), teks })
    simpanAntre(cfg.antreNotif, antre)
    return { terkirim: false, alasan: error.message }
  }
}

/** Kirim ulang pesan yang tertunda (dipanggil tiap putaran backup). */
export async function kirimAntre(cfg) {
  const antre = bacaAntre(cfg.antreNotif)
  if (!antre.length) return { jumlah: 0, terkirim: 0 }
  const conn = soket()
  if (!conn) return { jumlah: antre.length, terkirim: 0 }
  const sisa = []
  let terkirim = 0
  for (const item of antre) {
    try {
      await conn.sendMessage(`${cfg.owner}@s.whatsapp.net`, { text: String(item.teks || '') })
      terkirim += 1
    } catch (error) {
      sisa.push(item)
    }
  }
  simpanAntre(cfg.antreNotif, sisa)
  return { jumlah: antre.length, terkirim }
}

export default { kirimKeOwner, kirimAntre }
