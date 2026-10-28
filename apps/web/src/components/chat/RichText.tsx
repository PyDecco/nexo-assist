import { Fragment } from 'react';

/** Texto do agent: parágrafos e **negrito**. Sem HTML do modelo (evita injeção). */
export function RichText({ text }: { text: string }) {
  const paragraphs = text.trim().split(/\n{2,}/);
  return (
    <div className="text">
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
            part.startsWith('**') && part.endsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : <Fragment key={j}>{part}</Fragment>,
          )}
        </p>
      ))}
    </div>
  );
}
