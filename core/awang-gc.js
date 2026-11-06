/* By AlzRiss - Usanagi Umi AI */

import { getAccessModeState, setAccessMode, ACCESS_MODES } from './awang-mode.js'

export function isOnlyGcActive() {
  return getAccessModeState().mode === ACCESS_MODES.ONLY_GC
}

export function setOnlyGcActive(enabled) {
  const state = getAccessModeState()
  /* Task205: `.onlygc off` selalu kembali NORMAL — termasuk saat sedang
   * berada di mode 'off' (.onlypc off), supaya ada jalan keluar yang jelas. */
  const mode = enabled ? ACCESS_MODES.ONLY_GC : (state.mode === ACCESS_MODES.ONLY_GC || state.mode === ACCESS_MODES.OFF ? ACCESS_MODES.NORMAL : state.mode)
  if (state.mode === mode) return state
  return setAccessMode(mode)
}

export default {
  isOnlyGcActive,
  setOnlyGcActive,
}
