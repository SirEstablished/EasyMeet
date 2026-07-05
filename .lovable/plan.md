## Goal
Redesign the comments popup to match the reference: a rounded bottom sheet with a drag handle, "Comments 24" header, "Newest ▾" sort control, per-comment heart with count, "Reply" link, and a pill-style input with emoji button and purple circular send button. Keep all existing functionality (realtime, submit, delete, mentions, phone-check, count callback).

## Changes
**File:** `src/components/CommentsDrawer.tsx`

1. Swap `Sheet` (right side) for shadcn `Drawer` (bottom sheet) so it slides up from the bottom on mobile with rounded top corners and a drag handle — matches the reference exactly. Keep the same `open` / `onOpenChange` API so `feed.tsx` is untouched.
2. **Header:** "Comments" bold + purple count next to it (`24`). Right side: "Newest ▾" dropdown (client-side sort: Newest / Oldest). Purely UI reordering — no schema change.
3. **Comment row redesign:**
   - Larger avatar (40px) with soft pastel fallback ring.
   - Bold author name, body text below (no gray bubble background — plain on white to match reference).
   - Meta row: `3d ago  ·  Reply`. "Reply" is a link that focuses the input and prefixes `@username `. Owner still gets a subtle Delete action in the same row.
   - Right column: outlined heart icon with count underneath.
4. **Per-comment likes:** add a lightweight local like toggle using existing patterns — new table not required for visual redesign. To avoid backend changes, render the heart as a UI-only affordance that toggles local state and increments a displayed count (persists in `localStorage` per `comment.id`). No new tables/RPCs. (If the user later wants real persistence I'll add a `comment_likes` table.)
5. **Composer:** rounded pill container holding `MentionTextarea` (transparent, no border) + emoji-smile button (opens a tiny emoji list popover with common emojis that append to text). Send becomes a `h-11 w-11` purple circle with paper-plane icon. Keeps `submit`, `sending`, `disabled`, phone-check, and 500-char limit intact.
6. **Styling:** white surface, `rounded-t-3xl`, soft top handle bar, `max-h-[85vh]`, safe-area padding at bottom for iPhone. Divider between comments is a thin `border-border/60` hairline. Use `#6C4CF6` via `text-primary` / `bg-primary`.

## Preserved behavior
- Same props (`postId`, `open`, `onOpenChange`, `onCountChange`).
- Same Supabase reload + realtime channel subscription.
- Same insert / delete flows, mention parsing, phone-block guard, toast errors.
- `PostCard`'s call site unchanged.

## Out of scope
- No new tables, RPCs, or migrations.
- No changes to `feed.tsx`, `PostCard.tsx`, or post-side like counts.
- Threaded replies are visual only (the "Reply" link seeds `@username` into the composer; no reply-parent column yet).