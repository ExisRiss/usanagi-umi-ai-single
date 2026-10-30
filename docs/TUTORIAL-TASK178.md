# TUTORIAL TASK178 — AFK anti-spam sesama bot, /spamtag, ..menu kartu-saja

---

## 1. AFK tidak lagi spam antar bot

**Keluhan owner:** satu grup dihuni beberapa bot (utama + sesi jadibot, atau bot
pantauan). Satu tag ke user AFK dibalas SEMUA bot —5 notif identik dalam detik
yang sama.

**Perbaikan** (`lib/afk.js`, dipakai hook `plugins/_system/_afk.js`):

| Lapis | Cara kerja |
|---|---|
| `botMessageVerdict()` dari `lib/bot-filter.js` | Pesan dari bot DIABAIKAN: nomor bot sendiri (utama + semua sesi jadibot dalam proses), nomor di daftar `.setbotfilter`, id Baileys (BAE5), device tidak dikenal, tipe pesan API. Bot tidak pernah "negur" atau membalas sesama bot. |
| `catatUlang` (jendela10 menit per chat+target) | Setelah SATU sesi mengirim notif AFK untuk target, sesi bot LAIN di proses yang sama tidak mengulang. Tanda disimpan sebelum `sendMessage` supaya tidak kalah balapan antar sesi. Sapaan "sudah kembali" juga dikali aturan ini. |

Diagnosa: log `[BOT-FILTER] … — lewati` di konsol server. Nomor bot luar
tambahkan dengan `.setbotfilter add <nomor>` (owner).

**Uji lokal:** `node tmp-uji/alat/uji-afk-filter.mjs` (3 skenario: pengirim-bot
diabaikan, notif sekali + cooldown, target berbeda tetap jalan).

## 2. `/spamtag` (menu owner)

```
/spamtag <jumlah 1-50> <nomor | @tag>
```

Bot mengirim `<jumlah>` pesan beruntun, masing-masing menandai target (jeda
±0,4 dtk). Reply pesan target juga bisa: `/spamtag 10` (langsung pakai
pengirim yang di-reply). Khusus owner (`handler.owner = true`), muncul di
`menu_owner`.

## 3. `..menu` sekarang hanya kartu

Permintaan owner: "hapus teks menu yang muncul di //menu biar hanya sound dan
button yang muncul". `kirimMenuLive` (`lib/umi-menu/live-menu.js`):

- kartu sukses → **satu pesan kartu saja**, tanpa teks cadangan (untuk
  siapa pun, bukan hanya owner);
- kartu gagal terkirim → teks cadangan tetap dikirim (menu tidak boleh mati);
- diagnosa: env `UMI_RICH_TEKS=1` memaksa teks ikut terkirim.

`.menu` / `/menu` (satu prefix) **tidak berubah** — tetap teks + tombol
interaktif untuk semua pengguna, termasuk HP yang tidak bisa merender kartu.
