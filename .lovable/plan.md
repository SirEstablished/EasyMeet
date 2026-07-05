## Goal

Restore the dark/light theme toggle so users can switch modes, while keeping dark as the default (so it still looks dark by default across devices) and preserving the mobile fit fixes from the previous turn.

## Changes

1. **`src/lib/providers.tsx`** — Re-enable a real `ThemeProvider`:
   - Default `theme` to `"dark"`.
   - On mount, read `localStorage["em-theme"]` and, if unset, fall back to `"dark"` (not the OS preference — user asked for dark default).
   - `toggle` and `setTheme` mutate state again; effect adds/removes `.dark` on `<html>` and persists to localStorage.

2. **`src/routes/__root.tsx`** — Keep `<html className="dark" style={{ colorScheme: "dark" }}>` and `theme-color: #0D0D1A` so the very first paint (before hydration) is dark. `ThemeProvider` then takes over and can flip to light after hydration if the stored preference is `"light"`. Also add a tiny inline script in `<head>` that runs before React hydrates to read `localStorage["em-theme"]` and toggle `.dark` / `color-scheme` on `<html>` — this avoids a dark→light flash for returning light-mode users.

3. **`src/styles.css`** — Revert `:root` to the original light-mode token values, keeping `.dark` overrides intact. Dark-first paint is guaranteed by the `className="dark"` on `<html>` in the shell + the pre-hydration script, not by making `:root` dark.

4. **`src/components/AppNavbar.tsx`** — Re-add the Sun/Moon toggle button (import `Moon`, `Sun`, `useTheme`; render the ghost icon button that calls `toggle()`), placed to the left of `NotificationsBell` as before.

5. **`src/routes/index.tsx`** (landing header) — Re-add the same Sun/Moon toggle button next to Sign in / Get Started, using `useTheme()`.

No other files change. Mobile responsiveness fixes and forced-dark viewport meta from the previous turn stay in place.

## Verification

- `bunx tsgo --noEmit`.
- Playwright at 360×740: load `/`, confirm dark by default; click the toggle, confirm `<html>` loses `.dark` and background turns light; reload, confirm the light preference persists; toggle back to dark and reload, confirm dark persists. Also confirm no horizontal scroll after both toggles.
