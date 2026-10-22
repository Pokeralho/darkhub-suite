import React, { useState } from 'react';
import { HelpCircle, X } from './icons';

interface HelpSection {
  title: string;
  content: string;
}

interface HelpTipProps {
  title: string;
  description: string;
  buttonLabel?: string;
  example?: string;
  sections?: HelpSection[];
  children?: React.ReactNode;
}

export const HelpTip: React.FC<HelpTipProps> = ({
  title,
  description,
  buttonLabel,
  example,
  sections = [],
  children
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
        className="inline-flex items-center justify-center text-zinc-500 hover:text-zinc-100 transition-colors p-1 rounded-md hover:bg-zinc-800 cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
        aria-label={buttonLabel || `Ajuda sobre ${title}`}
        title={buttonLabel || title}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <HelpCircle size={16} />
      </div>

      {}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/75 animate-in"
          onClick={() => setIsOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Escape') setIsOpen(false); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full mx-4 p-5 relative dh-raised animate-in slide-in-from-bottom-2"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-3.5 right-3.5 p-1 rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
              aria-label="Fechar"
              autoFocus
            >
              <X size={16} />
            </button>

            <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-zinc-50 mb-2 pr-8">{title}</h3>

            <p className="text-[13px] leading-relaxed text-zinc-300 mb-4 max-w-[65ch]">{description}</p>

            {example && (
              <div className="mb-4 rounded-lg border border-zinc-800/80 bg-zinc-950 p-3 font-mono text-[12px] text-zinc-300">
                {example}
              </div>
            )}

            {sections.length > 0 && (
              <div className="space-y-3 border-t border-zinc-800/80 pt-3">
                {sections.map((section, index) => (
                  <div key={index}>
                    <h4 className="text-[13px] font-medium text-zinc-100 mb-0.5">{section.title}</h4>
                    <p className="text-[12.5px] leading-relaxed text-zinc-400">{section.content}</p>
                  </div>
                ))}
              </div>
            )}

            {children && (
              <div className="mt-4">
                {children}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
