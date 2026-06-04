## Plan

Four connected fixes spanning DB schema, storage, signup UX, and a new marketplace.

### 1. Database migrations (one migration file)

**profiles** — add columns:
- `profession TEXT`
- `business_type TEXT`
- `sells_products BOOLEAN DEFAULT FALSE`
- `offers_services BOOLEAN DEFAULT TRUE`

**products** — new table:
- id, seller_id (FK profiles, cascade), title, description, price NUMERIC, currency TEXT default 'NGN', category, product_type CHECK ('physical'|'digital') default 'physical', image_urls TEXT[], digital_file_url TEXT, stock_count INT default 0, is_active BOOL default true, created_at
- GRANTs: SELECT/INSERT/UPDATE/DELETE to authenticated; ALL to service_role; SELECT to anon
- RLS: select where is_active=true (authenticated); insert/update/delete by seller_id = auth.uid()

**orders** — extend if needed: ensure it accepts product orders (add `product_id UUID` nullable, `kind TEXT` default 'service'). Existing `service_id` stays nullable.

### 2. Storage buckets

- Ensure `service-images` public bucket exists (already used)
- Create `product-images` public bucket
- Create `digital-products` **private** bucket with RLS so only seller can upload/read; signed URLs delivered after purchase

### 3. Image optimisation utility

`src/lib/imageOptimize.ts`:
- `optimizeImage(file, { maxDim=1200, maxSizeKB=500 })` → File
- Uses Canvas. PNG with alpha → PNG; else JPEG with iterative quality reduction until <500KB
- Plug into: avatar upload, cover upload, post media, service image, product images

### 4. FIX 1 — Services CRUD

Audit `ServiceFormDialog.tsx`: ensure insert/update path actually fires, image goes through `optimizeImage` then upload to `service-images/{uid}/{filename}`, then INSERT/UPDATE `services` with `owner_id=auth.uid()`, title, description, price_ngn, category, image_url, is_active. Toast success/error. Parent `my-services.tsx` already refreshes via `onSaved`.

### 5. FIX 3 — Signup flow

Update `AuthModal.tsx` to add a Step 2 after role selection:
- Professional: profession dropdown (predefined list + Other free text), sells_products toggle
- Business: business_type dropdown, mode toggle (sell products / offer services / both)
- Customer: skip
- On signup, save extra fields into profiles after user creation (or via trigger update)

### 6. FIX 4 — Products marketplace

**New files:**
- `src/components/ProductFormDialog.tsx` — add/edit product with up to 4 images (all optimised), physical (stock) vs digital (file upload to `digital-products`)
- `src/routes/_authenticated/my-products.tsx` — list/manage; gated by `sells_products=true`
- Rewrite `src/routes/_authenticated/shop.tsx` — query `products` table only, not `services`

**Update orders insert for products:** store `product_id`, `service_title` = product title.

**Digital delivery:** after successful payment, generate signed URL for `digital_file_url` (path stored as bucket path) and show in success modal.

**Navbar/dashboard:** add "My Products" link when `sells_products=true`; keep "My Services" when `offers_services=true`.

### Technical notes

- All image inputs run through `optimizeImage` with a brief "Optimising image..." indicator
- Add `Product` interface + `PRODUCT_CATEGORIES`, `PROFESSIONS`, `BUSINESS_TYPES` to `client.ts`
- Update `Profile` interface with new fields
- Remove services from `/shop` query; service discovery stays on profile pages
- Keep ₦ formatting, purple/green branding intact

### Out of scope (won't touch)

- Existing messaging/feed/explore code
- Paystack core flow (reused)
- Auth-protected route layout