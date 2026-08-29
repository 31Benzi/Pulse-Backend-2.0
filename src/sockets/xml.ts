export interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  content: string;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function encodeXmlEntities(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function parseXml(input: string): XmlNode | null {
  let s = input.replace(/<\?xml[^?]*\?>/g, "").trim();
  if (!s) return null;

  let pos = 0;

  function skipWs() {
    while (pos < s.length && /\s/.test(s[pos])) pos++;
  }

  function parseElement(): XmlNode | null {
    skipWs();
    if (s[pos] !== "<") return null;
    pos++;

    const nameMatch = /^[a-zA-Z_:][\w\-.:]*/.exec(s.slice(pos));
    if (!nameMatch) return null;
    const name = nameMatch[0];
    pos += name.length;

    const attributes: Record<string, string> = {};

    while (pos < s.length && s[pos] !== ">" && s[pos] !== "/") {
      skipWs();
      if (s[pos] === ">" || s[pos] === "/") break;

      const attrMatch = /^([a-zA-Z_:][\w\-.:]*)\s*=\s*("([^"]*)"|'([^']*)')/.exec(s.slice(pos));
      if (!attrMatch) {
        pos++;
        continue;
      }
      const attrName = attrMatch[1];
      const attrValue = attrMatch[3] !== undefined ? attrMatch[3] : attrMatch[4];
      attributes[attrName] = decodeXmlEntities(attrValue);
      pos += attrMatch[0].length;
    }

    if (s[pos] === "/") {
      pos++;
      if (s[pos] === ">") pos++;
      return { name, attributes, children: [], content: "" };
    }

    if (s[pos] === ">") pos++;

    const children: XmlNode[] = [];
    let content = "";

    while (pos < s.length) {
      if (s[pos] === "<" && s[pos + 1] === "/") {
        const closeEnd = s.indexOf(">", pos);
        pos = closeEnd === -1 ? s.length : closeEnd + 1;
        return { name, attributes, children, content: decodeXmlEntities(content) };
      }
      if (s[pos] === "<") {
        const child = parseElement();
        if (child) children.push(child);
        else pos++;
      } else {
        content += s[pos];
        pos++;
      }
    }

    return { name, attributes, children, content: decodeXmlEntities(content) };
  }

  return parseElement();
}

export interface XmlAttrs {
  [k: string]: string | number | boolean | undefined;
}

export function buildTag(name: string, attrs: XmlAttrs = {}, inner = ""): string {
  const parts: string[] = [name];
  for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (v === undefined || v === null) continue;
    parts.push(`${k}="${encodeXmlEntities(String(v))}"`);
  }
  const open = parts.join(" ");
  if (!inner) return `<${open}/>`;
  return `<${open}>${inner}</${name}>`;
}

export function buildText(name: string, attrs: XmlAttrs = {}, text = ""): string {
  const inner = encodeXmlEntities(text);
  const parts: string[] = [name];
  for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (v === undefined || v === null) continue;
    parts.push(`${k}="${encodeXmlEntities(String(v))}"`);
  }
  return `<${parts.join(" ")}>${inner}</${name}>`;
}

export function findChild(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find(c => c.name === name || c.name.endsWith(":" + name));
}

export function decodeBase64(s: string): string {
  try {
    return Buffer.from(s, "base64").toString("utf-8");
  } catch {
    return "";
  }
}
