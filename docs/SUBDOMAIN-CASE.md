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
| `.addsubdomainmy` | ✅ | ✅ |
| `.kontrolsubdomain` (milik sendiri) | ✅ | ✅ |
| `.kontrolsubdomain` (semua) | ❌ | ✅ |
| `.dellsubdomainmy` | ❌ (ditolak + diarahkan ke owner) | ✅ |

### 3.1 Menambah subdomain sendiri

```
.addsubdomainmy toko-budi
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
