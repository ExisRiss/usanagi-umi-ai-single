/* By AlzRiss - Usanagi Umi AI
 *
 * Task151 — pemeriksa kode untuk fitur yang menerima kode dari WhatsApp
 * (`.addplugin` dan `.addcase`).
 *
 * Berkas ini TIDAK menjalankan kode. Tugasnya hanya:
 *   - membuang pagar ``` dari kode yang dikirim,
 *   - menolak pola berbahaya (child_process, eval, kredensial, hapus berkas),
 *   - merapikan nama fitur menjadi nama berkas yang aman,
 *   - memecah potongan `case 'nama': ... break` menjadi daftar case,
 *   - memastikan nama perintah belum dipakai plugin lain.
 */

/* ── pagar kode ────────────────────────────────────────────────────────── */

export function bersihkanPagarKode(value) {
  let code = String(value === undefined || value === null ? '' : value)
    .replace(/^\uFEFF/, '')
    .trim()
  const berpagar = code.match(/^```(?:javascript|js|mjs|cjs|txt)?\s*\n?([\s\S]*?)\n?```$/i)
  if (berpagar) code = berpagar[1].trim()
  return code
}

/* ── pemeriksaan keamanan ──────────────────────────────────────────────── */

const ATURAN_BAHAYA = [
  [/\b(?:child_process|node:child_process)\b/i, 'akses child_process'],
  [/\b(?:execSync|execFileSync|spawnSync|execFile|spawn)\s*\(/i, 'eksekusi proses sistem'],
  [/\b(?:eval|new\s+Function|Function\s*\()/i, 'eksekusi kode dinamis'],
  [/\bprocess\s*\.\s*(?:env|exit|kill|binding|dlopen)\b/i, 'akses proses sensitif'],
  [/\brequire\s*\(\s*['"`](?:node:)?(?:child_process|fs|net|http|https|tls|dgram)['"`]/i, 'impor modul sistem'],
  [/(?:sessions[\\/]|creds\.json|\.env\b|api[_-]?key|subdomain-kaira)/i, 'akses kredensial/session'],
  [/\bfs\s*\.\s*(?:rm|rmSync|rmdir|rmdirSync|unlink|unlinkSync)\s*\(/i, 'penghapusan filesystem'],
  [/\b(?:global\s*\.\s*(?:db|plugins|conn)\s*=\s*)/i, 'penimpaan objek global'],
  [/(?:config|main|handler)\.js['"`]?\s*,?\s*(?:\)|,)/i, 'perubahan file inti'],
  [/\bhandler\s*\.\s*command\s*=\s*[^\n]*(?:addplugin|installplugin|addcase)/i, 'pengambilalihan command installer'],
]

/** Lempar Error bila kode memuat pola berbahaya. */
export function periksaKeamananKode(code) {
  const teks = String(code || '')
  const ditolak = ATURAN_BAHAYA
    .filter(([pola]) => pola.test(teks))
    .map(([, label]) => label)
  if (ditolak.length) {
    throw new Error(`Kode ditolak oleh pemeriksaan keamanan: ${ditolak.join(', ')}.`)
  }
}

/* ── nama fitur ────────────────────────────────────────────────────────── */

const NAMA_TERLARANG = new Set([
  'addplugin', 'installplugin', 'addcase', 'addsubdomainmy', 'dellsubdomainmy',
  'kontrolsubdomain', 'hapussubdomain', 'deploysubdomain', 'menu', 'allmenu',
  'owner', 'self', 'eval', 'exec', 'restart', 'bot',
])

export function namaFiturAman(nama) {
  const bersih = String(nama || '')
    .trim()
    .toLowerCase()
    .replace(/^\.+/, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
  if (bersih.length < 2) return ''
  if (!/[a-z]/.test(bersih)) return ''
  if (NAMA_TERLARANG.has(bersih)) return ''
  return bersih
}

/** Kumpulan nama perintah yang sudah dipakai plugin yang termuat. */
export function daftarPerintahTerpakai(plugins) {
  const hasil = new Set()
  const sumber = plugins && typeof plugins === 'object' ? plugins : (global.plugins || {})
  for (const plugin of Object.values(sumber)) {
    if (!plugin || typeof plugin !== 'object' && typeof plugin !== 'function') continue
    const command = plugin.command
    if (!command) continue
    if (Array.isArray(command)) {
      for (const item of command) hasil.add(String(item).toLowerCase())
    } else if (command instanceof RegExp) {
      /* Regex plugin tidak bisa diuji balik; simpan polanya untuk uji langsung. */
      hasil.add(command)
    } else {
      hasil.add(String(command).toLowerCase())
    }
  }
  return hasil
}

/** True bila nama perintah sudah dipakai plugin lain (array atau regex). */
export function perintahSudahDipakai(nama, plugins) {
  const kunci = String(nama || '').toLowerCase()
  if (!kunci) return false
  const terpakai = daftarPerintahTerpakai(plugins)
  for (const item of terpakai) {
    if (item instanceof RegExp) {
      try {
        if (item.test(kunci)) return true
      } catch (error) { /* regex rusak — abaikan */ }
      continue
    }
    if (item === kunci) return true
  }
  return false
}

/* ── pemecah case ──────────────────────────────────────────────────────── */

const POLA_CASE = /(?:^|\n)[ \t]*case[ \t]*(['"`])([^'"`\n]+)\1[ \t]*:/g

/**
 * Pecah kode bergaya switch menjadi daftar `{ label, isi }`.
 * Kode tanpa `case` dikembalikan sebagai satu entri dengan label ''.
 */
export function pecahBlokCase(code) {
  const teks = String(code || '').replace(/\r\n/g, '\n')
  const cocok = [...teks.matchAll(POLA_CASE)]
  if (!cocok.length) return [{ labels: [], isi: rapikanIsi(teks) }]

  const hasil = []
  let tertunda = []
  for (let i = 0; i < cocok.length; i++) {
    const mulai = cocok[i].index + cocok[i][0].length
    const akhir = i + 1 < cocok.length ? cocok[i + 1].index : teks.length
    const potong = teks.slice(mulai, akhir).split(/\n[ \t]*default[ \t]*:/)[0]
    const label = cocok[i][2].trim()
    const isi = rapikanIsi(potong)
    if (!isi) {
      /* `case 'a':` langsung diikuti `case 'b':` → keduanya satu isi. */
      tertunda.push(label)
      continue
    }
    hasil.push({ labels: [...tertunda, label], isi })
    tertunda = []
  }
  return hasil
}

/**
 * Buang sisa switch yang tidak berguna di dalam fungsi:
 * `break`, `default:` kosong, dan `case` lain yang terselip.
 */
export function rapikanIsi(isi) {
  return String(isi || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((baris) => !/^\s*break\s*;?\s*$/.test(baris))
    .filter((baris) => !/^\s*\/\/\s*$/.test(baris))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*\n|\n\s*$/g, '')
}

/** Beri indentasi 2 spasi untuk disisipkan ke dalam fungsi. */
export function indentasi(isi, spasi = 2) {
  const awalan = ' '.repeat(spasi)
  return String(isi || '')
    .split('\n')
    .map((baris) => (baris.trim() ? awalan + baris : ''))
    .join('\n')
}
