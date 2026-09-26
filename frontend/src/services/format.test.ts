import { describe, expect, it } from "vitest";
import { descriptionToHtml } from "./format";

describe("descriptionToHtml", () => {
  it("keeps inline formatting and line breaks", () => {
    expect(
      descriptionToHtml(
        "<i>Cyberpunk</i> pulls you<br><br>back.<br><br><br><br>(Source)",
      ),
    ).toBe("<i>Cyberpunk</i> pulls you<br><br>back.<br><br>(Source)");
  });

  it("strips unknown tags, scripts and attributes but keeps text escaped", () => {
    expect(
      descriptionToHtml(
        '<a href="x" onclick="evil()">link</a><script>alert(1)</script><img src=x onerror=alert(1)>a &lt; b',
      ),
    ).toBe("linka &lt; b");
  });

  it("handles empty input", () => {
    expect(descriptionToHtml(undefined)).toBe("");
    expect(descriptionToHtml("")).toBe("");
  });
});
