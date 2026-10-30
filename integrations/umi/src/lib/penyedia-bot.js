/**
 * Jembatan penyedia API untuk paket integrasi `integrations/umi`.
 *
 * Semua fitur AI di paket ini (deepseek, gpt5, claudehaiku, qwen3, unlimitedai)
 * sebelumnya menembak layanan masing-masing (notegpt.io, overchat.ai, …) yang
 * mudah mati/diblokir. Modul ini menyatukan mereka ke penyedia milik bot:
 *
 *   xrina (apiii-xrina.my.id)  → LIVE, diuji 30-10-2026
 *   faa   (api-faa.my.id)      → cadangan
 *   deline(api.deline.web.id)  → cadangan
 *
 * Implementasi aslinya ada di `lib/penyedia-bot.js` milik bot, jadi tidak ada
 * dua daftar penyedia yang bisa berbeda.
 */
export {
  aiTeks,
  gambarAI,
  unduhMedia,
  ambilTeks,
  cekPenyedia,
  statusPenyedia,
  PENYEDIA,
  UA,
} from '../../../../lib/penyedia-bot.js'

import { aiTeks } from '../../../../lib/penyedia-bot.js'

/**
 * Versi ringkas yang dipakai scraper paket: langsung mengembalikan teks.
 * Kalau semua penyedia gagal, kembalikan '' supaya scraper asli yang jalan
 * (perilaku lama tidak hilang, hanya didahulukan penyedia bot).
 *
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export async function aiPenyediaTeks(prompt) {
  try {
    const hasil = await aiTeks(prompt)
    return hasil.ok ? hasil.teks : ''
  } catch {
    return ''
  }
}

export default { aiPenyediaTeks }
