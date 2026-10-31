/* By AlzRiss - Usanagi Umi AI
 *
 * Task194 — /tutorialseleksi : panduan lengkap sistem seleksi member grup.
 * Bisa dipanggil dari grup maupun chat pribadi.
 */

const TUTORIAL = `🎯 *PANDUAN SISTEM SELEKSI* — Umi Alz Seleksi

*1. Buat seleksi (pemilik grup)*
• Jalankan \`/buatseleksi <nama> [linkGrupSeleksi] [linkGrupUtama]\` di grup yang mau dijadikan grup tujuan.
• Link grup seleksi = link grup WA tempat calon member join dulu (opsional).
• Link grup utama = link grup tujuan akhir — dikirim otomatis via DM ke pendaftar yang DITERIMA.
• Kamu otomatis dapat *akun web* (dikirim via DM) untuk membuka panel.

*2. Grup seleksi (khusus admin)*
• Buat grup WA terpisah (mis. "Admin Seleksi AlzRiss"), tambahkan bot ke sana.
• Jalankan \`/grupseleksi\` di grup tersebut (oleh pemilik/owner) → semua notifikasi pendaftar baru masuk ke grup ini lengkap dengan tombol *Terima* / *Tolak*.
• Tanpa grup seleksi, notifikasi fallback ke grup tujuan.

*3. Calon member daftar*
• Di grup tujuan mereka jalankan \`/seleksi\` → dapat kode + link pendaftaran.
• Isi form (kolom bisa diatur), tunggu admin meninjau.
• Lolos → bot menambahkan ke grup + DM link grup utama. Tidak lolos → ditolak lewat tombol/panel.

*4. Anggota tim seleksi*
• \`/addseleksi @tag\` atau reply pesan orang lalu \`/addseleksi\` → orang itu langsung dapat *akun web* (DM username & password) + akses seleksi.
• Satu akun bisa dipakai di *banyak grup seleksi* — asal ditambahkan lewat /addseleksi atau dia pemiliknya.
• Pengaturan tiap grup *terpisah* (kolom, link, akses, deskripsi) di menu Pengaturan grup pada panel.

*5. Kelola kolom isian*
• \`/fieldseleksi +<kolom> [Label]\` → tambah kolom (mis. \`/fieldseleksi +tinggi "Tinggi badan"\`).
• \`/fieldseleksi hapus <kolom>\` → hapus kolom (minimal 1 sisa).

*6. Panel web*
• Link panel: \`https://umi-alz-seleksi.gwenna.my.id/<idAkun>/<slug>/seleksi\`
• Masuk dengan akun web → lihat pendaftar, ACC/TOLAK, atur pengaturan grup (pemilik), kelola kolom & akses.

*Catatan:*
• Tombol Terima/Tolak di notifikasi grup seleksi langsung menambahkan pendaftar ke grup tujuan.
• Ganti password web di menu Profil setelah dapat akun pertama kali.`

const handler = async (m) => m.reply(TUTORIAL)
handler.command = /^(tutorialseleksi|panduanseleksi)$/i
handler.help = ['tutorialseleksi']
handler.tags = ['info']
handler.description = 'Panduan lengkap sistem seleksi member grup'

export default handler
