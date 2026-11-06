# Tutorial Task205 — Sistem Akses Bot (Private / Public / OnlyGC / OnlyPC + Warning)

> Permintaan owner: 04-11-2026. Menggantikan spesifikasi lama `/onlygc` diam-total.

## Ringkasan

| Perintah | Fungsi |
|---|---|
| `/private` (alias `/self`) | Bot khusus **owner/developer** — user lain tidak dilayani (diam total). |
| `/public` | Bot bisa dipakai **semua orang** di mana pun. |
| `/onlygc on` | Hanya **group**. Command di chat pribadi dari non-owner → **warning**. |
| `/onlygc off` | Kembali normal (pribadi & group dilayani). |
| `/onlypc on` | Hanya **pribadi** — di group bot **tidak merespon** (diam). |
| `/onlypc off` | **Semua dibatasi**: pribadi warning→tindakan, group diam. |
| `/onlygcset` | Atur warning (tombol interaktif). |
| `/onlypcset` | Atur warning (tombol interaktif, config sama). |

Semua perintah: **owner only**.

## Mesin peringatan (chat pribadi dibatasi)

Saat non-owner mengirim **command** (pakai prefix) di chat pribadi pada mode
`onlygc on` atau `onlypc off`:

1. Bot kirim **peringatan** `⚠️ PERINGATAN x/y` + teks warning.
2. Setelah **y peringatan** (default **3**) → **tindakan** dipilih:
   - **BLOCK** — nomor diblokir WhatsApp (bila method socket tersedia;
     otomatis jatuh ke blacklist bila tidak).
   - **BLACKLIST** — nomor masuk blacklist bot (bot diam total untuknya,
     termasuk di group).
3. Bila **warning OFF** → tindakan langsung diambil pada pelanggaran pertama.

Pesan **biasa** (tanpa prefix) di permukaan yang dibatasi: **diam total**
(tanpa hint, tanpa AutoAI, tanpa notis AFK). Notis AFK juga dibungkam hanya
di permukaan yang dibatasi.

**Pengecualian:**
- Owner/developer: selalu dilayani di semua permukaan.
- Command realms (`realmAccessCommand`) tetap jalan di pribadi (aturan lama).
- Mode **private** didahulukan: tidak ada warning yang bocor saat private.

## Pengaturan (`/onlygcset` atau `/onlypcset`)

Kedua perintah membuka panel + **tombol**:

- `⚠️ Warning ON` / `🔇 Warning OFF` — ON: warning dulu; OFF: langsung tindakan.
- `➕ / ➖ Batas` — jumlah warning sebelum tindakan (1–20, default 3).
- `🔒 Tindakan: Block` / `🏷️ Tindakan: Blacklist` — pilihan konsekuensi.
- `🧹 Reset Hitungan` — hapus hitungan warning semua user.

Perintah manual (sama isinya):

```
.onlygcset warn on|off
.onlygcset jumlah <1-20>
.onlygcset teks <pesan warning baru>
.onlygcset tindakan block|blacklist
.onlygcset reset
```

Config disimpan di `global.db.data.accessWarn = { config, counts }`
(database bot) — berlaku bersama untuk onlygc dan onlypc.

## Status & saklar

```
.onlygc          → panel status ONLYGC + tombol
.onlygc on/off   → nyalakan/matikan
.onlypc          → panel status ONLYPC + tombol
.onlypc on/off   → nyalakan (group diam) / matikan (semua dibatasi)
.private         → mode private (owner only, diam untuk user lain)
.public          → buka semua
```

Mode tersimpan di SQLite `bot_access_mode` (`normal|onlygc|onlypc|off`,
dengan migrasi CHECK otomatis) + `botConfig.onlyGroup` untuk sesi jadibot.

## Catatan teknis (developer)

- Logika murni: `lib/access-warn.js` (`flagMode`, `putusanAkses`,
  `muatConfig`, `catatPeringatan`, `terapkanTindakan`).
- Gerbang di `handler.js` (setelah clear-AFK & gerbang privat, sebelum
  hint prefix) dan `handler-srv.js` (setelah `instancePublic`).
- Test: `tests/onlygc-silence.mjs` (17 test: struktur, murni, e2e).
