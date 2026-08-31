export type Status = 'waiting' | 'roasting' | 'completed';
export type Customer = {
  id: string;
  customer_type: 'individual' | 'business' | 'unspecified';
  is_demo: number;
  order_count?: number;
  active_orders?: number;
  total_grams?: number;
  last_order_at?: string | null;
  name: string;
  contact: string;
  phone: string;
  notes: string;
  created_at: string;
  updated_at: string;
};
export type Bean = {
  id: string;
  image_key: string;
  is_demo: number;
  name: string;
  origin: string;
  process: string;
  variety: string;
  notes: string;
  created_at: string;
  updated_at: string;
};
export type Point = {
  stage: string;
  seconds: number;
  temperature: number;
  power: number;
  fan: number;
};
export type Profile = {
  id: string;
  is_demo: number;
  bean_id: string;
  name: string;
  roast_level: string;
  machine: string;
  batch_grams: number;
  points: Point[];
  notes: string;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type RoastOrder = {
  id: string;
  is_demo: number;
  code: string;
  customer_id: string;
  bean_id: string;
  profile_id: string;
  customer_name: string;
  bean_name: string;
  profile_snapshot: Profile;
  quantity_grams: number;
  due_date: string;
  notes: string;
  status: Status;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};
export type OrderEvent = {
  id: string;
  order_id: string;
  status: Status;
  occurred_at: string;
};
export type Catalog = {
  customers: Customer[];
  beans: Bean[];
  profiles: Profile[];
  stats: Record<Status, number>;
  demo_counts?: {
    customers: number;
    beans: number;
    profiles: number;
    orders: number;
  };
};
export const statusLabels: Record<Status, string> = {
  waiting: '等待烘焙',
  roasting: '正在烘焙',
  completed: '已完成',
};
export function timeLabel(seconds: number) {
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
