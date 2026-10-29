# Tutorial: `.addplugin`, `.addcase`, dan Subdomain

Panduan singkat untuk tiga fitur Task151 beserta contoh yang bisa langsung
disalin ke WhatsApp.

---

## 1. `.addplugin` — menambah plugin penuh

**Siapa:** `rowner` (developer) saja.

### Langkah

1. Ketik perintahnya:

   ```
   .addplugin sapaan
   ```

2. Bot membalas satu pesan. **Balas pesan bot itu** dengan kode plugin, atau
   kirim dokumen `.js` sekaligus bersama perintahnya.

3. Bot memeriksa lalu membalas `✅ PLUGIN BERHASIL DITAMBAHKAN`.

### Kalau tidak ada kode yang dikirim

Bot **tidak** lagi membalas error. Bot mengirim tutorial berisi kerangka
plugin:

```
🧩 CARA MENAMBAH PLUGIN
1. Ketik `.addplugin <nama>`
2. Balas pesan bot itu dengan kode plugin / berkas .js
...
```

### Kerangka plugin

```js
const handler = async (m, { conn, text, args, usedPrefix, command }) => {
  m.reply('Hai dari plugin baru!')
}

handler.command = /^sapaan$/i
handler.tags = ['custom']
handler.help = ['sapaan']
handler.limit = false

export default handler
```

### Aturan

| Pemeriksaan | Batas |
|---|---|
| Ukuran | maksimal 256 KB (`pluginInstaller.maxBytes`) |
| Bentuk | wajib `export default handler` dan `handler.command` |
| Keamanan | ditolak bila memuat `child_process`, `eval`, `process.env`, akses `sessions/`/`creds.json`, atau `fs.rm` |
| Lokasi | `plugins/custom/<nama>.js` |
| Ganti | `.addplugin sapaan --replace` (versi lama dicadangkan di `.backups/`) |

---

## 2. `.addcase` — menambah fitur dari potongan `case`

**Siapa:** owner bot, owner utama, dan developer.

### Langkah

1. Ketik:

   ```
   .addcase sapa
   ```

2. Kirim kodenya di **pesan berikutnya** — tanpa prefix, dan tetap jalan di grup (bot menunggu sampai 20 menit; batal dengan `.batalcase`). Bisa juga langsung membalas pesan bot. Bentuk kodenya salah satu dari:

   **a. Potongan `case`**

   ```js
   case 'sapa':
     m.reply('Hai ' + (m.pushName || 'kak') + '! 👋')
     break
   ```

   **b. Isi saja (tanpa `case`)** — nama perintah diambil dari langkah 1:

   ```js
   m.reply('Hai kak! 👋')
   ```

   **c. Beberapa case sekaligus**

   ```js
   case 'pagi':
     m.reply('Selamat pagi 🌅')
     break
   case 'malam':
     m.reply('Selamat malam 🌙')
     break
   ```

   **d. Berkas** `.js` atau `.txt` berisi salah satu bentuk di atas.

3. Bot membalas:

   ```
   ✅ CASE BERHASIL DITAMBAHKAN
   ⌨️ Perintah: .sapa
   ⚡ Status: aktif sekarang juga (tanpa restart)
   ```

4. Coba langsung: `.sapa`

### Variabel yang tersedia di dalam case

| Variabel | Isi |
|---|---|
| `m` | pesan masuk — `m.reply()`, `m.sender`, `m.pushName`, `m.quoted`, `m.chat` |
| `conn` | koneksi WhatsApp (kirim media, cek grup, dll.) |
| `text` | teks setelah perintah |
| `args` | `text` yang sudah dipecah per spasi |
| `usedPrefix`, `prefix` | prefix yang dipakai user |
| `command` | nama perintah yang dijalankan |

### Kode yang hanya mendeklarasikan fungsi

Banyak contoh case di komunitas berbentuk fungsi utuh:

