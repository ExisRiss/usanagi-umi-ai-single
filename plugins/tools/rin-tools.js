/* By AlzRiss - Usanagi Umi AI
 *
 * RIN TOOLS SUITE (Task181) — perintah tools dari API Rin (apiii-xrina.my.id)
 * yang sebelumnya belum ada di bot: bypass shortener, cekban WA, cek operator,
 * track IP, subdomain finder, sub2unlock, TTS, nilai & tes kecepatan web.
 *
 * Semua lewat provider milik sendiri (lib/rin-api.js → apiii-xrina.my.id);
 * tanpa pihak ketiga lain. Parameter terverifikasi langsung dari API (probe
 * 31/10-2026): number, ip, domain, url, text.
 */

const BASE = 'https://apiii-xrina.my.id'
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36'

async function ambilJson(jalur, params = {}, timeoutMs = 45000) {
  const url = new URL(BASE + jalur)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }
  const kontrol = new AbortController()
  const timer = setTimeout(() => kontrol.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: kontrol.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json,*/*' },
      redirect: 'follow',
    })
    const teks = await res.text().catch(() => '')
    let json = null
    try { json = JSON.parse(teks) } catch { /* bukan JSON */ }
    if (!res.ok) {
      const pesan = json?.message || json?.error || teks.slice(0, 160) || `HTTP ${res.status}`
      throw new Error(`API ${res.status}: ${String(pesan).replace(/\s+/g, ' ').slice(0, 200)}`)
    }
    if (json && json.status === false) {
      throw new Error(String(json.message || 'API menolak permintaan.').replace(/\s+/g, ' ').slice(0, 200))
    }
    return json?.data ?? json
  } finally { clearTimeout(timer) }
}

/** Potong JSON jadi potongan teks yang aman ditampilkan di chat. */
function ringkas(obj, barisMaks = 24) {
  if (obj === null || obj === undefined) return '-'
  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') return String(obj)
  const baris = []
  const jalan = (isi, prefix = '') => {
    if (baris.length >= barisMaks) return
    if (Array.isArray(isi)) {
      isi.slice(0, 8).forEach((v, i) => jalan(v, `${prefix}[${i}]`))
      if (isi.length > 8) baris.push(`${prefix}… +${isi.length - 8} lagi`)
      return
    }
    if (isi && typeof isi === 'object') {
      for (const [k, v] of Object.entries(isi)) {
        if (baris.length >= barisMaks) return
        if (v && typeof v === 'object') {
          baris.push(`${prefix}${k}:`)
          jalan(v, prefix + '  ')
        } else {
          baris.push(`${prefix}${k}: ${String(v).slice(0, 140)}`)
        }
      }
      return
    }
  }
  jalan(obj)
  if (baris.length > barisMaks) baris.push('… (dipotong)')
  return baris.join('\n')
}

/** Nomor HP → format 62xx (API hanya menerima format internasional). */
function ke62(text) {
  let n = String(text || '').replace(/\D/g, '')
  if (n.startsWith('0')) n = '62' + n.slice(1)
  if (n.startsWith('8')) n = '62' + n
  return n
}

function normalUrl(text) {
  let u = String(text || '').trim()
  if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u
  return u
}

