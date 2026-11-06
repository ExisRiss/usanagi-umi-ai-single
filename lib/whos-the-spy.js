/**
 * WHO'S THE SPY — inti permainan (Task207 bagian4).
 *
 * State machine murni tanpa Baileys supaya bisa diuji15+ tes:
 *   waiting → clue → voting → (eliminated) → clue… → finished | cancelled
 *
 * Aturan (spesifikasi owner):
 *   -4–12 pemain per grup, satu ruang per grup (grup independen).
 *   - Spy dipilih acak; KATA dikirim lewat DM SAHAJA — tidak pernah masuk
 *     status publik, log, atau pesan grup.
 *   - Ruang kedaluwarsa5 menit bila belum penuh (fase waiting).
 *   - Petunjuk (clue) hanya boleh lewat REPLY pesan bot atau MENTION bot
 *     (validasi contextInfo dilakukan plugin, inti menerima flag `keBot`),
 *     maksimum1 clue per pemain per ronde, timer ronde5 menit → SKIP.
 *   - Voting memakai poll Baileys; hasil vote → eliminasi (seri = aman,
 *     tanpa eliminasi). Menang warga saat spy tersingkir; menang spy saat
 *     tersisa1 warga +1 spy.
 *   - XP: warga menang +100, spy menang +150, tiap clue +10, tiap
 *     eliminasi +25 — idempoten lewat kunci peristiwa.
 *   - Semua timer terdaftar di registry → cleanup tanpa timer sisa.
 */

export const MIN_PEMAIN = 4
export const MAX_PEMAIN = 12
export const EXPIRE_MENUNGGU_MS = 5 * 60 * 1000
export const CLUE_MS = 5 * 60 * 1000
export const VOTING_MS = 5 * 60 * 1000

export const XP = Object.freeze({
  wargaMenang: 100,
  spyMenang: 150,
  clue: 10,
  eliminasi: 25
})

export const FASE = Object.freeze({
  MENUNGGU: 'waiting',
  CLUE: 'clue',
  VOTING: 'voting',
  SELESAI: 'finished',
  BATAL: 'cancelled'
})

/** Kata permainan (rahasia). Warga & spy mendapat kata BERBEDA. */
export const KATA_LIST = Object.freeze([
  'apel', 'pisang', 'mangga', 'nasi', 'bakso', 'sate', 'mie', 'roti',
  'kucing', 'anjing', 'ular', 'burung', 'ikan', 'kuda', 'gajah', 'harimau',
  'mobil', 'motor', 'kereta', 'pesawat', 'kapal', 'sepeda', 'helikopter',
  'laptop', 'hp', 'televisi', 'kulkas', 'kipas', 'lampu', 'jam',
  'gunung', 'pantai', 'sungai', 'hutan', 'pulau', 'desa', 'kota',
  'bola', 'kasti', 'renang', 'lari', 'silat', 'sepak', 'basket',
  'jakarta', 'bandung', 'surabaya', 'makassar', 'medan', 'yogyakarta',
  'kantor', 'sekolah', 'rumah', 'pasar', 'masjid', 'gereja', 'taman',
  'obat', 'dokter', 'perawat', 'rumahsakit', 'apotek'
])

function pesanError (pesan, kode) {
  const e = new Error(pesan)
  e.kode = kode
  return e
}

/* ================================================================
 * REGISTRY TIMER — semua timer ruang wajib lewat sini agar bisa
 * dibersihkan tuntas (uji: `sisa() ===0` setelah batal/selesai).
 * ================================================================ */
