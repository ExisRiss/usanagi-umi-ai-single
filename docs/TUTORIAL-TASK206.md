# Tutorial Task206 — Backup pres, GETSC lancar, swgc/uno ramah,9 asisten

Tanggal:4 November2026 (WITA). Rilis: commit `00d3650` (branch `fix/task203-bughunt`).

##1. Backup otomatis — dari142 MB ke45,7 MB (bukti)

Masalah lama (laporan owner4/11): arsip131–142 MB melebihi batas unggah100 MB
(tiap jam gagal), plus2 galat tar (`/tmp/umi-backup-panduan` hilang → tar gagal (2);
`file changed as we read it` → tar gagal (1)).

Perubahan di `lib/backup/arsip.js` + `scheduler.js`:

| Tombol | Isi |
|---|---|
| gzip level | `-6` bawaan → **`gzip -9`** (`-I 'gzip -9'`) |
| Exclude baru | `data/latency-*.jsonl` (21 MB), `data/jadibot-backups`, `data/auto-update-backup`, `data/akun-backup`, `data/seleksi/foto` (33 MB PNG — **db.json tetap ikut**), `assets/igqc`, `assets/ttqc`, `assets/wacall_meme`, `assets/video`, `*.mp4`, `*.webm`, `public` (ada di repo git) |
| Panduan pulih | ditulis di **akar root** `_CARA-PULIH.txt` (bukan `/tmp`) + dihapus setelah tar — hilang sudah bug "tmp/umi-backup-panduan Cannot open" |
| Tar lunak | exit1 karena "file changed as we read it" (sesi jadibot hidup) **diterima** — verifikasi `-tzf` yang menjamin isi |
| Boot | backup terakhir **gagal** → langsung diulang90 detik setelah bot naik |

**Hasil terverifikasi (4/1123.51 WITA):** `ok=true`, arsip **45,68 MB** (81.743 entri),
unggah `upload.gwenna.my.id` sukses, notif link terkirim ke owner.
Status: `.backup` · riwayat: `data/backup-system/otomatis.json`.

> Catatan: foto fitur seleksi sengaja tidak ikut arsip (pembesar terbesar).
> Kalau ingin ikut, hapus satu baris `'data/seleksi/foto'` di `lib/backup/arsip.js`.

##2. GETSC — zip60 MB tidak lagi gagal

`plugins/owner/owner-getsc.js` + `lib/zip-filter.js`:

- Unduhan zipball GitHub dinaikkan cap-nya ke **120 MB** (dulu gagal DI SAAT stream
  untuk repo SINGLE yang83 MB).
- Bila hasil unduhan >60 MB → **saring bertingkat** tanpa kompresi ulang:
  buang `bin/` (±39 MB) → lalu `assets/` → lalu `public/` bila masih lebih.
- Bukti lokal: zipball SINGLE83,2 MB → disaring → **40,6 MB**, `zipfile.testzip()`
  lolos, isi byte semua entri identik (CRC sah).

##3. `.swgc2` & `.uno` — tidak ada lagi error menakutkan ke pelapor

- `plugins/owner/owner-swgc.js`: SEMUA balasan dibungkus `balas()` (catch) —
  kegagalan balasan ke grup mati tidak lagi jadi `unhandledRejection` dobel.
  Status429/503 dijawab dengan pesan ramah + hitung mundur detik, bukan stack.
- `lib/group-metadata-cache.js`: sengaja TIDAK memakai metadata stale saat429 —
  data peserta basi dilarang dipakai untuk keputusan izin (tes
  `feedback-latency.test.mjs` dipertahankan hijau).
- `plugins/game/game-webmultiplayer.js`: timeout `.uno` kini string ramah
  `Server game tidak merespons dalam20 detik — coba lagi sebentar lagi.`
  (dulu `DOMException [TimeoutError]` masuk log error).

##4. Log error Telegram (notifikasi error-hub) jadi bersih

`lib/error-report.js`:

- Kondisi graceful yang SUDAH ditangani plugin tidak dinotifikasi lagi:
  `Grup ini sedang tidak bisa diakses (403/404)`, `Metadata WhatsApp dibatasi/timeout`.
- Gangguan asal Cloudflare `HTTP520–524` diperlakukan transien (bukan bug plugin).

Bukti:0 entri baru di `data/errors/*.jsonl` setelah deploy (sebelumnya18/hari).

##5.9 fitur asisten baru (port dari Kaguya) — otomatis ikut Telegram

Jembatan Telegram (`lib/platform/telegram/plugin-bridge.js`) menjalankan plugin yang
SAMA; ke-9 plugin ini teks murni → langsung jalan di WA & Telegram.

| Perintah | Fungsi | Contoh |
|---|---|---|
| `.patungan` | Bagi tagihan + pajak/service | `.patungan450rb5105` |
| `.lembur` | Upah lembur Kepmenaker102/2004 | `.lembur6,5jt10libur5` |
| `.listrik` | Estimasi kWh & biaya/bulan | `.listrik350830\|100w5` |
| `.packing` | Daftar bawaan perjalanan | `.packing pantai4` |
| `.mathkit` | Prima, faktor, FPB, KPK, Fibonacci, faktorial | `.mathkit prima97` |
| `.lorem` | Teks dummy (opsi `id`) | `.lorem3id` |
| `.ipk` / `.ips` / `.nilai` | IPK/IPS, target, nilai berbobot | `.ipk A3,B+2` |
| `.acakan` / `.spin` / `.undi` / `.bagitim` / `.urutan` | Roda keputusan, undi, bagi tim | `.spin nasi, bakso` |
| `.bandingharga` | Harga per satuan termurah | `.bandingharga12rb250\|20rb500` |

Uji: `node --test tests/asisten-task206.mjs` (3/3) ·
`tests/backup-arsip-task206.mjs` (2/2) · `tests/zip-filter-task206.mjs` (3/3).

## Catatan operasional

- File backup (`lib/backup/*`, `_backupotomatis.js`, `_jadwalcek.js`) kini MASUK REPO
  (dulu hanya hidup di server) — perubahan backup tidak akan hilang lagi saat deploy.
- `scripts/boot.js` versi server masih memuat Task159/173f/200 yang belum ada di
  repo lokal — jangan deploy `boot.js` dari lokal sampai disejajarkan.
