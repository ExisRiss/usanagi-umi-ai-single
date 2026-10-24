# TUTORIAL — bot Usanagi Umi (versi script tunggal)

Panduan dari nol sampai bot online. Versi ini **hanya script bot**: tanpa website jadibot,
tanpa server game, dan **tanpa auto-backup / `lib/backup/`**.

---

## 0. Sebelum mulai

Yang kamu butuhkan:

- Node.js 20 atau lebih baru (`node -v`)
- FFmpeg (untuk stiker/audio/video): `sudo apt install ffmpeg`
- Nomor WhatsApp yang belum dipakai bot lain
- Koneksi internet

```bash
node -v
ffmpeg -version | head -1
```

---

## 1. Ambil kode

```bash
git clone https://github.com/ExisRiss/usanagi-umi-ai-single.git
cd usanagi-umi-ai-single
```

Tanpa git: unduh ZIP dari tombol **Code → Download ZIP**, lalu ekstrak.

---

## 2. Install dependency

```bash
npm install
```

Kalau ada paket native yang gagal dikompilasi:

```bash
sudo apt install build-essential python3
npm install
```

Butuh ±3–8 menit. Selama tidak ada tulisan `ERR!`, aman.

---

## 3. Isi `config.js`

```bash
cp config.example.js config.js
nano config.js
```

Minimal yang harus diubah:

```js
global.owner = [
  ['628xxxxxxxxxx', 'Nama Kamu', true],   // nomor WhatsApp kamu, awali 62
]

global.namebot = 'Usanagi Umi'
global.mainBot = {
  defaultPrefix: '.',
  registrationRequired: true,
}
```

- `true` di elemen ketiga = owner penuh (boleh pakai perintah owner).
- Jangan unggah `config.js` ke GitHub — sudah masuk `.gitignore`.

---

## 4. Domain publik & proxy media (untuk `.ytplay`)

Pemutar YouTube di versi ini memakai domain publik bot sebagai pengalir video.
Isi di `config.js`:

```js
global.media = {
  proxyBase: 'https://bot.domainkamu.com',
  proxyEnabled: true,
  proxyHosts: [],
}
```

atau lewat `.platform.env`:

```bash
cp .env.example .platform.env
chmod 600 .platform.env
```

```env
PLATFORM_PUBLIC_BASE_URL=https://bot.domainkamu.com
PLATFORM_MEDIA_SIGNING_KEY=     # string acak 32+ karakter
```

Buat nilai acak:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Endpoint proxy: `GET https://bot.domainkamu.com/media/yt?u=<url-media>&e=<kedaluwarsa>&s=<tanda tangan>`.
Host yang boleh di-proxy dibatasi (googlevideo, youtube, ytimg, savetube, plus
`global.media.proxyHosts`).

Tanpa domain publik, `.ytplay` tetap membalas — pemutar memakai tautan langsung lalu
embed YouTube.

---

## 5. Kunci API pihak ketiga (satu tempat)

Semua fitur yang butuh API/token membaca kuncinya dari `config/settings.js`
(implementasinya `config/api-keys.js`). Urutannya:

1. `global.apiKeys` di `config.js`
2. `.env.apikeys` (mode 600)
3. environment: `UMI_TENOR_KEY`, `UMI_PASTEBIN_KEY`, `UMI_NEURALFRAMES_TOKEN`,
   `GEMINI_API_KEY`, `GROQ_API_KEY`, `OPENAI_API_KEY`

```js
global.apiKeys = {
  tenor: '',
  pastebin: '',
  neuralFrames: '',
  gemini: '',
  groq: '',
  openai: '',
}
```

Kalau kosong, fitur terkait **tidak crash** — hanya membalas:

```
Fitur Upload Pastebin belum dikonfigurasi. Isi global.apiKeys.pastebin di config.js
atau UMI_PASTEBIN_KEY di .platform.env.
```

---

## 5.1 API Rin (`.xai`, `.ximg`, `.xdl`, ...)