```js
async function Sapa(sock, jid) {
  await sock.sendMessage(jid, { text: 'Hai!' })
}
```

Fungsi seperti ini **tidak melakukan apa pun kalau tidak dipanggil**. Sejak
Task153 bot mendeteksinya dan memanggilnya otomatis dengan `(sock, jid)`, jadi
`.sapa` langsung berjalan. Di dalam case juga tersedia alias:

| Alias | Isi |
|---|---|
| `sock` | sama dengan `conn` |
| `jid` | sama dengan `m.chat` |
| `sender` | sama dengan `m.sender` |
| `reply(teks)` | sama dengan `m.reply(teks)` |
| `pushName` | nama pengirim |

Balasan bot menandai bila auto-call dipakai: `▶️ Fungsi Sapa() dipanggil
otomatis (sock, jid)`.

### Catatan penting

- `break` boleh ditulis, bot membuangnya otomatis.
- `default:` diabaikan.
- Nama yang sudah dipakai plugin bawaan (mis. `menu`, `ping`, `addplugin`)
  **ditolak** supaya perintah lama tidak terbajak.
- Timpa case buatan sendiri: `.addcase sapa --ganti`.
- Hasil disimpan di `plugins/custom-case/<nama>.js`.
- Kode dijalankan di server, jadi fitur ini bukan untuk pengguna umum.

---

## 3. Subdomain

**Siapa:**

| Perintah | User biasa | Developer / owner bot |
|---|---|---|
| `.addsubdomain` | ✅ | ✅ |
| `.kontrolsubdomain` (milik sendiri) | ✅ | ✅ |
| `.kontrolsubdomain` (semua) | ❌ | ✅ |
| `.dellsubdomainmy` | ❌ (ditolak + diarahkan ke owner) | ✅ |

### 3.0 Dua cara mendaftar

```
.addsubdomain toko-budi          → https://toko-budi-alzriss.gwenna.my.id
.addsubdomain kaeira.my.id       → pakai domain milikmu sendiri
```

Bentuk yang diterima: `toko`, `toko-budi`, `toko.alzriss.gwenna.my.id`,
`toko-alzriss.gwenna.my.id`, `https://toko…/`, dan domain sendiri
`kaeira.my.id` / `toko.kaeira.my.id`.

Kalau tulisannya salah (kosong, terlalu pendek, angka saja, ada spasi, atau
domain bot tanpa nama), bot **membalas tutorial lengkap** — bukan error.

### 3.0a Memakai domain sendiri (mis. kaeira.my.id)

1. `.addsubdomain kaeira.my.id`
2. Di DNS domainmu (Cloudflare/registrar), buat:

| Type | Name | Value | Proxy |
|---|---|---|---|
| CNAME | `@` (atau subdomain) | `situs.gwenna.my.id` | ON / ikon oranye |

3. Tunggu propagasi (1–5 menit), lalu isi situsnya:
   `.deploysubdomain kaeira.my.id ganti`

Bot mengecek CNAME lewat DNS publik dan menulis hasilnya di pesan
(`🛰️ DNS: siap` / `BELUM mengarah ke bot`). Berkas tetap disimpan bot; DNS
milikmu tetap milikmu.

### 3.1 Menambah subdomain sendiri

```
.addsubdomain toko-budi
```

Hasil:

```
✅ SUBDOMAIN BERHASIL DIBUAT
🌐 https://toko-budi-alzriss.gwenna.my.id/
🔗 https://toko-budi.alzriss.gwenna.my.id/
👤 Pemilik: +62812xxxx
📊 Kuota: 1/3
```

Yang terjadi di belakang layar:

1. Folder `/situs/toko-budi/` dibuat di server situs.
2. Berkas `index.html` sementara ditulis (berisi nama pemilik & cara ganti).
3. CNAME Cloudflare dibuat ke tunnel untuk dua bentuk alamat di atas.
4. Kepemilikan dicatat di registry panel + salinan lokal.

