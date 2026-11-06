/* Task205 — helper bersama untuk onlygcset / onlypcset (dipakai berdua). */

export {
  muatConfig,
  simpanConfig,
  tindakanLabel,
  resetHitungan,
} from '../../lib/access-warn.js'

/** Label mode akses saat ini (tanpa I/O berat; SQLite dibaca lazy). */
export async function getModeLabelSederhana() {
  try {
    const mod = await import('../../core/awang-mode.js')
    const s = mod.getAccessModeState()
    if (s.off) return 'ALL BLOCKED (off)'
    if (s.onlygc) return 'ONLY GROUP'
    if (s.onlypc) return 'ONLY PRIVATE'
    return 'NORMAL'
  } catch {
    return 'NORMAL'
  }
}
