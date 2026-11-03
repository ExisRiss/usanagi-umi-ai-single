# Tutorial Task200 — Audit Error Bot + Mode Premium

## Yang diperbaiki (terbukti uji)

### 1. `rate-overlimit` (keluhan user: "over rate limit" di WA)
- **Gejala**: perintah `.add` (tambah anggota grup) memunculkan `Error: rate-overlimit`
  mentah ke chat — datang dari WhatsApp/Baileys saat aksi grup dibatasi.
- **Penyebab**: `plugins/group/group-manage.js` memanggil
  `conn.groupParticipantsUpdate()` tanpa `try/catch` dan tanpa jeda ulang.
- **Fix**: helper `jalankanAksi()` — retry3× dengan backoff4s/8s; kalau tetap gagal,
  balasan manusiawi: *"⛔ WhatsApp membatasi aksi grup ini (rate limit)…"*.
  `kick/promote/demote` juga ikut tertangkap.
- **Bukti**: `tmp-uji/alat/uji-errorfix.mjs` —9/9 (retry3x, backoff12s, sukses
  setelah2x gagal, error biasa tanpa retry).

### 2. `ENOENT sessions/jadibot/<nomor>/creds.json`
- **Gejala**: `process.unhandledRejection` berulang di log.
- **Penyebab**: `disconnectSubBot(..., {deleteSession:true})` menghapus folder sesi
  segera setelah `ws.close()` — auth state masih menulis `creds.json` yang sudah
  hilang → ENOENT.
- **Fix**: `lib/jadibot.js` — tunggu700ms sebelum `rmSync` supaya tulisan antrean selesai.
- **Bukti**: uji disconnect + hapus folder → bersih tanpa error.

### 3. Unhandled rejection resolver Instagram
- **Gejala**: `scrapeInstagramWebSjs/Page/Embed` melempar `process.unhandledRejection`
  (3 entri berbeda tiap hari).
- **Penyebah**: promise tier-2 dibuat bersamaan saat deklarasi `tierTasks`, tapi
  handler baru dipasang setelah loop mencapai tier-2 — kalau scraper cepat gagal
  saat tier-1 masih berjalan, reject-nya tak tertangkap.
- **Fix**: pembungkus `aman(promise, tier)` yang menangani sejak awal
  (`{error}` → diteruskan ke `lastError`).
- **Bukti**: uji —0 unhandled + user tetap dibalas pesan ramah.

### 4. Mode premium tidak mengunci fitur (`/premium add` terasa "gabisa")
- **Gejala**: `.premium add ht` menambah daftar tapi fitur tetap terbuka untuk
  semua orang — user mengira perintahnya rusak.
- **Penyebab NYATA**: `data/premium-main.json` = `{"enabled": false, "plugins": []}`
  (diset `website-console`31 Okt) → `isPremiumFeatureLocked()` selalu `false`
  karena saklar bot OFF. Kode `.premium add/del` sendiri SEHAT.
- **Fix**: saklar dinyalakan → `{"enabled": true, ...}` di container.
- **Bukti**: `tmp-uji/alat/uji-premium.mjs` —18/18: `add ht/rvo/jadibotconfig`
  sukses, `ht` TERKUNCI utk non-premium, `sticker` tetap bebas, `del/reset` jalan.

## Perintah premium (owner)
```
.premium on | off          saklar bot ini
.premium add ht            fitur ht jadi premium (user non-premium ditolak)
.premium del ht            keluarkan dari premium
.premium add ht,rvo,jadibot   banyak sekaligus
.premium list | cari <kata> | set <a,b> | reset
.premium kontak <nomor>    nomor wa.me di pesan "hubungi owner"
.premium global on|off     saklar platform (developer)
```
Catatan: fitur juga terkunci kalau plugin bawaan bertanda `handler.premium = true`.
Kunci efektif hanya bila saklar platform ON (default) DAN saklar bot ON.

## Website game.gwenna.my.id (hasil audit)
- Home, login, tab, room UNO: **0 error JS** (Playwright).
- API: health/lobby/rooms/create aman (40x request tanpa429 berbahaya).
-429 server selalu berbahasa Indonesia ("Terlalu banyak…") — **bukan** "over rate limit".
- Kode origin ada di server terpisah (`165.232.107.82`, nginx) — tidak terjangkau
  oleh kredensial di workspace (tanpa SSH/deploy key; token CF = scope DNS).

## Alur deploy ke container (penting — auto-update MATI)
Container d1 tidak `git pull` otomatis. Cara memperbaiki langsung:
1. Edit & uji di repo lokal (`node --check` + uji Playwright/node).
2. Push GitHub.
3. Tulis file yang sama ke container via `tools/panelcloud.py` (`write_file` +
   baca ulang sha256).
4. Restart server (`power restart`) agar plugin dimuat ulang.
