# Tutorial Subdomain & Domain — Umi Usanagi AI (Task176)

Panduan ini menggantikan seluruh menu subdomain/domain lama. Semua perintah lama
(`/deploysite`, `/ceksubdomain`, `/addsubdomain`, `/cekdns`, dst.) **sudah dihapus**
dari bot. Yang tersisa hanya 8 perintah di bawah, semuanya ada di satu plugin:

    plugins/owner/subdomain-domain.js

---

## 1. Peta perintah

| Perintah | Untuk siapa | Gunanya |
|---|---|---|
| `/subdomainmenu` | semua | peta menu + tombol ke semua perintah |
| `/subdomain` | semua | ringkasan: domain tersedia, jumlah subdomain, jumlah domain, situs aktif |
| `/domain` | semua | status tiap domain (hidup/mati, akses public/private, pemilik) |
| `/deploysubdomain` | semua | deploy situs ke `<nama>-alzriss.<domain>` (pilih domain lewat tombol) |
| `/deploydomain` | pemilik domain | deploy situs ke `<nama>.<domain>` tanpa akhiran |
| `/kontrolsubdomain` | pemilik situs | info, deploy ulang, maintenance, aktifkan, nonaktifkan, hapus |
| `/kontroldomain` | pemilik domain | daftar subdomain, akses domain, awalan, hapus situs |
| `/addsupabase` | pemilik situs | pasang database Supabase + tutorial |
| `/addfile` | pemilik situs | tambah / ganti / edit berkas situs, langsung berlaku |

> Catatan: `/kontrolsubdomain` dan `/kontroldomain` sama-sama ada karena
> cakupannya beda — yang satu per situs/subdomain, yang satu per domain.

---

## 2. Alamat yang dihasilkan

Domain bawaan bot (selalu tersedia):

    kieran.my.id      → public   (siapa pun boleh deploy subdomain)
    kieran.web.id     → private  (wajib awalan alzriss)
    gwenna.my.id      → bawaan

Aturan alamat:

    /deploysubdomain toko              → https://toko-alzriss.kieran.my.id
    /deploysubdomain toko kieran.web.id→ https://toko-alzriss.kieran.web.id
    /deploydomain    toko (domainmu)   → https://toko.<domainmu>

- Subdomain selalu memakai akhiran **`-alzriss`** (awalan bawaan bot).
- Domain bebas **tidak** memakai akhiran.
- Semua akar domain sudah punya **wildcard DNS**, jadi host baru langsung jalan
  tanpa menunggu pembuatan record. Tidak perlu Cloudflare API.

Domain milik user (dicatat di `data/domain-kontrol.json`) otomatis ikut muncul
di daftar domain saat `/deploysubdomain` atau `/deploydomain`.

---

## 3. Deploy baru

### 3.1 Subdomain

```
/deploysubdomain
```

Bot menampilkan tombol pilihan domain. Setelah memilih, kirim:

```
/deploysubdomain toko kieran.my.id
```

atau langsung tanpa memilih (memakai domain pertama yang boleh dipakai):

```
/deploysubdomain toko
```

Bot membalas **SIAP DEPLOY**, lalu kirim isi situs:

- **kirim berkas** (`.html/.css/.js/.json/.svg/.txt`) sebagai dokumen, atau
- **kirim kode HTML** langsung sebagai teks chat.

Hasil:

    🌐 https://toko-alzriss.kieran.my.id/

### 3.2 Domain bebas

Hanya bisa dipakai kalau nomor kamu tercatat sebagai pemilik domain:

```
/deploydomain toko
```

Hasil:

    🌐 https://toko.<domainmu>

Kalau domain tidak dimiliki, bot menolak dan menyebutkan domain yang boleh.

### 3.3 Ganti seluruh kode

```
/deploysubdomain toko ganti
/deploydomain toko ganti
```

Mode `ganti` mengosongkan isi lama lalu menimpa dengan berkas baru. Tanpa `ganti`,
berkas baru ditambahkan ke berkas yang sudah ada.

---

## 4. Kontrol situs