export function buatTimerRegistry (scheduler) {
  const sked = scheduler || {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (id) => clearTimeout(id)
  }
  const peta = new Map() // `${ruangId}:${tipe}` → handle

  return {
    jadwalkan (ruangId, tipe, fn, ms) {
      const kunci = `${ruangId}:${tipe}`
      const lama = peta.get(kunci)
      if (lama !== undefined) sked.clear(lama)
      const handle = sked.set(() => {
        peta.delete(kunci)
        fn()
      }, ms)
      peta.set(kunci, handle)
      return kunci
    },
    batalkan (ruangId, tipe) {
      const kunci = `${ruangId}:${tipe}`
      const handle = peta.get(kunci)
      if (handle !== undefined) {
        sked.clear(handle)
        peta.delete(kunci)
      }
    },
    /** Bersihkan SEMUA timer satu ruang. */
    bersihkanRuang (ruangId) {
      for (const kunci of Array.from(peta.keys())) {
        if (kunci.startsWith(`${ruangId}:`)) {
          sked.clear(peta.get(kunci))
          peta.delete(kunci)
        }
      }
    },
    sisa () { return peta.size },
    punya (ruangId, tipe) { return peta.has(`${ruangId}:${tipe}`) }
  }
}

/* ================================================================
 * RUANG — struktur serializable (tanpa fungsi) untuk db.
 * ================================================================ */
function buatRuang (grup, pembuat, pembuatNama, sekarang) {
  return {
    versi: 1,
    grup,
    pembuat,
    fase: FASE.MENUNGGU,
    dibuat: sekarang,
    deadline: sekarang + EXPIRE_MENUNGGU_MS,
    ronde: 0,
    pemain: [{ jid: pembuat, nama: pembuatNama, out: false }],
    kataA: null, // RAHASIA — kata warga
    kataB: null, // RAHASIA — kata spy (berbeda)
    spy: null,   // RAHASIA — jid spy
    clueSudah: [],        // kunci `${ronde}:${jid}` —1 clue/ronde
    clues: [],            // { ronde, jid, teks } (teks tampil di grup juga)
    votes: {},            // voterJid → targetJid (satu entri per voter)
    pollId: null,         // id pesan poll voting aktif
    xpEvents: [],         // { kunci, jid, jumlah } — idempoten
    xpDikirim: [],        // kunci yang sudah diterapkan plugin ke db
    pemenang: null,       // 'warga' | 'spy'
    pesanBatal: null
  }
}

function pemainHidup (ruang) {
  return ruang.pemain.filter(p => !p.out)
}

function acakDuaKata (acak) {
  const n = KATA_LIST.length
  const idxA = Math.min(n - 1, Math.floor(acak() * n))
  let idxB = Math.floor(acak() * (n - 1))
  if (idxB >= idxA) idxB = Math.min(n - 1, idxB + 1)
  if (idxB === idxA) idxB = (idxA + 1) % n
  return [KATA_LIST[idxA], KATA_LIST[idxB]]
}

function catatXp (ruang, jid, jumlah, kunci) {
  if (ruang.xpEvents.some(e => e.kunci === kunci)) return false
  ruang.xpEvents.push({ kunci, jid, jumlah })
  return true
}

/* ================================================================
 * API INTI
 * ================================================================ */

/** `.ws buat` — buat ruang tunggu di grup. Error bila sudah ada ruang aktif. */
export function buatRuangTunggu (daftarRuang, grup, pembuat, pembuatNama, sekarang) {
  const existing = daftarRuang.get(grup)
  if (existing && existing.fase !== FASE.SELESAI && existing.fase !== FASE.BATAL) {
    throw pesanError('Masih ada sesi WHO\'S THE SPY di grup ini. Gunakan .ws status atau .ws cancel.', 'ADA_RUANG')
  }
  const ruang = buatRuang(grup, pembuat, pembuatNama, sekarang)
  daftarRuang.set(grup, ruang)
  return ruang
}

/**
 * `.ws join` — anti-race: cek lalu tulis sinkron (satu event loop, tanpa
 * await di antaranya → dua panggilan beruntun tidak bisa dobel masuk).
 */