Aturan nama: 3–30 karakter, huruf kecil/angka/tanda hubung, bukan angka saja,
dan bukan nama populer (`www`, `api`, `admin`, `mail`, `ftp`, `jadibot`,
`alzriss`, `game`, `upload`).

Batas: 3 subdomain per nomor (ubah lewat `maksPerUser` di
`data/subdomain-kaira.json`).

### 3.2 Mengisi situs

```
.deploysubdomain toko-budi ganti
```

Lalu balas dengan:

- satu berkas `.html`
- `.zip` / `.tar.gz` yang punya `index.html` di akar
- kode HTML langsung di chat

### 3.3 Kontrol

```
.kontrolsubdomain
```

Menampilkan daftar subdomain milikmu (developer juga melihat semua subdomain
beserta pemiliknya).

```
.kontrolsubdomain toko-budi
```

Membuka panel:

- 🔄 Deploy ulang
- ⏸️ Nonaktifkan / ▶️ Aktifkan
- 📊 Info lengkap
- 🗑️ Hapus — **hanya muncul untuk developer**

### 3.4 Menghapus

```
.dellsubdomainmy toko-budi hapus
```

- User biasa: ditolak dengan pesan jelas + tautan `wa.me/6287813709432` untuk
  meminta penghapusan ke owner.
- Developer / owner bot: folder, berkas, dan CNAME dihapus, entri registry
  dibuang.

Tanpa kata `hapus`, bot hanya meminta konfirmasi.

### 3.5 Hosting: server bot sendiri (Task152)

Berkas situs sekarang disimpan **di server bot**, bukan di panel Kaira:

| Bagian | Lokasi |
|---|---|
| berkas situs | `situs/<nama>/` |
| daftar pemilik | `data/subdomain-registry.json` |
| penyaji | API bot port 2176, dikenali dari header Host |
| DNS | CNAME `<nama>-alzriss.gwenna.my.id` → tunnel bot |

Alur permintaan: Cloudflare → tunnel bot → API 2176 → `lib/situs-lokal.js`
membaca `situs/<nama>/<jalur>`. Halaman 404 bawaan menyebut nama subdomain dan
cara mengisi situs. Subdomain berstatus `nonaktif` menjawab 503.

Karena tidak lagi bergantung panel Kaira, gangguan panel tidak memengaruhi
situs pengguna.

### 3.6 Kalau situs belum terbuka

| Gejala | Arti | Tindakan |
|---|---|---|
| `530` + `error code: 1033` | DNS alamat baru belum tersebar | tunggu 10 detik–2 menit, muat ulang |
| `404 — Halaman belum ada` | subdomain aktif, berkas belum diunggah | `.deploysubdomain <nama> ganti` lalu kirim berkas |
| `404` + "belum terdaftar" | nama belum pernah diklaim | `.addsubdomainmy <nama>` |
| `503 — Situs sedang nonaktif` | dinonaktifkan pemilik | `.aktifsubdomain <nama>` |
| "Arsip tidak punya index.html di akar" | zip tanpa index.html | tambahkan `index.html` di akar zip |

Pesan sukses deploy sekarang menampilkan status DNS (`🛰️ DNS: siap` atau
peringatan bila ada record yang gagal dibuat).

---

## 4. Berkas yang terlibat

| Berkas | Fungsi |
|---|---|
| `lib/kode-aman.js` | pembersih pagar kode, pemeriksaan keamanan, pemecah `case`, cek bentrok nama |
| `plugins/owner/owner-addplugin.js` | `.addplugin` + tutorial |
| `plugins/owner/owner-addcase.js` | `.addcase` |
| `lib/subdomain-kaira.js` | panel situs, DNS Cloudflare, registry, klaim subdomain |
| `plugins/owner/subdomain-deploy.js` | semua perintah subdomain |
| `tests/task151-kode-aman.mjs` | 42 uji logika (tanpa jaringan) |