```
/kontrolsubdomain toko
/kontrolsubdomain toko info
/kontrolsubdomain toko deployulang
/kontrolsubdomain toko maintenance
/kontrolsubdomain toko aktif
/kontrolsubdomain toko nonaktif
/kontrolsubdomain toko hapus
```

| Aksi | Akibat |
|---|---|
| `info` | alamat, pemilik, jumlah berkas, ukuran, status, jumlah deploy |
| `deployulang` | kirim berkas/kode baru untuk menimpa isi lama |
| `maintenance` | situs menampilkan halaman maintenance (data tetap) |
| `aktif` / `nonaktif` | menyalakan / mematikan penyajian situs |
| `hapus` | **khusus owner bot** — menghapus situs + foldernya |

`/kontroldomain` menampilkan daftar semua subdomain di bawah satu domain,
status akses (public/private), awalan, dan tombol menuju tiap situs.

---

## 5. Ubah berkas tanpa deploy ulang

```
/addfile toko tambah          → kirim berkas baru (nama harus belum ada)
/addfile toko ganti           → kirim berkas dengan nama yang sudah ada
/addfile toko edit index.html → kirim kode HTML sebagai teks chat
```

Perubahan **langsung berlaku** (tidak perlu restart bot), karena berkas dibaca
langsung dari folder situs setiap ada permintaan.

Batalkan dengan `/batal`. Permintaan menunggu berlaku 15 menit.

---

## 6. Supabase

```
/addsupabase toko
```

Bot meminta dua hal:

1. **Project URL** — harus berbentuk `https://xxxxx.supabase.co`
2. **Anon public key** — minimal 20 karakter

Setelah valid, bot menulis ke folder situs:

    supabase-config.js     → URL + anon key (siap dipakai)
    supabase-client.js     → klien siap pakai (window.umiSupabase)
    TUTORIAL-SUPABASE.md   → cara pakai di HTML

Kunci **tidak pernah dicetak ulang** oleh bot. Kalau salah, ulangi
`/addsupabase toko` untuk menimpa.

Contoh pemakaian di halaman situs:

```html
<script src="supabase-client.js"></script>
<script>
  const { data } = await window.umiSupabase.from('pesan').select('*')
</script>
```

---

## 7. Status & pemantauan

`/subdomain` menampilkan:

- jumlah domain yang dikenal
- jumlah subdomain dan jumlah domain situs
- daftar akar domain + aksesnya
- daftar situs aktif (alamat + status)

`/domain` menampilkan tiap domain aktif beserta hasil cek HTTP:

    🟢 kieran.my.id — HIDUP · HTTP 200
    🔴 lain.example — MATI · tidak merespons

Cek memakai DNS + HTTP sungguhan, bukan status tulisan tangan.

---

## 8. Perbaikan bug "undefined"

Versi lama menampilkan alamat:

    https://undefined-alzriss.gwenna.my.id/

Penyebabnya: `deploySubdomain()` lama tidak pernah menulis `domainKustom`
ke registry, sehingga kartu situs kehilangan bagian label/akar.

Versi baru menulis sendiri ke `data/subdomain-registry.json`:

```json
{
  "toko-kieran-my-id": {
    "pemilik": "628xxxx@s.whatsapp.net",
    "akarDomain": "kieran.my.id",
    "label": "toko",
    "domainKustom": "toko-alzriss.kieran.my.id",
    "status": "aktif",
    "mode": "subdomain",
    "deployKe": 1
  }
}
```

Kartu situs membaca `domainKustom` lebih dulu, dan kalau entri lama belum
punya kolom itu, alamat diturunkan dari `label` + `akarDomain` — tidak pernah
lagi menampilkan `undefined` atau `https:///`.

---

## 9. Kalau ada masalah

| Gejala | Cek |
|---|---|
| "Domain belum terdaftar" | domain ada di `data/domain-kontrol.json`? pemilik cocok dengan nomormu? |
| situs tidak terbuka | `/kontrolsubdomain <nama> info` → status `aktif`? cek HTTP di `/domain` |
| alamat salah | harusnya `<nama>-alzriss.<akar>` (subdomain) atau `<nama>.<akar>` (domain) |
| berkas tidak berubah | pastikan kirim ke folder yang benar lewat `/addfile` atau `deployulang` |
| bot bilang "Situs tidak ditemukan" | deploy dulu, baru `/addfile` |