export function gabung (daftarRuang, grup, jid, nama) {
  const ruang = daftarRuang.get(grup)
  if (!ruang || ruang.fase !== FASE.MENUNGGU) {
    throw pesanError('Tidak ada ruang menunggu. Mulai dengan .ws buat', 'TIDAK_ADA')
  }
  if (ruang.pemain.some(p => p.jid === jid)) {
    throw pesanError('Kamu sudah bergabung.', 'SUDAH_GABUNG')
  }
  if (ruang.pemain.length >= MAX_PEMAIN) {
    throw pesanError(`Ruangan penuh (maksimal ${MAX_PEMAIN} pemain).`, 'PENUH')
  }
  ruang.pemain.push({ jid, nama: String(nama || jid).slice(0, 40), out: false })
  return ruang
}

/**
 * `.ws play` — mulai bila pemain ≥ MIN_PEMAIN. Menghasilkan daftar DM yang
 * harus dikirim plugin: [{ jid, teks }]. Bila ada DM gagal → plugin memanggil
 * `batalKarenaDm` (batal aman, tanpa rahasia bocor).
 */
export function siapkanMain (daftarRuang, grup, sekarang, acak) {
  const ruang = daftarRuang.get(grup)
  if (!ruang || ruang.fase !== FASE.MENUNGGU) {
    throw pesanError('Tidak ada ruang menunggu.', 'TIDAK_ADA')
  }
  if (ruang.pemain.length < MIN_PEMAIN) {
    throw pesanError(`Pemain minimal ${MIN_PEMAIN}.`, 'KURANG')
  }
  const rng = acak || Math.random
  const [kataA, kataB] = acakDuaKata(rng)
  ruang.kataA = kataA
  ruang.kataB = kataB
  const semua = pemainHidup(ruang)
  const idxSpy = Math.floor(rng() * semua.length)
  ruang.spy = semua[idxSpy].jid
  ruang.fase = FASE.CLUE
  ruang.ronde = 1
  ruang.clueSudah = []
  ruang.clues = []
  ruang.votes = {}
  ruang.pollId = null
  ruang.deadline = sekarang + CLUE_MS

  return semua.map(p => {
    if (p.jid === ruang.spy) {
      return {
        jid: p.jid,
        teks: `🕵️ *WHO'S THE SPY*\n\nKamu adalah *SPY*!\nKata kamu: *${ruang.kataB}*\nBukan warga — jangan ketahuan. Intip petunjuk mereka di grup.`
      }
    }
    return {
      jid: p.jid,
      teks: `👥 *WHO'S THE SPY*\n\nKamu *warga*. Kata kamu: *${ruang.kataA}*\nJaga rapat-rapat, spy ikut dapat kata (berbeda!).`
    }
  })
}

/** Batal aman — dipanggil saat DM kata gagal atau .ws cancel. */
export function batalRuang (daftarRuang, grup, alasan) {
  const ruang = daftarRuang.get(grup)
  if (!ruang) return null
  ruang.fase = FASE.BATAL
  ruang.pesanBatal = String(alasan || 'Dibatalkan.')
  ruang.kataA = null
  ruang.kataB = null
  ruang.spy = null
  return ruang
}

/**
 * Terima clue dari pemain. `keBot` = plugin sudah memastikan pesan adalah
 * REPLY ke pesan bot ATAU MENTION bot (validasi contextInfo).
 */
