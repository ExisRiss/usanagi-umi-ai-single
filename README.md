# Usanagi Umi AI — versi script bot tunggal

Repo ini **hanya berisi script bot WhatsApp**. Tidak ada website jadibot, server game,
portfolio, atau proyek pendamping lain. Kalau kamu butuh versi lengkap (bot + website +
server game), pakai repo `usanagi-umi-ai`.

Perbedaan dengan versi lengkap:

| | Versi ini (single) | Versi lengkap |
|---|---|---|
| Script bot | ya | ya |
| Website jadibot (Vercel) | tidak | ya |
| Server game web | tidak | ya |
| **Auto-backup** (harian + Telegram) | **dihapus** | ada |
| **`lib/backup/`** (arsip, restore, ekspor, REST `/api/backup-system`) | **dihapus** | ada |

Yang dihapus beserta berkasnya:

- `lib/auto-backup.js`, `lib/vercel-backup-scheduler.js`, `lib/vercel-backup-export.js`
- seluruh folder `lib/backup/` (api, archive, config, crypto, external, log, pipeline, restore, service, telegram-send)
- `scripts/backup-worker.js`
- plugin `owner-backup.js`, `owner-backupfull.js`, `usanagi-backup.js`, `umi-backupdb.js`, `umi-savedb.js`
- endpoint `/api/backup-system/*`, `/api/internal/backup/*`, dan `/api/owner-console/auto-backup`
- uji `tests/backup/`, `.backup-system.example.env`

Hasil uji boot setelah penghapusan: **2050 plugin termuat, tanpa error import**
(versi lengkap: 2055). Folder `sessions/` tetap dibuat Baileys untuk menyimpan sesi
WhatsApp — itu bukan auto-backup dan tidak dihapus.

> **Kredit penulis asli dipertahankan.** `By AlzRiss` ada di ratusan berkas, plus
> `CREDITS.md`, `CREDITS_PELENGKAP.md`, dan kredit pihak ketiga di dalam plugin.
> Jangan hapus atau ganti.

---

# Usanagi Umi AI v7

Bot WhatsApp multi-device dengan menu modern dan sistem plugin dinamis. Tampilan menu, arsitektur plugin, dan kumpulan fitur v7 diadaptasi dari **Usanagi v7 English × Indonesia**, kemudian dibersihkan dan di-rebrand untuk Usanagi Umi AI.

## Fitur utama

- Empat gaya menu dinamis dan all-menu berdasarkan kategori plugin.
- **792 modul plugin** berhasil dimuat saat pengujian tanpa kegagalan import.
- Seluruh **343 plugin Usanagi Umi AI** telah dipindahkan: AI, anime, download, fun, game, group, main, owner, RPG, search, sticker, dan tools.
- AI, anime, downloader, ekonomi, fun, game, grup, informasi, internet, maker, musik, pencarian, stiker, RPG, tools, voice, dan jadibot dari basis sebelumnya tetap tersedia.
- Sistem AI Usanagi yang telah diadaptasi: memori percakapan, cooldown, rich response, code block native, analisis intent, persona/model, serta fallback backend.
- Database pengguna, level, EXP, limit, premium, AFK, blacklist, serta statistik command.
- Moderasi grup: anti-link, anti-spam, anti-toxic, tagall, hidetag, jadwal buka/tutup, dan fitur admin.
- Dukungan bahasa Indonesia dan Inggris.
- Pairing melalui nomor telepon.

Sebagian plugin menggunakan layanan/API pihak ketiga. Plugin tersebut dapat berhenti bekerja jika endpoint pihak ketiganya berubah atau membatasi akses.

## Persyaratan

- Node.js 20 atau lebih baru.
- FFmpeg untuk fitur audio dan video.
- Koneksi internet.

## Instalasi

```bash
npm install
npm start
```

Masukkan nomor WhatsApp dalam format internasional saat diminta, misalnya `628xxxxxxxxxx`.

## Konfigurasi

Seluruh pengaturan utama berada di `config.js`:

