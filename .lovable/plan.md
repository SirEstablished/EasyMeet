Scope: Fix the Product Sale Agreement so it displays product-specific line items instead of the Material + Labor labels, with correct escrow/release descriptions.

Changes

1. SendAgreementDialog payment summary (`src/components/EscrowPanel.tsx`, lines ~2453-2461)
   - For `agreementType === "product_sale"`, replace the current summary lines with:
     - `📦 Product Price — Held in escrow`
     - `🚚 Delivery Fee — Released immediately`
   - Keep the existing value mapping (product price from `mapped.immediate`, delivery fee from `mapped.contingency`) so stored data remains unchanged.

2. PaymentBreakdownDialog (`src/components/EscrowPanel.tsx`, lines ~1507-1511)
   - For `type === "product_sale"`, update labels to:
     - `Product Price — Held in escrow`
     - `Delivery Fee — Released immediately`
   - Keep reading product price from `materials` and delivery fee from `contingency` to match current storage.

3. ViewAgreementModal (`src/components/EscrowChatCards.tsx`, lines ~579-594)
   - Make the Amounts section type-aware.
   - For `product_sale`:
     - Show `Product Price — Held in escrow` from `materials_cost`
     - Show `Delivery Fee — Released immediately` from `contingency_cost`
   - Keep existing `material_labor` / `service` labels for other agreement types.

4. Form field helper text (`src/components/EscrowPanel.tsx`, lines ~2260-2274)
   - Update product price helper to `Held in escrow until delivery is confirmed` (or similar) to match the new summary language.
   - Keep delivery fee helper as `Released immediately`.

Backwards compatibility
- No schema or storage changes; product price continues to be stored in `materials_cost` and delivery fee in `contingency_cost` for `product_sale` agreements.
- Only display labels and helper text change, so existing agreements render with the corrected wording immediately.

Verification
- Build/typecheck the project.
- If possible, open a product sale agreement in chat and confirm the View Agreement modal shows the new labels and the Send Agreement form summary shows the new descriptions.