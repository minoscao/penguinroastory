import {
  ArrowLeftIcon,
  CalendarIcon,
  CameraIcon,
  CheckCircledIcon,
  ChevronRightIcon,
  ClockIcon,
  DashboardIcon,
  GlobeIcon,
  HomeIcon,
  IdCardIcon,
  LockClosedIcon,
  MinusIcon,
  Pencil2Icon,
  PersonIcon,
  PlusIcon,
  SewingPinIcon,
} from "@radix-ui/react-icons";
import { createContext, useContext, useState, type ReactNode } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { FlowStack, MobileScroll, MobileTextField, type FlowControls, type FlowScreen } from "./mobile";

type EventItem = {
  id: string;
  title: string;
  date: string;
  shortDate: string;
  time: string;
  place: string;
  price: number;
  seats: number;
  image: string;
  tag: string;
  description: string;
};

type Ticket = { event: EventItem; quantity: number; checkedIn: boolean };
type PrototypeState = {
  events: EventItem[];
  setEvents: React.Dispatch<React.SetStateAction<EventItem[]>>;
  ticket: Ticket | null;
  setTicket: React.Dispatch<React.SetStateAction<Ticket | null>>;
};

const initialEvents: EventItem[] = [
  {
    id: "pour-over",
    title: "企鹅手冲咖啡体验课",
    date: "9月12日 · 周六",
    shortDate: "12",
    time: "14:00–16:00",
    place: "企鹅咖啡 · 苏州店",
    price: 128,
    seats: 6,
    image: "/event-assets/hero-penguin-pourover.png",
    tag: "本周主推",
    description: "从闻香、注水到分享一杯咖啡，零基础也能轻松完成。",
  },
  {
    id: "latte",
    title: "企鹅拉花入门课",
    date: "9月19日 · 周六",
    shortDate: "19",
    time: "14:00–16:30",
    place: "企鹅咖啡 · 苏州店",
    price: 168,
    seats: 8,
    image: "/event-assets/event-latte.png",
    tag: "新手友好",
    description: "认识奶泡状态，亲手完成一杯爱心拉花。",
  },
  {
    id: "camp",
    title: "湖畔露营手冲会",
    date: "9月26日 · 周六",
    shortDate: "26",
    time: "15:30–18:00",
    place: "独墅湖公园集合",
    price: 98,
    seats: 10,
    image: "/event-assets/event-camp.png",
    tag: "户外限定",
    description: "带着咖啡去湖边，在傍晚风景里认识新朋友。",
  },
  {
    id: "tasting",
    title: "夜间咖啡风味局",
    date: "10月3日 · 周六",
    shortDate: "03",
    time: "19:00–21:00",
    place: "企鹅咖啡 · 苏州店",
    price: 88,
    seats: 12,
    image: "/event-assets/event-tasting.png",
    tag: "朋友小聚",
    description: "一起品尝三支不同产区的咖啡，找到你喜欢的味道。",
  },
];

const PrototypeContext = createContext<PrototypeState | null>(null);
function usePrototypeState() {
  const value = useContext(PrototypeContext);
  if (!value) throw new Error("Prototype state is missing");
  return value;
}

export default function Prototype() {
  const [events, setEvents] = useState(initialEvents);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  return (
    <PrototypeContext.Provider value={{ events, setEvents, ticket, setTicket }}>
      <FlowStack initial={homeScreen()} />
    </PrototypeContext.Provider>
  );
}

function PenguinMark({ compact = false }: { compact?: boolean }) {
  return (
    <img
      className={compact ? "penguin-mark compact" : "penguin-mark"}
      src="/event-assets/penguin-brand-mark.png"
      alt=""
      aria-hidden="true"
    />
  );
}

function topBar(title: string, back = false) {
  return (flow: FlowControls) => (
    <div className="top-bar">
      {back ? <button className="icon-button" onClick={flow.pop} aria-label="返回"><ArrowLeftIcon /></button> : <PenguinMark />}
      <div className="top-bar-title">{title}</div>
      <div className="top-bar-side">{back ? <PenguinMark compact /> : "苏州"}</div>
    </div>
  );
}

