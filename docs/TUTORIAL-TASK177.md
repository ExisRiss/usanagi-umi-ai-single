# TUTORIAL TASK177 — bot cepat merespon, penyedia sendiri, studio video, menu rich

Dokumen ini menjelaskan **apa yang berubah**, **cara memakai**, dan **cara memeriksa**
hasilnya tanpa menebak. Semua perintah di bawah diuji di server (akun `d1ebc84a`).

---

## 1. Bot delay / kadang tidak merespon

Tiga perbaikan, semuanya di dalam kode (bukan sekadar "dibersihkan"):

| Perbaikan | Berkas | Efek |
|---|---|---|
| Pengawas perintah lambat | `lib/pengawas-lambat.js` | setiap perintah diukur; yang lewat 2 detik dicatat ke `data/lambat.jsonl` (maksimal 400 baris), yang lewat 20 detik dikabari ke owner (`UMI_KABAR_LAMBAT_MS`) |
| Penulisan DB digabung | `lib/db-writer.js` | dulu 429 penulisan (`dbwrite`) menahan total 182 detik; sekarang digabung maksimal 1× per 4 detik (`UMI_DB_JEDA_MS`), `write(true)` tetap langsung |
| Penyedia AI berantai | `lib/penyedia-bot.js` | satu pintu untuk teks & gambar; kalau penyedia pertama diam, otomatis pindah ke berikutnya |

**Cara membaca hasilnya**

```bash
# di server (Console → shell)
tail -n 20 data/lambat.jsonl
```

Satu baris = satu perintah yang lambat, mis.:

```json
{"perintah":"malz","ms":1529073,"at":"2026-10-30T..."}
```

Kalau `ms` besar tapi bot tetap membalas, berarti penyebabnya pekerjaan berat (ffmpeg/AI),
bukan bug antrean. Kalau perintah yang sama muncul berulang, laporkan nama perintahnya.

---

## 2. Fitur APA PUN yang butuh API harus lewat penyedia milik bot

`lib/penyedia-bot.js` **hanya** memakai penyedia milik bot:

- teks  → `POST https://apiii-xrina.my.id/ai/gemini` (tanpa API key), cadangan `faa`, lalu `deline`
- gambar → `https://apiii-xrina.my.id/ai-image/flux?prompt=...`

Hasil uji nyata (30-10-2026): teks menjawab dalam ±12 detik, gambar mengembalikan
WEBP 21.616 byte. `api-faa.my.id` dan `api.deline.web.id` **mati** — tetap ada di rantai
sebagai cadangan, tapi tidak diandalkan.

### Scraper di `integrations/umi/src/scraper/`

`deepseek.js`, `qwen3.js`, `claudehaiku.js`, `gpt5.js`, `unlimitedai.js` sekarang mencoba
penyedia bot **lebih dulu**:

```js
const __alt = await aiPenyediaTeks(prompt)
if (__alt) return { status: true, code: 200, model: 'penyedia-bot', answer: __alt }
```

Kalau penyedia bot tidak menjawab, kode lama tetap berjalan apa adanya (tidak dihapus).

### `.fakeff` — error `Cannot find module .../integrations/umi/config.js`

Penyebabnya `lib/rimuru-error.js` mengimpor `config.js` yang memang tidak ada di paket.
Perbaikan:

- `integrations/umi/config.js` (shim) sudah dipasang,
- `plugins/_system/task177-diagnosa.js` sekarang memakai jalur `../../integrations/umi/...`
  (sebelumnya `../` sehingga yang diuji berkas palsu),
- font `rimuru-font.ttf` dicari **lokal** dulu (`integrations/umi/assets/…`) sebelum
  mengunduh dari catbox — WebView/ffmpeg tidak boleh bergantung jaringan pihak ketiga.

Kalau `.fakeff` masih error, kirim hasil `/task177` (lihat bagian 5).

---

## 3. Studio video (`/vc...`)

Semua perintah memakai **video yang dikutip** (reply) atau dikirim dengan caption perintah.

