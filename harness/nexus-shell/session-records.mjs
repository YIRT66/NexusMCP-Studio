// Append only changes to the canonical native log. JSON projections can be
// rebuilt from these records; unchanged historical messages are never copied.
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function deltaFor(previous, next) {
  const { messages = [], calls = [], timeline: _timeline, ...metadata } = next;
  const { messages: oldMessages = [], calls: oldCalls = [], timeline: _oldTimeline, ...oldMetadata } = previous || {};
  const patch = { metadata: {}, unset: [], messages: [], calls: [] };
  for (const [field, value] of Object.entries(metadata)) if (!equal(oldMetadata[field], value)) patch.metadata[field] = value;
  patch.unset = Object.keys(oldMetadata).filter(field => !(field in metadata));
  for (const [field, values, old] of [['messages', messages, oldMessages], ['calls', calls, oldCalls]]) {
    const prior = new Map(old.map(item => [item.id, item]));
    patch[field] = values.filter(item => !equal(prior.get(item.id), item));
    const order = values.map(item => item.id);
    if (!equal(old.map(item => item.id), order)) patch[field + 'Order'] = order;
  }
  return Object.keys(patch.metadata).length || patch.unset.length || patch.messages.length || patch.calls.length || patch.messagesOrder || patch.callsOrder ? patch : null;
}
export function applyDelta(previous, patch) {
  const result = { ...previous, ...patch.metadata };
  for (const field of patch.unset || []) delete result[field];
  for (const field of ['messages', 'calls']) {
    const values = new Map((previous?.[field] || []).map(item => [item.id, item]));
    for (const item of patch[field] || []) values.set(item.id, item);
    result[field] = patch[field + 'Order'] ? patch[field + 'Order'].map(id => values.get(id)).filter(Boolean) : [...values.values()];
  }
  result.timeline = [...result.messages.map(m => ({ id: m.id, kind: 'message', at: m.createdAt || 0 })), ...result.calls.map(c => ({ id: c.id, kind: 'tool', at: c.startedAt || 0 }))].sort((a, b) => a.at - b.at);
  return result;
}
export function foldRecords(records) {
  let snapshot = null;
  for (const record of records) {
    if (record?.type === 'plugin:nexus.snapshot') snapshot = record.data;
    if (record?.type === 'plugin:nexus.delta') snapshot = applyDelta(snapshot, record.data);
  }
  return snapshot;
}
