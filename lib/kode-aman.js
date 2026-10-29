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

/* ── deteksi fungsi yang dideklarasikan tapi tidak pernah dipanggil ─────── */

const POLA_FUNGSI = /(?:^|\n)[ \t]*(?:async[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)[ \t]*\(/g

/**
 * Cari fungsi tingkat atas yang hanya dideklarasikan, tanpa dipanggil.
 *
 * Kasus nyata: user mengirim
 *     async function Bug2(sock, jid) { ... }
 * tanpa memanggilnya. Di dalam `case` WhatsApp versi apa pun, kode itu tidak
 * melakukan apa-apa — bot seolah diam. Fungsi seperti ini dikembalikan
 * namanya supaya bisa dipanggil otomatis.
 *
 * @returns {string} nama fungsi, atau '' bila tidak ada
 */
export function fungsiBelumDipanggil(kode) {
  const teks = String(kode || '')
  const cocok = [...teks.matchAll(POLA_FUNGSI)]
  if (!cocok.length) return ''

  for (const item of cocok) {
    const nama = item[1]
    const mulaiBadan = teks.indexOf('{', item.index + item[0].length - 1)
    if (mulaiBadan === -1) continue

    /* Cari penutup badan fungsi dengan menghitung kurung kurawal. */
    let dalam = 0
    let akhir = -1
    for (let i = mulaiBadan; i < teks.length; i++) {
      const huruf = teks[i]
      if (huruf === '{') dalam++
      else if (huruf === '}') {
        dalam--
        if (dalam === 0) { akhir = i; break }
      }
    }
    if (akhir === -1) continue

    /* Buang deklarasi ini, lalu lihat apakah masih ada pernyataan lain. */
    const sisa = (teks.slice(0, item.index) + teks.slice(akhir + 1))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\s+/g, '')
    const dipanggil = new RegExp(`\\b${nama}\\s*\\(`).test(sisa)
    if (!sisa.replace(/[;,'"`]/g, '') || (!dipanggil && sisa.length <= 2)) return nama
  }
  return ''
}

/* ── penyusun berkas plugin hasil .addcase ──────────────────────────────── */

/**
 * Susun berkas plugin dari potongan case.
 * Alias `sock`, `jid`, `sender`, `pushName`, `reply` disediakan supaya kode
 * gaya bot lain (yang memakai sock/jid) tetap jalan.
 */
export function bangunPluginCase({ labels = [], isi = '', namaBerkas = '', pengirim = '', waktu = '', fungsiOtomatis = '' } = {}) {
  const badan = [
    '  const sock = conn',
    '  const jid = m.chat',
    '  const sender = m.sender',
    '  const pushName = m.pushName',
    '  const reply = (teks, opsi) => m.reply(teks, opsi)',
    '',
    indentasi(isi),
  ]
  if (fungsiOtomatis) {
    badan.push(
      '',
      '  /* Kode hanya mendeklarasikan fungsi tanpa memanggilnya — bot menjalankan',
      '   * otomatis dengan (sock, jid) supaya fitur ini benar-benar bekerja. */',
      `  await ${fungsiOtomatis}(sock, jid)`,
    )
  }
  const pola = labels.map((l) => String(l).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  return [
    `/* Dibuat lewat .addcase — ${waktu} oleh ${pengirim} */`,
    '',
    'const handler = async (m, { conn, text, args, usedPrefix, prefix, command }) => {',
    ...badan,
    '}',
    '',
    `handler.command = /^(${pola})$/i`,
    `handler.help = [${labels.map((l) => `'${String(l).replace(/'/g, "\\'")}'`).join(', ')}]`,
    "handler.tags = ['custom']",
    `handler.description = 'Case buatan pengguna lewat .addcase (${String(namaBerkas).replace(/'/g, "\\'")})'`,
    'handler.limit = false',
    '',
    'export default handler',
    '',
  ].join('\n')
}
