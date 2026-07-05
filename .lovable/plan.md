## Problem

On desktop the page can only be scrolled with the scrollbar — mouse wheel does nothing over the content. Runtime check confirms both `<html>` and `<body>` currently compute to `overflow-x: hidden; overflow-y: auto`, i.e. both are scroll containers with the same 3097px content. The wheel event targets `<body>` (which can't actually scroll because it's the same size as its content in the flex layout), so the browser doesn't forward the delta to `<html>`, which is the element that actually needs to scroll. Dragging the visible scrollbar works because it targets `<html>` directly.

Cause is in `src/styles.css`:

```css
html, body {
  overflow-x: hidden;
  max-width: 100vw;
}
```

Setting `overflow-x: hidden` implicitly sets `overflow-y` to `auto` (not `visible`), turning both elements into scroll containers.

## Fix

Replace `overflow-x: hidden` with `overflow-x: clip` on `html` and `body` in `src/styles.css`. `clip` prevents horizontal overflow (the whole reason the rule exists — decorative blurs/orbs on mobile) without establishing a scroll container, so only `<html>` remains scrollable and the mouse wheel works everywhere. Modern browsers (Chrome/Edge/Safari 16+/Firefox) all support `overflow: clip`.

No component or layout changes; nothing else touched.

## Verify

Reload the home page, hover anywhere in the content, scroll the mouse wheel — page scrolls. Re-check on `/messages`, `/my-orders`, `/dashboard`. Horizontal scroll on narrow widths stays suppressed.
