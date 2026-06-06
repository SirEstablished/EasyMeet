## Functional smoke test — EasyMeet

Goal: click through every interactive surface on the site and report a per-feature pass/fail with the exact error (console message, failed network call, broken navigation, etc.). No code changes in this pass — fixes come after we agree on what's actually broken.

### How I'll run it

1. Open the preview in the test browser, sign in with the existing session (if not signed in I'll stop and ask you to log in once).
2. Walk each page below and exercise every button, link, form, filter, dialog, and tab.
3. Capture console errors, failed network requests (4xx/5xx), and any UI that does nothing or crashes.
4. For destructive actions (delete order, delete product, cancel booking, send money) I will NOT click — I'll only verify the dialog opens and note that I skipped the confirm step.

### Pages and features I'll cover

Public
- `/` landing — all nav links, CTAs, footer links, theme toggle
- `/about`, `/privacy`, `/terms` — render + links
- `/auth` — sign-up, sign-in, password reset, Google OAuth button (open only)

Authenticated app
- `/dashboard` — stat cards, quick-link tiles, sidebar nav
- `/feed` — create post, image upload, like, comment, boost dialog, mention autocomplete, post menu, infinite scroll
- `/explore` — search, category pills, profile card → profile navigation
- `/shop` — search, filters, product card → detail page
- `/shop/product/:id` — image gallery, Paystack buy flow (init only, no real payment), review section
- `/messages` — conversation list, send message, unread indicator
- `/profile`, `/profile/:id`, `/my-profile` — tabs (services / products / reviews / posts), edit profile dialog, verification modal, message button
- `/my-orders` — status filters, review dialog (open only)
- `/my-bookings` — status filters, cancel dialog (open only)
- `/my-services` — create, edit, delete dialog (open only)
- `/my-products` — create, edit, delete dialog (open only)
- `/settings` — every toggle, notification prefs, save button, sign-out

Global
- App navbar links, notifications bell dropdown, back-to-top button, route transitions

### Deliverable

A single report grouped by page, in this shape:

```text
/feed
  ✓ Create post (text)
  ✓ Like / unlike
  ✗ Comment submit — 403 from POST /rest/v1/comments, RLS rejection
  ⚠ Boost dialog opens but "Pay" button does nothing (no network call)
  ⊘ Delete post — skipped (destructive)
```

Plus a short "top issues to fix first" list at the end.

### What I will NOT do in this pass

- No code edits, no schema changes, no migrations.
- No real Paystack charges, no real deletes, no sending real money.
- No responsive / visual audit (you picked functional only).

After you see the report, tell me which issues to fix and I'll switch to build mode and patch them.
