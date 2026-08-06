# Escrow stays on "Pay into Escrow" after a successful payment

## What is confirmed

The payment itself works — Flutterwave charges the card and reports success. The
part that fails is everything after that: the panel never advances to
"Work in progress", no payment chat card appears, and no error is shown.

What I could not confirm: the app's chat/escrow data lives in a backend I cannot
query from here (the chat, agreement and escrow tables are not in the backend the
tools are connected to). So I can't yet say *which* of the post-payment steps
fails. Right now that step fails silently, which is why nothing at all happens.
The plan therefore makes the failure visible first, then makes the flow survive it.

## Step 1 — Make the post-payment path impossible to fail silently

In the payment handler in the escrow panel, each stage after the charge
(verification, escrow creation, chat card insert) currently can exit early
without telling the user. Change each exit to:

- log a clearly tagged line (`[escrow] verify ->`, `[escrow] rpc ->`, `[escrow] card ->`)
- show the exact error text in a toast, including the backend error code/message
- never leave the panel silently on stage 3

## Step 2 — Advance the panel before the backend round-trip

Right now the panel only moves once the escrow record comes back and survives a
later refetch. Change the order so that, immediately after the charge is verified:

- the panel state flips to "funds in escrow / work in progress"
- the Pay button is replaced by "Mark as Complete" and "Open Dispute"
- a later refetch cannot pull it back to stage 3 while the payment reference for
  this agreement exists

This is what removes the "nothing happens" symptom even if the write is slow.

## Step 3 — Fallback when the escrow creation call fails

If the `create_escrow_payment` call errors or is unavailable, fall back to
creating the escrow record directly (same fields: conversation, agreement,
customer, provider, amount, payment reference, status holding, stage
work_in_progress), then continue with the chat card. If both paths fail, the
payment reference is still shown to the user with a "contact support" toast so a
successful charge is never lost.

## Step 4 — Chat card and message

Post the payment card and the "Payment placed in escrow. Work can begin." notice
after whichever write succeeded, and log an error if the insert is rejected
(that insert failing is another way the card can silently go missing today).

## Verification

Run one real payment end to end and confirm, in order: the tagged logs appear,
the panel switches to work-in-progress without a reload, the payment card shows
in the chat, and the professional sees the same state.

## Technical notes

- File: `src/components/EscrowPanel.tsx` (`payEscrow`, plus the `load()` merge
  logic that can overwrite the optimistic order).
- No fee maths, agreement types, RPC parameter names, or UI styling change.
- No database migration in this plan — the escrow data lives in an external
  backend; if Step 1's logs show the escrow function is missing or its arguments
  differ, that is a separate follow-up on that backend.
