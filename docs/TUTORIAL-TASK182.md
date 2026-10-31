# Tutorial Task182 — Fitur `buattesti` (kartu testimoni) & `iqontact` (kartu kontak iOS)

> 31 Oktober 2026 · File: `plugins/maker/usanagi-bikintesti.js`,
> `plugins/maker/usanagi-iqontact.js`

## Sumber & penyesuaian

Owner mengirim dua skrip bot lain (`bikintesti.js`, `iqontact.js` — gaya
CommonJS + `npm i canvas` + handler manual). Keduanya **disesuaikan ke bot ini**:

| Aspek | Sumber | Di bot ini |
|---|---|---|
| Library gambar | `canvas` (node-canvas) | **`@napi-rs/canvas`** (dependensi resmi repo) |
| Prefix/parse | deteksi prefix manual di pesan | diserahkan ke framework handler (`handler.command`) |
| Foto bukti tf | cache manual di handler global | hook **`handler.all`** (framework menjalankan untuk semua pesan, jadi album 2 foto sebelum command tetap tercatat) |
| Unduh media | `downloadMediaMessage` baileys | `m.quoted.download()` untuk quote; `downloadMediaMessage` (elaina-baileys) untuk cache — sama seperti `.rvo` |
| Jam kartu | `Asia/Jakarta` | timezone bot `config/settings.js` (Asia/Makassar/WITA) |

## Pemakaian

### 1. `buattesti` / `bikintesti` — kartu testimoni
```
1) Kirim 2 foto bukti transfer (boleh album).
2) Reply salah satu foto dengan:
   buattesti 628xxxxxxxxxx | @namatiktok
   (atau kirim foto ber-caption perintah itu)
```
Keluaran: JPEG 1080×1350 — judul TESTIMONI, 2 slot foto, tagline, footer
WA+nomor / CONTACT / TT+nama. Nomor `08xx` otomatis jadi `628xx`, nama
otomatis diberi `@`.

### 2. `iqontact` — kartu kontak gaya iOS
```
iqontact <nama> | <nomor>                → tema gelap (default)
iqontact <nama> | <nomor> | light        → tema terang
```
Keluaran: PNG 720×1000 — avatar bulat (foto WA target kalau ada), nomor
format `+62 xxx-xxxx-xxx`, tombol Suara/Video/Cari, baris menu gaya Settings,
jam WITA.

## Bukti uji (31-10-2026)

- `node --check` kedua file PASS.
- Render end-to-end: `sample-bikintesti.jpg` 22.416 B (magic `ffd8`),
  `sample-iqontact-dark.png` 52.121 B, `sample-iqontact-light.png` 51.441 B
  (di `tmp-uji/`) — tampilan diverifikasi visual: judul/slot/footer testimoni
  & kartu iOS utuh.
- `@napi-rs/canvas` `encode()` bersifat async → wajib `await` (sudah dipakai).

## Catatan

- Kedua plugin `handler.limit = false` (tak memotong limit).
- Tidak ada tabrakan nama perintah (pencocokan sebelum rilis: 0 kemungkinan).
- Kalau prefix bot aktif `.`, perintahnya `.buattesti` / `.iqontact`; kalau
  prefix `/`, jadi `/buattesti` — framework yang memotong prefix.
