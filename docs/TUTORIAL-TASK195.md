# Tutorial Task195 — Akses Seleksi Ketat + Peringan Poller

## Akses ketat (tanpa bypass)
- `punyaAksesSeleksi` (store.js): HANYA pemilik grup atau helper terundang.
  Role `owner` sistem (developer) TIDAK lagi otomatis membuka seleksi orang.
- Bot: `grup-info.boleh` & `aturSeleksi` tanpa bypass developer — hanya
  pemilik/helper grup tsb. `/grupseleksi` kini hanya menampilkan grup
  milikmu sendiri (tersembunyi dari yang tak punya akses).
- Web: `/api/grup/saya`, `/api/seleksi/list`, `/api/grup/setting` GET/POST
  mengikuti aturan yang sama.
- Undang orang lain → `/addseleksi @tag` (akun web + akses otomatis).

## Peringan poller (anti-delay)
- Poller menyimpan cache keanggotaan grup 10 menit (`grupDikenal`) —
  mengurangi panggilan `groupMetadata` ke WA. Rate-limit metadata adalah
  salah satu pemicu backoff yang membuat semua fitur bot terasa delay.

## Uji lokal
`/tmp/uji195.mjs` — 8/8 (owner-role diblokir semua jalur; pemilik/helper tetap jalan).

## Pemasangan
Push → deploy store.js/api.js/seleksi.js dua server → restart → selesai.
