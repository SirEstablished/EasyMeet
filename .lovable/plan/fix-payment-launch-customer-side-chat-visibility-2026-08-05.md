# Fix payment launch + customer-side chat visibility

## 1. Payment button does nothing (confirmed cause)

The environment file contains no `VITE_FLUTTERWAVE_PUBLIC_KEY` (verified: the key is absent from `.env`). Without it, `payWithFlutterwave` rejects immediately with "Payments are not configured yet", and at some call sites that rejection is swallowed, so the button looks dead.

Changes:
- In `src/lib/flutterwave.ts`, log `[flw] public key:` on load (masked prefix only, never the full value) and make the missing-key case throw a clear `Payment not configured` error.
- At every payment call site (escrow payment, product buy, boost, verification, staff register), surface that error as a toast `Payment not configured` instead of failing silently.
- Also handle the checkout script failing to load with `Could not load the payment window — check your connection`.

Required from you: the Flutterwave **public** key (`FLWPUBK_…`). Until it is stored as `VITE_FLUTTERWAVE_PUBLIC_KEY`, no code change can open the payment window — the fix above only makes the failure visible instead of silent.

## 2. Customer not seeing professional's messages / agreements

Verified in code: the chat already loads conversations with `user_a = me OR user_b = me`, loads messages by `conversation_id`, and subscribes to `messages`, `service_agreements` and `escrow` filtered by `conversation_id`. So the client query shape described in the request is already in place — which points at the database side. The preview backend for this project does not contain the `conversations` / `messages` / `service_agreements` tables at all (verified), so the live database must be inspected before changing behaviour.

Step 1 — diagnose against the real database:
- Confirm `messages`, `conversations` and `service_agreements` are members of the realtime publication. Realtime only delivers rows for published tables; if `messages` is missing, only the sender sees the message via their own refetch — this is the leading suspect and matches the symptom.
- Confirm the read rules on all three tables allow **both** participants (`user_a` and `user_b`), not just the sender. Realtime respects the same read rules, so a sender-only rule blocks both the query and the live event for the customer.
- Confirm a customer can update `messages` (read receipts) without that failure interrupting the load.

Step 2 — fix what the diagnosis shows, in one migration:
- Add any table missing from the realtime publication.
- Repair or replace any read policy that is not "either participant of the conversation can read", including agreements, so an agreement sent by a professional is readable by the customer receiver.
- Leave existing insert/update rules untouched so nothing currently working breaks.

Step 3 — client hardening (small, no visual change):
- Refetch messages and agreements when the chat regains focus/visibility, so a missed realtime event self-heals instead of needing a reload.
- Log realtime channel subscription errors so future breakage is diagnosable.

## Verification
- With a customer session and a professional session open, send a message and an agreement from the professional and confirm both appear on the customer side without reload.
- Confirm the payment button either opens the Flutterwave window (once the key is set) or shows the `Payment not configured` toast.