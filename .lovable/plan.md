## Seller analytics section on the dashboard

Add an `AnalyticsSection` to `/dashboard` visible only for `professional` and `business` roles (customers do not see it). It renders inline on the home page — no new route and no new mobile tab.

### 1. New component `src/components/AnalyticsSection.tsx`
Client component. Fetches once with a `useCallback` `load` and subscribes via `useLiveData(["orders", "escrow", "reviews"], load)` so numbers refresh in realtime without a page reload.

Data source (already in schema):
- `orders`: `provider_id`, `amount` / `amount_ngn`, `service_title`, `service_id`, `customer_id`, `status`, `escrow_status`, `payout_amount`, `commission_amount`, `created_at`.
- `escrow` joined on `order_id` for authoritative `released` / `completed` state.
- `reviews`: `reviewed_id`, `rating`, `created_at`.

A row counts as an "earned/completed order" when `escrow.status IN ('released','completed')` OR `orders.status = 'completed'`. Revenue uses `payout_amount` when present, else `amount`.

Metrics rendered (each in a `glass-card` tile with the primary/accent gradient the rest of the dashboard uses):

1. **Total revenue (lifetime)** — sum of completed order payouts, `formatNgn`.
2. **Revenue this month vs last month** — two figures + a small delta pill ("▲ 12%" green / "▼ 8%" red / "—") comparing sums bucketed by `created_at` in the seller's local month.
3. **Completed orders** — count of completed orders lifetime + "(N this month)" secondary line.
4. **Repeat customers** — distinct `customer_id`s that appear on 2+ completed orders.
5. **Average rating trend** — current avg over last 30 days vs previous 30 days, with the same delta pill. Falls back to "No reviews yet" when the seller has none.

Charts (using existing `recharts` via `@/components/ui/chart`):

6. **Booking trends** — `<ChartContainer>` with a bar chart of completed-order count per week for the last 12 weeks (Sunday-anchored buckets), plus a toggle button ("Weekly" / "Monthly") that swaps to 12-month buckets.
7. **Top performing services** — horizontal bar chart of top 5 services by revenue (group by `service_title`, fall back to service id when title is empty), each bar labeled with `formatNgn(revenue)`. Empty-state: "No completed sales yet."

Layout: `grid gap-4 grid-cols-2 lg:grid-cols-4` for the metric tiles, then a single `grid gap-4 lg:grid-cols-2` row for the two charts. Mobile: charts collapse to full width and the height is capped so nothing pushes the fixed bottom nav.

Loading: single `Loader2` spinner while the first fetch resolves; subsequent realtime refreshes are silent (per `useLiveData` contract).
Errors: wrap the Supabase calls in `try/catch` and `toast.error(...)` — the section renders whatever it managed to load.

### 2. Mount on dashboard `src/routes/_authenticated/dashboard.tsx`
- Import `AnalyticsSection`.
- Render it inside the existing right-column `<div className="space-y-5 sm:space-y-8">`, **after the Stat Cards row and before the Getting Started card**, gated by `role !== "customer"`.
- No changes to `MobileBottomNav`, no new route file, no changes to `TransactionsSection`.

### 3. No backend changes needed
- `orders` and `escrow` are already readable by the signed-in provider via existing RLS (`orders parties read`).
- `reviews` reads scoped to `reviewed_id = auth.uid()` already exist per current app usage; we only read the seller's own review rows.
- The realtime publication for `orders`, `escrow`, and `reviews` was enabled in a prior migration; no new migration is required. If `reviews` is not yet in `supabase_realtime`, the section still works — `useLiveData`'s 10s polling fallback keeps it fresh.

### Out of scope
- No CSV export, no per-service detail drilldowns.
- No changes to the mobile bottom nav or navigation.
- No customer-side analytics.
