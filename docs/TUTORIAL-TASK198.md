# Tutorial Task198 — Game UMI terhubung bot utama & jadibot

**Tanggal:** 2026-11-01 · **Kondisi server game:** UMI GAMES v3.0.0 (game.gwenna.my.id)

## 🔍 Laporan & Diagnosis

User: *"Benerin game Umi agar terintegrasi ke bot jadibot dan bot utama, login pakai token
website jadibot / lewat bot, semua game & fitur terhubung bot WhatsApp (room dll), perbaiki
/getsc yang kirim link kosong 404."*

### Temuan diagnosis (bukti langsung ke server game)

1. **`/getsc` 404** — berkas disimpan di server 044f34b0 (tempat bot user), sedangkan host
   `upload.gwenna.my.id` disaji API d1ebc84a → tautan mati. (Fix Task196 — sudah live.)
2. **Server game naik ke v3.0.0 dan MEMUTUS jembatan lama:**
   | Endpoint lama (dipakai bot) | Status di v3 |
   |---|---|
   | `POST /api/rooms` (buat meja) | **404** → v3: `POST /api/rooms/create` |
   | `POST /api/rooms/{id}/claim` | **404** (dihapus) |
   | `POST /api/rooms/{id}/verify` | **404** (dihapus) |
   | `GET /api/rooms/{id}/state` | **404** (lambat) → v3: `GET /api/rooms/{id}` |
   | `GET /api/notify/pending` | **404** — notifikasi room mati |
   | `POST /api/trading/credit` | **404** — topup $AS dari wallet mati |
3. **Endpoint v3 yang hidup (dipetakan dengan uji langsung):**
   - `POST /api/rooms/create {game}` → `201 {roomId, token(host), view}` — tanpa auth
   - `POST /api/rooms/{id}/join {name}` → `{token(seat), view}` — tanpa auth
   - `POST /api/rooms/{id}/start {token}` → mulai; token host = token create, dikirim di **body**
   - `GET /api/rooms/{id}/state` → seats/phase/log · `GET /api/rooms` · `GET /api/health`
   - Auth web: `POST /api/auth/register|login {name,pin}` (register membalas **201**)
   - URL room: `https://game.gwenna.my.id/#/room/{id}`

## ✅ Yang dikerjakan

### 1. `plugins/game/game-webmultiplayer.js` — jembatan room v3 (rewrite)
- `.uno`, `.caturweb`, `.utweb`, `.monopoli`, `.empire`, `.wwweb`, `.unoflip`:
  tanpa argumen → **buat meja** (create) + tautan; `join <id>` → info & tautan;
  `start <id>` → start (hanya pembuat room — token host disimpan di registry);
  `webgame room <id>` → daftar kursi & fase.
- Registry `data/webgame-rooms.json` (mode 600): room, chat asal, token host, snapshot.
  Auto-bersih room >6 jam.
- `.webgame` → bantuan + health (`/api/health` + jumlah meja).

### 2. `lib/game-room-notifier.js` — poller notifikasi v3 (rewrite)
Endpoint notify bawaan server hilang → dipantau lewat `GET /api/rooms` + `state`
tiap 25 detik. Untuk room di registry bot:
- kursi bertambah → *"🪑 <nama> duduk di meja …"* (ke chat asal: grup → grup, privat → DM)
- fase `playing` → *"🎲 permainan dimulai"*
- room hilang → *"🚪 meja ditutup"* + dihapus dari registry.

### 3. `plugins/game/umi-akun-game.js` — `/gamelogin` (baru)
- `/gamelogin` → daftar akun game otomatis (`wa628xxxx` + pin6 digit) → kirim name+pin.
- `/gamelogin ulang` → kirim ulang kredensial tersimpan.
- `/gamelogin hapus` → hapus catatan bot.
- Kredensial disimpan di `data/game-accounts.json` (mode 600); login diverifikasi ulang
  ke server (`/api/auth/login`) sebelum dikirim.

### 4. Getsc (Task196-fix) — sudah live di dua server
`simpanBerkas` mendorong ke API penyaji + fallback kirim dokumen langsung.
Uji E2E: POST dorong → 200, GET → 200 isi sama; UA `node` lolos Cloudflare.

## 🧪 Uji — `tmp-uji/alat/uji198.mjs` **12/12 lulus** (server game asli)
buat meja → tautan · join info · join web 2/2 · start host ✓ · start non-host ditolak ✓ ·
state tampil pemain ✓ · registry tersimpan ✓ · snapshot notifier `phase=playing` ✓ ·
gamelogin daftar name/pin ✓ · ulang ✓ · verifikasi login "sudah aktif" ✓.

## 📡 Endpoint yang BELUM bisa dipulihkan (butuh akses kode server game)
| Fitur | Hambatan |
|---|---|
| Login pakai **token profile jadibot** | endpoint verify-token tidak ada di game v3 |
| Topup/kredit **$AS** (`/api/trading/credit`) | dihapus di v3 |
| Notifikasi internal `/api/notify/pending` | diganti poller bot (sudah jalan) |
| Deep-link kursi `?seat=token` | butuh perubahan halaman web game |

**Yang dibutuhkan:** source code server game atau key panel server game
(dulu `0223aeea` — key `panel-owner.env` sudah401, panel2.kaira.my.id1033).
Kalau akses tersedia: pasang `POST /api/auth/verify-jadibot` (token profile → akun game)
+ `POST /api/trading/credit` + notify internal.

## 🚀 Pemasangan
1. Push commit → deploy `game-webmultiplayer.js`, `umi-akun-game.js`, `game-room-notifier.js`
   ke d1ebc84a &044f34b0.
2. **Restart** satu kali per server (notifier diimpor `main.js` saat boot).
3. `lib/webgame.json` di server TIDAK disentuh (berisi baseUrl + token).
4. Coba dari WhatsApp: `.uno` (buat meja) · `/gamelogin` (akun web) · `.webgame` (bantuan).

## ⚠️ Catatan desain
- Kursi yang diisi lewat WA **tanpa sesi web** tidak bisa dipakai main (token seat ada di
  web). Karena itu `join` dari WA = tautan + petunjuk, pemain duduk dari browser — bot
  memberi tahu lewat poller. Deep-link seat butuh perubahan halaman game (lihat tabel atas).
- `/gamelogin` menghasilkan name `wa628…`; kalau name sudah terpakai, otomatis diakhiri
  acak (`-707`, dst) dan kredensial baru dikirim.