Bot memakai [Rin API](https://apiii-xrina.my.id) lewat `plugins/xrina/xrina.js`
dengan katalog lokal `lib/xrina-catalog.json` (284 endpoint, 18 kategori).

Tanpa kunci pun sebagian besar endpoint jalan. Endpoint kategori **premium**
dan **system** butuh kunci dari pemilik API. Isi salah satu:

```js
// config.js
global.apiKeys = { xrina: 'KUNCI-RIN-KAMU' }
```

```bash
# .platform.env / .env.apikeys
UMI_XRINA_KEY=KUNCI-RIN-KAMU
```

Kalau kosong, bot membalas:

```
🔑 Endpoint *viu* butuh kunci API Rin.
```

bukan error mentah.

Cara pakai singkat:

```text
.xapi                       daftar kategori + jumlah endpoint
.xapi download              daftar 22 endpoint download
.xapi cekkhodam             detail parameter satu endpoint
.xai gemini halo            tanya Gemini
.ximg flux kucing oren      buat gambar
.xdl tiktok <url>           unduh video (dikirim sebagai media)
.xrina /fun/pantun          panggil endpoint mentah
```

Kalau endpoint butuh gambar, kirim/reply foto sekalian:

```text
.ximg toghibli              (sambil reply foto)
.xcv fakeml username=alz    (sambil reply foto)
```

---

## 5.2 Mode SINGLE — hanya nomor dari setting

Versi single berjalan **tanpa bot utama**; HTTP API mati kecuali diminta lewat
`config.js` (lihat bagian HTTP API di bawah). Yang hidup hanya nomor yang kamu
daftarkan sendiri.

```bash
npm run pair 628123456789     # sekali per nomor, masukkan kode di WhatsApp
npm start                     # semua nomor di config/users.json menyala
```

Hasil pairing disimpan di `sessions/jadibot/<nomor>/` dan nomornya ditulis ke
`config/users.json`:

```json
{
  "autoPair": true,
  "users": ["628123456789"]
}
```

Kalau menambah nomor manual di berkas itu, bot meminta kode pairing saat start
dan mencetaknya di console dengan awalan `[SINGLE]`.

### Prefix di mode single

```text
.setprefix !              → prefix khusus chat ini
.setprefix global !       → prefix default bot ini (semua chat)
.setprefix default        → chat ini kembali ke prefix default
```

Prefix global disimpan di `sessions/jadibot/<nomor>/bot-config.json` dan tetap
dipakai setelah restart. **Jika website jadibot dipakai**, prefix juga bisa
diubah dari halaman Settings website — keduanya menulis berkas yang sama.

> Perbaikan 24-10-2026: `.setprefix` dulu salah membaca argumen (runtime
> memberi `m.text` tanpa nama perintah), sehingga `.setprefix !` hanya
> menampilkan bantuan dan `.setprefix global !` malah mengubah prefix per-chat.
> Sudah diperbaiki di `plugins/owner/usanagi-setprefix.js`.

### HTTP API jadibot (opsional)

Mode single mematikan HTTP API secara default. Kalau kamu memakai website
jadibot (butuh `/api/health`, `/api/sessions`, `/api/settings/*`), nyalakan
secara eksplisit di `config.js`:

```js
global.jadibotPlatform = {
  enabled: true,
  apiPort: 2176,
  supabaseUrl: 'https://<project>.supabase.co',
  supabaseAnonKey: '<anon key>',
  ownerEmails: ['email-owner@contoh.com'],
}
```

Tanpa `enabled: true`, tidak ada port yang dibuka sama sekali.

Mematikan mode single (bot utama + API kembali aktif):

```bash
UMI_SINGLE_MODE=false npm start
```

---

## 5.3 Game HTML (AI Rich)

21 game dikirim sebagai pesan HTML interaktif: `.htmlgames` untuk daftarnya,
lalu `.htmlflappy`, `.htmlsnake`, `.htmltetris`, `.htmlpacman`, `.htmlcatur`,
`.htmlmario`, `.htmlsonik`, `.htmlbreakout`, `.htmldino`, `.htmlangrybirds`,
`.htmlbalap`, `.htmlcolorblock`, `.htmlmahjong`, `.htmlmemory`, `.htmlmortal`,
`.htmlminigames`, `.htmlpinz <kata>`, `.htmlslot2`, `.htmlslotui`,
`.htmlspeedydash`, `.htmlstickman`.

---

## 5.4 Pemutar YouTube (UMI Usanagi AI)

```text
.ytplay <judul/link>     pemutar HTML 3 lapis (langsung → unduh → embed)
.ytvideo <judul/link>    kirim berkas video langsung
```

Resolver yang dipakai: SaveTube (`cdn*.savetube.vip/media/...`). Piped,
Invidious, dan Innertube per 24 Oktober 2026 menolak permintaan (403/401/
LOGIN_REQUIRED), jadi tidak dipakai lagi.

---

## 6. Jalankan bot

```bash
npm start
```

atau langsung `node main.js`.

Tanda berhasil:

```
Successfully Loaded 2050 Plugins
Bot siap digunakan!
```

Kalau jumlah plugin jauh di bawah itu, ada modul yang gagal dimuat — lihat pesan error
tepat di atasnya.

---

## 7. Pairing nomor WhatsApp

1. **Pairing code** — masukkan nomor bot (`628xxxxxxxxxx`), dapat 8 karakter, lalu di
   WhatsApp: **Perangkat tertaut → Tautkan perangkat → Tautkan dengan nomor telepon**.
2. **Scan QR** — buka **Perangkat tertaut → Tautkan perangkat**, pindai QR di terminal.

Sesi tersimpan di `sessions/`. **Jangan** unggah folder itu — siapa pun yang memegangnya
bisa memakai nomor botmu.

---

## 8. Cek bot hidup

Di WhatsApp kirim:

```
.menu
.ping
.owner
```

Kalau `.menu` membalas daftar perintah, bot sudah siap.

---

## 9. Pemutar YouTube (`.ytplay`)

Lihat **5.4** untuk versi terbaru (UMI Usanagi AI). Ringkasnya:

- `.ytplay <judul/link>` — pemutar HTML tiga lapis: video langsung →
  diunduh jadi `blob:` → embed YouTube.
- `.ytvideo <judul/link>` — berkas video dikirim langsung sebagai pesan video
  WhatsApp; ini jalur yang paling aman kalau webview perangkat rewel.

Proxy `/media/yt` hanya dipakai di **mode penuh** (butuh server HTTP). Di mode
single proxy tidak tersedia, dan pemutar tetap jalan tanpa itu.

Untuk audio: `.ytmp3 <judul>` / `.play <judul>`.

---

## 10. Yang TIDAK ada di versi ini

- **Auto-backup** harian + kiriman ke grup Telegram
- **`lib/backup/`**: arsip, restore, ekspor, `REST /api/backup-system`
- Plugin database backup (`umi-backupdb`, `umi-savedb`, `owner-backup`, `owner-backupfull`,
  `usanagi-backup`)
- `/api/owner-console/auto-backup`, `/api/internal/backup/*`

Backup manual: cukup salin folder `sessions/` + `database.json` ke tempat aman.

---

## 11. Menjalankan 24 jam

**systemd** (VPS):

```ini
# /etc/systemd/system/usanagi.service
[Unit]
Description=Usanagi Umi Bot
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/usanagi
ExecStart=/usr/bin/node main.js
Restart=always
RestartSec=5
User=usanagi

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now usanagi
sudo journalctl -u usanagi -f
```

**tmux**:

```bash
tmux new -s bot
node main.js          # Ctrl+B lalu D untuk keluar tanpa mematikan
tmux attach -t bot
```

Di panel Pterodactyl, isi `npm start` sebagai startup command.

---

## 12. Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| `Cannot find module 'x'` | `npm install` belum selesai, atau paket native gagal kompilasi → pasang `build-essential python3` lalu ulangi |
| Plugin sedikit yang termuat | Ada modul error sintaks; lihat pesan tepat sebelum `Successfully Loaded` |
| Bot minta pairing terus | Sesi rusak. Hapus `sessions/`, jalankan ulang, pairing lagi |
| `Connection Terminated` | Nomor dipakai di HP lain atau sesi dicabut → pairing ulang |
| `.ytplay` tidak memutar | Cek panel di kartu: kalau "Sumber: link langsung", isi `global.media.proxyBase` / `PLATFORM_PUBLIC_BASE_URL` lalu buat kartu baru |
| Fitur membalas "belum dikonfigurasi" | Kunci API belum diisi — bagian 5 |
| Stiker/audio gagal | FFmpeg belum terpasang |
| `ENOSPC` | Disk penuh — kosongkan `tmp/` dan log |

Log:

```bash
tail -f data/console.log
ls data/errors/
```

---

## 13. Kredit

- `By AlzRiss` pada ratusan berkas
- `CREDITS.md`, `CREDITS_PELENGKAP.md`, `SOURCE_PLUGIN_MANIFEST.md`
- plugin kredit: `plugins/pelengkap/umi/main/umi-credit.js`, `integrations/umi/plugins/main/credit.js`
- kredit pihak ketiga di dalam plugin (contoh: `YouTube Player • Fitur By: Anita Putri Azzahra`)

**Jangan hapus atau ganti kredit itu.**

---

## Penutup

1. `npm install` (bagian 2)
2. Isi `config.js` (bagian 3)
3. `npm start` + pairing (bagian 6–7)
4. Tes `.menu` (bagian 8)
5. Isi domain publik & kunci API kalau butuh fitur terkait (bagian 4–5, 9)

Kalau ada langkah yang gagal, hampir selalu penyebabnya: dependency belum lengkap, sesi
WhatsApp rusak, atau kredensial tidak cocok.
