import { describe, it, expect } from "vitest";

// probeSum returns the sum of a and b.
// Verification probe for Replicas @tryreplicas auto-fix (Path b).
function probeSum(a: number, b: number): number {
  return a + b;
}

describe("probeSum", () => {
  it("adds two numbers", () => {
    expect(probeSum(2, 3)).toBe(5);
  });
});
