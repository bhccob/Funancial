/** 1 is the test reminder's; 0 is not a valid notification id. */
const FIRST_ID = 2;
/** Android notification ids are 32-bit signed integers, and the plugin rejects anything wider. */
const LAST_ID = 0x7fffffff;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const encoder = new TextEncoder();

/** FNV-1a, 32-bit, over the key's UTF-8 bytes. */
function fnv1a(key: string): number {
  let hash = FNV_OFFSET;
  for (const byte of encoder.encode(key)) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash;
}

/**
 * The notification ids for these reminder keys, one each, in the same order. An id comes from
 * the key alone (FNV-1a, kept to the 31 bits that stay positive), so the same occasion gets the
 * same id every time. Two keys that land on one id are told apart by moving the later one on to
 * the next free id; 0 and 1 are never used.
 */
export function reminderIds(keys: string[]): number[] {
  const taken = new Set<number>();
  return keys.map((key) => {
    let id = fnv1a(key) & LAST_ID;
    while (id < FIRST_ID || taken.has(id)) id = id >= LAST_ID ? FIRST_ID : id + 1;
    taken.add(id);
    return id;
  });
}