function page(title: string, render: (flow: FlowControls) => ReactNode, footer?: (flow: FlowControls) => ReactNode): FlowScreen {
  return { id: title, header: topBar(title, true), headerHeight: 52, footer, footerHeight: footer ? 78 : 0, render };
}

function homeScreen(): FlowScreen {
  return {
    id: "home",
    header: topBar("企鹅周末"),
    headerHeight: 56,
    footer: (flow) => <HomeFooter flow={flow} />,
    footerHeight: 128,
    render: (flow) => <HomeScreen flow={flow} />,
  };
}

function HomeFooter({ flow }: { flow: FlowControls }) {
  const { events } = usePrototypeState();
  const featured = events[0];
  return (
    <div className="home-footer">
      <button className="home-cta" onClick={() => flow.push(detailScreen(featured))}>
        <span>查看详情</span><strong>立即报名&nbsp; ¥{featured.price}</strong>
      </button>
      <BottomNav flow={flow} active="home" />
    </div>
  );
}

function HomeScreen({ flow }: { flow: FlowControls }) {
  const { events } = usePrototypeState();
  const featured = events[0];
  return (
    <MobileScroll className="app-screen home-screen">
      <main className="home-content">
        <button className="hero-card" onClick={() => flow.push(detailScreen(featured))} aria-label={`查看${featured.title}`}>
          <img src={featured.image} alt="两只企鹅在暖色咖啡馆里一起手冲咖啡" />
          <div className="hero-shade" />
          <span className="hero-tag">{featured.tag}</span>
          <div className="hero-copy">
            <h1>{featured.title}</h1>
            <div className="hero-meta">
              <span><CalendarIcon />{featured.date}</span>
              <span><ClockIcon />{featured.time}</span>
            </div>
            <div className="hero-bottom">
              <strong>¥{featured.price}<small>/人</small></strong>
              <span>仅剩 {featured.seats} 个名额</span>
            </div>
          </div>
        </button>
        <section className="date-strip" aria-label="近期活动日期">
          <button className="date-tile selected"><small>本周六</small><strong>12</strong><span>手冲</span></button>
          <button className="date-tile"><small>下周六</small><strong>19</strong><span>拉花</span></button>
          <button className="date-tile"><small>第3周</small><strong>26</strong><span>露营</span></button>
          <button className="date-tile"><small>国庆</small><strong>03</strong><span>品鉴</span></button>
        </section>
        <button className="venue-banner" onClick={() => flow.push(venueScreen())}>
          <img src="/event-assets/coworking-penguin-guide.png" alt="企鹅和小鱼一起使用电脑" />
          <span className="venue-banner-copy">
            <span className="eyebrow">OUR SPACE</span>
            <strong>活动就在企鹅咖啡事务所</strong>
            <small><ClockIcon />7:00–22:00 · 晚上可自助办公</small>
          </span>
          <ChevronRightIcon />
        </button>
        <section className="upcoming-section">
          <div className="section-heading">
            <div><span className="eyebrow">UPCOMING</span><h2>接下来的周末</h2></div>
            <span>{events.length} 场活动</span>
          </div>
          <div className="event-list">
            {events.slice(1).map((event) => (
              <button className="event-row" key={event.id} onClick={() => flow.push(detailScreen(event))}>
                <img src={event.image} alt="企鹅主题活动封面" />
                <span className="event-row-copy">
                  <span className="event-row-tag">{event.tag}</span>
                  <strong>{event.title}</strong>
                  <span><CalendarIcon />{event.date} · {event.time.split("–")[0]}</span>
                  <span className="event-price">¥{event.price}<small>/人</small></span>
                </span>
                <ChevronRightIcon className="event-chevron" />
              </button>
            ))}
          </div>
        </section>
      </main>
    </MobileScroll>
  );
}

