/* By AlzRiss - Usanagi Umi AI
 *
 * STALK GITHUB (Task130 — diadaptasi dari Kilua MD by Naren V2)
 *
 * Aslinya memanggil `global.API('kyzz', '/api/stalker/github')` yang tidak ada
 * di proyek ini. Saya tulis ulang memakai REST API resmi GitHub
 * (api.github.com/users/<username>) yang sudah dicek bisa diakses dari server
 * (HTTP 200), jadi tidak bergantung pada API pihak ketiga.
 *
 * Perintah: .stalkgithub <username>  (alias .ghstalk .githubstalk .ghuser)
 */

const UA = 'Usanagi-Umi-AI/1.0 (+https://github.com/ExisRiss/usanagi-umi-ai-single)'

function rapikan(t) {
  return String(t == null ? '' : t).replace(/\s+/g, ' ').trim()
}

function tanggalID(iso) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
  return `${d.getUTCDate()} ${bulan[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

function angka(n) {
  if (n == null) return '-'
  return new Intl.NumberFormat('id-ID').format(Number(n))
}

/** Ambil profil GitHub; mengembalikan { ok, profil } atau { ok:false, alasan }. */
export async function ambilProfilGitHub(username, ket = {}) {
  const nama = rapikan(username).replace(/^@/, '')
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(nama)) {
    return { ok: false, alasan: 'Username GitHub tidak valid (huruf, angka, atau tanda hubung).' }
  }
  let res
  try {
    res = await fetch(`https://api.github.com/users/${encodeURIComponent(nama)}`, {
      headers: { 'User-Agent': UA, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(15000),
    })
  } catch (e) {
    return { ok: false, alasan: `Tidak bisa menghubungi GitHub: ${e?.message || e}` }
  }
  if (res.status === 404) return { ok: false, alasan: `User GitHub "${nama}" tidak ditemukan.` }
  if (res.status === 403 || res.status === 429) {
    return { ok: false, alasan: 'Kuota API GitHub habis (rate limit). Coba lagi beberapa menit lagi.' }
  }
  if (!res.ok) return { ok: false, alasan: `GitHub membalas HTTP ${res.status}.` }

  let data
  try {
    data = await res.json()
  } catch {
    return { ok: false, alasan: 'Balasan GitHub tidak bisa dibaca.' }
  }
  if (!data?.login) return { ok: false, alasan: `User GitHub "${nama}" tidak ditemukan.` }

  return {
    ok: true,
    profil: {
      login: data.login,
      nama: rapikan(data.name) || data.login,
      bio: rapikan(data.bio) || '-',
      perusahaan: rapikan(data.company) || '-',
      lokasi: rapikan(data.location) || '-',
      blog: rapikan(data.blog) || '-',
      twitter: rapikan(data.twitter_username) || '-',
      repo: data.public_repos ?? 0,
      gist: data.public_gists ?? 0,
      followers: data.followers ?? 0,
      following: data.following ?? 0,
      dibuat: tanggalID(data.created_at),
      diperbarui: tanggalID(data.updated_at),
      avatar: data.avatar_url || '',
      tipe: data.type || 'User',
      hireable: data.hireable === true ? 'Terbuka untuk kerja' : '-',
    },
  }
}

/** Susun caption WhatsApp dari data profil. */
export function susunCaption(p) {
  return [
    '🐙 *GITHUB STALKER*',
    '',
    `• *Nama*       : ${p.nama}`,
    `• *Username*   : @${p.login}`,
    `• *Bio*        : ${p.bio}`,
    `• *Perusahaan* : ${p.perusahaan}`,
    `• *Lokasi*     : ${p.lokasi}`,
    `• *Blog*       : ${p.blog}`,
    `• *Twitter*    : ${p.twitter === '-' ? '-' : `@${p.twitter}`}`,
    '',
    `• *Repo publik* : ${angka(p.repo)}`,
    `• *Gist*        : ${angka(p.gist)}`,
    `• *Followers*   : ${angka(p.followers)}`,
    `• *Following*   : ${angka(p.following)}`,
    `• *Status kerja*: ${p.hireable}`,
    '',
    `• *Bergabung*   : ${p.dibuat}`,
    `• *Diperbarui*  : ${p.diperbarui}`,
    `• *Tipe akun*   : ${p.tipe}`,
    '',
    `🔗 https://github.com/${p.login}`,
    '> data resmi dari api.github.com',
  ].join('\n')
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const kirim = (isi, opsi = {}) =>
    conn.sendMessage(m.chat, isi, { ...(m.raw ? { quoted: m.raw } : {}), ...opsi })

  const target = rapikan(text).split(/\s+/)[0]
  if (!target) {
    await kirim({ text: `🔍 *Format:* ${usedPrefix}${command} <username>\n*Contoh:* ${usedPrefix}${command} torvalds` })
    return { ok: false, alasan: 'tanpa argumen' }
  }

  const hasil = await ambilProfilGitHub(target)
  if (!hasil.ok) {
    await kirim({ text: `❌ ${hasil.alasan}` })
    return hasil
  }

  const caption = susunCaption(hasil.profil)
  try {
    if (hasil.profil.avatar) {
      await kirim({ image: { url: hasil.profil.avatar }, caption })
    } else {
      await kirim({ text: caption })
    }
  } catch {
    await kirim({ text: caption })
  }
  return { ok: true, login: hasil.profil.login }
}

handler.command = /^(stalkgithub|githubstalk|ghstalk|ghuser)$/i
handler.help = ['stalkgithub <username>']
handler.tags = ['stalker', 'tools']
handler.description = 'Lihat profil GitHub publik lewat api.github.com'
handler.limit = false

export default handler
