// Shared Paystack fee helper. Buyer always pays the fee — EasyMeet never absorbs it.
// Formula: 1.5% of amount, +₦100 when amount >= ₦2,500, capped at ₦2,000.
export function computePaystackFee(amountNgn: number): number {
  const amount = Math.max(0, Number(amountNgn) || 0);
  if (amount <= 0) return 0;
  const fee = amount * 0.015 + (amount >= 2500 ? 100 : 0);
  return Math.min(2000, Math.round(fee * 100) / 100);
}

export function withPaystackFee(amountNgn: number) {
  const amount = Math.max(0, Number(amountNgn) || 0);
  const fee = computePaystackFee(amount);
  return { amount, fee, total: Math.round((amount + fee) * 100) / 100 };
}

// Nigerian commercial + digital banks (Paystack-supported set).
export const NIGERIAN_BANKS: string[] = [
  "Access Bank",
  "Citibank Nigeria",
  "Ecobank Nigeria",
  "Fidelity Bank",
  "First Bank of Nigeria",
  "First City Monument Bank (FCMB)",
  "Globus Bank",
  "Guaranty Trust Bank (GTBank)",
  "Heritage Bank",
  "Keystone Bank",
  "Kuda Bank",
  "Moniepoint MFB",
  "Opay",
  "Palmpay",
  "Parallex Bank",
  "Polaris Bank",
  "Premium Trust Bank",
  "Providus Bank",
  "Stanbic IBTC Bank",
  "Standard Chartered",
  "Sterling Bank",
  "SunTrust Bank",
  "TAJBank",
  "Titan Trust Bank",
  "Union Bank of Nigeria",
  "United Bank for Africa (UBA)",
  "Unity Bank",
  "VFD Microfinance Bank",
  "Wema Bank",
  "Zenith Bank",
];