function venueScreen(): FlowScreen {
  return page("店铺空间", () => (
    <MobileScroll className="app-screen light-screen">
      <main className="venue-content">
        <img className="venue-photo" src="/event-assets/penguin-coworking-space.jpg" alt="企鹅咖啡事务所共享办公空间" />
        <section className="detail-card venue-intro">
          <span className="eyebrow dark">PENGUIN COFFEE OFFICE</span>
          <h1>企鹅咖啡事务所</h1>
          <p>白天喝咖啡、周末参加活动，晚上也可以安静办公。活动会在店里的开放吧台和共享桌区举行。</p>
        </section>
        <section className="coworking-guide">
          <img src="/event-assets/coworking-penguin-guide.png" alt="企鹅和小鱼在共享办公空间使用电脑" />
          <div className="guide-heading"><span className="eyebrow dark">COWORKING GUIDE</span><h2>小企鹅自助指南</h2></div>
          <div className="guide-grid">
            <div><GlobeIcon /><span><strong>免费网络</strong><small>到店后向店员领取当天网络</small></span></div>
            <div><ClockIcon /><span><strong>自助时段</strong><small>周末 19:00 后 · 平日 17:00 后</small></span></div>
            <div><PersonIcon /><span><strong>企鹅表情包</strong><small>微信搜索“我鹅的故事”</small></span></div>
            <div><LockClosedIcon /><span><strong>自助门禁</strong><small>开门方式请提前向店员申请</small></span></div>
          </div>
        </section>
        <section className="detail-card fact-list">
          <div><ClockIcon /><span><small>营业时间</small><strong>7:00–22:00</strong></span></div>
          <div><SewingPinIcon /><span><small>地址</small><strong>企鹅咖啡 · 苏州店</strong></span><ChevronRightIcon /></div>
          <div><CalendarIcon /><span><small>周末安排</small><strong>每周六举办主题活动</strong></span></div>
        </section>
        <section className="venue-note"><strong>共享办公空间</strong><p>到店消费即可使用；活动日部分座位会提前预留。</p></section>
      </main>
    </MobileScroll>
  ));
}

function BottomNav({ flow, active }: { flow: FlowControls; active: "home" | "ticket" | "staff" }) {
  return (
    <nav className="bottom-nav" aria-label="主导航">
      <button className={active === "home" ? "active" : ""} onClick={() => flow.replace(homeScreen())}><HomeIcon /><span>发现</span></button>
      <button className={active === "ticket" ? "active" : ""} onClick={() => flow.replace(ticketScreen())}><IdCardIcon /><span>我的报名</span></button>
      <button className={active === "staff" ? "active" : ""} onClick={() => flow.replace(staffScreen())}><DashboardIcon /><span>店员后台</span></button>
    </nav>
  );
}

function detailScreen(event: EventItem): FlowScreen {
  return page("活动详情", (flow) => <DetailScreen flow={flow} event={event} />, (flow) => (
    <div className="sticky-action">
      <div><small>报名费用</small><strong>¥{event.price}<span>/人</span></strong></div>
      <button onClick={() => flow.push(registrationScreen(event))}>立即报名</button>
    </div>
  ));
}

function DetailScreen({ flow, event }: { flow: FlowControls; event: EventItem }) {
  return (
    <MobileScroll className="app-screen light-screen">
      <main className="detail-content">
        <div className="detail-cover"><img src={event.image} alt="企鹅主题活动封面" /><span>{event.tag}</span></div>
        <section className="detail-card title-card">
          <h1>{event.title}</h1><p>{event.description}</p>
          <div className="availability"><span>已有 8 人报名</span><strong>还剩 {event.seats} 个名额</strong></div>
        </section>
        <section className="detail-card fact-list">
          <div><CalendarIcon /><span><small>活动日期</small><strong>{event.date}</strong></span></div>
          <div><ClockIcon /><span><small>活动时间</small><strong>{event.time}</strong></span></div>
          <div><SewingPinIcon /><span><small>活动地点</small><strong>{event.place}</strong></span><ChevronRightIcon /></div>
        </section>
        <section className="detail-card copy-card">
          <span className="eyebrow dark">WHAT YOU'LL DO</span><h2>这次会一起做什么</h2>
          <ul>
            <li><CheckCircledIcon />认识咖啡豆的香气与风味</li>
            <li><CheckCircledIcon />学习简单、稳定的手冲步骤</li>
            <li><CheckCircledIcon />带走你的体验豆与企鹅纪念卡</li>
          </ul>
        </section>
        <section className="notice-box"><strong>报名须知</strong><p>活动开始前 24 小时可联系店铺调整一次场次。儿童参加请由家长陪同。</p></section>
        <button className="text-link" onClick={() => flow.push(staffScreen())}>我是店员，进入活动后台</button>
      </main>
    </MobileScroll>
  );
}

