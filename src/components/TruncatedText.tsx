/** Teks satu baris + ellipsis; tooltip native via `title` (konsisten di Timeline / Task / ClickUp). */
export function TruncatedText({
  text,
  title,
  className = "",
  href,
  target,
  rel,
}: {
  text: string;
  /** Default: `text`; boleh multiline (\\n) untuk detail hover. */
  title?: string;
  className?: string;
  href?: string;
  target?: string;
  rel?: string;
}) {
  const tip = title ?? text;
  const base = `cell-truncate ${className}`.trim();
  if (href) {
    return (
      <a
        href={href}
        className={`${base} cell-truncate--link`.trim()}
        title={tip || undefined}
        target={target}
        rel={rel}
      >
        {text}
      </a>
    );
  }
  return (
    <span className={base} title={tip || undefined}>
      {text}
    </span>
  );
}
