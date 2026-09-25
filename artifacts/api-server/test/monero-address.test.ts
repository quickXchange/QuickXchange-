import assert from "node:assert/strict";
import test from "node:test";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { isValidMoneroMainnetAddress } from "../src/lib/monero-address";
import { isSyntacticallyValidManualWalletAddress } from "../src/lib/manual-wallet-validation";

// Public Monero documentation standard address / decoded body:
// https://docs.getmonero.org/public-address/standard-address/
const standard = "4AdUndXHHZ6cfufTMvppY6JwXNouMBzSkbLYfpAV5Usx3skxNgYeYTRj5UzqtReoS44qo9mtmXCqY45DJ852K5Jv2684Rge";
const keys = "eda9fe8dfcdd25d5430ea64229d04f6b41b2e5a1587c29cd499a63eb79d117113076a02b73d130fb904c9e91075fcd16f735c6850dfadb125eb826d96a113f09";
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const encodedSizes = [0, 2, 3, 5, 6, 7, 9, 10, 11];

// Independent encoder makes deterministic mainnet fixtures for all three
// formats without using a real user's receiving wallet or exposing a key.
function encodeAddress(prefix: number, paymentId?: Uint8Array): string {
  const body = Uint8Array.from([
    prefix,
    ...Buffer.from(keys, "hex"),
    ...(paymentId ?? []),
  ]);
  const data = Uint8Array.from([...body, ...keccak_256(body).subarray(0, 4)]);
  let result = "";
  for (let offset = 0; offset < data.length; offset += 8) {
    const block = data.subarray(offset, offset + 8);
    let value = 0n;
    for (const byte of block) value = value * 256n + BigInt(byte);
    let encoded = "";
    while (value > 0n) {
      encoded = alphabet[Number(value % 58n)] + encoded;
      value /= 58n;
    }
    result += encoded.padStart(encodedSizes[block.length], "1");
  }
  return result;
}

const route = { id: "xmr-monero", networkCode: "XMR", networkName: "Monero", networkFamily: "xmr" };

test("mainnet standard, subaddress, and integrated XMR addresses validate with their encoded lengths", () => {
  const subaddress = encodeAddress(42);
  const integrated = encodeAddress(19, Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]));
  assert.equal(encodeAddress(18), standard);
  assert.equal(standard.length, 95);
  assert.equal(subaddress.length, 95);
  assert.equal(integrated.length, 106);
  for (const address of [standard, subaddress, integrated]) {
    assert.equal(isValidMoneroMainnetAddress(address), true);
    assert.equal(isSyntacticallyValidManualWalletAddress(route, address), true);
  }
});

test("wrong network, incorrect length, alphabet, overflow, and checksum fail closed", () => {
  const integrated = encodeAddress(19, new Uint8Array(8));
  for (const address of [
    encodeAddress(24), // stagenet standard
    encodeAddress(53), // testnet standard
    encodeAddress(36), // stagenet subaddress
    encodeAddress(63), // testnet subaddress
    encodeAddress(25, new Uint8Array(8)), // stagenet integrated
    encodeAddress(54, new Uint8Array(8)), // testnet integrated
    encodeAddress(19), // integrated prefix without payment ID
    encodeAddress(18, new Uint8Array(8)), // standard prefix with payment ID
    standard.slice(1),
    integrated + "1",
    standard.replace("A", "0"), // forbidden Monero alphabet character
    "z".repeat(11) + standard.slice(11), // 8-byte block overflow
    standard.slice(0, -1) + (standard.endsWith("1") ? "2" : "1"),
    " " + standard.slice(1), // whitespace inside rather than trim
  ]) {
    assert.equal(isValidMoneroMainnetAddress(address), false, address);
    assert.equal(isSyntacticallyValidManualWalletAddress(route, address), false, address);
  }
});

test("Monero validation belongs only to the configured XMR route", () => {
  assert.equal(isSyntacticallyValidManualWalletAddress({ ...route, networkCode: "BEP20" }, standard), false);
  assert.equal(isSyntacticallyValidManualWalletAddress({
    ...route, id: "other", networkFamily: "ethereum",
  }, standard), false);
  assert.equal(isSyntacticallyValidManualWalletAddress(route, "0x3E00000000000000000000000000000000000001"), false);
});