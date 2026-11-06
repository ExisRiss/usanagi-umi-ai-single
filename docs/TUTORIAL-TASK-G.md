# Tutorial Task G — Perbaikan & Fitur Baru (2026-11-06)

## 1. `.list` / `.listgc` — daftar grup tidak lagi error `GROUP_LIST_CHANGED`
- Penyebab: saat bot ramai, event grup terus menaikkan epoch fetch; cache hanya mencoba 2×.
- Perbaikan: retry dinaikkan ke **6× dengan jeda bertahap** (250ms×n) di `lib/group-metadata-cache.js`,
  plus pengaman loop **3 percobaan** di `plugins/owner/owner-listgc.js`.
- Pakai: `.list` (atau `.listgc`) seperti biasa — kalau sekaligus gagal, coba lagi beberapa detik kemudian.

## 2. `.saham` — pesan error server 522 kini ramah
- Fakta: server game `game.gwenna.my.id` (origin `165.232.107.82`) sedang **mati total** (CF 522, semua port timeout).
  Ini di sisi server — perlu dinyalakan ulang oleh owner. Bukan bug bot.
- Perbaikan: `callGame` kini (a) mengulang sekali khusus GET untuk status 521–524, (b) timeout & origin-down
  dikirim sebagai pesan jelas: *"Server game sedang offline / tidak merespons — coba lagi beberapa menit."*
- Endpoint lain tetap: `.tradinglogin`, `.depositgame`, leaderboards, dsb — begitu server nyala, langsung jalan.

## 3. `/tradingwa` — tampilan baru ala platform forex/crypto
- **Daftar saham kini rail geser (geser ke samping)**, bukan daftar panjang — pilih saham lewat kartu + filter:
  `SEMUA · NAIK · TURUN · TOP MOVERS`.
- **Ticker berjalan** di atas layar (seperti bursa asli) menampilkan semua harga + perubahan %.
- **Chart dgn sumbu harga** di kanan + tag harga terakhir (garis putus-putus).
- **Timeframe**: tombol `1M / 5M / 15M / 30M` (bar digabung, volume tetap tampil).
- **Bid / Ask** ala forex (spread 0,1%) tepat di bawah chart.
- **Sinyal di chart**: panah `▲BUY` muncul saat arah naik, `▼SELL` saat arah turun (EMA6),
  plus badge `SINYAL: BUY/SELL/NETRAL` di bar timeframe. **Ikuti arah trend: turun → SELL, naik → BUY.**
- **Posisi (Portofolio)**: P/L dalam $ dan **%**, tombol **TUTUP** untuk jual cepat.
- Harga tetap tersimpan lokal (localStorage HP) — aman, tanpa internet.

## 4. `.rch` — reaction dijamin sampai ke saluran
- Setelah VIP sukses, bot otomatis mengirim reaction yang sama lewat **koneksi langsung akun bot**
  (jalur terbukti) sebagai jaring pengaman. Jejak: `/data/rch-probe.log` (baris `G4 CONNECTION-FALLBACK`).
- **Probe bukti**: `.t211probe` (khusus rowner) — uji VIP vs koneksi di pesan uji sendiri, hasil otomatis
  di `/data/rch-probe.log` (baris `KESIMPULAN VIP` / `KESIMPULAN CONNECTION`). Auto-run saat boot.

## 5. `/mlskill` — game baru (Arena Kotak / Fanny)
- Ketik `.mlskill` → game dikirim sebagai **rich message** (pola forward bertanda tangan, sama seperti
  `/tradingwa` dan game sonic) — langsung main di chat, joystick + tombol kabel, skor tersimpan lokal.

## 6. Kartu rich message: bisa digeser + tidak bisa di-reply (laporan lanjutan owner)
Berlaku untuk `/tradingwa`, `/mlskill`, dan `/ular` (semua kartu "main di WhatsApp").
- **Tidak bisa di-reply lagi**: swipe ke samping di kartu dan long-press tidak lagi memunculkan
  menu "Balas"; teks juga tidak ikut tersorot.
- **Layar tetap bisa digeser**: geser naik/turun tetap diteruskan ke WhatsApp, jadi kamu bisa
  menggeser chat seperti biasa. Geser ke samping hanya aktif di area yang memang daftar geser
  (rail saham, isi grafik) dan di area permainan (joystick/papan).
- **Ukuran dipas-kan di HP**:
  * `/mlskill` — dulu canvas setinggi LAYAR penuh (makanya kebesaran); sekarang tinggi kartu
    `clamp(240px, 54vh, 430px)` dan canvas mengikuti ukuran kartu (ResizeObserver).
  * `/tradingwa` — tinggi total turun ±100px: ticker 22px, chart 104px dengan **isi grafik digeser
    sendiri** (`.cbody`), kartu KAS/ASET, traffic, tab, info, panel order, dan input dipadatkan.
  * `/ular` — tidak lagi dipaksa `min-height:100vh`, padding HP dirapatkan.
- Kalau kartu lama masih terlihat besar/aneh: **kirim ulang perintahnya** (kartu lama tidak berubah).

---
---
Catatan: `node --check` semua file berubah = OK; eslint file Task G = 0 error;
`tests/auto-ai + agent-settings` = 17 pass / 0 fail.
