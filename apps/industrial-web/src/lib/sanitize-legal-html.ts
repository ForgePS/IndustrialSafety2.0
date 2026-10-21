/**
 * Defense-in-depth HTML sanitizer for platform-authored legal documents.
 * Strips scripts, embeds, and inline event handlers before dangerouslySetInnerHTML.
 */
export function sanitizeLegalHtml(html: string): string {
  const raw = String(html ?? "");
  if (!raw.trim()) return "";
  if (typeof DOMParser === "undefined") {
    return raw
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
      .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "")
      .replace(/\shref\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, ' href="#"');
  }
  const doc = new DOMParser().parseFromString(raw, "text/html");
  doc
    .querySelectorAll("script,iframe,object,embed,link[rel='import'],meta,base")
    .forEach((el) => el.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
        continue;
      }
      if ((name === "href" || name === "src" || name === "xlink:href") && /^javascript:/i.test(value)) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return doc.body.innerHTML;
}
