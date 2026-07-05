## Fixes

1. **Rename the bottom-nav tab from "Wallet" to "Transactions"**
   - In `src/components/MobileBottomNav.tsx`, change the label and keep the `Wallet` icon.
   - Shrink the tab typography (`text-[10px]`, tighter padding, `truncate`) so "Transactions" fits without wrapping across all 5 tabs at 360px.

2. **Make the Transactions page fit mobile perfectly**
   - In `src/components/TransactionsSection.tsx`:
     - Tighten outer padding on mobile (`p-4 sm:p-6`) and reduce header/stat gaps.
     - Stat cards: keep `grid-cols-3` but shrink numbers on mobile (`text-lg sm:text-2xl`), smaller labels, tighter padding so all three fit side-by-side without overflow.
     - Filter tabs: make `TabsList` horizontally scrollable (`overflow-x-auto`, `whitespace-nowrap`) so "All / Completed / In Escrow / Cancelled / Refunded" don't wrap or clip on small screens.
     - Transaction rows: hide the desktop `Table` on mobile and render a stacked **card list** instead — each card shows service title + status badge on top, counterparty + date, and amount right-aligned. Table stays for `sm:` and up.
     - Ensure the page wrapper uses `px-3 sm:px-6` and `max-w-full` so nothing overflows.
   - In `src/routes/_authenticated/transactions.tsx`: reduce top padding on mobile (`py-4 sm:py-8`) and use the same tighter horizontal padding.

3. **QA on mobile viewport (390×844)**: confirm bottom-nav label reads "Transactions", stat cards fit one row, filter tabs scroll, transaction cards stack cleanly with no horizontal scroll, and CSV export button stays reachable.

## Technical notes

- No new routes or DB changes.
- Only edits: `src/components/MobileBottomNav.tsx`, `src/components/TransactionsSection.tsx`, `src/routes/_authenticated/transactions.tsx`.
- Table → card switch uses `hidden sm:block` / `sm:hidden` pattern; no new component needed.