function registrationScreen(event: EventItem): FlowScreen {
  return page("填写报名信息", (flow) => <RegistrationScreen flow={flow} event={event} />);
}

function RegistrationScreen({ flow, event }: { flow: FlowControls; event: EventItem }) {
  const { setTicket } = usePrototypeState();
  const [quantity, setQuantity] = useState(1);
  const total = event.price * quantity;
  const pay = () => {
    setTicket({ event, quantity, checkedIn: false });
    flow.push(successScreen(event, quantity));
  };
  return (
    <MobileScroll className="app-screen light-screen">
      <main className="form-content">
        <section className="order-summary"><img src={event.image} alt="活动封面" /><div><span>{event.date}</span><strong>{event.title}</strong><small>{event.time} · {event.place}</small></div></section>
        <section className="form-card"><h2>参加人数</h2><div className="stepper"><button onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="减少人数"><MinusIcon /></button><strong>{quantity}</strong><button onClick={() => setQuantity((q) => Math.min(4, q + 1))} aria-label="增加人数"><PlusIcon /></button></div></section>
        <section className="form-card fields"><h2>联系人</h2><MobileTextField id="guest-name" label="姓名" placeholder="请输入报名人姓名" testId="guest-name" /><MobileTextField id="guest-phone" label="手机号" placeholder="用于接收活动提醒" testId="guest-phone" /></section>
        <section className="payment-card"><div><span>活动费用</span><strong>¥{event.price} × {quantity}</strong></div><div className="payment-total"><span>合计</span><strong>¥{total}</strong></div></section>
        <p className="prototype-note">这是可操作的设计原型，点击后会模拟微信支付，不会产生真实扣款。</p>
        <button className="primary-button" onClick={pay}>模拟微信支付 · ¥{total}</button>
      </main>
    </MobileScroll>
  );
}

function successScreen(event: EventItem, quantity: number): FlowScreen {
  return { id: "payment-success", header: topBar("报名成功"), headerHeight: 52, render: (flow) => <SuccessScreen flow={flow} event={event} quantity={quantity} /> };
}

function SuccessScreen({ flow, event, quantity }: { flow: FlowControls; event: EventItem; quantity: number }) {
  return (
    <MobileScroll className="app-screen success-screen"><main className="success-content">
      <CheckCircledIcon className="success-icon" /><span className="eyebrow">PAYMENT COMPLETE</span><h1>报名成功，周末见</h1><p>电子票已经放进“我的报名”，到店时出示二维码即可签到。</p>
      <TicketCard event={event} quantity={quantity} checkedIn={false} compact />
      <button className="primary-button coral" onClick={() => flow.replace(ticketScreen())}>查看我的电子票</button><button className="secondary-button dark" onClick={() => flow.replace(homeScreen())}>继续看看其他活动</button>
    </main></MobileScroll>
  );
}

function ticketScreen(): FlowScreen {
  return { id: "tickets", header: topBar("我的报名"), headerHeight: 56, footer: (flow) => <BottomNav flow={flow} active="ticket" />, footerHeight: 76, render: (flow) => <TicketScreen flow={flow} /> };
}

function TicketScreen({ flow }: { flow: FlowControls }) {
  const { ticket } = usePrototypeState();
  return (
    <MobileScroll className="app-screen light-screen"><main className="tickets-content">
      <div className="section-heading light"><div><span className="eyebrow dark">MY WEEKEND</span><h1>电子票</h1></div><span>{ticket ? "1 张有效" : "暂无电子票"}</span></div>
      {ticket ? <TicketCard event={ticket.event} quantity={ticket.quantity} checkedIn={ticket.checkedIn} /> : <section className="empty-ticket"><IdCardIcon /><h2>还没有报名记录</h2><p>挑一场喜欢的周末活动，报名后电子票会出现在这里。</p><button className="primary-button" onClick={() => flow.replace(homeScreen())}>去看看活动</button></section>}
      <button className="staff-entry" onClick={() => flow.replace(staffScreen())}><DashboardIcon /><span><strong>店员工作台</strong><small>查看报名、签到和发布活动</small></span><ChevronRightIcon /></button>
    </main></MobileScroll>
  );
}

