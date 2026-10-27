import type { RichText } from "../lib/content-model";
export function markdown(parts: RichText[] = []): string {
  return parts
    .map((p) => {
      let value = p.plain_text ?? p.text?.content ?? "",
        a = p.annotations ?? {};
      if (a.code) value = "`" + value + "`";
      if (a.bold) value = "**" + value + "**";
      if (a.italic) value = "*" + value + "*";
      if (a.strikethrough) value = "~~" + value + "~~";
      if (a.underline) value = "<u>" + value + "</u>";
      const href = p.href ?? p.text?.link?.url;
      return href ? `[${value}](${href})` : value;
    })
    .join("");
}
type Style = NonNullable<RichText["annotations"]>;
export function rich(
  value: string,
  style: Style = {},
  href: string | null = null,
  depth = 0,
): RichText[] {
  const plain = (text: string): RichText => ({
    plain_text: text,
    text: { content: text, ...(href ? { link: { url: href } } : {}) },
    annotations: { ...style },
    ...(href ? { href } : {}),
  });
  if (depth > 6) return [plain(value)];
  const pattern =
    /(\[[^\]]+\]\(https:\/\/[^\s)]+\)|\*\*\*[^*]+\*\*\*|\*\*[\s\S]+?\*\*|\*[^*]+\*|~~[\s\S]+?~~|`[^`]+`|<u>[\s\S]*?<\/u>)/g;
  return value
    .split(pattern)
    .filter(Boolean)
    .flatMap((t) => {
      const link = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/.exec(t);
      if (link) return rich(link[1], style, link[2], depth + 1);
      if (t.startsWith("***") && t.endsWith("***"))
        return rich(
          t.slice(3, -3),
          { ...style, bold: true, italic: true },
          href,
          depth + 1,
        );
      for (const [mark, key] of [
        ["**", "bold"],
        ["*", "italic"],
        ["~~", "strikethrough"],
      ] as const)
        if (t.startsWith(mark) && t.endsWith(mark))
          return rich(
            t.slice(mark.length, -mark.length),
            { ...style, [key]: true },
            href,
            depth + 1,
          );
      if (t.startsWith("<u>") && t.endsWith("</u>"))
        return rich(
          t.slice(3, -4),
          { ...style, underline: true },
          href,
          depth + 1,
        );
      if (t.startsWith("`") && t.endsWith("`"))
        return [
          { ...plain(t.slice(1, -1)), annotations: { ...style, code: true } },
        ];
      return [plain(t)];
    });
}