export function terimaClue (daftarRuang, grup, { jid, teks, keBot, sekarang }) {
  const ruang = daftarRuang.get(grup)
  if (!ruang || ruang.fase !== FASE.CLUE) {
    throw pesanError('Tidak ada ronde petunjuk yang berjalan.', 'FASE')
  }
  const p = ruang.pemain.find(x => x.jid === jid && !x.out)
  if (!p) throw pesanError('Kamu bukan pemain aktif.', 'BUKAN_PEMAIN')
  if (!keBot) {
    throw pesanError('Petunjuk harus REPLY pesan bot atau MENTION bot.', 'KONTEKS')
  }
  if (sekarang >= ruang.deadline) {
    throw pesanError('Waktu ronde habis — sedang lanjut ke voting.', 'WAKTU')
  }
  const kunci = `${ruang.ronde}:${jid}`
  if (ruang.clueSudah.indexOf(kunci) !== -1) {
    throw pesanError('Sudah1 petunjuk di ronde ini — tunggu ronde berikutnya.', 'CLUE_GANDA')
  }
  const isi = String(teks || '').trim().slice(0, 300)
  if (!isi) throw pesanError('Petunjuk kosong.', 'KOSONG')
  ruang.clueSudah.push(kunci)
  ruang.clues.push({ ronde: ruang.ronde, jid, teks: isi })
  const baru = catatXp(ruang, jid, XP.clue, `clue:${kunci}:${ruang.clues.length}`)
  return { ok: true, xpBaru: baru ? [{ jid, jumlah: XP.clue }] : [] }
}

/** Timer clue habis → SKIP ke voting. */
export function clueHabis (daftarRuang, grup, sekarang) {
  const ruang = daftarRuang.get(grup)
  if (!ruang || ruang.fase !== FASE.CLUE) return null
  return pindahKeVoting(ruang, sekarang)
}

function pindahKeVoting (ruang, sekarang) {
  ruang.fase = FASE.VOTING
  ruang.deadline = sekarang + VOTING_MS
  ruang.votes = {}
  ruang.pollId = null
  return ruang
}

/** Paksa lanjut (dipakai plugin: tombol/ruang basi). */
export function paksaVoting (daftarRuang, grup, sekarang) {
  const ruang = daftarRuang.get(grup)
  if (!ruang || ruang.fase !== FASE.CLUE) return null
  return pindahKeVoting(ruang, sekarang)
}

/**
 * Catat vote dari poll. `pollId` harus cocok dengan poll voting aktif
 * (poll lain di grup diabaikan). Voter terakhir menang (boleh ganti vote
 * selama voting berjalan — satu entri per voter, bukan suara ganda).
 */
export function prosesVote (daftarRuang, grup, { voterJid, targetJid, pollId, sekarang }) {
  const ruang = daftarRuang.get(grup)
  if (!ruang || ruang.fase !== FASE.VOTING) {
    throw pesanError('Voting tidak aktif.', 'FASE')
  }
  if (sekarang >= ruang.deadline) {
    throw pesanError('Waktu voting habis.', 'WAKTU')
  }
  if (pollId && ruang.pollId && pollId !== ruang.pollId) {
    throw pesanError('Poll bukan milik voting ini.', 'POLL')
  }
  const pemilih = ruang.pemain.find(x => x.jid === voterJid && !x.out)
  if (!pemilih) throw pesanError('Hanya pemain aktif yang boleh voting.', 'BUKAN_PEMAIN')
  const target = ruang.pemain.find(x => x.jid === targetJid && !x.out)
  if (!target) throw pesanError('Target tidak valid (sudah tersingkir atau bukan pemain).', 'TARGET')
  ruang.votes[voterJid] = targetJid
  return ruang
}

function hitungSuara (ruang) {
  const tally = {}
  for (const target of Object.values(ruang.votes)) {
    tally[target] = (tally[target] || 0) + 1
  }
  return tally
}

/**
 * Tutup voting → hasil. Seri teratas = TANPA eliminasi (aman).
 * Kembalikan { hasil, eliminasi, xpBaru, menang, rondeBerikut }.
 */
