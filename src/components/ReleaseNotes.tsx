import React, { useMemo } from 'react';
import { parseNotes, type Inline } from './releaseNotesParser';

function Text({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.t === 'b') return <strong key={i} className="font-semibold text-zinc-100">{p.v}</strong>;
        if (p.t === 'i') return <em key={i}>{p.v}</em>;
        if (p.t === 'code') return <code key={i} className="font-mono text-[11px] text-zinc-200 bg-zinc-800/70 rounded px-1 py-px break-all">{p.v}</code>;
        if (p.t === 'link') return <a key={i} href={p.href} target="_blank" rel="noreferrer noopener" className="text-blue-300 hover:text-blue-200 underline underline-offset-2">{p.v}</a>;
        return <React.Fragment key={i}>{p.v}</React.Fragment>;
      })}
    </>
  );
}

/** Formatted release notes (GitHub Markdown or HTML), rendered as React elements. */
export default function ReleaseNotes({ source, className = '' }: { source: string; className?: string }) {
  const blocks = useMemo(() => parseNotes(source), [source]);
  return (
    <div className={`space-y-2 text-[12px] leading-relaxed text-zinc-400 ${className}`}>
      {blocks.map((b, i) => {
        switch (b.t) {
          case 'h':
            return b.level === 1
              ? <h3 key={i} className="text-[13.5px] font-semibold text-zinc-50 pt-1"><Text parts={b.text} /></h3>
              : <h4 key={i} className={`font-semibold text-zinc-100 pt-1 ${b.level === 2 ? 'text-[13px]' : 'text-[12.5px]'}`}><Text parts={b.text} /></h4>;
          case 'p':
            return <p key={i}><Text parts={b.text} /></p>;
          case 'ul':
          case 'ol': {
            const List = b.t;
            return (
              <List key={i} className={`space-y-1 pl-4 ${b.t === 'ul' ? 'list-disc' : 'list-decimal'} marker:text-zinc-600`}>
                {b.items.map((it, j) => <li key={j}><Text parts={it} /></li>)}
              </List>
            );
          }
          case 'code':
            return <pre key={i} className="font-mono text-[11px] text-zinc-300 bg-zinc-950 border border-zinc-800/80 rounded-md p-2 overflow-x-auto whitespace-pre">{b.v}</pre>;
          case 'table':
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full text-[11.5px]">
                  <thead><tr>{b.head.map((c, j) => <th key={j} className="text-left font-medium text-zinc-500 pb-1 pr-3"><Text parts={c} /></th>)}</tr></thead>
                  <tbody className="divide-y divide-zinc-800/80">
                    {b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} className="py-1 pr-3 align-top"><Text parts={c} /></td>)}</tr>)}
                  </tbody>
                </table>
              </div>
            );
          case 'hr':
            return <hr key={i} className="border-zinc-800/80" />;
          default:
            return null;
        }
      })}
    </div>
  );
}
