/* By AlzRiss - Usanagi Umi AI
 *
 * GETSC (Task184) — kirim source code bot (ZIP) langsung ke peminta.
 *
 * Gerbang: HANYA owner utama (data/owner-utama.json) atau developer (nomor
 * terkunci di config / global.owner) — owner biasa & pengguna umum ditolak.
 *
 * Berkas DIAMBIL LANGSUNG dari GitHub repo bot (branch main, codeload —
 * tanpa token, selalu commit terbaru) lalu dikirim sebagai dokumen.
 * JANGAN memakai env GITHUB_REPO: nilainya menunjuk repo lain (catatan
 * Task177) — repo dikunci di konstanta ini.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { sendLocalMediaFast } from '../../lib/awang-media-transfer.js'

const REPO = 'ExisRiss/usanagi-umi-ai-single'
const BRANCH = 'main'
const ZIP_URL = `https://codeload.github.com/${REPO}/legacy.zip/refs/heads/${BRANCH}`
const MAKS_ZIP = 60 * 1024 * 1024 // zipball terukur ~39 MB (4.239 berkas)

/** Unduh zipball repo ke file sementara. @returns {Promise<{file:string, bytes:number}>} */
export async function unduhZipball() {
  const tujuan = path.join(os.tmpdir(), `getsc-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.zip`)
  const res = await fetch(ZIP_URL, {
    redirect: 'follow',
    signal: AbortSignal.timeout(300000),
    headers: { 'User-Agent': 'UMI-GetSC' },
  })
  if (!res.ok || !res.body) throw new Error(`GitHub tidak mengizinkan unduhan (HTTP ${res.status}).`)

  let total = 0
  const batas = new Transform({
    transform(potongan, _enc, selesai) {
      total += potongan.length
      if (total > MAKS_ZIP) {
        selesai(new Error('Ukuran zip melebihi batas 60 MB — repo terlalu besar untuk dikirim via WhatsApp.'))
        return
      }
      selesai(null, potongan)
    },
  })
  try {
    await pipeline(res.body, batas, fs.createWriteStream(tujuan))
  } catch (error) {
    fs.rmSync(tujuan, { force: true })
    throw error
  }
  if (!total) {
    fs.rmSync(tujuan, { force: true })
    throw new Error('GitHub mengirim file kosong.')
  }
  return { file: tujuan, bytes: total }
}

/** Info commit terbaru (opsional — kalau API gagal, lanjut tanpa). */
async function infoCommit() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/commits/${BRANCH}`, {
      headers: { 'User-Agent': 'UMI-GetSC', Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return {
      sha: String(data.sha || '').slice(0, 7),
      tanggal: String(data.commit?.committer?.date || '').slice(0, 10),
      pesan: String(data.commit?.message || '').split('\n')[0].slice(0, 90),
    }
  } catch { return null }
}

const handler = async (m, { conn, isOwnerUtama, isDeveloper, usedPrefix }) => {
  /* Gerbang ketat: owner utama ATAU developer. */
  if (!isOwnerUtama && !isDeveloper) {
    await m.reply('🔒 Perintah ini khusus *owner utama* atau *developer*.\nRole kamu tidak berhak mengunduh source code bot.')
    return
  }

  await m.reply('⏳ Mengambil source code dari GitHub (branch main)…')
  let hasil = null
  try {
    const [commit, zip] = await Promise.all([infoCommit(), unduhZipball()])
    hasil = zip
    const ukuran = (zip.bytes / 1048576).toFixed(1)
    const baris = [
      '📦 *SOURCE CODE BOT*',
      '',
      `Repo   : ${REPO}`,
      `Branch : ${BRANCH}`,
      commit ? `Commit : ${commit.sha} (${commit.tanggal})` : 'Commit : terbaru',
      commit?.pesan ? `Update : ${commit.pesan}` : '',
      `Ukuran : ${ukuran} MB`,
      '',
      `_Dikirim atas permintaan ${isDeveloper ? 'developer' : 'owner utama'}._`,
    ].filter(Boolean).join('\n')

    await sendLocalMediaFast(conn, m, zip.file, {
      type: 'document',
      mimeType: 'application/zip',
      fileName: `${REPO.split('/')[1]}-${BRANCH}.zip`,
      caption: baris,
      maxBytes: MAKS_ZIP,
    })
    console.log('[getsc] zip terkirim ke', m.sender, `${zip.bytes} B`, commit?.sha || '')
  } catch (error) {
    console.warn('[getsc]', error?.message || error)
    if (hasil?.file) fs.rmSync(hasil.file, { force: true })
    await m.reply(`❌ Gagal mengirim source code: ${error?.message || 'coba lagi nanti.'}`)
  }
}

handler.command = /^(getsc)$/i
handler.help = ['getsc (owner utama/developer)']
handler.tags = ['owner']
handler.category = 'owner'
handler.description = 'Kirim file source code bot (ZIP) langsung dari GitHub — khusus owner utama & developer.'
handler.owner = true // framework: lewat dulu gerbang owner biasa; gerbang utama/dev ada di dalam handler
handler.limit = false

export default handler
