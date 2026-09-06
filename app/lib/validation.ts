export class InputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InputError('提交内容格式不正确。');
  return value as Record<string, unknown>;
}
export function text(
  value: unknown,
  label: string,
  max = 200,
  required = false,
): string {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw new InputError(label + '格式不正确。');
  const result = (value as string).trim();
  if (required && !result) throw new InputError('请填写' + label + '。');
  if (result.length > max)
    throw new InputError(label + '不能超过' + max + '字。');
  return result;
}
export function number(
  value: unknown,
  label: string,
  min: number,
  max: number,
  integer = false,
) {
  if (
    value === '' ||
    value === null ||
    value === undefined ||
    (typeof value !== 'number' && typeof value !== 'string')
  )
    throw new InputError('请填写' + label + '。');
  const n = Number(value);
  if (
    !Number.isFinite(n) ||
    n < min ||
    n > max ||
    (integer && !Number.isInteger(n))
  )
    throw new InputError(
      label +
        '应在' +
        min +
        '至' +
        max +
        '之间' +
        (integer ? '，并使用整数。' : '。'),
    );
  return n;
}
export function date(value: unknown) {
  const s = text(value, '交付日期', 10);
  if (
    s &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(s) ||
      !Number.isFinite(Date.parse(s)) ||
      new Date(s).toISOString().slice(0, 10) !== s)
  )
    throw new InputError('请填写有效的交付日期。');
  return s;
}
export function customerInput(v: unknown) {
  const b = object(v);
  const customer_type = text(b.customer_type ?? 'unspecified', '客户类型', 20);
  if (!['individual', 'business', 'unspecified'].includes(customer_type))
    throw new InputError('请选择个人客户或企业客户。');
  return {
    customer_type,
    name: text(b.name, '客户名称', 100, true),
    contact: text(b.contact, '联系人', 100),
    phone: text(b.phone, '联系方式', 60),
    notes: text(b.notes, '偏好与备注', 2000),
  };
}
export function beanInput(v: unknown) {
  const b = object(v);
  const image_key = text(b.image_key, '风味示意图', 20);
  if (!['', 'floral', 'fruity', 'cocoa'].includes(image_key))
    throw new InputError('请选择提供的风味示意图。');
  return {
    image_key,
    name: text(b.name, '豆子名称', 100, true),
    origin: text(b.origin, '产地', 100),
    process: text(b.process, '处理法', 100),
    variety: text(b.variety, '品种', 100),
    notes: text(b.notes, '风味与备注', 2000),
  };
}
export function skuInput(v: unknown) {
  const b = object(v);
  return {
    bean_id: text(b.bean_id, '豆子产品', 80, true),
    label: text(b.label, '规格名称', 100, true),
    harvest_year: text(b.harvest_year, '年份', 20),
    process: text(b.process, '处理法', 100),
    altitude_m: number(b.altitude_m || 0, '海拔', 0, 10000, true),
    batch_code: text(b.batch_code, '批次编号', 80),
    stock_grams: number(b.stock_grams || 0, '初始库存（克）', 0, 100000000, true),
  };
}
export function profileInput(v: unknown) {
  const b = object(v);
  if (!Array.isArray(b.points) || b.points.length < 2 || b.points.length > 30)
    throw new InputError('烘焙曲线需要 2 至 30 个记录点。');
  let last = -1;
  const points = b.points.map((raw: unknown, i: number) => {
    const p = object(raw);
    const seconds = number(p.seconds, '时间（秒）', 0, 7200, true);
    if (seconds <= last || (i === 0 && seconds !== 0))
      throw new InputError('第一个点应为 0 秒，后续时间必须依次增加。');
    last = seconds;
    return {
      stage: text(p.stage, '阶段名称', 30, true),
      seconds,
      temperature: number(p.temperature, '豆温（℃）', 0, 350),
      power: number(p.power, '火力（%）', 0, 100),
      fan: number(p.fan, '风门（%）', 0, 100),
    };
  });
  return {
    bean_id: text(b.bean_id, '豆子', 80, true),
    name: text(b.name, '方案名称', 100, true),
    roast_level: text(b.roast_level, '烘焙度', 50, true),
    machine: text(b.machine, '烘焙机', 100),
    batch_grams: number(b.batch_grams, '方案投豆量（克）', 1, 1000000, true),
    points,
    notes: text(b.notes, '方案备注', 2000),
  };
}
export function orderInput(v: unknown) {
  const b = object(v);
  const id = text(b.id, '订单识别码', 80, true);
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw new InputError('订单识别码无效，请重新打开新建订单。');
  return {
    id,
    customer_id: text(b.customer_id, '客户', 80, true),
    bean_id: text(b.bean_id, '豆子', 80, true),
    sku_id: text(b.sku_id, '豆子规格', 80, true),
    profile_id: text(b.profile_id, '烘焙方案', 80, true),
    quantity_grams: number(
      b.quantity_grams,
      '订购熟豆重量（克）',
      1,
      100000000,
      true,
    ),
    batch_count: number(b.batch_count ?? 1, '烘焙仓数', 1, 1000, true),
    due_date: date(b.due_date),
    notes: text(b.notes, '订单备注', 2000),
  };
}
export function inventoryInput(v: unknown) {
  const b = object(v);
  return {
    sku_id: text(b.sku_id, '豆子规格', 80, true),
    delta_grams: number(b.delta_grams, '库存变动重量（克）', -100000000, 100000000, true),
    notes: text(b.notes, '库存备注', 500),
  };
}
export function shipmentInput(v: unknown) {
  const b = object(v);
  return {
    order_id: text(b.order_id, '订单', 80),
    customer_name: text(b.customer_name, '客户名称', 100, true),
    carrier: text(b.carrier, '快递公司', 50, true),
    tracking_number: text(b.tracking_number, '快递单号', 100, true),
    is_sample: number(b.is_sample ?? 0, '样品标记', 0, 1, true),
    notes: text(b.notes, '发货备注', 500),
  };
}
export function nextStatus(current: string, target: string) {
  if (
    !(
      (current === 'waiting' && target === 'roasting') ||
      (current === 'roasting' && target === 'completed')
    )
  )
    throw new InputError('订单进度已变化，请刷新后再操作。', 409);
  return target;
}
