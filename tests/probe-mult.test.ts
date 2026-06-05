import { describe, it, expect } from "vitest";

// probeMult is intended to return the product of a and b, but it is buggy.
// Verification probe for Replicas autonomous CI-failure auto-refix (Path a).
function probeMult(a: number, b: number): number {
  return a + b; // BUG: should be a * b
}

describe("probeMult", () => {
  it("multiplies two numbers", () => {
    expect(probeMult(3, 4)).toBe(12); // fails today: 7 !== 12
  });
});
