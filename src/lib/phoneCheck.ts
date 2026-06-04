export const PHONE_REGEX = /(\+?234|0)[789][01]\d{8}|\b\d{7,}\b/;

export function containsPhone(text: string): boolean {
  return PHONE_REGEX.test(text);
}

export const PHONE_BLOCK_MESSAGE =
  "Phone numbers are not allowed in messages. This protects both you and the professional.";