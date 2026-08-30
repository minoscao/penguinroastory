import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  customerInput,
  profileInput,
  orderInput,
  nextStatus,
  date,
} from '../lib/validation.ts';

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