export function tutupVoting (daftarRuang, grup, sekarang) {
  const ruang = daftarRuang.get(grup)
  if (!ruang || ruang.fase !== FASE.VOTING) {
    throw pesanError('Voting tidak aktif.', 'FASE')
  }
  const tally = hitungSuara(ruang)
  let top = null
  let topHitung = 0
  let seri = false
  for (const [jid, n] of Object.entries(tally)) {
    if (n > topHitung) { top = jid; topHitung = n; seri = false } else if (n === topHitung) { seri = true }
  }
  const hasil = {
    tally,
    seri: Boolean(top && seri),
    eliminasi: null,
    xpBaru: [],
    menang: null,
    lanjut: false
  }
  if (!top || hasil.seri) {
    // Seri / tidak ada suara → tanpa eliminasi, ronde berikutnya.
    hasil.lanjut = true
    mulaiRondeBerikut(ruang, sekarang)
    return hasil
  }

  const korban = ruang.pemain.find(p => p.jid === top)
  korban.out = true
  hasil.eliminasi = korban
  if (catatXp(ruang, korban.jid, XP.eliminasi, `elim:${ruang.ronde}:${korban.jid}`)) {
    hasil.xpBaru.push({ jid: korban.jid, jumlah: XP.eliminasi })
  }

  const sisa = pemainHidup(ruang)
  const spyHidup = sisa.some(p => p.jid === ruang.spy)
  const wargaHidup = sisa.filter(p => p.jid !== ruang.spy)

  if (!spyHidup) {
    hasil.menang = 'warga'
    selesaikan(ruang, 'warga')
    hasil.xpBaru.push(...terapkanXpMenang(ruang, 'warga'))
    return hasil
  }
  if (wargaHidup.length === 1 && sisa.length === 2) {
    hasil.menang = 'spy'
    selesaikan(ruang, 'spy')
    hasil.xpBaru.push(...terapkanXpMenang(ruang, 'spy'))
    return hasil
  }
  hasil.lanjut = true
  mulaiRondeBerikut(ruang, sekarang)
  return hasil
}

function mulaiRondeBerikut (ruang, sekarang) {
  ruang.fase = FASE.CLUE
  ruang.ronde += 1
  ruang.votes = {}
  ruang.pollId = null
  ruang.deadline = sekarang + CLUE_MS
}

function selesaikan (ruang, pemenang) {
  ruang.fase = FASE.SELESAI
  ruang.pemenang = pemenang
  ruang.deadline = 0
  ruang.kataA = null
  ruang.kataB = null
}

function terapkanXpMenang (ruang, pemenang) {
  const xpBaru = []
  if (pemenang === 'warga') {
    for (const p of ruang.pemain) {
      if (p.jid === ruang.spy) continue
      if (catatXp(ruang, p.jid, XP.wargaMenang, `menang:warga:${p.jid}`)) {
        xpBaru.push({ jid: p.jid, jumlah: XP.wargaMenang })
      }
    }
  } else {
    if (catatXp(ruang, ruang.spy, XP.spyMenang, `menang:spy:${ruang.spy}`)) {
      xpBaru.push({ jid: ruang.spy, jumlah: XP.spyMenang })
    }
  }
  return xpBaru
}

/** Voting waktu habis (belum semua vote) → tutup paksa. */
export function votingHabis (daftarRuang, grup, sekarang) {
  const ruang = daftarRuang.get(grup)
  if (!ruang || ruang.fase !== FASE.VOTING) return null
  return tutupVoting(daftarRuang, grup, sekarang)
}

/** Semua pemain aktif sudah vote → tutup lebih awal. */
export function semuaSudahVote (daftarRuang, grup) {
  const ruang = daftarRuang.get(grup)
  if (!ruang || ruang.fase !== FASE.VOTING) return false
  const hidup = pemainHidup(ruang)
  return hidup.length > 0 && hidup.every(p => Boolean(ruang.votes[p.jid]))
}

/**
 * Status AMAN untuk grup: tanpa kata, tanpa jid spy, tanpa isi vote.
 */
