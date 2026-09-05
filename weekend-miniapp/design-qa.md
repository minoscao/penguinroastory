# Design QA

**Source visual truth**
- `reference/selected-option-2.png`
- Original pixels: 852 × 1846
- Normalized comparison: `reference/source-home-normalized.png`, 393 × 852

**Rendered implementation**
- Local prototype: `http://localhost:4173/`
- Browser capture: `reference/implementation-home.png`
- Normalized screen crop: `reference/implementation-home-normalized.png`, 393 × 852
- Side-by-side evidence: `reference/qa-comparison-home.png`
- Browser viewport during capture: 1400 × 1200
- Verified phone screen CSS size: 393 × 852 at device scale factor 1
- State: customer discovery home, iPhone frame, dark theme, featured hand-pour event, venue card, sticky registration action

**Coworking guide update**
- Private source visual: `D:/Program Files (x86)/xwechat_files/wxid_x1nvl8kyoo2f22_3430/temp/RWTemp/2026-09/0e4cc23a208d5ee57181b50caabc388e/76bc138123d0cb2dcbae856155394a8a.jpg`
- Rendered screen: `reference/implementation-coworking-guide.png`
- Normalized screen: `reference/implementation-coworking-guide-normalized.png`, 393 × 852
- Side-by-side private comparison: `C:/Users/睿腾/.codex/visualizations/2026/09/05/01a07028-93e5-7c92-b2d5-581dd2109709/coworking-private-comparison.png`
- The private source and comparison are intentionally excluded from Git because the supplied artwork contains a Wi-Fi password and a door-access QR code.

**Full-view comparison evidence**
- The implementation preserves the selected direction's warm espresso palette, framed editorial hero, serif Chinese display type, coral action color, compact date cards, image-led event rows, and fixed lower navigation.
- The user-requested coworking-space photograph is intentionally added between the date strip and upcoming-events section. It introduces a light venue card while preserving the dark poster-wall hierarchy.
- The implementation intentionally uses four upcoming dates and a third staff tab because the working prototype includes weekly scheduling and store operations beyond the selected customer-only mock.

**Focused region comparison evidence**
- Header and hero: checked at 1:1 CSS size. The generated penguin brand mark stays legible at 34 px, and the hero subjects remain centered inside the metallic frame.
- Primary action: the coral sticky action mirrors the source placement and remains above the three-tab navigation.
- Venue card: the supplied 3214 × 1280 store image remains sharp at its 96 × 70 crop and opens a full-width 230 px detail image.
- Ticket: the electronic ticket uses a real `QRCodeCanvas` payload rather than a decorative pattern; status changes from “待签到” to “已签到”.
- Staff states: browser-tested registration totals, scan success, attendee status, and publish-success feedback.
- Coworking guide: the safe generated banner preserves the reference's penguin-at-a-laptop, orange-fish companion, and blue-gray atmosphere. Four information cards preserve the source grouping while replacing credentials and access codes with “到店向店员获取” guidance.

**Findings**
- No actionable P0, P1, or P2 issues remain.
- [P3] The venue image contains small embedded wall text that is only partly readable in the compact home card. This is acceptable because the card's adjacent app text carries the message and the full image appears on tap.
- [P3] The browser screenshot export includes the device bezel before normalization. The report keeps both the raw evidence and the normalized 393 × 852 comparison.

**Comparison history**
1. Earlier P2: the first brand thumbnail cropped to coffee equipment and did not read as a penguin. Fix: generated and installed a dedicated original penguin mark. Post-fix evidence: `reference/implementation-home-normalized.png`.
2. Earlier P2: the first ticket used a decorative block pattern. Fix: replaced it with a machine-generated high-error-correction QR canvas containing the ticket payload. Post-fix evidence: browser-tested “我的报名” screen.
3. Earlier P2: the first home build omitted the source design's persistent coral registration action. Fix: added a fixed “立即报名 ¥128” action above navigation. Post-fix evidence: `reference/qa-comparison-home.png`.
4. Earlier P2: the added venue card pushed the next-section heading completely below the fold. Fix: tightened hero, date-strip, and venue-card heights while retaining practical tap areas. Post-fix evidence: `reference/qa-comparison-home.png` shows “接下来的周末” above the sticky action.
5. Security review before coworking-guide implementation: the supplied source visibly contained network credentials and a door-access QR code. Fix: created a text-free derived illustration and moved all actionable access information behind an in-person staff instruction. Post-fix evidence: the private side-by-side comparison path above and `reference/implementation-coworking-guide-normalized.png`.

**Required fidelity surfaces**
- Fonts and typography: serif Chinese titles and strong sans-serif utility text preserve the selected editorial hierarchy; small text remains concise and does not visibly collide.
- Spacing and layout rhythm: 18 px page gutters, framed hero, compact card spacing, and fixed actions follow the source. Added venue content is visually separated and tappable.
- Colors and tokens: espresso, warm paper, brass, coral, muted cream, and green checked-in status are consistent and readable.
- Image quality and asset fidelity: all visible penguin/event/venue assets are raster source or generated assets; no CSS or handcrafted SVG art substitutes remain.
- Copy and content: customer, ticket, payment simulation, check-in, attendee, and publish language is written for store staff and customers without technical terms.

**Primary interactions tested**
- Open supplied venue element and return.
- Open the coworking guide, scroll through all four guidance cards, and confirm that no password or access QR is exposed.
- Open featured event, view details, and start registration.
- Change guest quantity, fill contact name, and run simulated WeChat payment.
- Open the resulting electronic ticket and verify QR rendering.
- Enter staff dashboard, read the demo ticket, and verify the checked-in count updates.
- Open activity publishing, publish a sample activity, and verify the event count updates.
- Browser console warnings and errors checked: none.

**Implementation checklist**
- [x] Source and rendered screens compared at normalized 393 × 852.
- [x] Customer registration path works.
- [x] Staff check-in and publishing paths work.
- [x] Runtime integrity and production build pass.
- [x] Browser console is clean.

final result: passed
