/* Task133 — unduhan permintaan VIDEO yang berakhir dengan AUDIO.
 *
 * Di server milik user (`eeb08e90`) tidak ada yt-dlp, Piped membalas 502 untuk
 * video tertentu, dan azbry mengirim halaman HTML. Sebelum Task133,
 * `downloadYoutube(url, { type: 'video' })` melempar error sehingga `.ytmp4`
 * dan `.ytplay` gagal total. Sekarang: kalau semua sumber video mati, audionya
 * diunduh lewat API OURIN dan hasilnya ditandai `audioOnly: true` supaya
 * plugin mengirim pesan audio (bukan mp3 yang dipaksa jadi video).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baca = (rel) => fs.readFileSync(path.join(AKAR, rel), 'utf8')

test('ketiga pemakai downloadYoutube menghormati audioOnly', () => {
  const ytmp4 = baca('plugins/download/usanagi-ytmp4.js')
  assert.match(ytmp4, /if \(hasil\.audioOnly\)/, 'ytmp4 harus mengirim audio saat hanya audio tersedia')
  assert.match(ytmp4, /audio: \{ url: media \}/, 'ytmp4 harus mengirim berkas audio')

  const ytplay = baca('plugins/music/umi-usanagi-ai-ytplay.js')
  assert.match(ytplay, /if \(media\.audioOnly\)/, 'ytplay harus mengirim audio saat hanya audio tersedia')

  const play = baca('plugins/download/usanagi-play.js')
  assert.match(play, /UMI_AUDIO_ONLY/, 'play tidak boleh mengirim audio sebagai video')
})

test('unduhan video -> audio mengalir nyata (uji jaringan)', { timeout: 300000 }, async () => {
  const { downloadYoutube } = await import(path.join(AKAR, 'lib/youtube-media.js'))
  const hasil = await downloadYoutube('60ItHLz5WEA', {
    type: 'video',
    maxBytes: 80 * 1024 * 1024,
    prefix: 'task133-uji',
  })
  try {
    const ukuran = fs.statSync(hasil.file).size
    assert.ok(ukuran > 512 * 1024, `berkas harus > 512 KB, dapat ${ukuran}`)
    assert.ok(ukuran <= 80 * 1024 * 1024, 'berkas tidak boleh melewati batas')

    if (hasil.audioOnly) {
      /* Server tanpa sumber video sama sekali: audio dikirim sebagai audio. */
      assert.match(hasil.file, /\.(mp3|m4a)$/i, `berkas audio, dapat ${hasil.file}`)
      assert.match(hasil.provider, /izuka|azbry|piped/i, `penyedia audio: ${hasil.provider}`)
    } else {
      /* Ada sumber video (di sandbox SaveTube kadang hidup): harus mp4 asli. */
      assert.match(hasil.file, /\.mp4$/i, `berkas video, dapat ${hasil.file}`)
      const kepala = fs.readFileSync(hasil.file).subarray(0, 4096)
      assert.ok(kepala.includes(Buffer.from('ftyp')), 'berkas mp4 harus punya kotak ftyp (bukan HTML)')
      assert.ok(!/savetube|izuka|piped/.test(hasil.provider) === false, `penyedia: ${hasil.provider}`)
    }
  } finally {
    fs.rmSync(hasil.file, { force: true })
  }
})
