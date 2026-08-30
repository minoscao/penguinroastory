import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = process.env.TEST_ORIGIN || 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname))
  throw new Error('Integration tests may only write to a local test database');
const endpoint = origin + '/api/roastery';
const records = {
  customer: null,
  bean: null,
  profile: null,
  order: crypto.randomUUID(),
};
await mkdir('work', { recursive: true });
const persist = () =>
  writeFile('work/integration-records.json', JSON.stringify(records));
async function call(method, payload, expected = 200) {
  const r = await fetch(endpoint, {
    method: method === 'POST' ? 'POST' : 'PATCH',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  assert.equal(r.status, expected, JSON.stringify(data));
  return data;
}
async function get(query) {
  const r = await fetch(endpoint + '?' + new URLSearchParams(query));
  assert.equal(r.status, 200);
  return r.json();
}
try {
  const customer = await call(
    'POST',
    {
      kind: 'customer',
      name: '测试专用客户-' + records.order,
      contact: '流程验证',
      notes: '自动检查使用，不是真实客户',
    },
    201,
  );
  records.customer = customer.id;
  await persist();
  const bean = await call(
    'POST',
    {
      kind: 'bean',
      name: '测试专用豆子-' + records.order,
      origin: '测试产区',
      process: '水洗',
    },
    201,
  );
  records.bean = bean.id;
  await persist();
  const profileBody = {
    kind: 'profile',
    bean_id: bean.id,
    name: '测试专用方案',
    roast_level: '浅烘焙',
    batch_grams: 1000,
    points: [
      { stage: '入豆', seconds: 0, temperature: 190, power: 70, fan: 20 },
      { stage: '回温', seconds: 90, temperature: 90, power: 65, fan: 20 },
      { stage: '下豆', seconds: 600, temperature: 200, power: 30, fan: 80 },
    ],
  };
  const profile = await call('POST', profileBody, 201);
  records.profile = profile.id;
  await persist();
  const body = {
    kind: 'order',
    id: records.order,
    customer_id: customer.id,
    bean_id: bean.id,
    profile_id: profile.id,
    quantity_grams: 3000,
    due_date: '2026-09-01',
    notes: '完整流程验证',
  };
  await call('POST', { ...body, quantity_grams: 0 }, 400);
  const order = await call('POST', body, 201);
  const duplicate = await call('POST', body);
  assert.equal(order.id, duplicate.id);
  assert.equal(
    (await get({ kind: 'orders', q: records.order, status: 'waiting' })).total,
    1,
  );
  await call(
    'PATCH',
    { kind: 'status', id: order.id, status: 'completed' },
    409,
  );
  await call('PATCH', {
    ...profileBody,
    id: profile.id,
    name: '修改后的方案',
    revision: 1,
  });
  await call('PATCH', { ...profileBody, id: profile.id, revision: 1 }, 409);
  assert.equal(
    (await get({ kind: 'detail', id: order.id })).order.profile_snapshot.name,
    '测试专用方案',
  );
  await call('PATCH', { kind: 'status', id: order.id, status: 'roasting' });
  assert.equal(
    (await get({ kind: 'orders', q: records.order, status: 'roasting' })).total,
    1,
  );
  await Promise.all([
    call('PATCH', { kind: 'status', id: order.id, status: 'completed' }),
    call('PATCH', { kind: 'status', id: order.id, status: 'completed' }).catch(
      (e) => {
        if (!String(e).includes('409')) throw e;
      },
    ),
  ]);
  const completed = await get({ kind: 'detail', id: order.id });
  assert.equal(completed.order.status, 'completed');
  assert.ok(completed.order.completed_at);
  assert.equal(completed.events.length, 3);
  assert.equal(
    (await get({ kind: 'orders', q: records.order, status: 'completed' }))
      .total,
    1,
  );
  assert.equal(
    (await get({ kind: 'orders', q: records.order, status: 'waiting' })).total,
    0,
  );
  await call(
    'PATCH',
    { kind: 'status', id: order.id, status: 'roasting' },
    409,
  );
  const cross = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://unrelated.example',
    },
    body: JSON.stringify({ kind: 'customer', name: 'must not save' }),
  });
  assert.equal(cross.status, 403);
  console.log(
    'PASS: create/edit catalogs, parameter snapshots, duplicate submission, complete lifecycle, search/status filters, concurrent completion, timestamps, cross-origin rejection',
  );
} finally {
  await persist();
  console.log('Local test record IDs saved for targeted cleanup.');
}
