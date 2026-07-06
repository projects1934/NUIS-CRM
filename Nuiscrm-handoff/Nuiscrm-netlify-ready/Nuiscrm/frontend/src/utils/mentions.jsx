export function renderBodyWithMentions(body, knownUsernames = []) {
  if (!body) return null;
  const known = new Set(knownUsernames);
  const parts = String(body).split(/(@[^\s@,.;:!?]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      const username = part.slice(1);
      if (known.size === 0 || known.has(username)) {
        return <span key={i} className="mention">{part}</span>;
      }
    }
    return <span key={i}>{part}</span>;
  });
}
