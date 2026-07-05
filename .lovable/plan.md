## Wallet System — Implementation Plan

### 1. Database (single migration)

**New tables**
- `wallets` — one row per user (professional/business)
  - `user_id` (PK, FK → auth.users)
  - `available_balance numeric default 0`
  - `escrow_balance numeric default 0` (denormalized, kept in sync by triggers/RPC)
  - `total_withdrawn numeric default 0`
  - `lifetime_earnings numeric default 0`
  - `auto_withdrawal boolean default false`
  - `auto_withdrawal_threshold numeric`
  - `created_at`, `updated_at`
- `wallet_transactions`
  - `user_id`, `type` (`credit` | `withdrawal` | `refund` | `commission`), `amount`, `balance_after`, `reference_id` (order/escrow/withdrawal id), `note`, `created_at`
- `withdrawal_requests`
  - `user_id`, `amount`, `bank_name`, `account_number`, `account_name`, `status` (`pending` | `processing` | `completed` | `rejected`), `rejection_reason`, `processed_by`, `processed_at`, `paystack_transfer_ref`, `created_at`

**GRANTs + RLS**
- All three tables: `GRANT SELECT/INSERT/UPDATE/DELETE ... TO authenticated; GRANT ALL TO service_role;`
- RLS: user can SELECT their own rows; admins (via `has_role`) SELECT all withdrawal_requests. Direct client writes to wallets/wallet_transactions are blocked — all mutations go through security-definer RPCs.

**RPCs (security definer)**
- `credit_wallet_after_release(p_user_id, p_amount, p_commission, p_order_id, p_escrow_id)` — atomically: upsert wallet, add (amount - commission) to available_balance + lifetime_earnings, insert wallet_transactions row.
- `request_withdrawal(p_amount, p_bank_name, p_account_number, p_account_name)` — caller = auth.uid(). Validates balance ≥ 1000 and ≥ p_amount. Deducts from available_balance, adds to total_withdrawn, inserts withdrawal_requests (pending) + wallet_transactions (withdrawal). Returns withdrawal id.
- `admin_reject_withdrawal(p_withdrawal_id, p_reason)` — admin only. Refunds amount to wallet, subtracts from total_withdrawn, marks rejected, inserts refund transaction.
- `admin_approve_withdrawal(p_withdrawal_id, p_transfer_ref)` — admin only. Marks completed (Paystack transfer wired later as placeholder).

**Modify existing `release_escrow_payment` RPC**
- After marking escrow released, call `credit_wallet_after_release` for the provider so the payout lands in the wallet rather than an external bank transfer path.

### 2. Frontend

**New route `/wallet`** (`src/routes/_authenticated/wallet.tsx`)
- Gated to `role in (professional, business)`; customers get a redirect to dashboard.
- Sections: 4 stat cards (Available / Escrow / Total Withdrawn / Lifetime), Withdraw button (opens dialog), Recent Transactions (last 10) + "View All", Withdrawal History table with status badges + rejection reason, Auto-Withdrawal settings card (toggle + threshold, saves to `wallets`).

**Withdraw dialog** (`src/components/WithdrawDialog.tsx`)
- Zod-validated form: amount (≥1000, ≤available), bank (dropdown from `NIGERIAN_BANKS`), account number, account name.
- Calls `request_withdrawal` RPC, toast confirm, refreshes wallet.

**Dashboard wallet card** (in `src/routes/_authenticated/dashboard.tsx`)
- New `WalletSummaryCard` component: Available Balance, Escrow, Withdraw button. Only for professional/business.

**Nav link**
- Add "Wallet" entry in dashboard sidebar quickLinks (non-customer) and `MobileBottomNav` if slot allows.

**Escrow release flow**
- `EscrowPanel` / release call already invokes `release_escrow_payment` — no code change needed since RPC now credits wallet. Add notification insert (professional): "₦X has been added to your EasyMeet Wallet 🎉".

**Admin withdrawals tab** (`src/routes/_authenticated/admin.disputes.tsx`)
- Add Tabs: existing "Disputes" + new "Withdrawals". Withdrawals tab lists pending requests with pro name/amount/bank/date and Approve/Reject actions calling the admin RPCs; Reject prompts for reason. Notifies via `notifications` insert.

### 3. Realtime & hooks
- `useLiveData(['wallets','wallet_transactions','withdrawal_requests'], refresh)` on wallet + admin pages for instant updates.

### 4. Non-breaking guarantees
- No table renames; `escrow`/`orders` untouched structurally.
- `release_escrow_payment` keeps its signature — only internal behavior extended.
- Customer role sees no new UI.

### Verification
- `bunx tsgo --noEmit`
- Manual: as professional, view /wallet (empty state), release an escrow → wallet credits; request withdrawal → balance drops, admin sees it; admin reject → balance restored with reason shown.
