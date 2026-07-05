## Fix mobile homepage and bottom nav

### 1. Bottom nav tabs (`src/components/MobileBottomNav.tsx`)
Replace current 5 tabs with exactly: **Home, Explore, Feed, Orders, Chat**.
- Remove the Transactions/Wallet tab from the bottom nav.
- Order: Home (`/dashboard`) → Explore (`/explore`) → Feed (`/feed`) → Orders (`/my-orders`) → Chat (`/messages`).
- Icons: Home, Compass, Rss, Package, MessageSquare.

### 2. Dashboard homepage (`src/routes/_authenticated/dashboard.tsx`)
- **Remove the inline `<TransactionsSection />`** from the bottom of the dashboard so scrolling the homepage no longer reveals the full transactions panel.
- Keep the "Transactions" entry in the Quick Links grid (both customer and business role lists) so users can still tap through to `/transactions`.
- Drop the `TransactionsSection` import.

### 3. Mobile polish for the dashboard page
Currently the dashboard uses `px-4 sm:px-6 py-10` and a large welcome banner (`p-8 sm:p-10`, `text-3xl sm:text-5xl`) which feels cramped on phones and pushes content wide.
- Outer wrapper: `px-3 sm:px-6 py-4 sm:py-10 pb-24 md:pb-10` (extra bottom padding so the fixed bottom nav doesn't cover content).
- Welcome banner: `p-5 sm:p-10`, heading `text-2xl sm:text-5xl`, subtitle `text-sm sm:text-lg`, rounded `rounded-2xl sm:rounded-3xl`.
- Stat cards grid: keep `sm:grid-cols-3`; on mobile stack becomes single column already — tighten gap to `gap-3`.
- Quick links card: `p-4 sm:p-7`, grid `grid-cols-2` on mobile so shortcuts (including Transactions) are tap-friendly 44px+ tiles instead of full-width rows.
- Section spacing: `space-y-5 sm:space-y-8`.

### Result
- Mobile bottom tabs: Home · Explore · Feed · Orders · Chat (5 items, matches request).
- Homepage no longer shows the Transactions panel inline; it's reachable via the "Transactions" quick-link tile.
- Dashboard fits phone widths with no horizontal scroll and doesn't get hidden behind the bottom nav.

No backend, route, or business-logic changes.
