/* Uji lib/message-response.js — Task104
 * Fokus: balasan tombol native (nested interactiveResponseMessage) harus
 * menghasilkan command id, karena inilah penyebab menu "tidak merespons".
 */
import assert from 'node:assert/strict'

const { extractSelectionId } = await import('/home/user/work-task94/single/lib/message-response.js')

let pass = 0
const test = (name, fn) => { fn(); pass += 1; console.log('  ✓', name) }

console.log('message-response tests')

test('list segar (singleSelectReply.selectedRowId)', () => {
  assert.equal(extractSelectionId({ singleSelectReply: { selectedRowId: '.allmenu' } }), '.allmenu')
})

test('list response utuh (listResponseMessage)', () => {
  assert.equal(extractSelectionId({ listResponseMessage: { singleSelectReply: { selectedRowId: '.kategori game' } } }), '.kategori game')
})

test('button response', () => {
  assert.equal(extractSelectionId({ buttonsResponseMessage: { selectedButtonId: '.owner' } }), '.owner')
})

test('template button', () => {
  assert.equal(extractSelectionId({ templateButtonReplyMessage: { selectedId: '.ping' } }), '.ping')
})

test('native flow datar (nativeFlowResponseMessage.paramsJson)', () => {
  assert.equal(extractSelectionId({ nativeFlowResponseMessage: { paramsJson: '{"id":".menu"}' } }), '.menu')
})

test('native flow BERSARANG — kasus yang dulu gagal', () => {
  const msg = { interactiveResponseMessage: { nativeFlowResponseMessage: { name: 'single_select', paramsJson: '{"id":".allmenu"}' } } }
  assert.equal(extractSelectionId(msg), '.allmenu')
})

test('paramsJson dengan selectedRowId', () => {
  const msg = { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{"selectedRowId":".menu_owner"}' } } }
  assert.equal(extractSelectionId(msg), '.menu_owner')
})

test('paramsJson rusak → string kosong, tidak melempar', () => {
  const msg = { interactiveResponseMessage: { nativeFlowResponseMessage: { paramsJson: '{bukan json' } } }
  assert.equal(extractSelectionId(msg), '')
})

test('tanpa id → string kosong', () => {
  assert.equal(extractSelectionId({}), '')
  assert.equal(extractSelectionId(null), '')
  assert.equal(extractSelectionId({ interactiveResponseMessage: { body: { text: 'Semua Fitur' } } }), '')
})

test('id kosong tidak dianggap valid', () => {
  assert.equal(extractSelectionId({ selectedId: '' }), '')
  assert.equal(extractSelectionId({ nativeFlowResponseMessage: { paramsJson: '{"id":""}' } }), '')
})

console.log(`\n${pass} tes lulus`)
