import { useI18n } from '../i18n/I18nProvider';
import React, { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

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
  const { t } = useI18n();
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
        className="inline-flex items-center justify-center text-zinc-400 hover:text-zinc-100 transition-colors p-1.5 rounded-full hover:bg-zinc-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-600"
        aria-label={buttonLabel || `Ajuda sobre ${title}`}
        title={buttonLabel || title}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <HelpCircle className="w-4 h-4" />
      </div>

      {}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-md w-full mx-4 p-6 relative"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
              aria-label="Fechar"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-xl font-semibold text-white mb-3 pr-8">{title}</h3>

            <p className="text-zinc-300 mb-4">{description}</p>

            {example && (
              <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
                {example}
              </div>
            )}

            {sections.length > 0 && (
              <div className="space-y-4">
                {sections.map((section, index) => (
                  <div key={index}>
                    <h4 className="font-medium text-zinc-200 mb-1">{section.title}</h4>
                    <p className="text-sm text-zinc-400">{section.content}</p>
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