function TicketCard({ event, quantity, checkedIn, compact = false }: { event: EventItem; quantity: number; checkedIn: boolean; compact?: boolean }) {
  return (
    <section className={compact ? "ticket-card compact-ticket" : "ticket-card"}>
      <div className="ticket-head"><PenguinMark /><div><span>企鹅周末电子票</span><strong>{event.title}</strong></div><span className={checkedIn ? "status checked" : "status"}>{checkedIn ? "已签到" : "待签到"}</span></div>
      <div className="ticket-facts"><span><CalendarIcon />{event.date}</span><span><ClockIcon />{event.time}</span><span><SewingPinIcon />{event.place}</span><span><PersonIcon />{quantity} 位参加人</span></div>
      {!compact && <div className="qr-zone"><div className="qr-sample" role="img" aria-label="电子票签到二维码"><QRCodeCanvas value="PENGUIN-WEEKEND|EVENT:20260912|TICKET:PWE-0912-0008|STATUS:PAID" size={98} level="H" marginSize={1} /></div><strong>到店出示此码</strong><small>票号 PWE-0912-0008</small></div>}
      <div className="ticket-cut"><span /><span /></div>
    </section>
  );
}

function staffScreen(): FlowScreen {
  return { id: "staff", header: topBar("活动后台"), headerHeight: 56, footer: (flow) => <BottomNav flow={flow} active="staff" />, footerHeight: 76, render: (flow) => <StaffScreen flow={flow} /> };
}

function StaffScreen({ flow }: { flow: FlowControls }) {
  const { events, ticket } = usePrototypeState();
  return (
    <MobileScroll className="app-screen staff-screen"><main className="staff-content">
      <div className="staff-welcome"><div><span className="eyebrow">STAFF DESK</span><h1>周末活动一眼看清</h1><p>今天有 1 场活动需要准备</p></div><PenguinMark /></div>
      <section className="metrics"><div><span>已报名</span><strong>{ticket ? 9 : 8}</strong><small>人</small></div><div><span>已签到</span><strong>{ticket?.checkedIn ? 4 : 3}</strong><small>人</small></div><div><span>已收款</span><strong>¥{ticket ? 1152 : 1024}</strong></div></section>
      <section className="staff-actions"><button onClick={() => flow.push(scannerScreen())}><span className="action-icon coral-bg"><CameraIcon /></span><span><strong>扫码签到</strong><small>扫描客人的电子票</small></span><ChevronRightIcon /></button><button onClick={() => flow.push(publishScreen())}><span className="action-icon gold-bg"><Pencil2Icon /></span><span><strong>发布新活动</strong><small>填写时间、地点和价格</small></span><ChevronRightIcon /></button></section>
      <div className="section-heading"><div><span className="eyebrow">EVENTS</span><h2>活动管理</h2></div><span>{events.length} 场</span></div>
      <section className="manage-list">{events.slice(0, 3).map((event, index) => <button key={event.id} onClick={() => flow.push(attendeeScreen(event))}><img src={event.image} alt="活动封面" /><span><strong>{event.title}</strong><small>{event.date} · {event.seats} 个余位</small></span><span className={index === 0 ? "manage-state active" : "manage-state"}>{index === 0 ? "报名中" : "未开始"}</span></button>)}</section>
    </main></MobileScroll>
  );
}

function scannerScreen(): FlowScreen { return page("扫码签到", (flow) => <ScannerScreen flow={flow} />); }
function ScannerScreen({ flow }: { flow: FlowControls }) {
  const { ticket, setTicket } = usePrototypeState();
  const [scanned, setScanned] = useState(false);
  const checkIn = () => { setScanned(true); if (ticket) setTicket({ ...ticket, checkedIn: true }); };
  return (
    <div className="scanner-screen"><div className="scanner-copy"><span className="eyebrow">CHECK IN</span><h1>{scanned ? "签到完成" : "扫描客人的电子票"}</h1><p>{scanned ? "林小满 · 企鹅手冲咖啡体验课" : "将二维码放入取景框内"}</p></div><div className={scanned ? "scan-frame scanned" : "scan-frame"}>{scanned ? <CheckCircledIcon /> : <CameraIcon />}</div><div className="scanner-result">{scanned ? <><strong>电子票有效</strong><span>PWE-0912-0008 · 1 位参加人</span><button className="primary-button coral" onClick={() => flow.replace(staffScreen())}>返回活动后台</button></> : <><strong>原型演示</strong><span>正式小程序会调用微信相机。现在可直接读取演示电子票。</span><button className="primary-button coral" onClick={checkIn}>读取演示二维码</button></>}</div></div>
  );
}