```js
global.owner = [
  ['628xxxxxxxxxx', 'AlzRiss', true]
]

global.namebot = 'Usanagi Umi AI'
global.developer = 'AlzRiss × Arena'
global.creditOwners = ['Okta - Owner', 'Risky - Owner']
global.scriptUrl = ''
```

- Ganti nomor owner sebelum bot dijalankan.
- Isi `global.scriptUrl` jika tombol `.sc`/`.script` ingin digunakan.
- Isi konfigurasi pembayaran, panel, atau gambar publik hanya bila fiturnya dibutuhkan.
- Jangan mengunggah folder `sessions`, `database.json`, atau data autentikasi ke repositori publik.

## Sistem AI terintegrasi

Seluruh key dan model AI diatur melalui objek `global.usanagiAI` di `config.js`; tidak menggunakan `.env`.

- `.umiai <pertanyaan>` — Gemini dengan memori percakapan dan fallback Gemini Web.
- `.umiai reset` — menghapus memori Gemini.
- `.umiai info` — melihat backend dan status memori.
- `.deepseek <pertanyaan>` — DeepSeek melalui OpenRouter, termasuk vision dan rich response.
- `.deepseek reset|info|limit` — pengelolaan sesi dan status OpenRouter.
- `.grok <pertanyaan>` — Groq AI dengan memori, pilihan model/persona, vision, dan pencarian web yang didukung backend.
- `.grok model`, `.grok mode`, `.grok reset`, `.grok info` — pengaturan Groq per pengguna.

Isi key milikmu sendiri jika ingin menggunakan backend resmi:

```js
global.usanagiAI = {
  geminiApiKey: '',
  geminiModel: 'gemini-2.5-flash',
  openRouterApiKey: '',
  groqApiKey: ''
}
```

Tanpa `geminiApiKey`, `.umiai` mencoba Gemini Web guest. API key bawaan dari arsip sumber tidak disertakan karena merupakan data sensitif.

## Plugin Usanagi lengkap

Semua 343 plugin Usanagi tersedia. Sebanyak 340 plugin non-AI disimpan dengan awalan nama file `usanagi-`, sedangkan tiga plugin AI telah diadaptasi menjadi Usanagi Umi AI, DeepSeek Pro, dan Groq Pro.

Untuk menghindari bentrok dengan command lama, setiap command Usanagi dapat dipanggil melalui namespace:

```text
.usanagi-menu
.usanagi-allmenu
.usanagi-akankah aku sukses?
.usanagi-chess
.usanagi-adventure
.usanagi-inventory
.usanagi-play judul lagu
.usanagi-antilink on
```

Command tanpa namespace tetap dapat bekerja apabila tidak bertabrakan dengan plugin yang sudah ada. Usanagi menu/catalog store disinkronkan dengan loader utama sehingga kategori dan jumlah fitur tetap terbaca.

Plugin `.usanagi-rvo` dipindahkan tetapi dinonaktifkan karena melewati privasi media view-once. Plugin verifikasi pembelian yang membawa credential pihak lain juga dinonaktifkan. Credential yang ditemukan di source telah dikosongkan dan dipindahkan ke konfigurasi `global.externalApiKeys`.

## Mode SINGLE (default)

Repo ini **hanya** menjalankan nomor WhatsApp yang didaftarkan pemiliknya.
Tidak ada bot utama, tidak ada HTTP API, tidak ada website.

| Komponen | Status di mode single |
|---|---|
| Bot utama (sesi di `sessions/`) | **mati** — tidak menyambung, tidak minta pairing |
| HTTP API platform (port 2176/2144) | **mati** |
| Adapter Telegram / platform | **mati** |
| Nomor dari `config/users.json` | **hidup** (sesi di `sessions/jadibot/<nomor>/`) |

### Menambah nomor

1. Pasang nomornya (sekali saja per nomor):

   ```bash
   npm run pair 628123456789
   ```

   Perintah ini mencetak **kode pairing** di terminal. Buka WhatsApp nomor itu →
   **Perangkat tertaut** → **Tautkan perangkat** → **Tautkan dengan nomor telepon**
   → masukkan kode. Nomor otomatis ditambahkan ke `config/users.json`.

