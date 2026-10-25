/* Task110 — cache metadata grup harus tahan 403/404 tanpa melempar error mentah. */
import { createGroupMetadataCache } from '../lib/group-metadata-cache.js'

const hasil = []
const cek = (nama, lulus, info = '') => { hasil.push(lulus); console.log(`${lulus ? 'LULUS' : 'GAGAL'} · ${nama}${info ? ' — ' + info : ''}`) }

const boom = (status, message) => Object.assign(new Error(message), { isBoom: true, data: status })

function api403() {
  const c = createGroupMetadataCache({ fetchGroup: async () => { throw boom(403, 'forbidden') } })
  return c
}

// 1. 403 tanpa cache lama → error bertipe jelas (bukan Boom mentah)
{
  const c = api403()
  let err = null
  try { await c.get('120363000000000001@g.us') } catch (e) { err = e }
  cek('403 → kode GROUP_FORBIDDEN', err?.code === 'GROUP_FORBIDDEN', String(err?.message).slice(0, 70))
  cek('403 → bukan Boom mentah', err?.isBoom !== true && err?.code !== undefined)
}

// 2. 404 item-not-found → GROUP_NOT_FOUND (dulu lolos mentah)
{
  const c = createGroupMetadataCache({ fetchGroup: async () => { throw boom(404, 'item-not-found') } })
  let err = null
  try { await c.get('120363000000000001@g.us') } catch (e) { err = e }
  cek('404 → kode GROUP_NOT_FOUND', err?.code === 'GROUP_NOT_FOUND', String(err?.message).slice(0, 70))
  cek('404 → pesan untuk pengguna', /tidak ditemukan/i.test(String(err?.message || '')))
}

// 3. 403 setelah punya cache lama → pakai cache (pengiriman tetap jalan)
{
  let n = 0
  const c = createGroupMetadataCache({
    ttlMs: 1,
    fetchGroup: async () => {
      n++
      if (n === 1) return { subject: 'Grup Uji', participants: [{ id: '6281@s.whatsapp.net' }] }
      throw boom(403, 'forbidden')
    }
  })
  const awal = await c.get('1@g.us')
  await new Promise(r => setTimeout(r, 5))
  const kedua = await c.get('1@g.us')
  cek('403 dengan cache lama → tetap dapat metadata', kedua?.subject === awal.subject, kedua?.subject)
}

// 4. Grup normal tetap bekerja
{
  const c = createGroupMetadataCache({ fetchGroup: async () => ({ subject: 'Sehat', participants: [{ id: '1@s.whatsapp.net' }] }) })
  const data = await c.get('2@g.us')
  cek('grup normal → metadata terbaca', data?.subject === 'Sehat')
}

// 5. JID yang sudah diblokir tidak menembak WhatsApp berulang
{
  let panggilan = 0
  const c = createGroupMetadataCache({ fetchGroup: async () => { panggilan++; throw boom(404, 'item-not-found') } })
  await c.get('3@g.us').catch(() => {})
  await c.get('3@g.us').catch(() => {})
  await c.get('3@g.us').catch(() => {})
  cek('JID bermasalah hanya ditanya sekali', panggilan === 1, `panggilan=${panggilan}`)
}

// 6. Rate limit tetap ditangani setelah perubahan
{
  const c = createGroupMetadataCache({ fetchGroup: async () => { throw Object.assign(new Error('rate-overlimit'), { data: 429 }) } })
  let err = null
  try { await c.get('4@g.us') } catch (e) { err = e }
  cek('429 tetap dilempar sebagai rate limit', Boolean(err), String(err?.message).slice(0, 50))
}

const gagal = hasil.filter(x => !x).length
console.log(`\n${hasil.length - gagal}/${hasil.length} lulus`)
process.exit(gagal ? 1 : 0)
