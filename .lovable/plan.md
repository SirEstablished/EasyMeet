## Problem

The Transactions section was added to `src/routes/_authenticated/dashboard.tsx`, but you can't see it. Two likely reasons:

1. You're viewing `/` (the public landing page), not `/dashboard`. The section only renders on the authenticated dashboard route.
2. After sign-in, the app may be sending you somewhere other than `/dashboard` (e.g. `/feed` or `/my-orders`), so you never hit the page that contains it.

## Plan

1. Verify where signed-in users land by default (check `AppNavbar`, auth redirect, and the `/dashboard` link) — no code changes yet, just confirm the route.
2. Make the Transactions section reachable from the primary nav so it's not hidden behind `/dashboard`:
   - Add a **Transactions** entry to the mobile bottom nav and desktop navbar/quick links, pointing to a dedicated route.
   - Create `src/routes/_authenticated/transactions.tsx` that renders the existing `<TransactionsSection />` full-width with a page header.
3. Keep the summary cards + table on `/dashboard` as-is so it also appears there.
4. Quick QA: sign in, click **Transactions** in the nav, confirm totals, filter tabs (All / Completed / In Escrow / Cancelled / Refunded), and CSV export all work.

## Technical notes

- New route: `src/routes/_authenticated/transactions.tsx` — thin wrapper around `TransactionsSection` (already built, already wired to `orders` + `escrow` + `profiles` with realtime via `useLiveData`).
- Nav edits: `src/components/MobileBottomNav.tsx` (replace or add a tab) and `src/components/AppNavbar.tsx` / dashboard quick links.
- No DB or RLS changes — the section reads tables you already have policies for.
