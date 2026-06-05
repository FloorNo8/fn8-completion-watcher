import { describe, it, expect } from "vitest";

// probeSum is intended to return the sum of a and b, but it is buggy.
// Verification probe for Replicas @tryreplicas auto-fix (Path b).
function probeSum(a: number, b: number): number {
  return a - b; // BUG: should be a + b
}

describe("probeSum", () => {
  it("adds two numbers", () => {
    expect(probeSum(2, 3)).toBe(5); // fails today: -1 !== 5
  });
});
