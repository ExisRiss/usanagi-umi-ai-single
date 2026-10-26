/* By AlzRiss - Usanagi Umi AI
 *
 * Deteksi prefix "nyasar".
 *
 * Masalah nyata (laporan 25-10-2026): owner mengganti prefix bot menjadi
 * "/", "?" atau "!", bot menjawab "Prefix ... diubah", tetapi perintah berikut
 * tetap tidak dijalankan karena pesan yang dikirim masih memakai prefix lama
 * (biasanya ".") atau chat itu belum punya baris prefix sendiri sehingga masih
 * memakai default lama yang tersimpan di memori saat bot start.
 *
 * Supaya bot tidak "bengong" ketika itu terjadi, satu pesan boleh memakai
 * simbol prefix lain ASALKAN sisa teksnya benar-benar nama perintah yang
 * terdaftar. Contoh: prefix aktif "!" lalu user mengetik ".menu" → tetap jalan.
 * Ini hanya berlaku untuk simbol umum, tidak untuk teks biasa, dan tidak
 * mengubah prefix tersimpan.
 */

const CANDIDATES = ['!', '/', '?', '.', '#', '$', '%', '&', '+', '-', ',', ':', ';', '*', '~', '=', '>']

let index = { size: -1, names: new Set(), patterns: [] }

function commandList(plugin) {
  const spec = plugin && plugin.command
  if (!spec) return []
  return Array.isArray(spec) ? spec : [spec]
}

function buildIndex(plugins) {
  const names = new Set()
  const patterns = []
  for (const key of Object.keys(plugins || {})) {
    const plugin = plugins[key]
    if (!plugin) continue
    for (const entry of commandList(plugin)) {
      if (typeof entry === 'string') {
        names.add(entry.toLowerCase())
      } else if (entry instanceof RegExp) {
        patterns.push(entry)
      }
    }
  }
  return { size: Object.keys(plugins || {}).length, names, patterns }
}

function getIndex(plugins) {
  const size = Object.keys(plugins || {}).length
  if (size !== index.size) index = buildIndex(plugins)
  return index
}

/** Nama perintah dikenali? (dipakai juga oleh plugin lain bila perlu) */
export function isKnownCommand(word, plugins) {
  const value = String(word || '').toLowerCase().trim()
  if (!value) return false
  const data = getIndex(plugins)
  if (data.names.has(value)) return true
  return data.patterns.some(pattern => {
    pattern.lastIndex = 0
    return pattern.test(value)
  })
}

/**
 * Kembalikan simbol prefix alternatif yang masuk akal untuk pesan ini,
 * atau '' kalau tidak ada.
 */
export function detectAlternatePrefix(text, plugins, activePrefix) {
  const raw = String(text || '').trim()
  if (!raw || raw.length < 2) return ''
  const active = String(activePrefix || '')
  if (active && raw.startsWith(active)) return ''
  const symbol = raw[0]
  if (!CANDIDATES.includes(symbol)) return ''
  const rest = raw.slice(1).trim()
  if (!rest) return ''
  const word = rest.split(/\s+/)[0]
  if (!word || word.length > 40) return ''
  return isKnownCommand(word, plugins) ? symbol : ''
}

export const FALLBACK_PREFIXES = CANDIDATES.slice()

export default { detectAlternatePrefix, isKnownCommand, FALLBACK_PREFIXES }