const handler = async (m, { conn, args, usedPrefix, command }) => {
  const teks = args.join(' ').trim()
  const cmd = command.toLowerCase()

  const perintah = {
    async bypass() {
      if (!teks) return m.reply(`Gunakan: ${usedPrefix}bypass <link shortener>`)
      const url = normalUrl(teks)
      try {
        const data = await ambilJson('/tools/bypass', { url })
        return { teks: `✅ *Bypass berhasil*\n${ringkas(data, 8)}` }
      } catch (e) {
        // cadangan: versi 2
        const data = await ambilJson('/tools/bypassv2', { url })
        return { teks: `✅ *Bypass berhasil (v2)*\n${ringkas(data, 8)}` }
      }
    },
    async bypass2() {
      if (!teks) return m.reply(`Gunakan: ${usedPrefix}bypass2 <link shortener>`)
      const data = await ambilJson('/tools/bypassv2', { url: normalUrl(teks) })
      return { teks: `✅ *Bypass v2*\n${ringkas(data, 8)}` }
    },
    async cekban() {
      const nomor = ke62(teks)
      if (!nomor) return m.reply(`Gunakan: ${usedPrefix}cekban 628xxxxxxxxxx\nBisa juga membalas pesan orang lalu ketik ${usedPrefix}cekban`)
      const data = await ambilJson('/tools/cekban-wa', { number: nomor })
      const d = data || {}
      return { teks: [
        '🛡️ *Cek Ban WhatsApp*',
        `Nomor : ${d.masked || d.phone || nomor}`,
        `Status: ${d.status || (d.banned ? 'BANNED' : 'Aman')}`,
        `Ban   : ${d.banned ? 'YA ❌' : 'TIDAK ✅'}`,
        `Terdaftar: ${d.exists ? 'ya' : 'tidak'}`,
      ].join('\n') }
    },
    async cekoperator() {
      const nomor = ke62(teks)
      if (!nomor) return m.reply(`Gunakan: ${usedPrefix}cekoperator 628xxxxxxxxxx`)
      const data = await ambilJson('/tools/ceknomor-operator', { number: nomor })
      return { teks: `📱 *Cek Operator*\n${ringkas(data, 12)}` }
    },
    async trackip() {
      if (!teks) return m.reply(`Gunakan: ${usedPrefix}trackip 1.2.3.4`)
      const data = await ambilJson('/tools/trackip', { ip: teks })
      const d = data || {}
      return { teks: [
        '🌐 *Lacak IP*',
        `IP      : ${d.ip || teks} (${d.type || '-'})`,
        `Lokasi  : ${[d.city, d.region, d.country].filter(Boolean).join(', ') || '-'}`,
        `ISP     : ${d.isp || d.org || d.asn || '-'}`,
        `Koordinat: ${d.latitude && d.longitude ? `${d.latitude}, ${d.longitude}` : d.loc || '-'}`,
        `Zona    : ${d.timezone || d.time_zone || '-'}`,
        `Peta    : ${d.map || d.google_maps || (d.latitude && d.longitude ? `https://maps.google.com/?q=${d.latitude},${d.longitude}` : '-')}`,
      ].join('\n') }
    },
    async subdo() {
      if (!teks) return m.reply(`Gunakan: ${usedPrefix}subdo contoh.com`)
      const data = await ambilJson('/tools/subdo-finder', { domain: teks.replace(/^https?:\/\//, '').replace(/\/.*$/, '') })
      const list = Array.isArray(data?.subdomains) ? data.subdomains : []
      return { teks: [
        `🔎 *Subdomain* ${data?.domain || teks}`,
        `Total: ${data?.total ?? list.length} (${Math.round((data?.elapsed_ms || 0) / 100) / 10} dtk)`,
        '',
        list.length ? list.slice(0, 40).map((s) => `• ${s}`).join('\n') : 'Tidak ditemukan.',
      ].join('\n') }
    },
    async sub2unlock() {
      if (!teks) return m.reply(`Gunakan: ${usedPrefix}sub2unlock <link sub2unlock.me>`)
      const data = await ambilJson('/tools/sub2unlock', { url: normalUrl(teks) })
      return { teks: `🔓 *Sub2Unlock*\n${ringkas(data, 8)}` }
    },
    async tts2() {
      if (!teks) return m.reply(`Gunakan: ${usedPrefix}tts2 Halo apa kabar\nOpsional: ${usedPrefix}tts2 id Halo (bahasa)\n\nUntuk suara karakter pakai ${usedPrefix}tts (lama).`)
      const bagian = teks.split(' ')
      let bahasa = 'id', isi = teks
      if (/^[a-z]{2}$/i.test(bagian[0]) && bagian.length > 1) { bahasa = bagian[0].toLowerCase(); isi = bagian.slice(1).join(' ') }
      const data = await ambilJson('/tools/tts2', { text: isi, language: bahasa })
      const link = data?.link || data?.url || data?.audio || data?.result
      if (link && /^https?:\/\//.test(String(link))) {
        await conn.sendMessage(m.chat, { audio: { url: String(link) }, mimetype: 'audio/mpeg', ptt: false }, { quoted: m })
        return { teks: `🔊 *TTS2* (${data?.input?.voice?.name || bahasa})${data?.cost ? ` · ${data.cost}` : ''}` }
      }
      return { teks: `🔊 *TTS2*\n${ringkas(data, 12)}` }
    },
    async rateweb() {
      if (!teks) return m.reply(`Gunakan: ${usedPrefix}rateweb https://contoh.com`)
      const data = await ambilJson('/tools/rateweb', { url: normalUrl(teks) }, 90000)
      return { teks: `📊 *Nilai Web*\n${ringkas(data, 18)}` }
    },
    async speedweb() {
      if (!teks) return m.reply(`Gunakan: ${usedPrefix}speedweb https://contoh.com`)
      const data = await ambilJson('/tools/speed-web', { url: normalUrl(teks) }, 90000)
      return { teks: `⚡ *Speed Web*\n${ringkas(data, 16)}` }
    },
  }

  const jalankan = perintah[cmd]
  if (!jalankan) return

  try {
    const hasil = await jalankan()
    if (hasil?.teks) await m.reply(hasil.teks)
  } catch (error) {
    console.warn('[rin-tools]', cmd, error?.message || error)
    await m.reply(`❌ Gagal: ${error?.message || 'permintaan tidak berhasil.'}`)
  }
}

handler.command = /^(bypass2?|cekban|cekoperator|trackip|subdo|sub2unlock|tts2|rateweb|speedweb)$/i
handler.help = ['bypass <link>', 'cekban <nomor>', 'trackip <ip>', 'subdo <domain>', 'tts2 <teks>', 'rateweb <url>', 'speedweb <url>']
handler.tags = ['tools']
handler.category = 'tools'
handler.description = 'Suite tools API Rin: bypass shortener, cekban WA, cek operator, track IP, subdomain, sub2unlock, TTS, nilai & speed web.'
handler.limit = false

export default handler
