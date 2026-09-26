const ALLOWED_TAGS = new Set(["i", "b", "em", "strong"]);
const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// AniList/MAL descriptions carry light HTML (<i>, <br>). Rebuild it keeping only
// inline formatting + line breaks; everything else is reduced to escaped text.
export function descriptionToHtml(raw?: string | null): string {
  if (!raw) return "";
  const doc = new DOMParser().parseFromString(raw, "text/html");
  const walk = (node: Node): string =>
    Array.from(node.childNodes)
      .map((n) => {
        if (n.nodeType === Node.TEXT_NODE)
          return escapeHtml(n.textContent ?? "");
        if (!(n instanceof Element)) return "";
        const tag = n.tagName.toLowerCase();
        if (tag === "br") return "<br>";
        if (tag === "script" || tag === "style") return "";
        const inner = walk(n);
        return ALLOWED_TAGS.has(tag) ? `<${tag}>${inner}</${tag}>` : inner;
      })
      .join("");
  return walk(doc.body)
    .replace(/(<br>\s*){3,}/g, "<br><br>")
    .trim();
}

// navigator.clipboard only exists in secure contexts (HTTPS/localhost); the app
// is served over plain HTTP on the LAN, so fall back to a hidden textarea.
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // fall through
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("Copy command rejected");
}
