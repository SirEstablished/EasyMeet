# Messaging & Escrow UI Redesign

A purely visual refresh of the chat thread and escrow stage cards to match the reference screens. Backend logic, escrow RPCs, fee math, data queries, and access rules stay exactly as they are.

## 1. Chat header
- Keep avatar, name, verification ticks, founding badge, role pill and last-seen text; restyle to the reference proportions.
- Role pill: soft lavender for Customer, soft indigo for Professional, with "• Last seen 11:21" inline beside it.
- Keep the call and overflow buttons on the right, on a flat white header with a hairline bottom border.

## 2. "No active deal yet" banner
- When no deal is active, show a lavender-bordered rounded card at the top of the thread: shield icon tile, "No active deal yet", subtext "Start a protected deal to work with peace of mind", and a solid purple "+ Start Protected Deal" button.
- The button reuses the existing new-deal action; behaviour is unchanged, including staying hidden for the customer role.
- When a deal is active, the existing escrow status banner stays and is restyled to the same card language.

## 3. Message bubbles
- White chat background with centered pill date separators.
- Received: avatar on the left, light gray bubble, timestamp underneath.
- Sent: right-aligned lavender bubble with dark text, timestamp plus double-tick read receipt underneath (existing sent/delivered/read state drives the tick colour).

## 4. Escrow stage cards
All stage cards already exist and stay wired to the same data; this restyles them and aligns their copy to the reference.

| Stage | Card | Accent |
|---|---|---|
| 1 | Agreement Sent — Waiting for customer response, View Agreement | indigo |
| 2 | Agreement Received — Accept / Request Changes / Reject | amber |
| 3 | Agreement Accepted 🎉 + Pay into Escrow + progress | green |
| 4 | Funds in Escrow 🔒 — Payment secured by EasyMeet | green |
| 5 | Work in Progress + Escrow ID + progress | green |
| 6 | Job Completed ✅ — Please review the work | green |
| 7 | Action Required — Release Payment / Report Issue / Request Changes | amber |
| 8 | Payment Released 🎉 + summary + Leave a Review | green |
| 9A | Dispute Opened ⚠️ + what happens next + View Dispute | red |
| 9B | Dispute Resolved ✅ + summary + Leave a Review | green |

- Shared restyle: coloured icon tile top-left, bold title with a one-line subtitle, large bold amount, small muted `Escrow ID: ESC-...`, then the progress bar.
- Progress bar simplified to the reference's four labelled steps — Agreement, Escrow Paid, In Progress, Completed — with green check circles for completed steps and gray outline circles for pending ones (currently five plain bars).

## 5. Deal Completed summary card
- Restyle the permanent summary card: green check circle, "Deal Completed / Payment released to professional", a "Completed" pill, then icon-led rows for Service + amount, Customer Paid, EasyMeet Protection Fee, Professional Received (green), Completed on (date and time), and a "View Full Deal Details ›" link.
- All values keep reading from the same escrow fields; nothing is recalculated.

## 6. Status legend
- Restyle the bottom legend into icon chips: 🔒 Secure & Protected, ⏳ Waiting, ⚡ Action Required, ✅ Completed, ⚠️ Issue/Dispute, each with a short caption, wrapping on mobile.

## Technical notes
- Files touched: `src/routes/_authenticated/messages.tsx` (header, banner, bubbles, legend) and `src/components/EscrowChatCards.tsx` (CardShell, EscrowProgress, all stage cards, DealSummaryCard, StatusLegend).
- `src/components/EscrowPanel.tsx` is touched only if the "Start Protected Deal" trigger needs surfacing to the banner; its escrow and fee logic stays untouched.
- Colours use existing tokens plus the EasyMeet palette already in use (#6C47FF primary, emerald success, red destructive).
- No database queries, realtime subscriptions, RPCs, inserts, or message payload shapes change.