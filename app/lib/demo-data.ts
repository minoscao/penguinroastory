import type {
  Bean,
  Customer,
  Profile,
  RoastOrder,
  OrderEvent,
  Status,
} from './model';

/** Fictional records only. Stable IDs make imports repeat-safe. */
export function makeDemoDataset(anchor = new Date().toISOString()) {
  const base = Date.parse(anchor);
  const ago = (days: number, hours = 0) =>
    new Date(base - days * 86400000 - hours * 3600000).toISOString();
  const due = (days: number) =>
    new Date(base + days * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
  const beans: Bean[] = [
    {
      id: 'demo-v1-bean-ethiopia',
      name: '埃塞俄比亚 · 耶加雪菲',
      origin: '埃塞俄比亚 / 耶加雪菲',
      process: '水洗',
      variety: '当地原生种',
      notes: '茉莉花、柑橘、白桃。干净明亮，适合清爽的日常手冲。',
      image_key: 'floral',
      is_demo: 1,
      created_at: ago(30),
      updated_at: ago(30),
    },
    {
      id: 'demo-v1-bean-colombia',
      name: '哥伦比亚 · 慧兰',
      origin: '哥伦比亚 / 慧兰',
      process: '蜜处理',
      variety: '卡杜拉',
      notes: '红色水果、焦糖、蜂蜜。甜感圆润，手冲和美式都很讨喜。',
      image_key: 'fruity',
      is_demo: 1,
      created_at: ago(29),
      updated_at: ago(29),
    },
    {
      id: 'demo-v1-bean-brazil',
      name: '巴西 · 喜拉多',
      origin: '巴西 / 喜拉多',
      process: '日晒',
      variety: '黄波旁',
      notes: '黑巧克力、榛果、奶油。醇厚扎实，适合意式和牛奶咖啡。',
      image_key: 'cocoa',
      is_demo: 1,
      created_at: ago(28),
      updated_at: ago(28),
    },
  ];
  const people = [
    ['林小满', '手冲爱好者，喜欢花香和柑橘，通常每次订 500g。'],
    ['陈一舟', '家用意式机，偏爱巧克力和坚果，希望酸度柔和。'],
    ['周予安', '每周末做手冲，喜欢红色水果与蜂蜜甜感。'],
    ['许知夏', '日常做冰美式，偏好清爽、不明显苦涩的风味。'],
    ['吴沐晨', '办公室自用，手冲与挂耳均可，少量多次。'],
    ['唐嘉禾', '家里喜欢做拿铁，想要更明显的坚果和奶油感。'],
    ['陆星野', '刚开始学习手冲，喜欢稳定、容易冲煮的方案。'],
    ['苏晚晴', '偏好温柔的甜感，偶尔买豆作为礼物。'],
  ];
  const businesses = [
    [
      '山岚咖啡',
      '小岚',
      '社区咖啡馆，以奶咖为主。每袋 1kg，优先保持出品稳定。',
    ],
    ['日常面包房', '阿杰', '早餐咖啡搭配面包，偏好坚果、可可风味。'],
    ['未迟书店', '小迟', '书店吧台用豆，主推手冲，希望有清晰的花果香。'],
    ['栖木设计工作室', '小木', '办公室咖啡，团队喜欢均衡、低苦感的美式。'],
    ['南窗咖啡馆', '阿南', '季节手冲轮换，希望保留豆子本身的明亮风味。'],
    ['木白民宿', '小白', '早餐服务用豆，以全自动咖啡机为主。'],
    ['岛屿烘焙坊', '阿屿', '甜品搭配咖啡，喜欢焦糖甜感和柔和口感。'],
    ['青禾创意社', '小禾', '会议接待与日常饮用，按月补充意式用豆。'],
  ];
  const customers: Customer[] = [
    ...people.map(([name, notes], i) => ({
      id: 'demo-v1-customer-person-' + (i + 1),
      name,
      customer_type: 'individual' as const,
      contact: name,
      phone: '模拟联系 P' + String(i + 1).padStart(2, '0'),
      notes,
      is_demo: 1,
      created_at: ago(26 - i),
      updated_at: ago(26 - i),
    })),
    ...businesses.map(([name, contact, notes], i) => ({
      id: 'demo-v1-customer-business-' + (i + 1),
      name,
      customer_type: 'business' as const,
      contact,
      phone: '模拟联系 B' + String(i + 1).padStart(2, '0'),
      notes,
      is_demo: 1,
      created_at: ago(18 - i),
      updated_at: ago(18 - i),
    })),
  ];
  const profiles: Profile[] = beans.flatMap((bean, i) =>
    [0, 1].map((variant) => {
      const end = variant === 0 ? 600 + i * 35 : 660 + i * 40;
      const temperature = variant === 0 ? 198 + i * 4 : 205 + i * 5;
      return {
        id: 'demo-v1-profile-' + i + '-' + variant,
        bean_id: bean.id,
        name:
          variant === 0
            ? ['花香手冲', '蜂蜜手冲', '坚果美式'][i]
            : ['清甜美式', '焦糖意式', '醇厚奶咖'][i],
        roast_level:
          variant === 0
            ? ['浅烘焙', '中浅烘焙', '中烘焙'][i]
            : ['中浅烘焙', '中烘焙', '中深烘焙'][i],
        machine: '演示烘焙机',
        batch_grams: variant === 0 ? 1000 : 5000,
        is_demo: 1,
        revision: 1,
        notes:
          '模拟参数，仅用于体验软件和查看曲线。请按自己的设备重新设置，不要直接用于实际烘焙。',
        created_at: ago(27),
        updated_at: ago(27),
        points: [
          {
            stage: '入豆',
            seconds: 0,
            temperature: 190 + i * 5,
            power: 70,
            fan: 20,
          },
          {
            stage: '回温',
            seconds: 85 + i * 5,
            temperature: 88 + i * 3,
            power: 65,
            fan: 25,
          },
          {
            stage: '转黄',
            seconds: 270 + i * 15,
            temperature: 151 + i * 2,
            power: 50,
            fan: 40,
          },
          {
            stage: '一爆',
            seconds: end - 85,
            temperature: temperature - 12,
            power: 35,
            fan: 65,
          },
          { stage: '下豆', seconds: end, temperature, power: 20, fan: 80 },
        ],
      };
    }),
  );
  const orders: RoastOrder[] = [];
  const events: OrderEvent[] = [];
  for (let i = 0; i < 24; i++) {
    const customer = customers[i % 16],
      bean = beans[i % 3];
    const profile =
      profiles[(i % 3) * 2 + (customer.customer_type === 'business' ? 1 : 0)];
    const status: Status =
      i < 8 ? 'waiting' : i < 14 ? 'roasting' : 'completed';
    const created = ago(
      status === 'completed' ? i - 12 : 0,
      status === 'completed' ? 2 : i + 1,
    );
    const started =
      status === 'waiting'
        ? null
        : new Date(Date.parse(created) + 1800000).toISOString();
    const completed =
      status === 'completed'
        ? new Date(Date.parse(created) + 7200000).toISOString()
        : null;
    const id = 'demo-v1-order-' + String(i + 1).padStart(3, '0');
    const order: RoastOrder = {
      id,
      code: 'DEMO-' + String(i + 1).padStart(3, '0'),
      customer_id: customer.id,
      bean_id: bean.id,
      profile_id: profile.id,
      customer_name: customer.name,
      bean_name: bean.name,
      sku_id: ['demo-v2-sku-ethiopia', 'demo-v2-sku-colombia', 'demo-v2-sku-brazil'][i % 3],
      sku_snapshot: null,
      profile_snapshot: profile,
      quantity_grams:
        customer.customer_type === 'individual'
          ? [250, 500, 1000, 1500][i % 4]
          : [5000, 8000, 12000, 20000][i % 4],
      batch_count: customer.customer_type === 'individual' ? 1 : 2 + (i % 4),
      stock_deducted_grams: 0,
      due_date: due(status === 'completed' ? -(i - 13) : i % 3),
      notes:
        '模拟订单 · ' +
        (customer.customer_type === 'individual'
          ? '每袋 250g，整豆，保留烘焙日期。'
          : '每袋 1kg，整豆，外袋贴烘焙日期。'),
      is_demo: 1,
      status,
      created_at: created,
      started_at: started,
      completed_at: completed,
      updated_at: completed || started || created,
    };
    orders.push(order);
    events.push({
      id: id + '-created',
      order_id: id,
      status: 'waiting',
      occurred_at: created,
    });
    if (started)
      events.push({
        id: id + '-started',
        order_id: id,
        status: 'roasting',
        occurred_at: started,
      });
    if (completed)
      events.push({
        id: id + '-completed',
        order_id: id,
        status: 'completed',
        occurred_at: completed,
      });
  }
  return { beans, customers, profiles, orders, events };
}