| Perintah | Fungsi |
|---|---|
| `/vstudio` | daftar perintah + cek ffmpeg |
| `/vcinfo` | durasi, resolusi, fps, codec, bitrate |
| `/vctext <teks>` | teks di bawah video |
| `/vcwm <teks>` | watermark kanan atas |
| `/vctrim <mulai> [detik]` | potong klip |
| `/vcspeed <0.5-3>` | percepat / perlambat (suara ikut) |
| `/vcreverse` | putar balik |
| `/vcmute` | hapus suara |
| `/vccrop <1:1\|9:16\|16:9\|4:5>` | potong tengah ke rasio |
| `/vcrotate <90\|180\|270>` | putar |
| `/vcgif [detik]` | GIF |
| `/vcsticker [detik]` | stiker animasi |
| `/vccompress` | perkecil ukuran |
| `/vcthumb` | ambil 1 bingkai jadi gambar |
| `/vcaudio` | balas video + kirim audio → suara diganti |
| `/vcai <ide>` | video 4 detik dari 1 gambar AI |
| `/vcslide <ide>` | video 4 detik dari beberapa gambar AI |

Contoh:

```
(quote video) /vctext Halo Umi Usanagi
/vcai gadis anime kacamata langit biru
```

Catatan jujur:

- Antrean **satu pekerjaan** dalam satu waktu supaya CPU tidak habis dan bot tetap membalas.
- ffmpeg diambil dari `@ffmpeg-installer` → `PATH` (server punya ffmpeg 7.1.5).
- Video AI dibuat dengan zoom halus 4 detik, resolusi 720×1280, bitrate dibatasi 1,8 Mbps.
  Dulu `-loop 1 -t 4` + `zoompan d=100` menghasilkan **400 detik** dan 16 MB.

---

## 4. `..menu` rich — tampil di WhatsApp & tema baru

Tema sekarang **liquid glass (blur tembus background) + neobrutalism** (garis 3 px,
bayangan keras, hijau neon). Yang berubah:

1. Kartu **tidak lagi** memakai `height:100vh`; tinggi kartu ditentukan isi, area tab
   dibatasi 300 px dan bisa digeser, jadi ukuran pesan tetap.
2. Banner hanya dipasang **sekali** (di belakang kartu). Sebelumnya data URI banner masuk
   dua kali → HTML 190 KB. Sekarang ±45 KB (banner WebP 720 px, 19 KB).
3. `lib/rich-live-card.js` tidak lagi menimpa `html,body{height:100%;overflow:hidden}`
   pada kartu yang mengatur gulirnya sendiri (`umi-scroll-sendiri`).
4. Salin perintah lewat ketukan memakai `writeText()` + cadangan `execCommand`, jadi tidak
   ada lagi galat konsol saat izin clipboard ditolak.

### Kalau kartu tetap tidak muncul

Jalankan (owner):

```
/ujirich
```

Bot mengirim 3 kartu berurutan: **MINI (±0,5 KB)**, **SEDANG (±1 KB, tanpa gambar)**,
**PENUH (menu asli)**. Balas nomor yang muncul:

- ketiganya muncul → kartu normal (kemungkinan hanya soal ukuran pesan di HP tertentu),
- hanya MINI → batas ukuran payload; kabari, isi menu akan dipangkas lagi,
- tidak ada yang muncul → HP/versi WhatsApp tidak merender rich message; pakai
  `.umimenu style teks` sebagai ganti.

`.menulaut` tetap ada untuk memeriksa kartu di server (ukuran, data URI, encode payload).

---

## 5. Diagnosa cepat

```
/task177
```

Menulis `data/task177-diagnosa.json`: lama `handleMs`, jumlah perintah lambat, penulisan DB,
impor paket `integrations/umi` (fakeff, deepseek, gpt5, …), ketersediaan ffmpeg.

---

## 6. Variabel lingkungan

| Variabel | Bawaan | Guna |
|---|---|---|
| `UMI_DB_JEDA_MS` | `4000` | jeda gabung penulisan DB |
| `UMI_KABAR_LAMBAT_MS` | `20000` | ambang kabar perintah lambat ke owner |
| `UMI_RICH_TEKS` | `0` | `1` = kirim teks menu setelah kartu |