function attendeeScreen(event: EventItem): FlowScreen { return page("报名名单", () => <AttendeeScreen event={event} />); }
function AttendeeScreen({ event }: { event: EventItem }) {
  const { ticket } = usePrototypeState();
  const attendees = [["林小满", "138 **** 2038", ticket?.checkedIn ? "已签到" : "待签到"], ["周可可", "156 **** 7281", "已签到"], ["陈知夏", "189 **** 5516", "待签到"], ["苏州慢生活", "133 **** 9022", "待签到"]];
  return (
    <MobileScroll className="app-screen light-screen"><main className="attendee-content"><section className="mini-event"><img src={event.image} alt="活动封面" /><div><span>{event.date}</span><strong>{event.title}</strong><small>已报名 8 / 14 人</small></div></section><div className="section-heading light"><div><span className="eyebrow dark">GUESTS</span><h2>报名客人</h2></div><span>8 人</span></div><section className="attendee-list">{attendees.map(([name, phone, status], index) => <div key={name}><span className="avatar">{name.slice(0, 1)}</span><span><strong>{name}</strong><small>{phone} · {index === 3 ? "2" : "1"} 人</small></span><span className={status === "已签到" ? "check-state done" : "check-state"}>{status}</span></div>)}</section></main></MobileScroll>
  );
}

function publishScreen(): FlowScreen { return page("发布新活动", (flow) => <PublishScreen flow={flow} />); }
function PublishScreen({ flow }: { flow: FlowControls }) {
  const { setEvents } = usePrototypeState();
  const [saved, setSaved] = useState(false);
  const save = () => {
    setEvents((current) => current.some((item) => item.id === "dessert") ? current : [...current, { id: "dessert", title: "企鹅咖啡甜点搭配课", date: "10月10日 · 周六", shortDate: "10", time: "14:30–16:30", place: "企鹅咖啡 · 苏州店", price: 138, seats: 10, image: "/event-assets/event-tasting.png", tag: "首次发布", description: "用三组咖啡与甜点，体验风味如何互相衬托。" }]);
    setSaved(true);
  };
  return (
    <MobileScroll className="app-screen light-screen"><main className="form-content"><section className="upload-cover"><img src="/event-assets/event-tasting.png" alt="待发布活动封面" /><span><CameraIcon />更换活动图片</span></section><section className="form-card fields"><h2>活动内容</h2><MobileTextField id="event-title" label="活动名称" placeholder="企鹅咖啡甜点搭配课" /><MobileTextField id="event-detail" label="活动简介" placeholder="写一句吸引客人的介绍" /></section><section className="form-card fields"><h2>时间与地点</h2><MobileTextField id="event-date" label="活动日期" placeholder="10月10日 · 周六" /><MobileTextField id="event-time" label="活动时间" placeholder="14:30–16:30" /><MobileTextField id="event-place" label="活动地点" placeholder="企鹅咖啡 · 苏州店" /></section><section className="form-card fields two-fields"><MobileTextField id="event-price" label="每人价格" placeholder="¥138" /><MobileTextField id="event-seats" label="可报名人数" placeholder="10 人" /></section>{saved && <div className="saved-notice"><CheckCircledIcon /><span><strong>活动已发布</strong><small>顾客首页已经可以看到</small></span></div>}<button className="primary-button" onClick={save}>{saved ? "活动已发布" : "预览并发布"}</button>{saved && <button className="secondary-button" onClick={() => flow.replace(staffScreen())}>返回活动后台</button>}</main></MobileScroll>
  );
}
