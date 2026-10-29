# Upload publik — `https://upload.gwenna.my.id/<id akun>/<nama berkas>`

Task155. Foto, video, audio/stiker, dokumen, zip/7z/rar/apk yang dikirim ke bot
disimpan **di server bot sendiri** lalu dibagikan sebagai tautan unduhan biasa.
Tidak ada host pihak ketiga (catbox, pone.rs, dan sejenisnya sudah tidak dipakai).

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `.tourl` (balas media/berkas) | unggah lampiran yang dibalas → tautan unduhan |
| `.upload`, `.catbox`, `.url` | alias `.tourl` |
| `.tourl list` | daftar berkas milik pengirim + tautan folder |
| `.tourl` tanpa lampiran | tutorial singkat (bukan error) |
| `.tolink`, `.poneurl` | plugin lama, sekarang hanya nama lain (tidak bentrok) |

Kirim media langsung dengan caption `.tourl`, atau balas pesan lama yang berisi
berkas dengan `.tourl`.

## Alamat hasil

```
https://upload.gwenna.my.id/<id akun>/<nama berkas>
https://upload.gwenna.my.id/<id akun>/<nama berkas>?dl=1   ← paksa unduh
https://upload.gwenna.my.id/<id akun>/                     ← daftar berkas
```

- **`<id akun>`** — hash pendek 8 karakter dari nomor WhatsApp pengirim
  (`6287813709432` → `wnt659u9`). Nomor tidak pernah muncul di URL. Bila nomor
  tidak diketahui, dipakai ID acak supaya berkas tetap punya folder.
- **`<nama berkas>`** — nama asli dengan ekstensi dipertahankan (`foto.jpg`,
  `video.mp4`, `aplikasi.apk`, `data.zip`, `arsip.7z`, `backup.rar`, …).
  Nama dibersihkan dari karakter aneh dan `/`, lalu diberi akhiran `-1`, `-2`, …
  kalau namanya sudah ada.

## Perilaku penyajian

- Foto, video, audio, PDF, dan teks tampil **inline** di browser.
  Arsip (`zip`, `7z`, `rar`, `apk`, …) dan berkas lain dikirim sebagai
  **attachment** (langsung terunduh), dengan `Content-Type` sesuai ekstensi:
  `application/zip`, `application/x-7z-compressed`, `application/vnd.rar`,
  `application/vnd.android.package-archive`, dst.
- `?dl=1` memaksa `attachment` untuk berkas apa pun.
- Header: `Content-Length`, `Cache-Control: public, max-age=86400`,
  `X-Content-Type-Options: nosniff`.
- Path traversal (`../`, `%2F`, `%00`) ditolak `400`; berkas tak dikenal `404`.
- Metode selain `GET`/`HEAD` → `405`.

## Batas & masa simpan

Konfigurasi: `data/upload-publik.json`

```json
{ "host": "upload.gwenna.my.id", "maksUkuran": 104857600, "simpanHari": 90 }
```

- `maksUkuran` bawaan **100 MB** per berkas; lewat itu bot menolak dengan pesan
  ukuran. Buffer kosong juga ditolak.
- `simpanHari` bawaan **90 hari**; berkas yang lebih tua dibersihkan otomatis
  setiap ada unggahan baru (`bersihkanLama()`), ikut menghapus folder yang kosong.
- Berkas fisik tersimpan di `data/upload-publik/<id akun>/<nama berkas>`,
  ditambah `.index.jsonl` (catatan nama, ukuran, mime, waktu).

## Operasional (server bot)

1. Penyimpanan & penyajian ada di `lib/upload-publik.js`
   (`simpanBerkas`, `daftarFolder`, `layaniUpload`, `bersihkanLama`).
2. HTTP masuk lewat API bot (port `2176`). `lib/jadibot-platform-api.js`
   memanggil `layaniUpload(req, res)` **sebelum** `layaniSitus`, jadi:
   - `upload.gwenna.my.id` → halaman upload & berkas;
   - `*.gwenna.my.id` lain → situs subdomain seperti biasa;
   - `api.gwenna.my.id` → API tetap tidak terganggu.
3. Cloudflare: CNAME `upload` → `72975e9b-…cfargotunnel.com` (proxied), dan
   ingress tunnel `upload.gwenna.my.id → http://localhost:2176`.
   Menambah host baru = PATCH DNS + PUT ingress, lalu restart bot.

## Uji

```bash
node tests/task155-upload-publik.mjs   # 40 uji, tanpa jaringan
```

Diuji di server: `.tourl` pada zip 30 B → tautan, unduhan 200 isi identik,
daftar folder 200, `.tourl list` memuat nama, tanpa lampiran → tutorial,
buffering API lain tetap 200. Diuji dari internet: `paket-publik.zip` (2404 B)
sha256 identik, PNG inline, `.7z` attachment `application/x-7z-compressed`.
