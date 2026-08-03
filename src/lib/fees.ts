// Shared payment-processing fee helper (Flutterwave NGN).
// Formula: 1.4% of amount + ₦100, capped at ₦2,000.
export function computeGatewayFee(amountNgn: number): number {
  const amount = Math.max(0, Number(amountNgn) || 0);
  if (amount <= 0) return 0;
  return Math.min(2000, Math.round((amount * 0.014 + 100) * 100) / 100);
}

/**
 * Single customer-facing fee. EasyMeet commission and the payment-processing
 * fee are always combined into ONE "EasyMeet Protection Fee" line.
 */
export function computeProtectionFee(commission: number, amountNgn: number): number {
  const comm = Math.max(0, Number(commission) || 0);
  return Math.round((comm + computeGatewayFee(amountNgn)) * 100) / 100;
}

export function withGatewayFee(amountNgn: number) {
  const amount = Math.max(0, Number(amountNgn) || 0);
  const fee = computeGatewayFee(amount);
  return { amount, fee, total: Math.round((amount + fee) * 100) / 100 };
}

// Nigerian commercial + digital banks.
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