// Shared across website actions and native RPG plugins, including awaits for media.
//
// Task207 — kunci dua kelas: PENGUNGA (per pengirim) vs BERSAMA (situs web).
// Bukti (data/latency-119.jsonl): mutex global 'rpg:shared-world' yang dipegang
// sepanjang task termasuk await media membuat REPLY orang lain melonjak 10× saat
// plugin user lain lambat (median 143ms → 1535ms, p90 6126ms → 15622ms).
//
// Protokol sekarang:
//   • kunci pengirim 'rpg:user:<nomor>'  → task lintas pengguna berjalan PARALEL;
//     sesama pengirim tetap berurutan (tulisan-baca cepat aman).
//   • tanpa kunci / 'rpg:shared-world'  → tetap eksklusif terhadap semua task
//     pengguna DAN sesama pemegang bersama (kontrak lama dipertahankan:
//     aksi web dan perintah pesan pada pengguna yang sama tetap terserial —
//     lihat tests/unified-integration.test.mjs "web buy and legacy earnings").
//   • pengguna baru hanya menunggu pemegang bersama yang SEDANG berjalan;
//     antrean bersama yang menunggu >2 dtk mendapat giliran (anti kelaparan).
//   • penjaga transaksi tetap ada di unified-store (flush membatalkan aman
//     bila data berubah) — lapisan ini soal LINTAS jalur (web vs pesan).
//
// Pemanggil tanpa kunci (situs web Realms, worker hadiah, cadangan) memakai
// jalur bersama persis seperti perilaku lama.
import { AsyncLocalStorage } from 'node:async_hooks'

const key = Symbol.for('umi.realms.gate.v1')
if (!global[key]) {
  global[key] = {
    context: new AsyncLocalStorage(),
    queued: 0,
    // jalur bersama
    antreBersama: Promise.resolve(),
    bebaskanBersama: null,
    bersamaAktif: false,
    menungguPengguna: null,   // fn: bangunkan saat semua pengguna selesai
    sejakAntreBersama: 0,     // kapan jalur bersama mulai menunggu (anti starvation)
    masukBersama: null,       // promise: resolved saat jalur bersama resmi masuk
    // jalur pengguna
    ekorPengguna: new Map(),  // nomor → promise antre per pengguna
    penggunaAktif: new Map(), // nomor → jumlah task aktif
    menungguBersama: [],      // fn: bangunkan saat jalur bersama bebas
  }
}
const gate = global[key]
const BERSAMA = 'rpg:shared-world'
const ANTI_KELAPARAN_MS = 2000

function bangunSemua(daftar) {
  const tunggu = daftar.splice(0, daftar.length)
  for (const fn of tunggu) {
    try { fn() } catch { /* abaikan */ }
  }
}

async function masukJalurBersama() {
  // Satu jalur bersama pada satu waktu (rantai janji), lalu tunggu semua
  // pemegang pengguna benar-benar selesai — bukan yang masih mengantre.
  const antre = gate.antreBersama
  let lepasAntre
  gate.antreBersama = new Promise(resolve => { lepasAntre = resolve })
  await antre
  gate.sejakAntreBersama = Date.now()
  let lepasMasuk
  const janjiMasuk = new Promise(resolve => { lepasMasuk = resolve })
  gate.masukBersama = janjiMasuk
  while (gate.penggunaAktif.size > 0) {
    await new Promise(resolve => { gate.menungguPengguna = resolve })
  }
  gate.sejakAntreBersama = 0
  gate.bersamaAktif = true
  lepasMasuk()
  return () => {
    gate.bersamaAktif = false
    lepasAntre()
    bangunSemua(gate.menungguBersama)
  }
}

async function masukJalurPengguna(nomor) {
  // 1) urutkan sesama pengirim yang sama
  const ekorLama = gate.ekorPengguna.get(nomor) || Promise.resolve()
  let lepasEkor
  const ekorBaru = new Promise(resolve => { lepasEkor = resolve })
  gate.ekorPengguna.set(nomor, ekorBaru)
  await ekorLama
  // 2) bila jalur bersama sudah menunggu lama, haturkan giliran (anti starvation)
  if (gate.sejakAntreBersama && Date.now() - gate.sejakAntreBersama > ANTI_KELAPARAN_MS && gate.masukBersama) {
    await gate.masukBersama
  }
  // 3) hanya menunggu pemegang bersama yang SEDANG berjalan
  while (gate.bersamaAktif) {
    await new Promise(resolve => { gate.menungguBersama.push(resolve) })
  }
  const sebelum = gate.penggunaAktif.get(nomor) || 0
  gate.penggunaAktif.set(nomor, sebelum + 1)
  return () => {
    const sisa = (gate.penggunaAktif.get(nomor) || 1) - 1
    if (sisa <= 0) gate.penggunaAktif.delete(nomor)
    else gate.penggunaAktif.set(nomor, sisa)
    lepasEkor()
    if (gate.penggunaAktif.size === 0 && gate.menungguPengguna) {
      const fn = gate.menungguPengguna
      gate.menungguPengguna = null
      try { fn() } catch { /* abaikan */ }
    }
  }
}

export async function withRealmGate(task, keys) {
  if (gate.context.getStore()?.active) return task()
  const daftar = Array.isArray(keys) && keys.length > 0 ? keys.map(String) : [BERSAMA]
  const pakaiBersama = daftar.includes(BERSAMA)
  if (gate.queued >= 128) throw Object.assign(new Error('Dunia sedang sibuk. Coba sebentar lagi.'), { status: 503 })
  gate.queued++
  try {
    const pelepas = []
    if (pakaiBersama) {
      pelepas.push(await masukJalurBersama())
    } else {
      for (const nomor of [...new Set(daftar)].sort()) pelepas.push(await masukJalurPengguna(nomor))
    }
    const scope = { active: true }
    try {
      return await gate.context.run(scope, async () => {
        try { return await task() } finally { scope.active = false }
      })
    } finally {
      for (let i = pelepas.length - 1; i >= 0; i--) pelepas[i]()
    }
  } finally {
    gate.queued--
  }
}