2. Jalankan bot:

   ```bash
   npm start
   ```

   Semua nomor di `config/users.json` dinyalakan bersamaan. Nomor yang belum
   punya sesi akan dimintakan kode pairing lagi saat start (tercetak di console
   dengan awalan `[SINGLE]`).

### Mengembalikan mode penuh

```bash
UMI_SINGLE_MODE=false npm start
```

---

## Game HTML (AI Rich)

21 game interaktif yang dirender WhatsApp sebagai halaman HTML (diadaptasi dari
paket Rimuru MD, kredit di `lib/rich-games/`).

```text
.htmlgames            daftar semua game
.htmlflappy           Flappy Bird
.htmlsnake .htmltetris .htmlpacman .htmlcatur
.htmlmario .htmlsonik .htmlbreakout .htmldino
.htmlangrybirds .htmlbalap .htmlcolorblock .htmlmahjong
.htmlmemory .htmlmortal .htmlminigames .htmlpinz <kata kunci>
.htmlslot2 .htmlslotui .htmlspeedydash .htmlstickman
.html <nama>          bentuk panjang, mis. .html flappy
```

Butuh WhatsApp versi terbaru yang mendukung pesan AI Rich. Kalau perangkat
tidak mendukung, bot membalas pesan biasa (bukan error).

## Pemutar YouTube

- `.ytplay <judul/link>` — pemutar HTML interaktif **UMI Usanagi AI**.
  Tiga lapis: video langsung → unduh ke blob → embed YouTube.
- `.ytvideo <judul/link>` — kirim berkas videonya langsung (paling aman untuk
  semua perangkat, tidak butuh webview).

## Mode privat (bot diam)

Kalau sesi disetel **private/self** (website → Mode bot: Self, atau
`public: false`), bot **tidak membalas apa pun** kepada pengguna biasa — tidak
ada pesan "bot sedang privat", tidak ada petunjuk prefix, tidak ada notifikasi
AFK. Yang tetap dilayani hanya:

- **developer** (nomor terkunci di `config.js`),
- **owner utama** (`data/owner-utama.json`),
- **owner bot** itu sendiri (`.addowner` / kolom owner di website),
- pesan dari akun bot sendiri (`fromMe`).

Gerbang ini berjalan paling awal di handler (sebelum AFK, aksi tertunda, dan
petunjuk prefix), jadi tidak ada jalur balasan yang lolos. Daftar akses sesi
(`.addakses`) **tidak** membuka mode privat — untuk memberi akses, jadikan
owner dengan `.addowner` supaya kewenangannya utuh.

Catatan: pengabaian dicatat ke console maksimal 1×/10 menit per chat
(`[mode-privat] abaikan pesan dari …`) supaya mudah didiagnosis.

## Reaction channel (.rch)

`.rch <link_post> <emoji>` mengirim reaction ke post WhatsApp Channel memakai
kunci API RCH VIP. Kunci dibaca dari `.env.apikeys` → `UMI_RCH_KEY` (satu kunci
atau daftar JSON `[{"name":"VIP-1","apiKey":"…","domain":"https://…"}]`).

- **Filter kunci**: duplikat isi kunci, placeholder (`PENDING`/`TEST-KEY`),
  kunci terlalu pendek, domain kosong, dan kunci yang kuotanya sudah habis
  (dari `usage_today`/`limit` balasan API) tidak dipakai.
- **Rotasi sampai dapat**: kunci pertama kena limit → kunci berikutnya dicoba
  dalam permintaan yang sama sampai ada yang berhasil.
- **RCH LIMIT**: kalau SEMUA kunci limit, bot otomatis membalas `🚫 RCH LIMIT`
  berisi jumlah kunci, waktu reset, dan saran menambah kunci — bukan diam.
- `.rch status` — siap / istirahat / dibuang beserta alasannya (isi kunci tidak
  pernah ditampilkan). `.rch reset` — bersihkan jeda (owner).
- `.rch reload` — baca ulang `.env.apikeys` tanpa restart (owner).

## Kontak premium & laporan bug

