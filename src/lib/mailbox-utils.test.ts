import { describe, expect, it } from "vitest";

import { parseDispatchSubject } from "./mailbox-utils.js";

describe("parseDispatchSubject", () => {
  it("returns the frontmatter subject when present", () => {
    const raw = `---
to: cursor
subject: From Frontmatter
---

# From Heading

body`;
    expect(parseDispatchSubject(raw)).toBe("From Frontmatter");
  });

  it("falls back to the first body heading when no subject in frontmatter", () => {
    const raw = `---
to: cursor
---

# Implement caching layer

body`;
    expect(parseDispatchSubject(raw)).toBe("Implement caching layer");
  });

  // Regression: previously matched `# comment` from inside the YAML frontmatter
  // because the fallback regex ran against the raw text, not the parsed body.
  it("ignores `# comment` lines inside frontmatter", () => {
    const raw = `---
to: cursor
# this is a yaml comment
priority: 1
---

# Implement caching layer

body`;
    expect(parseDispatchSubject(raw)).toBe("Implement caching layer");
  });

  it("returns empty when no subject in frontmatter and no heading in body", () => {
    const raw = `---
to: cursor
# pre-existing setup
priority: 1
---

Some body text without heading.`;
    expect(parseDispatchSubject(raw)).toBe("");
  });
});
