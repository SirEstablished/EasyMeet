
# Escrow, Disputes & Refunds

A large, multi-surface feature. Plan below — please approve before I start building.

## 1. Database (new migration)

New tables in `public`:

- `escrow_orders`
  - `id uuid pk`, `created_at`, `updated_at`
  - `kind text check in ('service','product')`
  - `customer_id uuid`, `professional_id uuid`
  - `conversation_id uuid null` (services)
  - `product_id uuid null`, `quantity int null` (shop)
  - `agreement_id uuid null`
  - `amount_ngn numeric`, `commission_amount numeric`, `payout_amount numeric`
  - `status text` — `pending_payment | holding | in_progress | completed | disputed | refunded | cancelled`
  - `paystack_reference text`, `paid_at`, `released_at`, `refunded_at`
  - `refund_status text null`, `refund_amount numeric null`
- `service_agreements`
  - `id`, `conversation_id`, `professional_id`, `customer_id`
  - `title`, `description`, `price_ngn`, `terms`
  - `status text` (`pending|accepted|rejected|cancelled`), `accepted_at`
- `escrow_disputes`
  - `id`, `order_id`, `opened_by`, `reason`, `status` (`open|resolved_release|resolved_refund`)
  - `resolution_note`, `resolved_by`, `resolved_at`
- `escrow_dispute_evidence`
  - `id`, `dispute_id`, `uploaded_by`, `file_url`, `note`, `is_chat_snapshot bool`
- Storage bucket `dispute-evidence` (private)
- RLS: customer & professional read/write their own rows; admin (`has_role admin`) full read; service_role full.
- Grants per project rules.

## 2. Server functions (`src/lib/escrow.functions.ts`)

All authenticated via `requireSupabaseAuth`, with Zod validation:

- `createAgreement({conversation_id, title, description, price_ngn, terms})` (professional)
- `acceptAgreement({agreement_id})` (customer) → creates `escrow_orders` row `pending_payment`
- `confirmEscrowPayment({order_id, reference})` → verifies via existing `verifyPaystackTransaction`, sets `status='holding'`, computes 3% commission
- `markOrderComplete({order_id})` (customer) → status `completed`, sets released_at, computes `payout_amount` (97%). Records release; payout to professional handled manually for now (note in UI).
- `openDispute({order_id, reason})` → status `disputed`, snapshots last 100 chat messages into `dispute_evidence` as JSON file
- `uploadDisputeEvidence` (signed URL helper)
- `resolveDispute({dispute_id, outcome, note})` (admin only)
- `requestRefund({order_id})` (customer, only when cancelled or dispute resolved in their favour) → marks `refund_status='processing'`, `refunded_at`. (Actual Paystack refund API call server-side using secret key.)
- `createShopEscrowOrder({product_id, quantity, reference})` for shop checkout

## 3. UI changes

### Messages thread (`src/routes/_authenticated/messages.tsx`)
Add an **Escrow panel** above the composer showing current agreement/order state with stage-appropriate buttons:
- Professional: "Send Agreement" → dialog (title, description, price, terms)
- Customer: "Accept Agreement", "Pay into Escrow" (Paystack), "Mark as Complete", "Open Dispute"
- Professional: "Open Dispute" after payment
- Stage indicator (1–6)

### Shop product page (`shop.product.$id.tsx`)
Replace direct seller payment with escrow flow: pay → `createShopEscrowOrder` → order appears in "My Orders" with "Mark as Complete" / "Open Dispute" / "Refund" buttons.

### My Orders (`my-orders.tsx`)
Show escrow orders with current stage, action buttons, and refund popup with the exact copy specified.

### Admin disputes page (new `src/routes/_authenticated/admin.disputes.tsx`)
Admin-only list of open disputes with evidence viewer and Release/Refund buttons.

## 4. Refund flow

Server function calls Paystack `POST /refund` with `transaction: reference`. On success sets `refund_status='processing'`. Popup copy shown client-side after success.

## 5. Notifications

Insert rows into existing `notifications` table (if present) for:
- agreement sent/accepted
- payment received
- order completed/released
- dispute opened/resolved
- refund processed

## Out of scope (will note in chat after build)
- Automated payout to professional bank account (Paystack Transfers requires recipient setup — left as manual admin action for now; payout_amount tracked).
- Email notifications.

Approve to proceed and I'll implement.
