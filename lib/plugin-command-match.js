/* By AlzRiss - Usanagi Umi AI
 *
 * MENCARI TAHU APAKAH SEBUAH ID TOMBOL ADALAH PERINTAH YANG TERDAFTAR (Task127)
 *
 * Modul bebas dependensi supaya bisa diuji tanpa memuat seluruh bot.
 *
 * Kenapa diperbaiki: versi lama memecah `plugin.command.source` dengan
 * `split('|')` lalu membuang karakter regex. Untuk pola berkelompok seperti
 *
 *     /^(umimenu|lmenu|menu|menu_all(?:_\d+)?|menu_(?:owner|group|game|tools|refresh))$/i
 *
 * hasilnya potongan sampah ("menu_all_d+", "menu_(?:owner" …) sehingga
 * `menu_owner` dan `menu_all` TIDAK pernah dianggap perintah. Akibatnya
 * `_templateResponse.js` melewati ID tombol dan bot tidak membalas apa pun —
 * persis keluhan "Owner Menu di button menu ga respon".
 *
 * Sekarang: regex disimpan UTUH dan diuji langsung ke ID, jadi hasilnya selalu
 * sama dengan yang nanti dipakai `handler.js` saat mencocokkan plugin.
 */

/**
 * Bangun daftar perintah dari objek plugin (biasanya `global.plugins`).
 * @param {Record<string, any>} plugins
 * @returns {{cmd: Set<string>, help: Set<string>, regex: RegExp[], at: number}}
 */
export function bangunDaftarPerintah(plugins = {}) {
  const cmd = new Set()
  const help = new Set()
  const regex = []

  for (const key in plugins) {
    const plugin = plugins[key]
    if (!plugin) continue
    try {
      if (plugin.command instanceof RegExp) {
        // Uji utuh — ini yang menentukan hasil sebenarnya.
        regex.push(plugin.command)
        // Cadangan untuk ID yang ditulis apa adanya (tanpa grup/opsional).
        const source = String(plugin.command.source || '')
        if (!/[()[\]{}?*+]/.test(source)) {
          for (const part of source.replace(/^\^|\$$/g, '').split('|')) {
            const clean = part.trim().toLowerCase()
            if (clean) cmd.add(clean)
          }
        }
      } else if (Array.isArray(plugin.command)) {
        for (const item of plugin.command) {
          if (item instanceof RegExp) regex.push(item)
          else if (item) cmd.add(String(item).toLowerCase())
        }
      } else if (plugin.command) {
        cmd.add(String(plugin.command).toLowerCase())
      }

      if (Array.isArray(plugin.help)) for (const item of plugin.help) help.add(String(item).toLowerCase())
      else if (plugin.help) help.add(String(plugin.help).toLowerCase())
    } catch {
      /* plugin rusak: lewati */
    }
  }

  return { cmd, help, regex, at: Date.now() }
}

/**
 * Apakah `id` adalah perintah/tombol yang dikenal bot?
 * @param {{cmd:Set<string>, help:Set<string>, regex:RegExp[]}} daftar
 * @param {string} id
 */
export function cocokPerintah(daftar, id) {
  const word = String(id == null ? '' : id)
    .trim()
    .replace(/^[^\w]+/, '')
    .split(/\s+/)[0]
    .toLowerCase()
  if (!word) return false

  if (daftar?.cmd?.has?.(word)) return true
  if (daftar?.help?.has?.(word)) return true

  for (const pola of daftar?.regex || []) {
    try {
      pola.lastIndex = 0
      if (pola.test(word)) return true
    } catch {
      /* pola rusak: lewati */
    }
  }
  return false
}

export default { bangunDaftarPerintah, cocokPerintah }