export function statusPublik (daftarRuang, grup, sekarang) {
  const ruang = daftarRuang.get(grup)
  if (!ruang) return 'Tidak ada sesi WHO\'S THE SPY di grup ini.'
  const faseLabel = {
    [FASE.MENUNGGU]: '⏳ Menunggu pemain',
    [FASE.CLUE]: '🔍 Ronde petunjuk',
    [FASE.VOTING]: '🗳️ Voting',
    [FASE.SELESAI]: `🏁 Selesai — menang: ${ruang.pemenang === 'warga' ? 'WARGA 👥' : 'SPY 🕵️'}`,
    [FASE.BATAL]: `❌ Dibatalkan${ruang.pesanBatal ? ` (${ruang.pesanBatal})` : ''}`
  }[ruang.fase]
  const nama = ruang.pemain.map((p, i) => `${i + 1}. ${p.nama}${p.out ? ' ❌' : ''}`).join('\n')
  const sisaDetik = ruang.deadline > 0 ? Math.max(0, Math.ceil((ruang.deadline - sekarang) / 1000)) : 0
  return [
    `*WHO'S THE SPY* — ${faseLabel}`,
    `Pemain (${pemainHidup(ruang).length}/${MAX_PEMAIN}):`,
    nama,
    ruang.fase === FASE.MENUNGGU
      ? `Mulai: .ws play (minimal ${MIN_PEMAIN}) • sisa ${sisaDetik}s`
      : `Ronde: ${ruang.ronde} • sisa ${sisaDetik}s`,
    `Petunjuk: REPLY pesan bot atau MENTION bot —1 per ronde.`
  ].join('\n')
}

/** Daftar DM kata — TANPA menyimpan ke output lain. */
export function dmUntuk (daftarRuang, grup) {
  const ruang = daftarRuang.get(grup)
  if (!ruang || !ruang.kataA) return []
  return siapkanMainSnapshot(ruang)
}

function siapkanMainSnapshot (ruang) {
  return ruang.pemain.filter(p => !p.out).map(p => ({
    jid: p.jid,
    teks: p.jid === ruang.spy
      ? `🕵️ Kamu SPY. Kata kamu: ${ruang.kataB}`
      : `👥 Kamu warga. Kata kamu: ${ruang.kataA}`
  }))
}

/* ================================================================
 * PERSISTENSI — serial → file JSON atomik; pulihkan saat restart.
 * ================================================================ */
export function serialkan (daftarRuang) {
  return Array.from(daftarRuang.values())
}

export function pulihkan (data, sekarang) {
  const daftar = new Map()
  if (!Array.isArray(data)) return daftar
  for (const ruang of data) {
    if (!ruang || typeof ruang !== 'object' || !ruang.grup) continue
    if (ruang.fase === FASE.MENUNGGU && sekarang >= ruang.deadline) continue // kedaluwarsa dibuang
    if (ruang.fase === FASE.SELESAI || ruang.fase === FASE.BATAL) continue // tak perlu disimpan
    // Fase aktif dengan deadline lewat dibiarkan — plugin menyelesaikan
    // transisinya saat boot (tanpa timer lama yang tersisa).
    daftar.set(ruang.grup, ruang)
  }
  return daftar
}

export function buatPenyimpan (pathModul, fsModul, dir) {
  const path = pathModul
  const fs = fsModul
  const file = path.join(dir, 'rooms.json')
  return {
    file,
    async simpan (daftarRuang) {
      await fs.promises.mkdir(dir, { recursive: true })
      const tmp = `${file}.tmp`
      await fs.promises.writeFile(tmp, JSON.stringify(serialkan(daftarRuang)), { mode: 0o600 })
      await fs.promises.rename(tmp, file)
    },
    async muat () {
      try {
        const teks = await fs.promises.readFile(file, 'utf8')
        return JSON.parse(teks)
      } catch {
        return []
      }
    }
  }
}

export default {
  MIN_PEMAIN, MAX_PEMAIN, EXPIRE_MENUNGGU_MS, CLUE_MS, VOTING_MS, XP, FASE,
  buatTimerRegistry, buatRuangTunggu, gabung, siapkanMain, batalRuang,
  terimaClue, clueHabis, paksaVoting, prosesVote, tutupVoting, votingHabis,
  semuaSudahVote, statusPublik, dmUntuk, serialkan, pulihkan, buatPenyimpan
}
