# Kitchen module — Phase 2 & 3 design

Answers to four questions: amending an approved requisition, the bill and
payment side, what a resort needs that we haven't built, and where the speed
went. Phase 1 (requisition → approval → WhatsApp fan-out → printed sheet) is
live; this is what comes next and why.

---

## 1. Amending an approved requisition

### The problem

Today an approved requisition cannot be edited at all — `saveRequisition`
refuses anything that isn't a draft, and the detail page only shows the Edit
link on drafts. That's deliberate but incomplete: in practice a booking grows,
a supplier calls to say the fish isn't available, or the kitchen realises at
4pm that 2kg of beef won't stretch.

The obvious fix — unlock the record and let people edit it — is the wrong one,
for a reason that has nothing to do with software:

**the order has already left the building.** Six WhatsApp groups hold a message.
A printed sheet is on a clipboard. Editing the row silently changes none of
those, and it destroys the only record of what was actually authorised. An
extra 5kg of beef appearing in an approved requisition, with no trace of who
added it or when, is precisely the hole the approval step exists to close.

### The rule: the dispatch line

> **Before the order goes out, edit it. After it goes out, amend it.**

That requires knowing whether it went out, which we currently don't record —
the dispatch screen's copy button sets local state and forgets. So:

**Add `kitchen_requisition_dispatches`** — one row per vendor per requisition,
written when the message is copied: `requisition_id`, `kitchen_vendor_id`,
`sent_at`, `sent_by_user_id`, `message_snapshot`. This earns its place three
times over:

- it decides edit-vs-amend
- it answers "did anyone actually send the vegetable order?", which nothing
  currently can
- `message_snapshot` is the evidence of what the supplier was told, when the
  delivery doesn't match

**Approved but not yet dispatched** → "Reopen for editing" moves it back to
`pending_approval` (not `draft` — the work of filling it in is done, only the
authorisation is void) and logs who reopened it. Nothing has gone out, so
nothing needs explaining.

**Approved and dispatched** → amendment only.

### Amendments

`parent_requisition_id` already exists in the schema for this. An amendment is
a **child requisition** carrying only the delta:

- numbered off the parent — `RQ-0003-A`, `RQ-0003-B` — so everyone can see it
  belongs to the same day
- lines may be **negative**: `−2 kg` beef expresses "cancel 2 of the 5 you
  ordered". Requires dropping the `qty > 0` check on lines and replacing it
  with `qty <> 0`.
- goes through **the same approval gate**. This is the entire point: someone
  must authorise the extra spend, and an amendment path that skips approval is
  just an editable requisition with more steps.
- dispatches **only to the vendors it touches**. Sending "no change" to six
  groups trains people to ignore the messages.
- the amendment message is visibly different — `⚠️ সংশোধন / CHANGE TO TODAY'S
  ORDER`, with `+3 kg potato` and `CANCEL 2 kg beef` rather than a restated
  list. A supplier who skims a re-sent full order will deliver it twice.

The parent's detail page and printed sheet show the **effective order** —
parent plus amendments, netted, with changed lines marked — because the person
receiving goods at 6am needs one list, not three documents to reconcile.

### Why not versioning

A revision counter with snapshots gives the same audit trail and is tidier in
the database. It loses the thing that matters most: an amendment is a
*document that gets sent to somebody*. It needs its own number, its own
approval, and its own message. Versions are for records; this is correspondence.

---

## 2. Bill and payment

Three separate events, currently conflated in everyone's head as "paying the
vendor":

| Event | What it means | What it creates |
|---|---|---|
| **Delivery** | Goods arrived and were weighed | A cost, and a liability |
| **Bill** | Both sides agree on the amount | Nothing new — it confirms the delivery |
| **Payment** | Money leaves (usually a cheque) | Settles the liability |

Keeping these apart is what makes "how much do we owe the beef supplier?"
answerable. Collapsing them — recording an expense when the cheque is written —
is why that question currently needs a phone call.

### Schema

**`kitchen_deliveries`** — `requisition_id` (nullable), `kitchen_vendor_id`,
`supplier_id`, `delivery_date`, `supplier_memo_no`, `received_by_employee_id`,
`status` (draft | confirmed), `total_amount`, `memo_photo_path`, `notes`.

`requisition_id` is nullable on purpose: suppliers deliver against no
requisition more often than anyone admits.

**`kitchen_delivery_lines`** — `delivery_id`, `requisition_line_id` (nullable),
`item_id`, `item_name`, `qty_ordered` (snapshot), `qty_delivered`,
`piece_count`, `unit_id`, `unit_price`, `line_total`, `is_unrequested`,
`rejected_qty`, `reject_reason`.

`unit_price` pre-fills from `inv_items.default_unit_price` (shipped in
migration 002) and is editable per delivery.

**`kitchen_vendor_payments`** — `kitchen_vendor_id`, `supplier_id`,
`payment_date`, `method` (cheque | cash | bank_transfer | bkash), `cheque_no`,
`cheque_date`, `bank_name`, `amount`, `photo_path`, `notes`.

**`kitchen_payment_allocations`** — `payment_id`, `delivery_id`,
`amount_allocated`. The many-to-many is the whole trick: one Dutch-Bangla
cheque settles fourteen deliveries, and

```
outstanding(vendor) = Σ delivery totals − Σ allocations
```

is the number the resort actually needs. Without allocations you can total
what you bought and total what you paid, but never tell which bills are still
open.

### The three unanswered questions, answered

