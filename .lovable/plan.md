## Overview

Four substantial feature areas across Explore, Reviews, Gold Tick, and Verification flows. This plan groups the work so existing features stay intact.

---

## FIX 1 — Explore page improvements

**DB migration**
- Add `latitude numeric`, `longitude numeric` columns to `public.profiles` (nullable).

**EditProfileDialog**
- Add "Use my current location" button that calls `navigator.geolocation.getCurrentPosition`; on success store `latitude`/`longitude` into the update payload. Graceful fallback if denied.

**ProfileCard** (`src/components/ProfileCard.tsx`)
- Display: large avatar (h-14 w-14 / 56px), primary line = `@username` if present else `full_name`, location below in muted text, first 60 chars of bio (`...` if longer), optional `"X.X km away"` line when distance prop passed.
- Add optional `distanceKm?: number` prop.

**Explore route** (`src/routes/_authenticated/explore.tsx`)
- Add "Near Me" filter chip. On click, request geolocation; cache coords in state.
- Haversine helper in `src/lib/geo.ts`.
- When Near Me active, compute distance per profile (only those with lat/lng), sort ascending, pass `distanceKm` into card.
- Profiles without coords appear after, no km shown.

---

## FIX 2 — Review system after completed orders

**ReviewOrderDialog** (new `src/components/ReviewOrderDialog.tsx`)
- Star picker (1-5 required), textarea (max 300, optional), submit.
- INSERT into `reviews` with `reviewer_id=auth.uid()`, `professional_id=order.provider_id`, `rating`, `comment`. (Schema uses `professional_id`/`reviewer_id`; no `service_id` field present — skip if not in schema.)
- After insert, also insert notification for the customer when order becomes completed (handled below).

**my-orders route**
- For each order with `status='completed'` AND no existing review by current user for that provider+order, show "Leave a Review" button.
- Track reviewed orders: query `reviews` filtered by `reviewer_id` once and match by `professional_id`+approximate — better: add `order_id` column? Spec doesn't require. Use simple check: one review per (reviewer, professional) — show button only if none exists yet for that provider. (Documented as limitation.)
- After submit: replace button with "Thanks for your review!".

**Notifications**
- When the professional marks an order completed (existing update site), insert notification row for customer: "How was your experience with X? Leave a review."

---

## FIX 3 — Gold tick criteria

**DB migration**
- Add `is_banned boolean default false` to profiles.
- Update/replace `award_gold_tick` trigger function: set `gold_tick=true` when `avg_rating>=4.8 AND review_count>=50 AND created_at <= now() - interval '6 months' AND is_banned=false AND profile_complete`. Profile complete = all of full_name, username, bio, location, phone, avatar_url not null/empty.
- Trigger on profiles update of relevant fields + reviews insert.

**UI**
- Update gold tick description text on ProfileView / My Profile page.

---

## FIX 4 — Verification document upload flow

**Storage**
- Create private bucket `verification-docs` via tool. RLS: users can upload to/read their own `${uid}/...` path.

**DB migration** — `verification_requests` table per spec, with RLS (select/insert own only) + grants.

**VerificationModal** (new `src/components/VerificationModal.tsx`)
- Multi-step: Documents → Payment → Confirmation.
- Blue: ID upload, selfie, phone confirm, optional cert. Price ₦2,000/month.
- White: CAC doc, business name, reg number, address proof, owner ID, business phone. Price ₦5,000/month.
- Uploads files to `verification-docs/${userId}/${type}-${ts}-${name}`.
- On payment success (existing Paystack flow), INSERT verification_requests row with collected URLs.
- Final step shows 24–48h message.

**ProfileView wiring**
- Replace direct payment trigger on Blue/White tick buttons with opening this modal.
- Update displayed pricing text.

---

## Technical details

- Haversine in `src/lib/geo.ts` returns km.
- Distance hidden when no lat/lng on profile.
- All new SQL in fresh migration files under `supabase/migrations/`.
- Bucket created via `supabase--storage_create_bucket`.
- Tailwind/semantic tokens reused; brand purple/green already in theme.
- Mobile-first layout retained on Explore grid and modals (sm: breakpoints already used).

---

## Out of scope / assumptions

- Reverse geocoding of stored text locations into lat/lng is NOT done; only freshly captured coords count for distance.
- Review uniqueness uses `(reviewer_id, professional_id)` since `reviews` table has no `order_id` column — one review per professional per reviewer.
- Notifications use existing `notifications` table shape; if absent, fallback to skipping silently.
- Admin approval workflow for verification_requests is not built (spec only requires user-side submission).
