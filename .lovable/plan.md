## Goal

Make the site look and fit correctly on Android/mobile across every page, and force dark mode as the only theme site-wide.

## 1. Force dark mode everywhere (remove toggle)

- `src/lib/providers.tsx` — `ThemeProvider` always sets `dark` on `<html>`, writes `"dark"` to `localStorage`, and `toggle`/`setTheme` become no-ops. `useTheme()` still returns `{ theme: "dark" }` so existing call sites keep compiling.
- `src/routes/__root.tsx` — add `className="dark"` on `<html>` in `RootShell` so the very first SSR paint is dark (no light flash on Android).
- `src/styles.css` — apply the `.dark` token values to `:root` as well (or wrap the light-mode block behind an unused selector) so any pre-hydration paint uses dark colors.
- Remove the Sun/Moon toggle button from `src/routes/index.tsx` header and from `AppNavbar` (and any other header that renders it). Drop unused `Moon`/`Sun` imports and the `useTheme()` calls where only the toggle used them.

## 2. Android viewport + no-horizontal-scroll baseline

- `src/routes/__root.tsx` head meta — extend viewport to `width=device-width, initial-scale=1, viewport-fit=cover` and add `theme-color: #0D0D1A` so the Android status bar matches the dark UI.
- `src/styles.css` — keep `overflow-x: hidden` but also add `overscroll-behavior-y: none` on `html, body`, and guard decorative blurs/orbs with `max-width: 100vw; overflow: hidden` on the pseudo-elements so the giant `blur-3xl` orbs never create horizontal scroll on 360px Android screens.
- Add a small utility rule to clamp any `.blur-3xl` decorative div inside a `overflow-hidden` wrapper — audit hero sections that currently place them as siblings of `min-h-[92vh]` containers.

## 3. Mobile layout audit + fixes (all requested scopes)

Apply the responsive-layout pattern (`grid-cols-[minmax(0,1fr)_auto]` + `min-w-0` + `shrink-0` + `truncate`) and tighten mobile paddings/type scale on:

- **Landing + auth**: `src/routes/index.tsx` (hero type scale `text-4xl sm:text-7xl`, buttons full-width on mobile, container `px-4`, hide desktop-only floating cards below `lg`), `src/components/AuthModal.tsx` (dialog `max-w-[calc(100vw-1.5rem)]`, stacked inputs, eye button spacing), `src/components/LegalPageShell.tsx`, `src/routes/{about,privacy,terms,staff-register}.tsx`.
- **Dashboard + analytics**: `src/routes/_authenticated/dashboard.tsx` header row, stat cards → `grid-cols-2` on mobile, `src/components/AnalyticsSection.tsx` metric tiles `grid-cols-2`, charts wrap in `overflow-x-auto` container with min height, top-services bars use `min-w-0` + `truncate`.
- **Feed / Explore / Profile**: `src/routes/_authenticated/{feed,explore,profile.tsx,profile.$id.tsx,profile.index.tsx}`, `src/components/{PostCard,ProfileView,ProfileCard,CommentsDrawer,CreatePostCard}.tsx` — avatar `shrink-0`, headings `truncate`, action rows switch to two-column grid on mobile, media respects `aspect-ratio` with `max-w-full`.
- **Orders / Messages / Transactions**: `src/routes/_authenticated/{my-orders,my-bookings,messages,transactions}.tsx`, `src/components/{EscrowOrdersSection,EscrowPanel,TransactionsSection,RequestRefundDialog,ReviewOrderDialog}.tsx` — tables wrap in `overflow-x-auto` with sticky first column on mobile, message list rows use grid layout, escrow status pills wrap.
- **Shared chrome**: `src/components/AppNavbar.tsx` (hide desktop-only items on mobile, ensure gap/padding), `src/components/MobileBottomNav.tsx` (already fine, verify safe-area padding), `src/components/Footer.tsx` (stack columns, wrap link rows).

For each file the recipe is the same three passes: (a) replace `flex flex-wrap` header rows with the grid pattern from `responsive-layout-patterns`, (b) add `min-w-0` / `truncate` / `shrink-0` where text meets icons, (c) drop `whitespace-nowrap` and giant fixed widths, use responsive `text-*`/`p-*`/`gap-*`.

## 4. Verification

- `bunx tsgo --noEmit` to typecheck (theme toggle removal must not leave dangling imports).
- Drive Playwright at `http://localhost:8080` at viewport `375x812` (Android-ish) — screenshot: landing, auth modal, dashboard, analytics, feed, explore, profile, my-orders, messages, transactions. Confirm no horizontal scroll (`document.documentElement.scrollWidth === innerWidth`), dark background everywhere, no light-mode flash on reload.

## Out of scope

- No business logic, DB, or route changes.
- No visual redesign — colors, gradients, and the existing dark palette stay as-is; only sizing, spacing, and layout structure change.
