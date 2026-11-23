// The token symbol is shown next to every price and balance, so it may only be a symbol or emoji.
// Letters, digits, spaces and markup characters (< > { } & quotes, slashes, backticks...) are removed, which also stops pasted code.

const MAX_CODE_POINTS = 8; // enough for flags and joined emoji such as family or skin-tone sequences

function isAllowed(cp: number): boolean {
  return (
    cp === 0x24 ||                       // $
    (cp >= 0xa2 && cp <= 0xa5) ||        // cent, pound, currency, yen
    cp === 0xe3f ||                      // baht
    cp === 0x20ac ||                     // euro
    (cp >= 0x20a0 && cp <= 0x20cf) ||    // currency symbols
    cp === 0x2122 || cp === 0xa9 || cp === 0xae ||
    (cp >= 0x2190 && cp <= 0x2bff) ||    // arrows, technical, shapes, dingbats, misc symbols
    cp === 0x3030 || cp === 0x303d || cp === 0x3297 || cp === 0x3299 ||
    cp === 0x200d ||                     // joiner for combined emoji
    cp === 0xfe0f || cp === 0xfe0e ||    // emoji variation selectors
    cp === 0x20e3 ||                     // keycap
    (cp >= 0x1f000 && cp <= 0x1faff) ||  // emoji blocks, flags, skin tones
    (cp >= 0xe0020 && cp <= 0xe007f)     // flag tag characters
  );
}

export function sanitizeTokenSymbol(input: unknown): string {
  const kept: string[] = [];
  for (const ch of Array.from(String(input ?? ''))) {
    const cp = ch.codePointAt(0) as number;
    if (isAllowed(cp)) kept.push(ch);
    if (kept.length >= MAX_CODE_POINTS) break;
  }
  return kept.join('');
}

export function isValidTokenSymbol(input: unknown): boolean {
  const s = String(input ?? '');
  return s.length > 0 && sanitizeTokenSymbol(s) === s;
}