Data yang dipakai bot:

    data/subdomain-registry.json   → daftar situs
    data/domain-kontrol.json       → daftar domain + pemilik + akses
    data/subdomain-baru-tunggu.json→ state menunggu berkas (otomatis dibersihkan)
    data/subdomain-baru-log.json   → catatan deploy

---

## 10. Uji cepat

1. `/subdomainmenu` → muncul tombol lengkap
2. `/subdomain` → jumlah situs bertambah setelah deploy
3. `/deploysubdomain toko kieran.my.id` → kirim `<!doctype html><h1>Toko</h1>`
4. Buka `https://toko-alzriss.kieran.my.id/` → tampil
5. `/kontrolsubdomain toko info` → alamat benar, bukan `undefined`
6. `/addfile toko edit index.html` → kirim HTML baru → muat ulang halaman
7. `/kontrolsubdomain toko maintenance` → situs berubah
8. `/kontrolsubdomain toko aktif` → situs normal lagi

---

## 11. Task179 — tanya target, situs sudah ada → pilihan aksi

Tiga perubahan pada alur deploy, dari keluhan pemilik bot:

1. **Deploy menanya target dengan benar.** `/deploysubdomain` (tanpa argumen)
   menampilkan daftar target nyata:
   - *Subdomain gratis (tanpa limit)* — hanya 3 domain bawaan
     (`kieran.my.id`, `kieran.web.id`, `gwenna.my.id`), SELALU berakhiran
     `-alzriss`; contoh `https://toko-alzriss.kieran.web.id/`.
   - *Domain milikmu (tanpa akhiran)* — domain yang sudah kamu daftarkan;
     dialihkan otomatis ke `/deploydomain`.
   Deploy TIDAK lagi mengalihkan diam-diam ke domain lain. Kalau namanya
   sudah dipakai di domain berbeda, deploy tetap berjalan di domain yang
   kamu pilih dengan peringatan "alamat di atas adalah situs BARU".

2. **Situs sudah ada → pilihan aksi (tombol/daftar).** Ketika
   `/deploysubdomain <nama> <domain>` atau `/deploydomain <nama> <domain>`
   menemukan situs yang sudah terpasang di alamat itu, bot menampilkan:
   - 🔄 Deploy ulang — kirim berkas baru, isi lama ditimpa
   - 🧑‍💻 Ganti code — kirim kode HTML baru untuk `index.html`
   - ✏️ Edit berkas — ganti isi satu berkas
   - 📤 Upload berkas — tambah berkas ke situs
   - 🗑️ Hapus situs — buang situs + foldernya (owner bot)
   - 🛠️ Panel situs lengkap — `/kontrolsubdomain <nama>`

3. **Tier gratis dibatasi jelas.** Subdomain gratis hanya di 3 domain
   bawaan dan selalu memakai akhiran `-alzriss` (perintah `labelAman`
   memangkas kelebihan akhiran, `hostSubdomain` selalu menambahkannya
   kembali). Domain milik sendiri memakai `/deploydomain` (tanpa akhiran).

### Berkas terkait
- `plugins/owner/subdomain-domain.js` — alur picker, panel aksi, pemandu
  akses domain private (Task179).
- `lib/subdomain-kaira.js` — disinkronkan dari server (47.990 B): versi repo
  sebelumnya ketinggalan zaman (27.585 B, ekspor `bacaKontrolDomain` /
  `akarDomainHost` hilang) — inilah sebab repo pernah tidak konsisten dengan
  server.

### Catatan: bot jadibot versi lama
Balasan ".buatsubdomain", "Biarkan file lama", atau "undefined-alzriss"
yang terlihat di log berasal dari sesi jadibot dengan KODE LAMA (sistem
subdomain sebelum Task176) — bukan dari bot utama. Perbarui/hentikan sesi
itu dari panel jadibotnya; kode di repo ini sudah memakai sistem baru.
