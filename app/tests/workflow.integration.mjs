import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const origin = process.env.TEST_ORIGIN || 'http://localhost:3001';
if (!['localhost', '127.0.0.1'].includes(new URL(origin).hostname))
  throw new Error('Integration tests may only write to a local test database');
const endpoint = origin + '/api/roastery';
const records = {
  customer: null,
  bean: null,
  sku: null,
  profile: null,
  order: crypto.randomUUID(),
  orders: [],
  shipments: [],
  shipment: null,
};
await mkdir('work', { recursive: true });
const persist = () =>
  writeFile('work/integration-records.json', JSON.stringify(records));
async function call(method, payload, expected = 200) {
  const r = await fetch(endpoint, {
    method:
      method === 'POST' ? 'POST' : method === 'PATCH' ? 'PATCH' : 'DELETE',
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
  assert.equal(
    (await get({ kind: 'operations', source: 'all' })).active_orders.filter(
      (o) => o.status === 'roasting',
    ).length,
    0,
    'Use ROASTORY_TEST_DATA=1 with a separate development server',
  );
  records.customer = (
    await call(
      'POST',
      {
        kind: 'customer',
        name: '流程验证客户',
        contact: '测试联系人',
        customer_type: 'business',
      },
      201,
    )
  ).id;
  await persist();
  records.bean = (
    await call(
      'POST',
      {
        kind: 'bean',
        name: '流程验证 · 埃塞水洗',
        origin: '埃塞俄比亚',
        altitude: '1900–2200 m',
        process: '水洗',
      },
      201,
    )
  ).id;
  await persist();
  records.sku = (
    await call(
      'POST',
      {
        kind: 'sku',
        bean_id: records.bean,
        label: '本地验证批次',
        stock_grams: 5000,
      },
      201,
    )
  ).id;
  await persist();
  const profileBody = {
    kind: 'profile',
    bean_id: records.bean,
    name: '手冲浅烘参考',
    roast_level: '浅烘焙',
    machine: 'Sandouke 600',
    batch_grams: 600,
    points: [
      { stage: '入豆', seconds: 0, temperature: 205 },
      { stage: '回温', seconds: 90, temperature: 98.2, fan: 0 },
      { stage: '出豆', seconds: 500, temperature: 198.5, fan: 55 },
    ],
  };
  records.profile = (await call('POST', profileBody, 201)).id;
  await persist();
  const makeOrder = async (id, grams) => {
    records.orders.push(id);
    await persist();
    return call(
      'POST',
      {
        kind: 'order',
        id,
        customer_id: records.customer,
        bean_id: records.bean,
        quantity_grams: grams,
        due_date: '2026-10-01',
      },
      201,
    );
  };
  await makeOrder(records.order, 250);
  const other = crypto.randomUUID();
  await makeOrder(other, 250);
  const competing = crypto.randomUUID();
  await makeOrder(competing, 200);
  await call('POST', {
    kind: 'order',
    id: records.order,
    customer_id: records.customer,
    bean_id: records.bean,
    quantity_grams: 250,
    due_date: '2026-10-01',
  });
  const catalog = await get({ kind: 'catalog', source: 'all' });
  assert.equal(
    catalog.skus.find((s) => s.id === records.sku).stock_grams,
    4300,
    'retry must not deduct stock twice',
  );
  assert.equal(
    catalog.beans.find((b) => b.id === records.bean).altitude,
    '1900–2200 m',
  );
  assert.ok(
    catalog.profiles.every((p) => !p.id.startsWith('pending-profile-')),
  );
  await call(
    'PATCH',
    { kind: 'status', id: records.order, status: 'roasting' },
    409,
  );
  const record = {
    startedAt: Date.now(),
    machine: 'Sandouke 600',
    chargedGrams: 600,
    target: {
      temperature: '198.5',
      label: '浅烘目标',
      level: '浅烘焙',
      machine: 'Sandouke 600',
      profileId: records.profile,
      profileName: '手冲浅烘参考',
    },
    records: [{ stage: '入豆', seconds: 0, temperature: 205 }],
  };
  const ids = [records.order, other];
  await call('PATCH', {
    kind: 'roast-start',
    ids,
    expected_revision: 0,
    record,
  });
  await call(
    'PATCH',
    { kind: 'roast-start', ids: [competing], expected_revision: 0, record },
    409,
  );
  await call(
    'PATCH',
    {
      kind: 'roast-record',
      ids: [records.order],
      expected_revision: 1,
      record,
    },
    409,
  );
  record.records.push(
    { stage: '回温', seconds: 80, temperature: 98.2, fan: 0 },
    { stage: '转黄', seconds: 210, temperature: 146.3, fan: 3.5 },
  );
  await call('PATCH', {
    kind: 'roast-record',
    ids,
    expected_revision: 1,
    record,
  });
  await call(
    'PATCH',
    {
      kind: 'roast-record',
      ids,
      expected_revision: 1,
      record: { ...record, records: [] },
    },
    409,
  );
  const restored = (await get({ kind: 'detail', id: other })).order;
  assert.deepEqual(restored.roast_record.orderIds, ids);
  assert.equal(restored.roast_record.records[2].fan, 3.5);
  assert.equal(restored.roast_revision, 2);
  await call('PATCH', {
    ...profileBody,
    id: records.profile,
    name: '新的参考方案',
    revision: 1,
  });
  await call(
    'PATCH',
    { ...profileBody, id: records.profile, revision: 1 },
    409,
  );
  assert.equal(
    (await get({ kind: 'detail', id: other })).order.roast_record
      .referenceProfile.name,
    '手冲浅烘参考',
    'the roast reference must remain immutable',
  );
  assert.equal(
    (
      await get({ kind: 'operations', date: '2001-01-01' })
    ).active_orders.filter((o) => o.status === 'roasting').length,
    2,
    'date filter must not hide the occupied machine',
  );
  record.records.push(
    { stage: '一爆', seconds: 430, temperature: 194.2, fan: 5.5 },
    { stage: '出豆', seconds: 492, temperature: 198.5, fan: 6 },
  );
  await call('PATCH', {
    kind: 'roast-finish',
    ids,
    expected_revision: 2,
    record,
  });
  const completed = await get({ kind: 'detail', id: records.order });
  assert.equal(completed.order.status, 'completed');
  assert.equal(completed.events.length, 3);
  assert.ok(
    !completed.order.roast_record.records.some((p) => p.stage === '二爆'),
  );
  record.records[1].seconds = 91;
  await call('PATCH', {
    kind: 'roast-record',
    ids,
    expected_revision: 3,
    record,
  });
  assert.equal(
    (await get({ kind: 'detail', id: other })).order.roast_record.records[1]
      .seconds,
    91,
  );
  const shipmentBody = {
    kind: 'shipment',
    order_id: records.order,
    customer_name: '流程验证客户',
    carrier: '顺丰',
    tracking_number: 'SF-LOCAL-TEST-001',
    is_sample: 0,
  };
  records.shipment = (await call('POST', shipmentBody, 201)).id;
  records.shipments.push(records.shipment);
  await persist();
  await call('POST', shipmentBody, 409);
  await call('PATCH', {
    kind: 'shipment-status',
    id: records.shipment,
    status: 'delivered',
  });
  assert.equal(
    (await get({ kind: 'operations' })).shipments.find(
      (s) => s.id === records.shipment,
    ).status,
    'delivered',
  );
  assert.ok(
    !(await get({ kind: 'operations' })).completed_orders.some(
      (o) => o.id === records.order,
    ),
  );
  await call('DELETE', { kind: 'customer', id: records.customer }, 409);
  await call('DELETE', { kind: 'bean', id: records.bean }, 409);
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
  }).format(new Date());
  for (const filter of [today, today.slice(0, 7), today.slice(0, 4)]) {
    const filtered = await get({
      kind: 'orders',
      date: filter,
      customer_id: records.customer,
    });
    assert.ok(
      filtered.orders.some((o) => o.id === records.order),
      'day/month/year filter preserves matching order',
    );
  }
  assert.ok(
    !(await get({ kind: 'operations', date: '2001' })).completed_orders.some(
      (o) => o.id === records.order,
    ),
    'already shipped order never returns to waiting shipment',
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
    'PASS: archive, altitude, inventory retry, linked roast, machine exclusion, cross-device conflict, immutable reference, optional second crack, correction, shipment, deletion protection, origin safety',
  );
} finally {
  await persist();
  console.log('Exact local IDs saved for cleanup and UI review.');
}
