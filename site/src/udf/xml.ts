/** Minimal XML reader for UDF content.xml, so the parser runs without a DOM (Node, workers, browsers). */

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

export type XmlNode = XmlElement | string;

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

export function decodeEntities(value: string): string {
  if (!value.includes("&")) return value;
  return value.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[ref] ?? whole;
  });
}

/** XML parsers normalise line ends, and UDF offsets count the normalised text. */
function normaliseNewlines(text: string): string {
  return text.includes("\r") ? text.replace(/\r\n?/g, "\n") : text;
}

const NAME = /[^\s/>=]+/y;
const ATTR = /\s*([^\s/>=]+)\s*=\s*("([^"]*)"|'([^']*)')/y;

export function parseXml(source: string): XmlElement {
  const root: XmlElement = { name: "#document", attrs: {}, children: [] };
  const stack: XmlElement[] = [root];
  let pos = 0;
  const len = source.length;

  while (pos < len) {
    const lt = source.indexOf("<", pos);
    const textEnd = lt === -1 ? len : lt;
    if (textEnd > pos) {
      const text = source.slice(pos, textEnd);
      if (stack.length > 1) stack[stack.length - 1].children.push(normaliseNewlines(decodeEntities(text)));
    }
    if (lt === -1) break;

    if (source.startsWith("<![CDATA[", lt)) {
      const end = source.indexOf("]]>", lt + 9);
      const stop = end === -1 ? len : end;
      stack[stack.length - 1].children.push(normaliseNewlines(source.slice(lt + 9, stop)));
      pos = end === -1 ? len : end + 3;
    } else if (source.startsWith("<!--", lt)) {
      const end = source.indexOf("-->", lt + 4);
      pos = end === -1 ? len : end + 3;
    } else if (source[lt + 1] === "?" || source[lt + 1] === "!") {
      const end = source.indexOf(">", lt);
      pos = end === -1 ? len : end + 1;
    } else if (source[lt + 1] === "/") {
      const end = source.indexOf(">", lt);
      const name = source.slice(lt + 2, end === -1 ? len : end).trim();
      // Pop to the matching tag so a stray close tag cannot unwind the whole tree.
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === name) {
          stack.length = i;
          break;
        }
      }
      pos = end === -1 ? len : end + 1;
    } else {
      NAME.lastIndex = lt + 1;
      const nameMatch = NAME.exec(source);
      if (!nameMatch) {
        stack[stack.length - 1].children.push("<");
        pos = lt + 1;
        continue;
      }
      const el: XmlElement = { name: nameMatch[0], attrs: {}, children: [] };
      let cursor = NAME.lastIndex;
      for (;;) {
        ATTR.lastIndex = cursor;
        const m = ATTR.exec(source);
        if (!m) break;
        el.attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? "");
        cursor = ATTR.lastIndex;
      }
      const end = source.indexOf(">", cursor);
      const close = end === -1 ? len : end;
      const selfClosing = source[close - 1] === "/";
      stack[stack.length - 1].children.push(el);
      if (!selfClosing) stack.push(el);
      pos = close + 1;
    }
  }
  return root;
}

export function childElements(el: XmlElement, name?: string): XmlElement[] {
  const out: XmlElement[] = [];
  for (const child of el.children) {
    if (typeof child !== "string" && (name === undefined || child.name === name)) out.push(child);
  }
  return out;
}

export function firstChild(el: XmlElement, name: string): XmlElement | undefined {
  for (const child of el.children) {
    if (typeof child !== "string" && child.name === name) return child;
  }
  return undefined;
}

export function textOf(el: XmlElement): string {
  let out = "";
  for (const child of el.children) out += typeof child === "string" ? child : textOf(child);
  return out;
}
