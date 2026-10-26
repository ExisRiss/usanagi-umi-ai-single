/* By AlzRiss - Usanagi Umi AI
 *
 * Penggambar kartu profil & podium memakai @napi-rs/canvas yang sudah
 * terpasang di server. Diadaptasi dari `lib/ui` + plugin `kartu`/`podium`
 * bot VanXone Multi Device, tetapi datanya diambil dari struktur user bot
 * ini (global.db.data.users: level, exp, money, bank, limit, role).
 *
 * Tidak ada aset luar: semua digambar dengan gradasi dan bentuk, jadi tetap
 * jalan walau server tidak bisa mengunduh gambar.
 */
import { createCanvas, loadImage } from '@napi-rs/canvas'

const WARNA = {
  laut: ['#031a2e', '#0a4f7a', '#1e90ff'],
  emas: '#f4c542',
  teks: '#eaf4ff',
  redup: '#8fb4d1',
  kartu: 'rgba(255,255,255,0.06)',
}

const bulat = (ctx, x, y, w, h, r) => {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function latar(ctx, lebar, tinggi) {
  const gradasi = ctx.createLinearGradient(0, 0, lebar, tinggi)
  gradasi.addColorStop(0, WARNA.laut[0])
  gradasi.addColorStop(0.55, WARNA.laut[1])
  gradasi.addColorStop(1, WARNA.laut[2])
  ctx.fillStyle = gradasi
  ctx.fillRect(0, 0, lebar, tinggi)
  // Ornamen lingkaran lembut supaya tidak terlihat datar.
  for (const [x, y, r, a] of [[lebar * 0.85, tinggi * 0.1, 190, 0.10], [lebar * 0.1, tinggi * 0.95, 150, 0.08]]) {
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(120,200,255,${a})`
    ctx.fill()
  }
}

async function gambarAvatar(ctx, sumber, x, y, ukuran, cincin = WARNA.emas) {
  ctx.save()
  ctx.beginPath()
  ctx.arc(x + ukuran / 2, y + ukuran / 2, ukuran / 2, 0, Math.PI * 2)
  ctx.closePath()
  ctx.clip()
  let gambar = null
  if (sumber) {
    try {
      const isi = typeof sumber === 'string' ? await loadImage(sumber) : await loadImage(Buffer.isBuffer(sumber) ? sumber : Buffer.from(sumber))
      gambar = isi
    } catch {}
  }
  if (gambar) {
    ctx.drawImage(gambar, x, y, ukuran, ukuran)
  } else {
    // Avatar cadangan: inisial di atas gradasi.
    const g = ctx.createLinearGradient(x, y, x + ukuran, y + ukuran)
    g.addColorStop(0, '#1e90ff')
    g.addColorStop(1, '#0a4f7a')
    ctx.fillStyle = g
    ctx.fillRect(x, y, ukuran, ukuran)
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(x + ukuran / 2, y + ukuran / 2, ukuran / 2 - 2, 0, Math.PI * 2)
  ctx.lineWidth = 4
  ctx.strokeStyle = cincin
  ctx.stroke()
}

/** 1.250.000 → "1,25jt" supaya muat di kotak kecil tanpa terpotong. */
export function angkaRingkas(nilai) {
  const n = Number(nilai || 0)
  if (!Number.isFinite(n)) return '-'
  const abs = Math.abs(n)
  const potong = (v, satuan) => `${Number(v.toFixed(2)).toLocaleString('id-ID')}${satuan}`
  if (abs >= 1e12) return potong(n / 1e12, 'T')
  if (abs >= 1e9) return potong(n / 1e9, 'M')
  if (abs >= 1e6) return potong(n / 1e6, 'jt')
  if (abs >= 1e3) return potong(n / 1e3, 'rb')
  return String(Math.round(n))
}

const potongTeks = (ctx, teks, maks) => {
  let hasil = String(teks || '')
  if (ctx.measureText(hasil).width <= maks) return hasil
  while (hasil.length > 1 && ctx.measureText(`${hasil}…`).width > maks) hasil = hasil.slice(0, -1)
  return `${hasil}…`
}

/**
 * Kartu profil 900x460 (semua elemen punya zona sendiri, tidak bertumpuk).
 * @param {{name:string, number:string, status:string, level:number, exp:number, expNeed:number,
 *          money:number, bank:number, limit:number, rank:number, rankTotal:number,
 *          avatar?:string|Buffer, botName?:string}} data
 */
export async function renderProfileCard(data) {
  const LEBAR = 900
  const TINGGI = 460
  const canvas = createCanvas(LEBAR, TINGGI)
  const ctx = canvas.getContext('2d')
  latar(ctx, LEBAR, TINGGI)

  // Panel kaca
  bulat(ctx, 24, 24, LEBAR - 48, TINGGI - 48, 26)
  ctx.fillStyle = WARNA.kartu
  ctx.fill()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'
  ctx.stroke()

  // ── baris 1: avatar + nama + nomor + label bot ──────────────────
  await gambarAvatar(ctx, data.avatar, 60, 60, 140)

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = WARNA.teks
  ctx.font = 'bold 38px Arial'
  ctx.fillText(potongTeks(ctx, data.name || 'Tanpa Nama', 520), 228, 116)
  ctx.fillStyle = WARNA.redup
  ctx.font = '24px Arial'
  ctx.fillText(potongTeks(ctx, `${data.number || '-'}  ·  ${data.status || 'MEMBER'}`, 520), 228, 154)

  ctx.fillStyle = 'rgba(30,144,255,0.92)'
  bulat(ctx, LEBAR - 300, 64, 240, 44, 22)
  ctx.fill()
  ctx.fillStyle = '#04121f'
  ctx.font = 'bold 20px Arial'
  ctx.fillText(potongTeks(ctx, data.botName || 'Usanagi Umi AI', 212), LEBAR - 286, 93)

  // ── baris 2: empat kotak angka (y 224–292) ──────────────────────
  const kotak = [
    ['UANG', `Rp${angkaRingkas(data.money)}`],
    ['BANK', `Rp${angkaRingkas(data.bank)}`],
    ['LIMIT', String(data.limit ?? '-')],
    ['PERINGKAT', data.rank ? `#${data.rank}/${angkaRingkas(data.rankTotal)}` : '—'],
  ]
  const lebarKotak = 186
  const jarak = 16
  kotak.forEach(([label, nilai], i) => {
    const x = 60 + i * (lebarKotak + jarak)
    bulat(ctx, x, 224, lebarKotak, 68, 14)
    ctx.fillStyle = 'rgba(255,255,255,0.09)'
    ctx.fill()
    ctx.fillStyle = WARNA.redup
    ctx.font = '16px Arial'
    ctx.fillText(label, x + 16, 250)
    ctx.fillStyle = WARNA.teks
    ctx.font = 'bold 22px Arial'
    ctx.fillText(potongTeks(ctx, nilai, lebarKotak - 30), x + 16, 280)
  })

  // ── baris 3: level + bar EXP ────────────────────────────────────
  const persen = Math.max(0, Math.min(100, Math.floor((Number(data.exp || 0) / Math.max(1, Number(data.expNeed || 1))) * 100)))
  ctx.textAlign = 'left'
  ctx.fillStyle = WARNA.teks
  ctx.font = 'bold 24px Arial'
  ctx.fillText(`Level ${data.level ?? 1}`, 60, 340)
  ctx.textAlign = 'right'
  ctx.fillStyle = WARNA.redup
  ctx.font = '22px Arial'
  ctx.fillText(`${persen}%`, LEBAR - 60, 340)
  ctx.textAlign = 'left'

  const barX = 60
  const barY = 356
  const barW = LEBAR - 120
  bulat(ctx, barX, barY, barW, 16, 8)
  ctx.fillStyle = 'rgba(255,255,255,0.14)'
  ctx.fill()
  const isiBar = Math.max(persen > 0 ? 16 : 0, (barW * persen) / 100)
  if (isiBar > 0) {
    const g = ctx.createLinearGradient(barX, barY, barX + barW, barY)
    g.addColorStop(0, '#3ddad7')
    g.addColorStop(1, WARNA.laut[2])
    bulat(ctx, barX, barY, isiBar, 16, 8)
    ctx.fillStyle = g
    ctx.fill()
  }

  ctx.fillStyle = WARNA.redup
  ctx.font = '19px Arial'
  ctx.fillText(`EXP ${Number(data.exp || 0).toLocaleString('id-ID')} / ${Number(data.expNeed || 0).toLocaleString('id-ID')}`, 60, 404)

  // ── footer (zona sendiri, tidak menimpa apa pun) ────────────────
  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(234,244,255,0.5)'
  ctx.font = '17px Arial'
  ctx.fillText('By AlzRiss - Usanagi Umi AI', LEBAR - 60, 404)
  ctx.textAlign = 'left'

  return canvas.toBuffer('image/png')
}

/**
 * Podium 900x520: juara 1-3 di atas batang, peringkat 4-8 di daftar bawah.
 * Tanpa emoji: font di server tidak punya glyph emoji, jadi medali digambar.
 * @param {{top:Array<{name:string,level:number,exp:number}>, botName?:string}} data
 */
export async function renderPodium(data) {
  const LEBAR = 900
  const TINGGI = 520
  const canvas = createCanvas(LEBAR, TINGGI)
  const ctx = canvas.getContext('2d')
  latar(ctx, LEBAR, TINGGI)

  ctx.textAlign = 'center'
  ctx.fillStyle = WARNA.teks
  ctx.font = 'bold 34px Arial'
  ctx.fillText('PODIUM LEVEL', LEBAR / 2, 62)
  ctx.fillStyle = WARNA.redup
  ctx.font = '19px Arial'
  ctx.fillText('Peringkat berdasarkan level tertinggi', LEBAR / 2, 92)
  ctx.textAlign = 'left'

  const juara = Array.isArray(data.top) ? data.top.slice(0, 3) : []
  const tinggiBatang = [170, 140, 118]
  const tengah = [LEBAR / 2, LEBAR / 2 - 240, LEBAR / 2 + 240]
  const warna = [WARNA.emas, '#c8d6e5', '#cd7f32']
  const dasar = 340
  const lebarBatang = 220

  juara.forEach((user, i) => {
    const x = tengah[i]
    const tinggi = tinggiBatang[i]
    const atas = dasar - tinggi

    bulat(ctx, x - lebarBatang / 2, atas, lebarBatang, tinggi, 16)
    const g = ctx.createLinearGradient(x - lebarBatang / 2, atas, x + lebarBatang / 2, dasar)
    g.addColorStop(0, warna[i])
    g.addColorStop(1, 'rgba(3,26,46,0.9)')
    ctx.fillStyle = g
    ctx.fill()

    // Medali menempel di bibir atas batang (setengah di luar), jadi tidak
    // pernah bertumpuk dengan nama yang selalu di bawah.
    ctx.beginPath()
    ctx.arc(x, atas, 24, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(4,18,31,0.92)'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = warna[i]
    ctx.stroke()
    ctx.fillStyle = warna[i]
    ctx.font = 'bold 26px Arial'
    ctx.textAlign = 'center'
    ctx.fillText(String(i + 1), x, atas + 9)

    // Nama & level selalu menempel di bawah, jadi tidak pernah keluar batang.
    ctx.fillStyle = '#04121f'
    ctx.font = 'bold 21px Arial'
    ctx.fillText(potongTeks(ctx, user.name || '-', lebarBatang - 28), x, dasar - 52)
    ctx.font = '18px Arial'
    ctx.fillText(`Level ${user.level ?? 1}`, x, dasar - 22)
    ctx.textAlign = 'left'
  })

  // Peringkat 4-8 (di bawah batang, zona sendiri)
  const sisa = Array.isArray(data.top) ? data.top.slice(3, 8) : []
  sisa.forEach((user, i) => {
    const y = 384 + i * 30
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    bulat(ctx, 70, y - 22, LEBAR - 140, 28, 9)
    ctx.fill()
    ctx.fillStyle = WARNA.redup
    ctx.font = '18px Arial'
    ctx.fillText(`#${i + 4}`, 86, y - 2)
    ctx.fillStyle = WARNA.teks
    ctx.fillText(potongTeks(ctx, user.name || '-', 520), 140, y - 2)
    ctx.textAlign = 'right'
    ctx.fillStyle = WARNA.emas
    ctx.fillText(`Level ${user.level ?? 1}`, LEBAR - 90, y - 2)
    ctx.textAlign = 'left'
  })

  ctx.fillStyle = 'rgba(234,244,255,0.5)'
  ctx.font = '17px Arial'
  ctx.fillText('By AlzRiss - Usanagi Umi AI', 70, TINGGI - 22)

  return canvas.toBuffer('image/png')
}

export default { renderProfileCard, renderPodium }
