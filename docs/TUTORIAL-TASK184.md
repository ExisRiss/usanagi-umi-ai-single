# Tutorial Task184 — `/getsc`: kirim source code bot (ZIP) khusus owner utama & developer

> 31 Oktober 2026 · File: `plugins/owner/owner-getsc.js`

## Fungsi

`getsc` → bot mengambil **zipball repo GitHub bot** (branch `main`) lalu
mengirimnya sebagai dokumen `.zip` langsung ke chat peminta — bukan link,
tapi file asli.

## Gerbang role (persis permintaan: owner utama ATAU developer)

| Role | Sumber | Hasil |
|---|---|---|
| owner utama | `data/owner-utama.json` / `global.ownerUtama` → `extras.isOwnerUtama` | ✅ boleh |
| developer | nomor terkunci `global.owner` / `m.fromMe` → `extras.isDeveloper` (`isROwner`) | ✅ boleh |
| owner biasa / pengguna | — | ❌ "🔒 khusus owner utama atau developer" |

Dua lapis: flag framework `handler.owner = true` (tolak non-owner umum) +
**cek eksplisit** `isOwnerUtama || isDeveloper` di dalam handler (owner biasa
yang lolos framework tetap ditolak dengan pesan role yang jelas).

## Pengambilan berkas

- Sumber: `https://codeload.github.com/ExisRiss/usanagi-umi-ai-single/legacy.zip/refs/heads/main`
  — repo **dikunci di konstanta**, TIDAK memakai env `GITHUB_REPO`
  (catatan Task177: env itu menunjuk repo lain).
- Selalu commit terbaru saat diperintah (tanpa token — repo publik; codeload
  tanpa batas rate-limit API).
- Info commit (sha + tanggal + pesan) diambil dari API commits → ikut di
  caption; kalau API gagal, kiriman tetap jalan tanpa info commit.
- Streaming `pipeline()` dengan **batas 60 MB** (zipball terukur
  **42.068.614 B ≈ 40,1 MB / 4.239 berkas**, unduh 2,4 dtk dari sandbox).
- Kirim via `sendLocalMediaFast` (`type: document`, mimetype `application/zip`,
  nama `usanagi-umi-ai-single-main.zip`) — file sementara dihapus otomatis
  oleh `finally` lib, plus bersih-bersih sendiri kalau gagal.

## Bukti uji (31-10-2026)

- `node --check` PASS.
- `unduhZipball()` dijalankan asli: **42.068.614 B, magic `504b` (PK), 2,4 dtk**.
- Simulasi gerbang: tanpa role → 🔒; `isOwnerUtama` → lanjut tahap unduh;
  `isDeveloper` → lanjut tahap unduh.

## Cara uji di WhatsApp

```
getsc                ← sebagai owner utama/developer → file ZIP masuk
getsc                ← sebagai owner biasa/user     → 🔒 ditolak
```
