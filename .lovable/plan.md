## Password show/hide + site-wide realtime updates

### 1. Password eye toggle in `src/components/AuthModal.tsx`
Wrap the password `<Input>` in a relative container and add an inline eye button. Toggle a local `showPassword` state to switch the input `type` between `"password"` and `"text"`. Use `Eye` / `EyeOff` from `lucide-react`.

- Add `const [showPassword, setShowPassword] = useState(false);` at the top of `AuthModal`.
- Wrap the existing password `<Input>` (lines ~376-386) in `<div className="relative">`, add `pr-10` to the input, and place an absolutely-positioned `<button type="button" aria-label="Show/Hide password">` with the icon on the right.
- Same treatment for the login-mode password input further down the file.
- Reset `showPassword` back to `false` when the modal closes (extend the existing `reset()` helper — or use a `useEffect` on `open`).

Purely presentational — no auth-flow changes.

### 2. Site-wide realtime auto-refresh
The `useLiveData` hook (Supabase realtime + 10s polling fallback) already exists and is used by explore, feed, my-orders, my-services, my-products, my-bookings, TransactionsSection, and ProfileView. Extend the same pattern to the remaining data-driven surfaces so users never have to refresh.

Add `useLiveData([...], reload)` to the fetch/reload function in each of these, wiring the tables each screen actually reads:

- `src/routes/_authenticated/messages.tsx` → `["messages", "conversations", "profiles"]` on the conversation list + active-thread refresh.
- `src/routes/_authenticated/admin.disputes.tsx` → `["disputes", "orders", "escrow"]`.
- `src/routes/_authenticated/staffs.tsx` → `["staff_invites", "profiles"]` (verify the actual table names in the file when editing).
- `src/components/NotificationsBell.tsx` → `["notifications"]`.
- `src/components/EscrowPanel.tsx` and `src/components/EscrowOrdersSection.tsx` → `["orders", "escrow"]`.
- `src/components/PostCard.tsx` (like/comment counts) and `src/components/CommentsDrawer.tsx` → `["post_likes", "post_comments"]` scoped to the open post.

For each file the change is: extract the existing load-from-Supabase logic into a `useCallback` `load` (if not already), then add `useLiveData(tables, load)` next to the initial `useEffect`. Do NOT toggle a visible loading spinner inside `load` after the first fetch (the hook contract) — introduce a `firstLoad` guard where the current code always sets `loading = true`.

Ensure the referenced tables are enabled in the `supabase_realtime` publication. Ship one migration that runs `ALTER PUBLICATION supabase_realtime ADD TABLE public.<t>` for every table above (wrapped so re-adding an already-published table is a no-op via `DO $$ … EXCEPTION WHEN duplicate_object … $$`).

### Out of scope
- No changes to auth logic, RLS, table schemas, or the `useLiveData` hook itself.
- No visual redesign — the eye button uses existing icons and Tailwind utilities.