Pesan "FITUR PREMIUM … Hubungi owner bot" dan kartu "laporan bug" memakai satu
resolver nomor yang sama (`premiumOwnerContact`). Urutannya: nomor yang dikunci
manual → nomor developer/owner utama yang juga owner sesi itu → owner sesi
pertama. Jadi nomor pemilik platform tidak lagi kalah oleh nomor owner lain di
daftar owner sesi.

- `.premium kontak` — lihat nomor yang benar-benar dipakai + sumbernya.
- `.premium kontak 6287813709432` — kunci nomor ini untuk SEMUA bot
  (developer / owner utama; tersimpan di `data/premium-contact.json`, mode 600).
- `.premium kontak auto` — kembali ke pemilihan otomatis.

## Restart & auto update

- `/restart` — restart server langsung dari WhatsApp (developer / owner utama;
  pemilik sesi jadibot tidak boleh karena semua sesi ikut mati).
  Bot membalas dulu, lalu memanggil API panel `power/restart`. Satu restart
  per 45 detik. `/restart status` memperlihatkan metode yang siap dipakai.
- `/autorestart on|off` — sama-sama khusus developer; mengatur apakah bot **restart sendiri** setelah
  pembaruan dari GitHub diterapkan. Saat `off`, berkas pembaruan tetap ditulis;
  aktifkan dengan `/restart`.
- `.autoupdate` — status lengkap, `.autoupdate cek|now|paksa|log|restart`.

Auto update juga tidak lagi menimpa data runtime (`lib/chat.json`) dan tidak
lagi "macet" ketika ada berkas yang sengaja diedit manual.

Tiga penyebab "bot tidak membalas" juga ditutup: pesan pribadi yang memakai
prefix salah, sesi bermode **Only Group**, dan sesi bermode **privat** sekarang
dijawab dengan penjelasan (maks. sekali per 10 menit per chat) alih-alih dibuang
tanpa suara. Dokumentasi: [`docs/AUTO-UPDATE.md`](docs/AUTO-UPDATE.md).

## Video Editor (cinematic typography)

`.edit` membuat video cinematic typography dari foto/video yang kamu kirim —
semua diproses lokal dengan FFmpeg, tanpa shell, tanpa API luar.

- `.edit` — panduan singkat + template yang benar-benar ada.
- `.edit mulai` — buka sesi; kirim 1–4 foto/video, lalu `.edit render`.
- `.edit mulai nature` / `editorial` / `minimal` / `script` / `gaming` / `gallery`
  — langsung pilih template (nama di luar daftar ditolak, bukan template palsu).
- `.edit judul <teks>` · `.edit sub <teks>` · `.edit meta <teks>` — tulis judul,
  subjudul, dan baris kecil (foto tim, tanggal).
- `.edit durasi <detik>` · `.edit slow <0.4-1>` · `.edit kualitas <rendah|sedang|tinggi>`.
- `.edit logo` / `.edit tanpa logo` — pakai logo bot di panel teks atau tidak.
- `.edit status` · `.edit batal` — cek isi sesi / batalkan render yang antre.

Kanvas mengikuti **ukuran dan rotasi video utama** (portrait, landscape, square,
atau ukuran aneh 1024x436) tanpa di-stretch; semua elemen diskalakan
proporsional. Ada blur reveal → tajam → hold → exit, gerak kamera halus,
slow motion, kolase dengan sudut membulat, dan audio asli dipertahankan bila
ada. Sesi per pengguna + chat dengan TTL 30 menit, antrean 2 render paralel,
dan pembatalan. Dokumentasi lengkap: [`docs/VIDEO-EDITOR.md`](docs/VIDEO-EDITOR.md).

## API Rin (284 endpoint)