**Partial deliveries.** `qty_ordered` and `qty_delivered` are separate columns;
the shortfall is visible rather than inferred. The delivery is still complete
and billable — you pay for what arrived. The shortfall should offer **"carry
to tomorrow's requisition"**, which is what the storekeeper does on paper
anyway.

**Unrequested items.** Allowed, flagged `is_unrequested`, never blocked —
refusing a delivery at 6am isn't practical and the rule would just be ignored.
The control is visibility: a weekly count per vendor. A supplier pushing stock
shows up as a pattern, not as a single line nobody questions.

**Emergency orders.** `is_emergency` exists and currently changes nothing.
It should **skip the wait, not the approval**: dispatch immediately, then
require approval within 24h, and report anything still unapproved. An emergency
flag that bypasses authorisation becomes the way everyone orders.

### Expense double-counting

The rule, unchanged from earlier in the build: **the delivery creates the cost;
the payment settles it and creates nothing.**

The existing Expenses module is keyed on `expense_date` and reads as
cash-basis, so wiring deliveries straight into it would misstate cash. The
kitchen ledger should therefore stay self-contained — deliveries and payments
live in the kitchen tables, and a single expense row is posted **at payment**,
dated to the payment, with the food-cost reporting drawn from
`kitchen_deliveries` rather than from expenses. Reports get accrual accuracy
from the kitchen tables; the cash books stay cash. Nothing is counted twice.

---

## 3. What we missed as a resort

Ordered by what they'd be worth.

**1. Pax — shipped.** The requisition asked what to order and never for how
many. Headcounts now sit above the item list, derived from live bookings by
the same meal engine the daily report uses.

**2. Cost per cover.** Once deliveries carry money and days carry pax, the
number a GM actually manages — BDT per head per day, and food cost as a
percentage of F&B revenue — falls out. This is the module's real output. Right
now the resort cannot answer "did we spend more per guest last month?".

**3. Staples vs perishables.** Everything is currently ordered the same way,
against the event. That's right for fish and vegetables and wrong for rice,
oil, spices and powdered milk, which should be ordered against **stock and par
level**. `inv_items` already has `par_level`, `reorder_point` and
`current_stock` from the inventory module — the grocery vendor's section
should suggest from those instead of from memory. Ordering staples per-event
is how a kitchen ends up with four months of one spice and no salt.

**4. Rate variance.** Now that a standing rate exists, a delivery priced more
than ~10% above it should flag. Prices in these arrangements drift quietly
upward. A weekly "rates that changed" list is cheap and pays for itself.

**5. Goods received don't touch stock.** Deliveries should increase kitchen
stock and the kitchen should issue against it. Today everything bought is
implicitly consumed the same day — true for vegetables, false for groceries.

**6. Duplicate-date guard.** Nothing stops two people raising a requisition for
the same event date, and the fan-out would send both. The codebase already has
a duplicate-bookings warning; the same shape applies.

**7. Cut-off time.** Suppliers need the order by a certain hour. A requisition
for tomorrow raised at 11pm is a phone call, not an order. Show the cut-off,
flag late ones.

**8. Wastage and returns.** Rejected goods — bad fish, short weight — need a
line and a credit, or the bill overstates and the argument happens over
WhatsApp with no record.

**9. Menu → requisition.** Nobody writes a requisition from nothing; they read
the day's menu. Full recipe explosion is a bigger project, but showing the
menu beside the form is nearly free.

**10. Receiving is a different person.** Deliveries land at 6am with whoever is
awake. `received_by_employee_id` and a memo photo (the field-visits module
already established the private-bucket + signed-URL pattern) close that gap.

**11. Offline.** The store is at the back of the resort. The field-visits
offline capture pattern transfers directly.

---

## 4. Speed and UX — what was actually slow

Measured rather than guessed, and the first four are shipped.

**Shipped**

- **No route had a `loading.tsx`.** Every kitchen navigation was a blocking
  server render with no feedback, and nothing for Next to prefetch. All seven
  routes have one — this is the single biggest change to how fast the module
  *feels*.
- **The catalogue was re-fetched on every navigation.** Six vendors and 77
  items, read by four different screens, two Supabase round-trips per tap, for
  rows that change a few times a month. Now cached under a `kitchen-catalogue`
  tag invalidated by every catalogue write. (`setItemVendor` had no
  revalidation at all — untidy before caching, wrong after.)
- **The list pulled every line row of 500 requisitions** to produce two
  integers per card — ~20,000 rows for a list nobody scrolls. Now the vendor id
  only, over a 120-row window.
- **Start from a previous sheet.** The list barely changes day to day; the
  quantities do. Copying the last requisition and adjusting numbers already on
  screen beats retyping forty items.

**Next**

- **Browse the picker by vendor.** You order vegetables as a group, not by
  recalling each name. Search-only forces recall where recognition would do.
- **Quantity steppers and a numeric keypad.** Forty `type="text"` boxes on a
  phone is forty keyboard switches.
- **Last-ordered quantity as placeholder text** per item.
- **Optimistic line edits.** The 1.2s debounce is right for the network but the
  UI shouldn't wait on it.
- **Sticky footer summary** — items, vendors covered, untagged warnings —
  so the state of the sheet is visible without scrolling to the bottom.

---

## Build order

1. **Dispatch recording** — small, unblocks amendments, immediately useful
2. **Amendments** — the question that prompted this
3. **Deliveries** — rates, partials, unrequested, rejects, bill messages
4. **Payments and allocations** — the vendor ledger
5. **Reports** — cost per cover, spend by vendor, rate variance
6. Staples-by-par, stock movement, duplicate guard, cut-off

Steps 1–2 stand alone and are worth doing regardless of what's decided about
billing.
