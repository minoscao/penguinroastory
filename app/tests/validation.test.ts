import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  customerInput,
  beanInput,
  profileInput,
  orderInput,
  nextStatus,
  date,
} from '../lib/validation.ts';
import { makeDemoDataset } from '../lib/demo-data.ts';

void test('个人和企业客户分别保存，旧档案类型不擅自推断', () => {
  assert.equal(
    customerInput({ name: '小满', customer_type: 'individual' }).customer_type,
    'individual',
  );
  assert.equal(
    customerInput({ name: '山岚咖啡', customer_type: 'business' })
      .customer_type,
    'business',
  );
  assert.equal(customerInput({ name: '旧档案' }).customer_type, 'unspecified');
  assert.throws(() =>
    customerInput({ name: '客户', customer_type: 'invalid' }),
  );
  assert.equal(
    beanInput({ name: '花香豆子', image_key: 'floral' }).image_key,
    'floral',
  );
  assert.throws(() =>
    beanInput({ name: '豆子', image_key: 'https://untrusted.example/image' }),
  );
});

void test('模拟资料关系完整、状态时间一致，重复生成使用相同标识', () => {
  const data = makeDemoDataset('2026-08-31T02:00:00.000Z');
  const later = makeDemoDataset('2026-09-02T02:00:00.000Z');
  assert.deepEqual(
    [
      data.beans.length,
      data.customers.length,
      data.profiles.length,
      data.orders.length,
      data.events.length,
    ],
    [3, 16, 6, 24, 50],
  );
  assert.equal(
    data.customers.filter((c) => c.customer_type === 'individual').length,
    8,
  );
  assert.equal(
    data.customers.filter((c) => c.customer_type === 'business').length,
    8,
  );
  assert.deepEqual(
    ['waiting', 'roasting', 'completed'].map(
      (s) => data.orders.filter((o) => o.status === s).length,
    ),
    [8, 6, 10],
  );
  assert.equal(new Set(data.orders.map((o) => o.customer_id)).size, 16);
  for (const key of ['beans', 'customers', 'profiles', 'orders'] as const) {
    assert.ok(data[key].every((r) => r.is_demo === 1));
    assert.deepEqual(
      data[key].map((r) => r.id),
      later[key].map((r) => r.id),
    );
  }
  for (const o of data.orders) {
    const p = data.profiles.find((p) => p.id === o.profile_id)!;
    assert.equal(p.bean_id, o.bean_id);
    assert.equal(
      data.customers.find((c) => c.id === o.customer_id)?.name,
      o.customer_name,
    );
    assert.equal(data.beans.find((b) => b.id === o.bean_id)?.name, o.bean_name);
    assert.deepEqual(o.profile_snapshot, p);
    assert.ok(p.created_at <= o.created_at);
    const events = data.events.filter((e) => e.order_id === o.id);
    assert.equal(events.at(-1)?.status, o.status);
    assert.deepEqual(
      events.map((e) => e.occurred_at),
      events.map((e) => e.occurred_at).sort(),
    );
    profileInput(p);
  }
});

const profile = {
  bean_id: 'bean-1',
  name: '手冲方案',
  roast_level: '浅烘焙',
  batch_grams: 1000,
  points: [
    { stage: '入豆', seconds: 0, temperature: 190, power: 65, fan: 20 },
    { stage: '下豆', seconds: 600, temperature: 200, power: 20, fan: 80 },
  ],
};
void test('拒绝无名称的客户和无效交付日期', () => {
  assert.throws(() => customerInput({ name: '  ' }));
  assert.throws(() => date('2026-02-30'));
  assert.equal(date('2028-02-29'), '2028-02-29');
});
void test('曲线时间不能倒退、重复或从非零开始', () => {
  for (const times of [
    [1, 600],
    [0, 0],
    [0, -5],
  ])
    assert.throws(() =>
      profileInput({
        ...profile,
        points: profile.points.map((p, i) => ({ ...p, seconds: times[i] })),
      }),
    );
});
void test('拒绝空参数、非有限数值和超出范围的火力', () => {
  for (const power of ['', NaN, 101, -1])
    assert.throws(() =>
      profileInput({
        ...profile,
        points: profile.points.map((p) => ({ ...p, power })),
      }),
    );
});
void test('有效方案保存所有操作参数', () => {
  assert.deepEqual(profileInput(profile).points, profile.points);
  assert.equal(profileInput(profile).batch_grams, 1000);
});
void test('订购重量必须为正整数克', () => {
  for (const grams of [0, -10, 1.5, Infinity])
    assert.throws(() =>
      orderInput({
        id: crypto.randomUUID(),
        customer_id: 'c',
        bean_id: 'b',
        profile_id: 'p',
        quantity_grams: grams,
      }),
    );
});
void test('状态必须按等待、烘焙、完成的顺序推进', () => {
  assert.equal(nextStatus('waiting', 'roasting'), 'roasting');
  assert.equal(nextStatus('roasting', 'completed'), 'completed');
  for (const pair of [
    ['waiting', 'completed'],
    ['completed', 'roasting'],
    ['roasting', 'waiting'],
    ['waiting', 'unknown'],
  ])
    assert.throws(() => nextStatus(...(pair as [string, string])));
});