`plugins/xrina/xrina.js` menyambungkan bot ke [Rin API](https://apiii-xrina.my.id)
— 284 endpoint dalam 18 kategori. Katalognya disimpan lokal di
`lib/xrina-catalog.json`, jadi daftar perintah dan parameter bisa dibaca tanpa
memanggil server.

Perintah dikelompokkan per kategori:

| Perintah | Kategori | Jumlah |
|---|---|---|
| `.xai` | ai | 22 |
| `.ximg` | ai image | 45 |
| `.xdl` | download | 22 |
| `.xcari` | search | 14 |
| `.xstalk` | stalker | 11 |
| `.xfun` | fun | 14 |
| `.xcv` | canvas | 29 |
| `.xmk` | maker | 14 |
| `.xgame` | game | 13 |
| `.xberita` | info | 10 |
| `.xkomik` | komik, komiku, MangaDex | 20 |
| `.xanime` | Animein, Donghive | 11 |
| `.xtool` | tools | 39 |
| `.xprem` | premium (butuh kunci) | 14 |
| `.xsys` | system (butuh kunci) | 6 |

Perintah bantu:

- `.xapi` — daftar kategori; `.xapi <kategori>` daftar endpoint;
  `.xapi <nama>` detail parameter.
- `.xrina /path?k=v` — panggil endpoint apa pun secara mentah.

Contoh:

```text
.xai gemini jelaskan fotosintesis singkat
.ximg flux kucing oren pakai topi
.xtool qrcode halo dunia
.xmk brat usanagi umi ai
.xgame tebakhewan
.xfun cekkhodam Alz
.xcari lyrics bohemian rhapsody
.xstalk stalk-gh octocat
.xdl tiktok https://www.tiktok.com/@user/video/123
.xdl play-spotify despacito
.xkomik komiku terbaru
.xanime animein search one piece
```

Catatan pemakaian:

- Parameter bisa ditulis berurutan (`.xfun cekkhodam Alz`) atau `k=v`
  (`.xcari pinterest q=kucing limit=5`).
- Endpoint yang butuh gambar bisa memakai URL **atau** balas/kirim foto:
  bot mengunggah fotonya dulu, lalu mengisi parameter `image`/`url`/`pp`.
- Hasil gambar/video/audio dikirim sebagai media. Untuk endpoint download,
  berkasnya diunduh dulu dan diperiksa; kalau tautan CDN dari server sudah mati,
  bot bilang terus terang alih-alih mengirim tautan rusak.
- Endpoint berkunci (kategori premium/system) butuh `global.apiKeys.xrina`
  atau `UMI_XRINA_KEY`. Tanpa kunci, bot membalas instruksi — bukan error.

## Media branding

- `media/menu.png` — banner welcome biru Usanagi Umi AI.
- `media/banner.jpg` — banner pesan Welcome ketika pengguna bergabung ke grup.
- Menu utama dan All Menu menggunakan video lokal `assets/video/menu.mp4` melalui `global.brandingAssets.menuVideo`.
- `media/thumbnail.jpg` — foto profil utama.
- `media/avatar_contact.png` — avatar kontak alternatif.
- `bg-template.jpg` — latar maker/welcome berbasis banner gelap.

## Menu

- `.menu` — menu utama.
- `.allmenu` — seluruh fitur berdasarkan kategori.
- `.setmenu` — memilih gaya menu (owner).
- `.lang id` / `.lang en` — mengganti bahasa per chat.

## Keamanan

Versi ini menghapus kredensial dan data pengguna dari arsip sumber, menyalakan kembali verifikasi TLS, serta tidak menyertakan fitur OTP bombing, spam OTP, TikTok boosting, pembaca view-once, pencarian dewasa, generator bukti pembayaran palsu, virtual-number, dan eksekusi shell/eval owner. Pemeriksaan `npm audit` menghasilkan **0 kerentanan yang diketahui** pada saat build.

## UMI API Suite

Semua command integrasi menggunakan namespace murni `umi`, tanpa nama provider. Contohnya `.umigemini`, `.umiplay`, `.umipinterest`, `.umiimg`, `.umidl`, dan `.umitools`. Daftar lengkap tersedia melalui `.umimenu`. Command `.umiai` tetap menjadi AI utama Usanagi Umi AI agar tidak terjadi bentrok.

Suite menyediakan fitur AI, AI image, canvas, downloader, fun, game, berita, maker, pencarian, stalker publik, dan tools. Endpoint penipuan saldo, spam, token akun, serta penghapusan watermark tidak diekspos. Base URL, timeout, dan batas respons tetap dipusatkan dalam `config.js`.

## Respons Cepat dan Stabilitas

Bot menampilkan status **sedang mengetik** tanpa menunggu respons presence dari WhatsApp, sehingga tidak menambah delay pada pesan. Runtime memakai reconnect bertahap anti-tumpuk, watchdog koneksi, interval keep-alive lebih cepat, retry pesan lebih banyak, penyimpanan database non-overlap setiap 30 detik, serta pembersihan temporary file setiap 5 menit. Semua interval utama diatur melalui `global.autoTyping` dan `global.runtimePerformance` dalam `config.js`.

## Installer Plugin dari WhatsApp

`/addplugin <nama>` menambah plugin baru dari WhatsApp. Kalau perintah dikirim **tanpa** balasan kode maupun berkas, bot kini membalas **tutorial pemakaian** lengkap dengan kerangka plugin — bukan pesan error.

- Balas pesan bot dengan kode plugin, atau kirim dokumen `.js` bersama perintahnya.
- Bot memeriksa ukuran, syntax ES module, bentuk handler (`export default` + `handler.command`), pola keamanan berbahaya, nama file, lalu hot reload.
- Plugin valid disimpan ke `plugins/custom/` dan langsung aktif tanpa restart.
- `.addplugin nama-plugin --replace` mengganti plugin lama (versi lama dicadangkan).
- Hanya untuk `rowner`; konfigurasi di `global.pluginInstaller` (`config.js`).

## Case baru dari WhatsApp (.addcase)

`/addcase <nama>` menambah **fitur case** tanpa menulis plugin penuh.

1. Ketik `.addcase sapa`
2. Kirim kodenya di **pesan berikutnya** (tanpa prefix — di grup juga masuk), atau balas pesan bot dengan kode / berkas `.js` / `.txt`.
3. Bot menyimpan berkas ke `plugins/custom-case/<nama>.js`, memuatnya lewat hot reload, lalu membalas perintah yang bisa dipakai (`.sapa`).

Beberapa `case` sekaligus boleh dalam satu kiriman, label bertumpuk (`case 'bye': case 'dadah':`) digabung, dan `default:` diabaikan. Kode yang hanya mendeklarasikan fungsi (mis. `async function X(sock, jid) { … }`) dideteksi dan fungsi itu dipanggil otomatis dengan `(sock, jid)` — begitu juga alias `sock`, `jid`, `sender`, `reply`, dan `pushName` di dalam case. Nama yang sudah dipakai plugin bawaan ditolak supaya perintah lama tidak terbajak. Timpa case lama dengan `.addcase <nama> --ganti`. Tersedia untuk owner bot (bukan pengguna umum) karena kode dijalankan di server.

## Subdomain milik user

Semua pengguna bisa mendaftarkan subdomain sendiri, tetapi **penghapusan hanya untuk developer / owner bot**.

- `.addsubdomain <nama>` — klaim subdomain `<nama>-alzriss.gwenna.my.id` (halaman awal + CNAME otomatis). Bentuk salah (kosong/terlalu pendek/ada spasi) dibalas **tutorial lengkap**, bukan error.
- `.addsubdomain <domain-mu>` — pakai domain sendiri, mis. `.addsubdomain kaeira.my.id`. Bot mencatat domain, memeriksa CNAME ke `situs.gwenna.my.id`, dan menyajikan situsnya dari server bot.
- Batas `maksPerUser` (bawaan 3) situs per nomor.
- `.deploysubdomain <nama> ganti` — isi situs: balas `.html`, `.zip`/`.tar.gz` (wajib ada `index.html`), atau kode HTML.
- `.kontrolsubdomain [nama]` — panel kontrol milik sendiri (developer melihat semua): info, deploy ulang, aktif/nonaktif.
- `.dellsubdomainmy <nama> hapus` — hapus folder + DNS; **ditolak untuk user biasa** (mereka diarahkan ke owner).
- `.hapussubdomain` kini mengikuti aturan yang sama: hanya developer/owner bot.

Alamat hasil: `https://<nama>-alzriss.gwenna.my.id/` (SSL Universal aktif) dan `https://<nama>.alzriss.gwenna.my.id/` (aktif setelah Total TLS).

**Hosting sekarang di server bot sendiri** (Task152): berkas situs disimpan di `situs/<nama>/`, daftar pemilik di `data/subdomain-registry.json`, dan penyajiannya lewat API bot (port 2176) yang mengenali header Host subdomain. Panel Kaira tidak dipakai lagi, jadi deploy tidak ikut mati saat panel itu gangguan.

## Prefix dan menu

Jadibot menerima prefix yang disetel **plus `/`** sebagai alias — banyak pengguna mengetik `/menu`, `/addcase`, `/bug2` karena dokumentasi memakainya. Simbol lain (mis. `!`, `#`) tetap ditolak saat mode `strict` dipakai, dan bot utama tetap hanya `$`. Filter prefix yang disetel tetap berlaku penuh (Task112).

`.subdomainmenu` dan `.mcmenu` sekarang tampil di `.menu` (kategori **owner**) dan di `.allmenu`.

## Identitas Pengguna dan Owner Dinamis

Database pengguna menyatukan identitas WhatsApp PN (`@s.whatsapp.net`) dan LID (`@lid`) agar status `.daftar` tetap terdeteksi di private chat maupun grup. Pendaftaran disimpan langsung tanpa menunggu autosave. Owner yang ditambahkan lewat `.addowner` dikenali secara langsung oleh handler utama, termasuk ketika WhatsApp mengirim identitas LID, sehingga memperoleh akses command owner dan bypass premium seperti owner lainnya.

Command `.me` menampilkan umur dari data `.daftar` meskipun tanggal lahir belum diatur. Akun dalam database owner dinamis ditampilkan dengan role **Owner**, Premium **Yes**, dan limit **Unlimited**. Tanggal lahir dapat disimpan atau diubah memakai `.setbirthday DD-MM-YYYY`, `.setlahir`, atau `.setultah`; format garis miring dan spasi juga didukung. Jika tahun diberikan, umur pada profil diperbarui otomatis.

## UMI Extra Feature Collection

Sebanyak 121 fitur tambahan yang belum tersedia dipindahkan ke `plugins/umi-extra/`. Seluruh plugin memakai format loader Usanagi, nama file UMI, branding aktif **By AlzRiss - Usanagi Umi AI**, serta adapter `conn/sock`, argument, permission, dan prefix. Koleksi mencakup 322 command/alias baru pada tools, pencarian, informasi, Islami, maker, canvas, fun, anime, musik, TTS, sticker, download, dan utility. Plugin duplikat, panel/VPS/store, fitur berisiko, kredensial tertanam, serta source yang memerlukan runtime lama tidak diaktifkan. Daftar asal dan command hasil migrasi tersedia di `plugins/umi-extra/manifest.json`; pengaturan provider dipusatkan melalui `global.umiExtraAPI` di `config.js`.

## Branding

Seluruh fitur, menu, watermark, footer, dan caption menggunakan identitas:

**By AlzRiss - Usanagi Umi AI**

Daftar atribusi source dan kontributor terdahulu dikonsolidasikan dalam [`CREDITS.md`](./CREDITS.md).


## Konfigurasi Bot Utama dan Jadibot

> Di **mode single** (default repo ini) bot utama tidak dipakai sama sekali —
> lihat bagian *Mode SINGLE* di atas. Penjelasan di bawah berlaku kalau
> `UMI_SINGLE_MODE=false`.

Bot utama memakai konfigurasi global di `config.js`. Setiap akun Jadibot mempunyai profil terpisah di `sessions/jadibot/<nomor>/bot-config.json`; file dibuat otomatis saat sesi dibuat atau dipulihkan. Identitas, prefix default, mode public/private, limit awal, auto-typing, tautan, aset, pengaturan TikTok Rich, dan daftar fitur nonaktif tidak dibagikan antar akun. Kredensial API, session WhatsApp, branding resmi, dan akses owner utama tetap dilindungi serta tidak dapat dioverride profil Jadibot.

Atur akun melalui Jadibot terkait dengan `.jadibotconfig` atau `.jbconfig`. Prefix per chat juga dipisahkan berdasarkan akun bot, sehingga perubahan prefix di bot utama tidak mengubah prefix Jadibot dan sebaliknya.
