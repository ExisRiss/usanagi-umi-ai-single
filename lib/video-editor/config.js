/* By AlzRiss - Usanagi Umi AI
 *
 * Task146 — CINEMATIC TYPOGRAPHY VIDEO EDITOR · konfigurasi
 *
 * Semua ambang batas bisa diubah lewat environment variable di panel.
 * Nilai bawaan dipilih supaya aman di VPS kecil (2 core / 2-4 GB).
 */

const angka = (nilai, bawaan) => {
  const n = Number(nilai)
  return Number.isFinite(n) && n > 0 ? n : bawaan
}

const pilihan = (nilai, daftar, bawaan) => {
  const v = String(nilai || '').trim().toLowerCase()
  return daftar.includes(v) ? v : bawaan
}

export const KONFIG = {
  /** VIDEO_EDITOR_ENABLED=0 mematikan seluruh fitur (perintah membalas alasan). */
  aktif: !/^(0|false|off|no)$/i.test(String(process.env.VIDEO_EDITOR_ENABLED || '1')),

  /** Batas per berkas masukan. */
  maksInputBytes: angka(process.env.VIDEO_EDITOR_MAX_INPUT_BYTES, 35 * 1024 * 1024),
  /** Batas berkas hasil. Video yang lebih besar dari ini tidak dikirim. */
  maksOutputBytes: angka(process.env.VIDEO_EDITOR_MAX_OUTPUT_BYTES, 64 * 1024 * 1024),
  /** Batas durasi sumber (detik). */
  maksDurasi: angka(process.env.VIDEO_EDITOR_MAX_DURATION, 60),
  /** Durasi hasil kalau sumber foto (detik). */
  durasiFoto: angka(process.env.VIDEO_EDITOR_PHOTO_DURATION, 12),
  /** Jumlah media per sesi (1 utama + tambahan untuk kolase). */
  maksMedia: angka(process.env.VIDEO_EDITOR_MAX_MEDIA, 4),
  /** Rendering bersamaan. */
  maksConcurrent: angka(process.env.VIDEO_EDITOR_MAX_CONCURRENT, 2),
  /** Batas panjang antrean. */
  maksAntrean: angka(process.env.VIDEO_EDITOR_MAX_QUEUE, 8),
  /** Timeout satu rendering. */
  timeoutMs: angka(process.env.VIDEO_EDITOR_TIMEOUT_MS, 5 * 60 * 1000),
  /** Folder berkas sementara (dibuat otomatis). */
  tempDir: process.env.VIDEO_EDITOR_TEMP_DIR || '',
  /** Kualitas: rendah | sedang | tinggi. */
  kualitas: pilihan(process.env.VIDEO_EDITOR_DEFAULT_QUALITY, ['rendah', 'sedang', 'tinggi'], 'sedang'),
  /** Umur sesi (ms). */
  ttlSesiMs: angka(process.env.VIDEO_EDITOR_SESSION_TTL_MS, 30 * 60 * 1000),
  /** Batas FPS hasil (sumber di atas ini diturunkan). */
  maksFps: angka(process.env.VIDEO_EDITOR_MAX_FPS, 30),
  /** Logo bawaan (opsional). Kalau tidak ada, layer logo dilewati. */
  logoBawaan: process.env.VIDEO_EDITOR_DEFAULT_LOGO || '',
  /** Efek berat boleh dimatikan untuk VPS lemah. */
  efekBerat: !/^(0|false|off|no)$/i.test(String(process.env.VIDEO_EDITOR_HEAVY_EFFECTS || '1')),
}

/** Preset kualitas H.264. */
export const PRESET_KUALITAS = {
  rendah: { crf: '26', preset: 'veryfast', audio: '96k' },
  sedang: { crf: '23', preset: 'veryfast', audio: '128k' },
  tinggi: { crf: '20', preset: 'medium', audio: '160k' },
}

export function presetKualitas(nama) {
  return PRESET_KUALITAS[pilihan(nama, Object.keys(PRESET_KUALITAS), KONFIG.kualitas)] || PRESET_KUALITAS.sedang
}

export default KONFIG
