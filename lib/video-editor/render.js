/* By AlzRiss - Usanagi Umi AI
 *
 * Task146 — mesin render FFmpeg untuk Cinematic Typography Video Editor.
 *
 * Prinsip:
 *   • Kanvas SELALU mengikuti media utama (lebar/tinggi efektif setelah rotasi),
 *     dibulatkan ke bilangan genap. Tidak ada 9:16 paksa.
 *   • Semua ukuran elemen = rasio × sisi pendek kanvas.
 *   • Argumen dikirim sebagai array ke spawn() — tidak ada shell, tidak ada
 *     potongan teks pengguna yang masuk ke sintaks filter (teks ditulis ke
 *     textfile).
 *   • Hasil selalu diperiksa ulang dengan ffprobe (dimensi, durasi, audio).
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { ffmpegBin, ffprobeBin } from './probe.js'
import { fontUntuk } from './fonts.js'
import { TEKS_TIMING } from './templates.js'
import { KONFIG, presetKualitas } from './config.js'

/* ── util ──────────────────────────────────────────────────────────────── */

const bulat2 = (n) => {
  const v = Math.max(2, Math.round(Number(n) || 2))
  return v % 2 === 0 ? v : v + 1
}

/** '#ffffff' | 'white' → '0xffffff' untuk ffmpeg. */
function warna(teks, bawaan = '0xffffff') {
  const v = String(teks || '').trim()
  if (!v) return bawaan
  if (/^#[0-9a-f]{6}$/i.test(v)) return '0x' + v.slice(1).toLowerCase()
  if (/^#[0-9a-f]{3}$/i.test(v)) return '0x' + v.slice(1).split('').map((c) => c + c).join('').toLowerCase()
  if (/^0x[0-9a-f]{6}$/i.test(v)) return v.toLowerCase()
  if (/^[a-z]+$/i.test(v)) return v.toLowerCase()
  return bawaan
}

/** Escape nilai untuk dipakai di dalam opsi filter (`key=value`). */
function escOpsi(nilai) {
  return String(nilai).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

/** Angka aman untuk ekspresi ffmpeg. */
const num = (n, bawaan = 0) => (Number.isFinite(Number(n)) ? Number(n) : bawaan)

/* ── tulis teks ke berkas (anti-injection) ─────────────────────────────── */

/**
 * Tulis teks pengguna ke berkas untuk opsi `textfile`. Isi berkas TIDAK PERNAH
 * diurai sebagai sintaks filter, jadi karakter seperti : ' \ % aman.
 */
function tulisTeks(folder, nama, teks) {
  const berkas = path.join(folder, nama + '.txt')
  /* Batasi: buang kontrol karakter & \r, jaga panjang wajar. */
  const bersih = String(teks || '')
    .replace(/\r/g, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .slice(0, 400)
  fs.writeFileSync(berkas, bersih + '\n', 'utf8')
  return berkas
}

/* ── peta gerak ────────────────────────────────────────────────────────── */

/**
 * Ekspresi gerak kamera virtual untuk `zoompan`.
 *
 * Sumber sudah diperbesar ke W*K x H*K, lalu zoompan memotong jendela
 * seukuran (input/zoom) dan mengecilkannya ke kanvas. Jadi:
 *   zoom = 1   → jendela selebar W*K  (paling jauh)
 *   zoom = K   → jendela selebar W    (paling dekat, 1:1)
 * "Zoom in" berarti zoom naik 1 → K selama durasi.
 */
function ekspresiGerak(jenis, skala, durasi) {
  const D = Math.max(0.5, num(durasi, 1))
  const K = Math.max(1.02, num(skala, 1.1))
  const delta = K - 1
  const p = `min(1,max(0,time/${D.toFixed(3)}))`

  /* x/y selalu relatif terhadap ruang gerak yang tersedia (iw - iw/zoom). */
  const tengah = { x: '(iw-iw/zoom)/2', y: '(ih-ih/zoom)/2' }

  switch (jenis) {
    case 'zoom-in':
      return { skala: K, z: `(1+${delta.toFixed(4)}*${p})`, ...tengah }
    case 'zoom-out':
      return { skala: K, z: `(${K.toFixed(4)}-${delta.toFixed(4)}*${p})`, ...tengah }
    case 'pan-kiri':
      return { skala: K, z: K.toFixed(4), x: `(iw-iw/zoom)*(1-${p})`, y: '(ih-ih/zoom)/2' }
    case 'pan-kanan':
      return { skala: K, z: K.toFixed(4), x: `(iw-iw/zoom)*${p}`, y: '(ih-ih/zoom)/2' }
    case 'pan-atas':
      return { skala: K, z: K.toFixed(4), x: '(iw-iw/zoom)/2', y: `(ih-ih/zoom)*(1-${p})` }
    case 'pan-bawah':
      return { skala: K, z: K.toFixed(4), x: '(iw-iw/zoom)/2', y: `(ih-ih/zoom)*${p}` }
    case 'zoom-pan':
      return {
        skala: K,
        z: `(1+${(delta * 0.85).toFixed(4)}*${p})`,
        x: `(iw-iw/zoom)*(0.2+0.6*${p})`,
        y: '(ih-ih/zoom)/2',
      }
    case 'statis':
    default:
      return { skala: K, z: K.toFixed(4), ...tengah }
  }
}

/* ── layer teks (blur reveal + pop + fade) ─────────────────────────────── */

/** Perkiraan lebar karakter relatif terhadap ukuran font. */
const LEBAR_KARAKTER = 0.58

/** Bungkus teks supaya tidak melewati 86% lebar kanvas (drawtext tidak wrap). */
export function bungkusTeks(teks, ukuranFont, lebarKanvas) {
  const maks = lebarKanvas * 0.86
  const keluaran = []
  for (const paragraf of String(teks || '').split('\n')) {
    const kata = paragraf.trim().split(/\s+/).filter(Boolean)
    if (!kata.length) { keluaran.push(''); continue }
    let baris = ''
    for (const k of kata) {
      const usul = baris ? baris + ' ' + k : k
      if (usul.length * ukuranFont * LEBAR_KARAKTER > maks && baris) {
        keluaran.push(baris)
        baris = k
      } else {
        baris = usul
      }
    }
    if (baris) keluaran.push(baris)
  }
  return keluaran.length ? keluaran : ['']
}

/**
 * Bangun satu layer teks.
 *
 * Blur reveal TIDAK sekadar fade: teks dibuat dua kali (versi blur & versi
 * tajam). Versi blur muncul cepat lalu hilang, versi tajam menyusul — jadi
 * mata melihat huruf "datang dari kabut" lalu mengeras. Keduanya memakai fade
 * ALPHA, bukan hanya opacity overlay.
 *
 * Kanvas layer sengaja hanya setinggi kotak teks (bukan seluruh kanvas):
 * overlay RGBA seukuran 1080x1920 per frame membuat rendering 20x lebih lambat
 * tanpa beda tampilan sama sekali.
 */
function layerTeks({ indeks, blok, teks, W, H, fps, t0, t1, folder, peran }) {
  const font = fontUntuk(blok.font || peran)
  const minimum = Math.min(W, H)
  const ukuran = Math.max(12, Math.round(minimum * num(blok.ukuran, 0.1)))
  const outline = Math.max(0, Math.round(minimum * num(blok.outline, 0)))
  const shadow = Math.max(0, Math.round(minimum * num(blok.shadow, 0)))
  const posisiY = Math.round(H * num(blok.posisiY, 0.45))
  const T = TEKS_TIMING
  const blur = Math.max(0, num(blok.blur, T.blur))
  const pop = Math.max(0, num(blok.pop, T.pop))
  const lama = Math.max(0.8, t1 - t0)

  const barisTeks = bungkusTeks(teks, ukuran, W)
  const boxH = bulat2(ukuran * 1.32 * barisTeks.length + ukuran * 0.55)
  const margin = Math.round(minimum * 0.04)
  const yAtas = Math.max(margin, Math.min(H - boxH - margin, Math.round(posisiY - boxH / 2)))

  const berkasTeks = tulisTeks(folder, `teks-${indeks}-${peran}`, barisTeks.join('\n'))
  const label = `txt${indeks}`
  const baris = []

  const opsiDraw = [
    font.berkas ? `fontfile=${escOpsi(font.berkas)}` : '',
    `textfile=${escOpsi(berkasTeks)}`,
    `fontcolor=${warna(blok.warna, '0xffffff')}`,
    `fontsize=${ukuran}`,
    'x=(w-text_w)/2',
    'y=(h-text_h)/2',
    outline ? `borderw=${outline}` : '',
    outline ? `bordercolor=${warna(blok.outlineWarna, '0x000000')}` : '',
    shadow ? `shadowx=${Math.max(1, Math.round(shadow / 2))}` : '',
    shadow ? `shadowy=${Math.max(1, Math.round(shadow / 2))}` : '',
    shadow ? `shadowcolor=${warna(blok.shadowWarna, '0x000000')}@0.65` : '',
    'line_spacing=6',
  ].filter(Boolean).join(':')

  /* Sumber: kotak transparan seukuran teks selama jendela teks saja. */
  baris.push(`color=c=black@0.0:s=${W}x${boxH}:r=${fps}:d=${lama.toFixed(3)},format=rgba,drawtext=${opsiDraw},setpts=PTS-STARTPTS,split=2[${label}a][${label}b]`)

  /* Versi blur: muncul cepat, hilang saat versi tajam masuk. */
  const blurMasuk = Math.min(T.blurMasuk, lama * 0.4)
  const blurHilang = blurMasuk + Math.min(T.jeda + 0.25, lama * 0.3)
  baris.push(`[${label}b]gblur=sigma=${blur.toFixed(2)},` +
    `fade=t=in:st=0:d=${blurMasuk.toFixed(2)}:alpha=1,` +
    `fade=t=out:st=${blurHilang.toFixed(2)}:d=${Math.min(0.28, lama * 0.2).toFixed(2)}:alpha=1,` +
    `setpts=PTS+${t0.toFixed(3)}/TB[${label}blur]`)

  /* Versi tajam: pop skala kecil lalu diam, fade keluar di akhir jendela. */
  const popLama = Math.min(T.popLama, lama * 0.5)
  const skalaPop = `zoompan=z='max(1,1+${pop.toFixed(4)}*(1-min(1,time/${popLama.toFixed(2)})))':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=1:s=${W}x${boxH}:fps=${fps}`
  const tajamMasuk = Math.min(T.tajamMasuk, lama * 0.35)
  const mulaiTajam = Math.min(blurMasuk + T.jeda * 0.5, lama * 0.5)
  const keluar = Math.max(mulaiTajam + 0.2, lama - Math.min(0.8, lama * 0.25))
  baris.push(`[${label}a]${skalaPop},` +
    `fade=t=in:st=${mulaiTajam.toFixed(2)}:d=${tajamMasuk.toFixed(2)}:alpha=1,` +
    `fade=t=out:st=${keluar.toFixed(2)}:d=${Math.min(0.7, lama * 0.25).toFixed(2)}:alpha=1,` +
    `setpts=PTS+${t0.toFixed(3)}/TB[${label}tajam]`)

  return { baris, keluaran: { blur: `${label}blur`, tajam: `${label}tajam` }, jendela: { t0, t1 }, y: yAtas }
}

/**
 * Hitung tata letak panel kolase. Dipakai dua tempat (pembuat masker dan
 * penyusun filter) supaya ukuran masker SELALU sama dengan ukuran panel —
 * kalau beda satu piksel, alphamerge gagal.
 */
export function hitungPanel(template, W, H, modePanel) {
  const min = Math.min(W, H)
  const marginX = Math.round(min * num(template.panel.margin, 0.06))
  const marginAtas = Math.round(H * num(template.panel.marginAtas, num(template.panel.margin, 0.06)))
  const marginBawah = Math.round(H * num(template.panel.marginBawah, num(template.panel.margin, 0.06)))
  const jarak = Math.round(min * num(template.panel.jarak, 0.028))
  const radius = Math.round(min * num(template.panel.radius, 0.04))
  const border = Math.round(min * num(template.panel.border, 0.004))
  const kolom = modePanel === 'tiga' ? 1 : 2
  const baris = 2
  const PW = bulat2((W - marginX * 2 - jarak * (kolom - 1)) / kolom)
  const PH = bulat2((H - marginAtas - marginBawah - jarak * (baris - 1)) / baris)
  return { marginX, marginAtas, marginBawah, jarak, radius, border, kolom, baris, PW, PH }
}

/* ── masker panel (sudut membulat) ─────────────────────────────────────── */

/**
 * Buat PNG masker sudut membulat memakai geq (tanpa dependensi tambahan).
 * Putih = tampak, hitam = transparan.
 */
async function buatMasker(folder, nama, W, H, radius, { cinci = false, tebal = 0 } = {}) {
  const berkas = path.join(folder, nama + '.png')
  const r = Math.max(0, Math.round(radius))
  /* Jarak ke sudut terdekat: dx = max(r-X, X-(W-r), 0), dy = max(r-Y, Y-(H-r), 0). */
  const jarak = `hypot(max(max(${r}-X,0),max(X-(${W}-${r}),0)),max(max(${r}-Y,0),max(Y-(${H}-${r}),0)))`
  const alfa = cinci
    ? `if(lte(${jarak},${r})*gte(${jarak},${Math.max(0, r - Math.max(1, tebal))}),255,0)`
    : `if(lte(${jarak},${r}),255,0)`

  const args = [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:d=1`,
    '-vf', `format=rgba,geq=r=255:g=255:b=255:a='${alfa}'`,
    '-frames:v', '1',
    berkas,
  ]
  await jalankan(args, { waktuMaks: 30000 })
  if (!fs.existsSync(berkas)) throw new Error('gagal membuat masker panel')
  return berkas
}

/* ── proses ffmpeg ─────────────────────────────────────────────────────── */

/** Jalankan ffmpeg/ffprobe dengan array argumen (tanpa shell). */
export function jalankan(args, { waktuMaks = 60000, bin = '' } = {}) {
  return new Promise((resolve, reject) => {
    const anak = spawn(bin || ffmpegBin(), args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let galat = ''
    const jam = setTimeout(() => {
      try { anak.kill('SIGKILL') } catch (e) { /* sudah mati */ }
      reject(Object.assign(new Error('FFmpeg melebihi batas waktu'), { kode: 'TIMEOUT' }))
    }, waktuMaks)
    anak.stderr.on('data', (d) => {
      galat += d.toString()
      if (galat.length > 60000) galat = galat.slice(-30000)
    })
    anak.on('error', (e) => { clearTimeout(jam); reject(e) })
    anak.on('close', (kode) => {
      clearTimeout(jam)
      if (kode === 0) resolve({ kode, log: galat })
      else reject(Object.assign(new Error(`FFmpeg keluar dengan kode ${kode}: ${galat.trim().split('\n').slice(-6).join(' | ').slice(-700)}`), { kode: 'FFMPEG', log: galat }))
    })
  })
}

/* ── perakitan grafik ──────────────────────────────────────────────────── */

/**
 * Susun seluruh argumen ffmpeg untuk satu pekerjaan.
 * Diekspor supaya bisa diperiksa di uji tanpa menjalankan render.
 */
export function susunArgumen({
  media, template, folder, judul, subjudul, meta, logo, durasi, kualitas, masker = {}, slowmo = 1,
}) {
  const utama = media[0]
  const W = bulat2(utama.lebar)
  const H = bulat2(utama.tinggi)
  const fps = Math.min(KONFIG.maksFps, Math.max(12, Math.round(num(utama.fps, 30) || 30)))
  const D = Math.max(2, Math.min(num(durasi, 10), KONFIG.maksDurasi))
  const kualitasPreset = presetKualitas(kualitas)
  const sk = num(slowmo, 1) || 1

  const args = ['-hide_banner', '-loglevel', 'error', '-y']
  const masukan = [] // berkas -i berurutan
  const modes = [] // 'foto' | 'video' per masukan

  const tambahMasukan = (berkas, mode, tambahan = []) => {
    masukan.push({ berkas, tambahan })
    modes.push(mode)
    return masukan.length - 1
  }

  /* Media utama: foto perlu -loop 1; video cukup dipotong. */
  const durasiMasukan = sk < 1 ? D * sk : D
  if (utama.jenis === 'foto') {
    tambahMasukan(utama.berkas, 'foto', ['-loop', '1', '-t', durasiMasukan.toFixed(3), '-r', String(fps)])
  } else {
    tambahMasukan(utama.berkas, 'video', ['-t', durasiMasukan.toFixed(3)])
  }

  const graf = []
  const modePanel = template.panel?.mode || 'single'
  const pakaiPanel = modePanel !== 'single' && media.length > 0

  /* ── 1. dasar: media utama ── */
  const gerak = ekspresiGerak(template.motion.jenis, template.motion.skala, D)
  const lebarBesar = bulat2(W * gerak.skala)
  const tinggiBesar = bulat2(H * gerak.skala)
  const saringDasar = [
    `fps=${fps}`,
    sk < 1 ? `setpts=PTS/${sk.toFixed(4)}` : '',
    /* Perbesar dulu supaya ada ruang untuk zoom & pan tanpa distorsi. */
    `scale=${lebarBesar}:${tinggiBesar}:force_original_aspect_ratio=increase`,
    `zoompan=z='min(${gerak.skala.toFixed(4)},max(1,${gerak.z}))':x='${gerak.x}':y='${gerak.y}':d=1:s=${W}x${H}:fps=${fps}`,
    'setsar=1',
    'format=yuv420p',
  ].filter(Boolean).join(',')
  /* Satu pad input hanya boleh dipakai SEKALI di filter_complex. Karena panel
   * pertama memakai media utama juga, input 0 dipecah dengan split dulu —
   * tanpa ini ffmpeg gagal: "Stream specifier ... matches no streams". */
  const sumberDasar = pakaiPanel ? 'srcDasar' : '0:v'
  const sumberPanel0 = 'srcPanel0'
  if (pakaiPanel) graf.push('[0:v]split=2[srcDasar][srcPanel0]')
  graf.push(`[${sumberDasar}]${saringDasar}[dasar]`)
  let alurTerakhir = 'dasar'

  /* ── 2. kolase ( kalau template memang berpanel ) ── */
  if (pakaiPanel) {
    const tata = hitungPanel(template, W, H, modePanel)
    const { jarak, kolom: kolomPanel, PW, PH } = tata
    const tebalBorder = tata.border
    const jumlahPanel = Math.min(kolomPanel * tata.baris, KONFIG.maksMedia)

    const jumlahPanelAwal = modePanel === 'tiga' ? 2 : 4
    masukan.push({ berkas: masker.panel, tambahan: ['-loop', '1', '-t', String(D), '-r', String(fps)] })
    const idxPanelMask = masukan.length - 1
    modes.push('masker')
    /* Satu keluaran filter hanya bisa dipakai SEKALI. Karena tiap panel butuh
     * masker, keluarannya dipecah dengan split — tanpa ini panel kedua gagal
     * dengan "Stream specifier 'maskerPanel' ... matches no streams". */
    const labelMask = Array.from({ length: jumlahPanelAwal }, (_, i) => `maskerPanel${i}`)
    graf.push(`[${idxPanelMask}:v]format=gray,split=${jumlahPanelAwal}${labelMask.map((l) => '[' + l + ']').join('')}`)

    const pakaiCinci = tebalBorder > 0 && Boolean(masker.cinci)
    let labelCinci = []
    if (pakaiCinci) {
      masukan.push({ berkas: masker.cinci, tambahan: ['-loop', '1', '-t', String(D), '-r', String(fps)] })
      const idxCinci = masukan.length - 1
      modes.push('masker')
      labelCinci = Array.from({ length: jumlahPanelAwal }, (_, i) => `cinciPanel${i}`)
      graf.push(`[${idxCinci}:v]format=rgba,split=${jumlahPanelAwal}${labelCinci.map((l) => '[' + l + ']').join('')}`)
    }

    for (let i = 0; i < jumlahPanel; i++) {
      const sumber = media[Math.min(i, media.length - 1)]
      const idx = i === 0 ? sumberPanel0 : tambahMasukan(sumber.berkas, sumber.jenis, sumber.jenis === 'foto'
        ? ['-loop', '1', '-t', String(D), '-r', String(fps)]
        : ['-t', String(D)])
      const mulai = 0.25 + i * num(template.panel.bertahap, 0.3)
      const labelMasuk = typeof idx === 'number' ? `${idx}:v` : idx
      graf.push(`[${labelMasuk}]fps=${fps},scale=${PW}:${PH}:force_original_aspect_ratio=increase,crop=${PW}:${PH},setsar=1,format=rgba[p${i}src]`)
      graf.push(`[p${i}src][${labelMask[i]}]alphamerge,format=rgba,fade=t=in:st=${mulai.toFixed(2)}:d=0.45:alpha=1[p${i}]`)
      const kolom = i % kolomPanel
      const baris = Math.floor(i / kolomPanel)
      const px = tata.marginX + kolom * (PW + jarak)
      const py = tata.marginAtas + baris * (PH + jarak)
      graf.push(`[${alurTerakhir}][p${i}]overlay=${px}:${py}:format=auto[panel${i}]`)
      alurTerakhir = `panel${i}`
      if (pakaiCinci) {
        graf.push(`[${alurTerakhir}][${labelCinci[i]}]overlay=${px}:${py}:format=auto[panelb${i}]`)
        alurTerakhir = `panelb${i}`
      }
    }
  }

  /* ── 3. color grading ── */
  const g = template.grading || {}
  const saringGrade = [
    `eq=contrast=${num(g.kontras, 1).toFixed(3)}:saturation=${num(g.saturasi, 1).toFixed(3)}:brightness=${num(g.kecerahan, 0).toFixed(3)}`,
    g.vignette ? 'vignette=angle=PI/5' : '',
    g.unsharp && KONFIG.efekBerat ? 'unsharp=5:5:0.6' : '',
    g.grain > 0 && KONFIG.efekBerat ? `noise=alls=${Math.round(num(g.grain, 0))}:allf=t+u` : '',
  ].filter(Boolean).join(',')
  graf.push(`[${alurTerakhir}]${saringGrade}[grade]`)
  alurTerakhir = 'grade'

  /* ── 4. layer teks ── */
  const daftarTeks = [
    { peran: 'judul', blok: template.teks.judul, teks: judul, t0: 0.6, t1: Math.max(2.2, D - 0.4) },
    { peran: 'subjudul', blok: template.teks.subjudul, teks: subjudul, t0: 0.6 + 0.5, t1: Math.max(2.4, D - 0.3) },
    { peran: 'meta', blok: template.teks.meta, teks: meta, t0: 0.6 + 0.9, t1: Math.max(2.6, D - 0.2) },
  ].filter((x) => x.blok && String(x.teks || '').trim())

  let nomorLayer = 0
  for (const item of daftarTeks) {
    const t0 = Math.min(item.t0, Math.max(0.2, D - 1.2))
    const t1 = Math.max(t0 + 1.0, Math.min(item.t1, D))
    const layer = layerTeks({
      indeks: nomorLayer, blok: item.blok, teks: item.teks, W, H, fps,
      t0, t1, folder, peran: item.peran,
    })
    nomorLayer += 1
    graf.push(...layer.baris)
    /* Dua lapis overlay: versi blur dulu, lalu versi tajam di atasnya. */
    graf.push(`[${alurTerakhir}][${layer.keluaran.blur}]overlay=0:${layer.y}:format=auto:enable='between(t,${t0.toFixed(3)},${t1.toFixed(3)})'[vb${nomorLayer}]`)
    graf.push(`[vb${nomorLayer}][${layer.keluaran.tajam}]overlay=0:${layer.y}:format=auto:enable='between(t,${t0.toFixed(3)},${t1.toFixed(3)})'[vt${nomorLayer}]`)
    alurTerakhir = `vt${nomorLayer}`
  }

  /* ── 5. logo (opsional) ── */
  if (logo) {
    const idxLogo = tambahMasukan(logo, 'foto', ['-loop', '1', '-t', String(D), '-r', String(fps)])
    const tinggiLogo = Math.max(16, Math.round(Math.min(W, H) * num(template.logo?.ukuran, 0.07)))
    const m = Math.round(Math.min(W, H) * 0.035)
    const posisi = String(template.logo?.posisi || 'kanan-bawah')
    const x = posisi.includes('kiri') ? `${m}` : `W-w-${m}`
    const y = posisi.includes('atas') ? `${m}` : `H-h-${m}`
    const opasitas = Math.max(0.1, Math.min(1, num(template.logo?.opacity, 0.85)))
    graf.push(`[${idxLogo}:v]scale=-2:${tinggiLogo},format=rgba,fade=t=in:st=0.4:d=0.8:alpha=1,colorchannelmixer=aa=${opasitas.toFixed(2)}[logo]`)
    graf.push(`[${alurTerakhir}][logo]overlay=${x}:${y}:format=auto[vidlogo]`)
    alurTerakhir = 'vidlogo'
  }

  /* ── 6. keluaran ── */
  graf.push(`[${alurTerakhir}]format=yuv420p[vout]`)

  /* audio */
  let idxAudio = ''
  if (utama.punyaAudio && template.audio?.pertahankan !== false) {
    const saringAudio = [`aresample=48000`, `aformat=channel_layouts=stereo`]
    if (sk < 1) {
      let sisa = sk
      while (sisa < 0.5) { saringAudio.push('atempo=0.5'); sisa = sisa / 0.5 }
      saringAudio.push(`atempo=${sisa.toFixed(4)}`)
    }
    graf.push(`[0:a]${saringAudio.join(',')}[aout]`)
    idxAudio = '[aout]'
  } else {
    masukan.push({ berkas: 'anullsrc=channel_layout=stereo:sample_rate=48000', tambahan: ['-f', 'lavfi'] })
    const idx = masukan.length - 1
    modes.push('sunyi')
    graf.push(`[${idx}:a]anull[aout]`)
    idxAudio = '[aout]'
  }

  for (const m of masukan) args.push(...m.tambahan, '-i', m.berkas)

  args.push(
    '-filter_complex', graf.join(';'),
    '-map', '[vout]',
    '-map', idxAudio,
    '-t', D.toFixed(3),
    '-c:v', 'libx264',
    '-preset', kualitasPreset.preset,
    '-crf', kualitasPreset.crf,
    '-pix_fmt', 'yuv420p',
    '-profile:v', 'high',
    '-c:a', 'aac',
    '-b:a', kualitasPreset.audio,
    '-ar', '48000',
    '-movflags', '+faststart',
    '-shortest',
    path.join(folder, 'hasil.mp4'),
  )

  return { args, W, H, fps, durasi: D, jumlahMasukan: masukan.length }
}

/* ── pemeriksaan hasil ─────────────────────────────────────────────────── */

async function bacaHasil(berkas) {
  const bin = ffprobeBin()
  if (bin) {
    const hasil = await new Promise((resolve) => {
      const anak = spawn(bin, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', berkas], { stdio: ['ignore', 'pipe', 'pipe'] })
      let keluar = ''
      const jam = setTimeout(() => { try { anak.kill('SIGKILL') } catch (e) { /* */ } }, 20000)
      anak.stdout.on('data', (d) => { keluar += d.toString() })
      anak.on('error', () => { clearTimeout(jam); resolve(null) })
      anak.on('close', () => { clearTimeout(jam); try { resolve(JSON.parse(keluar)) } catch (e) { resolve(null) } })
    })
    if (hasil && Array.isArray(hasil.streams)) {
      const v = hasil.streams.find((s) => s.codec_type === 'video')
      const a = hasil.streams.find((s) => s.codec_type === 'audio')
      return {
        lebar: Number(v?.width || 0),
        tinggi: Number(v?.height || 0),
        durasi: Number(hasil.format?.duration || v?.duration || 0),
        punyaAudio: Boolean(a),
        codec: String(v?.codec_name || ''),
      }
    }
  }
  return null
}

/* ── API utama ─────────────────────────────────────────────────────────── */

/**
 * Render satu video.
 *
 * @param {object} opsi
 * @param {Array} opsi.media        media terperiksa (lihat probe.js), [0] = utama
 * @param {object} opsi.template    preset dari templates.js
 * @param {string} opsi.folder      folder kerja (dibuat pemanggil, dihapus pemanggil)
 * @param {string} opsi.judul
 * @param {string} opsi.subjudul
 * @param {string} opsi.meta
 * @param {string} [opsi.logo]      path PNG transparan (opsional)
 * @param {number} [opsi.durasi]
 * @param {string} [opsi.kualitas]
 * @param {number} [opsi.slowmo]
 * @param {(tahap:string)=>void} [opsi.onTahap]
 * @returns {Promise<{berkas:string, info:object, diminta:object, args:Array, catatan:string[]}>}
 */
export async function renderVideo({
  media, template, folder, judul, subjudul, meta, logo = '', durasi, kualitas, slowmo = 1, onTahap = () => {},
}) {
  if (!Array.isArray(media) || !media.length) throw new Error('Tidak ada media untuk dirender.')
  if (!media.every((m) => m && m.ok !== false)) throw new Error('Ada media yang belum lolos pemeriksaan.')
  if (!template) throw new Error('Template belum dipilih.')

  const utama = media[0]
  const W = bulat2(utama.lebar)
  const H = bulat2(utama.tinggi)
  const sk = Math.max(0.4, Math.min(1, num(slowmo, 1) || 1))
  const D = Math.max(2, Math.min(
    num(durasi, utama.jenis === 'foto' ? KONFIG.durasiFoto : Math.min(utama.durasi, KONFIG.maksDurasi)),
    KONFIG.maksDurasi,
  ))

  const catatan = []
  if (utama.rotasi) catatan.push(`rotasi ${utama.rotasi}° diikuti (kanvas ${W}x${H})`)
  if (utama.lebar !== utama.lebarTampil) catatan.push(`SAR non-square dinormalkan (${utama.lebarTampil}px tampilan)`)
  if (sk < 1) catatan.push(`slow motion ${sk}x, pitch audio dijaga (atempo)`)
  if (media.length > 1) catatan.push(`${media.length} media dipakai`)

  onTahap('masker')
  const masker = {}
  const modePanel = template.panel?.mode || 'single'
  if (modePanel !== 'single') {
    const tata = hitungPanel(template, W, H, modePanel)
    masker.panel = await buatMasker(folder, 'mask-panel', tata.PW, tata.PH, tata.radius)
    if (tata.border > 0) masker.cinci = await buatMasker(folder, 'mask-cinci', tata.PW, tata.PH, tata.radius, { cinci: true, tebal: tata.border })
  }

  onTahap('susun')
  const rencana = susunArgumen({ media, template, folder, judul, subjudul, meta, logo, durasi: D, kualitas, masker, slowmo: sk })

  onTahap('render')
  const mulai = Date.now()
  await jalankan(rencana.args, { waktuMaks: KONFIG.timeoutMs })

  const berkas = path.join(folder, 'hasil.mp4')
  const ukuran = fs.existsSync(berkas) ? fs.statSync(berkas).size : 0
  if (!ukuran) throw new Error('FFmpeg selesai tetapi berkas hasil tidak ada/kosong.')

  onTahap('verifikasi')
  const info = await bacaHasil(berkas)
  if (info) {
    if (info.lebar !== rencana.W || info.tinggi !== rencana.H) {
      catatan.push(`dimensi hasil ${info.lebar}x${info.tinggi} (diminta ${rencana.W}x${rencana.H})`)
    }
    if (utama.jenis === 'video' && info.durasi > D + 1.5) {
      throw new Error(`Durasi hasil melebihi batas (${info.durasi.toFixed(1)}s > ${D}s).`)
    }
  } else {
    catatan.push('ffprobe tidak tersedia — hasil tidak diverifikasi ulang')
  }

  return {
    berkas,
    ukuran,
    info,
    /* `info.punyaAudio` selalu true kalau kita menambahkan kanvas sunyi.
     * Pemanggil butuh tahu apakah AUDIO SUMBER yang dipertahankan. */
    audioSumber: Boolean(utama.punyaAudio && template.audio?.pertahankan !== false),
    diminta: { W: rencana.W, H: rencana.H, fps: rencana.fps, durasi: rencana.durasi },
    detik: Math.round((Date.now() - mulai) / 1000),
    catatan,
    args: rencana.args,
  }
}

export default { renderVideo, susunArgumen, jalankan }
