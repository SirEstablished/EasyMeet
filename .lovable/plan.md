## Goal
Make every interactive element fully visible and tappable at 375–430px wide. No desktop layout, functionality, or Supabase code changes.

## Scope (visual/CSS only)

### 1. Landing header (`src/routes/index.tsx`)
- On mobile the header packs theme toggle + "Sign in" + "Get Started" into a 16px-padded row — buttons get clipped.
- Fix: tighten container padding on mobile (`px-3`), shrink buttons on `<sm` (`size="sm"`, `px-3 text-sm`), hide the standalone "Sign in" text button below `sm` (Sign-in remains accessible via Get Started → AuthModal toggle), keep theme toggle + Get Started visible. No desktop change (`sm:` breakpoints preserve current layout).
- Hero CTAs: ensure buttons stack full-width on mobile (`w-full sm:w-auto`).

### 2. App navbar (`src/components/AppNavbar.tsx`)
- The nav links row is `hidden md:flex` (good), but the right cluster (theme, bell, avatar) + logo can crowd 375px.
- Fix: reduce horizontal padding on mobile (`px-3 sm:px-6`), shrink icon buttons gap, ensure Logo truncates.
- Add a mobile bottom tab bar OR a hamburger menu? → Out of scope unless asked; instead expose the existing nav links via a `Sheet` triggered by a menu icon visible only on `<md`. This restores access to Home/Explore/Feed/Shop/Messages/Profile on mobile (currently they're inaccessible without desktop mode). Uses existing `Sheet` shadcn component — no new deps, no logic changes.

### 3. Dashboard (`src/routes/_authenticated/dashboard.tsx`)
- Audit stat cards/grids for `grid-cols-*` without a mobile fallback; ensure `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` pattern.
- Action buttons: `flex-wrap` + `w-full sm:w-auto` where they currently overflow.

### 4. My Services / My Products / My Orders / My Bookings
- Header rows with title + "Create" button: switch to `flex-col sm:flex-row` with `w-full sm:w-auto` button.
- Card grids: ensure `grid-cols-1 sm:grid-cols-2` minimum.

### 5. Profile pages (`ProfileView.tsx`, `profile.$id.tsx`)
- Action buttons (Edit/Message/Follow) wrap to a column on mobile (`flex-wrap gap-2`, buttons `flex-1 min-w-0` or full-width).
- Cover/avatar overlap area: ensure no negative-margin clipping below 375px.

### 6. Service / Product cards & dialogs
- `ServiceFormDialog` / `ProductFormDialog`: ensure `DialogContent` uses `max-w-[95vw] sm:max-w-lg` and inner buttons stack on mobile.

### 7. Global safety net (`src/styles.css`)
- Add `html, body { overflow-x: hidden; }` (or `max-width: 100vw`) as a backstop against horizontal scroll from blur orbs/decoratives.
- Constrain landing-page decorative blurs with `overflow-hidden` on their parent sections (already in hero — verify on others).

## Out of scope
- Desktop layout (≥`sm`/`md` breakpoints untouched).
- Any data fetching, Supabase, auth, routing, or business-logic code.
- New features beyond a mobile menu Sheet to surface existing nav links.

## Validation
After edits: use `preview_ui--set_preview_device_viewport` (mobile) and visually verify each route — landing, dashboard, my-services, my-products, profile, shop, feed — at 375px. Confirm no horizontal scroll and all CTAs tappable.
