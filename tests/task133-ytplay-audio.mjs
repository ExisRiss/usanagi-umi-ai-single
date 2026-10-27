/* Task133 — `.ytplay` harus tetap bisa didengar walau video tidak tersedia.
 *
 * Latar belakang (log server milik user, 27/10/2026):
 *   [youtube-media] video 60ItHLz5WEA · yt-dlp-720p gagal: yt-dlp tidak ditemukan di server
 *   [youtube-media] video 60ItHLz5WEA · sumber-ourin-video gagal:
 *     piped api.piped.private.coffee: HTTP 502 · azbry (OURIN): isinya text/html
 *
 * Artinya untuk sebagian video, aliran VIDEO memang tidak ada. Yang masih hidup
 * adalah AUDIO dari API OURIN (izuka). Jadi `.ytplay` sekarang mengirim audio
 * itu sebagai pesan audio WhatsApp, bukan berhenti dengan "YT PLAY ERROR".
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baca = (rel) => fs.readFileSync(path.join(AKAR, rel), 'utf8')
const YTPLAY = 'integrations/umi/plugins/download/ytplay.js'

test('ytplay memuat jalur audio cadangan', () => {
  const sumber = baca(YTPLAY)
  assert.match(sumber, /async function ambilAudioSiapKirim\(/, 'harus ada helper pengunduh audio')
  assert.match(sumber, /if \(!stream\?\.url \|\| stream\.audioOnly\)/, 'harus menangani kasus tanpa video')
  assert.match(sumber, /audio: audio\.buffer/, 'harus mengirim berkas audio')
  assert.match(sumber, /audio\/mp4|audio\/mpeg/, 'mimetype audio harus ditentukan')
  // Tidak boleh resolve dua kali: URL audio dari getPlayableStream dipakai ulang.
  assert.match(sumber, /urlSiap: stream\?\.audioOnly \? stream\.url : ""/)
})

test('plugin tidak memakai m.reply(teks, m) — pelajaran Task131', () => {
  const sumber = baca(YTPLAY)
  assert.doesNotMatch(sumber, /\.reply\([^)]*,\s*m\s*\)/)
})

test('pesan gagal unduh video menyarankan .ytmp3', () => {
  const sumber = baca('lib/youtube-media.js')
  assert.match(sumber, /pakai \.ytmp3 atau \.ytplay/)
})

test('API OURIN benar-benar mengalirkan audio (uji jaringan)', { timeout: 120000 }, async () => {
  const mod = await import(path.join(AKAR, 'lib/yt-sumber.js'))
  const sumber = await mod.sumberMedia('60ItHLz5WEA', 'audio')
  assert.ok(sumber.url, 'harus mendapat URL audio')
  assert.match(sumber.sumber, /izuka|azbry/i, `sumber tak terduga: ${sumber.sumber}`)
  assert.match(sumber.tipe, /^audio\//, `content-type harus audio, dapat ${sumber.tipe}`)

  const hasil = await mod.unduhMedia(sumber.url, { maksByte: 16 * 1024 * 1024 })
  assert.ok(hasil.byte > 512 * 1024, `audio harus lebih dari 512 KB, dapat ${hasil.byte}`)
})
