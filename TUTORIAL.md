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

`.ytplay <judul>` mengirim kartu pemutar. Pemutar mencoba 4 cara berurutan:

1. proxy server bot · putar langsung
2. proxy server bot · unduh dulu ke perangkat, lalu putar dari `blob:` (dipakai kalau
   webview WhatsApp menolak memutar video jarak jauh)
3. tautan asli YouTube · putar langsung
4. pemutar embed YouTube

Panel kecil di kartu menampilkan sumber yang sedang dipakai, jadi kalau gagal kelihatan
di tahap mana. Untuk mengunduh biasa: `.ytmp4 <judul>` / `.ytmp3 <judul>`.

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
