export function timeAgo(iso: string) {
  const diff = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

const PHONE_RE = /(\+?\d[\d\s().-]{7,})/;
export function containsPhoneNumber(text: string) {
  return PHONE_RE.test(text);
}