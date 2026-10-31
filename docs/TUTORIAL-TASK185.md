# Tutorial Task185 — Perbaikan getsc, rute `.fake dana`, & rebrand nama tampilan

Tanggal: 31 Oktober 2026
Commit: (lihat log git Task185)

## 1. Bug: `/getsc` kirim ZIP ke group, bukan private chat owner

### Gejala
Owner menjalankan `$getsc` di group → ZIP source code terkirim di group (semua member bisa unduh).

### Penyebab
`owner-getsc.js` memanggil `sendLocalMediaFast(conn, m, …)` dengan `m` asli — `m.chat` = ID group.

### Fix (plugins/owner/owner-getsc.js)
```js
const diGrup = Boolean(m.isGroup)
const mTujuan = diGrup ? { chat: m.sender } : m
...
await sendLocalMediaFast(conn, mTujuan, zip.file, { ... })
if (diGrup) await m.reply('✅ File ZIP source code sudah dikirim ke private chat kamu.')
```
Saat dipanggil di group, file dikirim ke JID peminta (PM), dan group hanya menerima notifikasi. Di private chat perilaku lama dipertahankan.

## 2. Bug: `.fake dana 10.000.00` balas "Format salah" (RIMURU FAKETAG)

### Gejala
`.fake dana 10.000.00` kena plugin faketag → cek format `a|b|c` gagal → "Format salah darling~".

### Penyebab
Command `fake` dimiliki wrapper faketag (`umi-faketag.js`); fakedana hanya punya command `fakedana|danafake|fakedan`.

### Fix (plugins/pelengkap/umi/tools/umi-faketag.js)
1. Intercept di awal handler: kalau argumen pertama adalah kata `dana`, delegasikan ke fitur fakedana:
   ```js
   if (/^dana\b/i.test(teks)) {
     const nominal = teks.replace(/^dana\b/i, '').trim()
     const { default: fakedana } = await import('../../../maker/usanagi-fakedana.js')
     return fakedana(m, { ...extra, text: nominal, args: ..., command: 'fakedana' })
   }
   ```
   `handler.js` mem-parse `.fake dana 10.000.00` → command `fake`, text `dana 10.000.00` (verifikasi di `lib/command-parser.js`), jadi intercept `^dana\b` tepat sasaran.
2. `handler.group = false` (sebelumnya `true`): gerbang group di handler.js akan menolak PM sebelum handler jalan, sehingga cabang faketag-group-only dipindah ke dalam handler:
   - `.fake dana …` → jalan di chat mana pun (PM maupun group).
   - `.fake @user|tag|pesan` → tetap khusus grup (balasan panduan di PM).
3. Help ditambah: `fake dana <nominal>`.

Jalur lama `.fakedana 10.000` tetap berfungsi (command `fakedana` di `usanagi-fakedana.js`).

## 3. Rebrand teks tampilan: Rimuru / Ourin / Anya → Umi Usanagi

### Ruang lingkup (penting)
- **Diganti**: string literal yang tampil ke user (caption, reply, judul canvas/HTML game, deskripsi menu, help, FEATURE_CREDIT, label sumber play, fallback nama bot/stiker).
- **TIDAK diganti**:
  - Komentar & banner kredit upstream (atribusi penulis asli; "DO NOT REMOVE CREDIT").
  - Nama file/path/command/alias/importSource (`ourin-ceksexy`, `rimuru-ai`, `getAssetBuffer("rimuru")`, dst.) — fungsional.
  - Nama karakter anime di `gachabini.js` ("Rimuru", "Anya Forger" di waifuList).
  - Kunci registry/menu (`'game-rimuru'`, `ourin:`) — hanya nilai deskripsinya yang diganti.
  - Kunci data internal (localStorage, store key) — identifier, bukan tampilan.

### Metode
Script token-aware (`tmp-uji/alat/rebrand-task185.py`): parser komentar/string, hanya menyentuh isi string literal; proteksi path/URL/dotted-id/kebab-lower/line identifier. Hasil: **377 file, 850 string** + beberapa edit manual (credit.js header stil, ganti-rimuru-large, rimuru-ai, nixelgames localStorage key).

### Contoh hasil
| Sebelum | Sesudah |
|---|---|
| `💗 *RIMURU FAKETAG*` | `💗 *UMI USANAGI FAKETAG*` |
| `🦋 *Rimuru*: He~ selamat pagi…` | `🦋 *Umi Usanagi*: He~ selamat pagi…` |
| `Fitur SC Bot Rimuru MD 👑` (FEATURE_CREDIT) | `Fitur SC Bot Umi Usanagi 👑` |
| `sumber: 'izuka (OURIN)'` | `sumber: 'izuka (UMI USANAGI)'` |
| `'game-rimuru': 'kumpulan game gaya Rimuru'` | `'game-rimuru': 'kumpulan game gaya Umi Usanagi'` |
| header `/credit` stil `𝑹𝑰𝑴𝑼𝑹𝑼 𝑴𝑫` | `𝑼𝑴𝑰 𝑼𝑺𝑨𝑵𝑮𝑰` |

### Jaminan kualitas
- `node --check` 378/378 file lolos.
- Audit sisa teks tampilan mengandung nama (string literal, non-gachabini, non-identifier): **0**.
- Audit identifier rusak (spasi di tengah key/path): **0** (temuan awal diperbaiki manual).
- Diff diaudit terhadap zipball main: setiap baris berubah murni perubahan nama.

## Cara uji mandiri
1. `.getsc` di group → ZIP masuk PM, group dapat notifikasi.
2. `.fake dana 10.000.00` di PM & group → gambar fake saldo DANA.
3. `.fake @user|tag|pesan` di PM → panduan "khusus grup"; di group → tetap jalan.
4. Fitur caption AI/d Maker (`.play`, `.checkers`, `.credit`, menu, dst.) → label "Umi Usanagi".
