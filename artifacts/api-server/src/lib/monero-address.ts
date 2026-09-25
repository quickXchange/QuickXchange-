import { timingSafeEqual } from "node:crypto";
import { keccak_256 } from "@noble/hashes/sha3.js";

// Monero encodes each eight-byte block independently, with fixed-width Base58
// padding. Decoding the entire string as ordinary Base58 gives wrong bytes.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const DECODED_BLOCK_SIZES: Record<number, number> = { 7: 5, 11: 8 };

function decodeBlock(block: string): Uint8Array | null {
  const byteCount = DECODED_BLOCK_SIZES[block.length];
  if (!byteCount) return null;
  let value = 0n;
  for (const character of block) {
    const digit = ALPHABET.indexOf(character);
    if (digit < 0) return null;
    value = value * 58n + BigInt(digit);
  }
  if (value >= 1n << BigInt(byteCount * 8)) return null;
  const bytes = new Uint8Array(byteCount);
  for (let index = byteCount - 1; index >= 0; index--) {
    bytes[index] = Number(value & 0xffn);
    value >>= 8n;
  }
  return bytes;
}

/** Verify a mainnet Monero standard, integrated, or subaddress. */
export function isValidMoneroMainnetAddress(address: string): boolean {
  if (address.length !== 95 && address.length !== 106) return false;
  const fullBlocks = address.length === 95 ? 8 : 9;
  const bytes = new Uint8Array(address.length === 95 ? 69 : 77);
  for (let index = 0; index < fullBlocks; index++) {
    const block = decodeBlock(address.slice(index * 11, (index + 1) * 11));
    if (!block) return false;
    bytes.set(block, index * 8);
  }
  const finalBlock = decodeBlock(address.slice(fullBlocks * 11));
  if (!finalBlock) return false;
  bytes.set(finalBlock, fullBlocks * 8);

  // 18: standard; 19: integrated (with 8-byte payment ID); 42: subaddress.
  if (bytes[0] !== (bytes.length === 77 ? 19 : 18) &&
      !(bytes.length === 69 && bytes[0] === 42)) return false;
  const body = bytes.subarray(0, bytes.length - 4);
  return timingSafeEqual(
    Buffer.from(bytes.subarray(bytes.length - 4)),
    Buffer.from(keccak_256(body).subarray(0, 4)),
  );
}