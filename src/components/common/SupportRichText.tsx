import React from 'react';
import { ArrowUpRight, Compass } from 'lucide-react';
import { ActivePage } from '../../context/AppContext.tsx';

export const VALID_SUPPORT_NAV_PAGES: ActivePage[] = [
  'home',
  'about',
  'programs',
  'events',
  'news',
  'gallery',
  'team',
  'volunteer',
  'track',
  'contact'
];

interface ExtractedPageButton {
  page: ActivePage;
  label: string;
}

const PAGE_TOKEN_REGEX = /\[\[PAGE:([a-z-]+)\|([^\]]+)\]\]/gi;

function extractAndCleanSupportText(rawText: string): {
  cleanedText: string;
  pageButtons: ExtractedPageButton[];
} {
  const pageButtons: ExtractedPageButton[] = [];

  const registerButton = (rawPage: string, rawLabel: string): string => {
    const normalized = String(rawPage || '').trim().toLowerCase() as ActivePage;
    const label = String(rawLabel || '').trim();
    if (VALID_SUPPORT_NAV_PAGES.includes(normalized) && label) {
      if (!pageButtons.some(b => b.page === normalized)) {
        pageButtons.push({ page: normalized, label });
      }
    }
    return label;
  };

  // Process line-by-line so lines that only contain [[PAGE:...]] tokens (even separated by | or bullets)
  // are completely removed from text prose after registering their buttons, preventing ugly leftover pipes/duplicates.
  const processedLines: string[] = [];
  for (const rawLine of (rawText || '').split(/\r?\n/)) {
    const lineTokens = [...rawLine.matchAll(new RegExp(PAGE_TOKEN_REGEX.source, 'gi'))];
    if (lineTokens.length > 0) {
      for (const m of lineTokens) {
        registerButton(m[1], m[2]);
      }
      const remainder = rawLine
        .replace(new RegExp(PAGE_TOKEN_REGEX.source, 'gi'), '')
        .replace(/[\s|•·,;\-*`]+/g, '')
        .trim();

      if (!remainder) {
        // Pure button row -> strip from text completely, buttons render cleanly below
        continue;
      }

      // Inline mention inside a real sentence -> replace token with clean label
      const cleanLine = rawLine
        .replace(new RegExp(PAGE_TOKEN_REGEX.source, 'gi'), (_, __, label) => `**${String(label).trim()}**`)
        .replace(/\s*\|\s*$/, '')
        .trim();
      processedLines.push(cleanLine);
    } else {
      processedLines.push(rawLine);
    }
  }

  return {
    cleanedText: processedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    pageButtons
  };
}

export function stripSupportFormattingForPreview(rawText: string): string {
  const { cleanedText, pageButtons } = extractAndCleanSupportText(rawText);
  const plain = cleanedText
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/gi, '$1')
    .replace(/^#{1,4}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (plain) return plain;
  return pageButtons.map(b => b.label).join(' · ');
}

function renderInlineFormattedText(
  text: string,
  variant: 'light' | 'dark'
): React.ReactNode[] {
  // Match **bold**, `code`, [label](url), or *italic* safely
  const tokenRegex =
    /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]]+\]\((?:https?:\/\/|mailto:)[^\s)]+\)|\*[^*\n]+\*)/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong
          key={idx}
          className={variant === 'dark' ? 'font-bold text-white' : 'font-bold text-slate-900'}
        >
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={idx}
          className={
            variant === 'dark'
              ? 'px-1.5 py-0.5 rounded bg-white/15 text-amber-200 font-mono text-[11px]'
              : 'px-1.5 py-0.5 rounded bg-slate-100 text-indigo-950 font-mono text-[11px]'
          }
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)$/i);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className={
            variant === 'dark'
              ? 'underline text-amber-300 hover:text-amber-200 font-medium'
              : 'underline text-indigo-700 hover:text-indigo-950 font-medium'
          }
        >
          {linkMatch[1]}
        </a>
      );
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={idx} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }

    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

interface SupportRichTextProps {
  text: string;
  onNavigatePage?: (page: ActivePage) => void;
  variant?: 'light' | 'dark';
}

export const SupportRichText: React.FC<SupportRichTextProps> = ({
  text,
  onNavigatePage,
  variant = 'light'
}) => {
  const resolvedVariant: 'light' | 'dark' = variant === 'dark' ? 'dark' : 'light';
  const { cleanedText, pageButtons } = extractAndCleanSupportText(text);
  const lines = cleanedText ? cleanedText.split('\n') : [];

  const blocks: React.ReactNode[] = [];
  let listItems: { ordered: boolean; items: string[] } | null = null;

  const flushList = (keyBase: string) => {
    if (!listItems || listItems.items.length === 0) return;
    const isOrdered = listItems.ordered;
    const Tag = isOrdered ? 'ol' : 'ul';
    blocks.push(
      <Tag
        key={keyBase}
        className={`space-y-1 pl-4 ${isOrdered ? 'list-decimal' : 'list-disc'} marker:text-amber-600`}
      >
        {listItems.items.map((item, i) => (
          <li key={i} className="leading-relaxed">
            {renderInlineFormattedText(item, resolvedVariant)}
          </li>
        ))}
      </Tag>
    );
    listItems = null;
  };

  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushList(`list-${idx}`);
      if (blocks.length > 0) {
        blocks.push(<div key={`gap-${idx}`} className="h-1" />);
      }
      return;
    }

    const bulletMatch = trimmed.match(/^(?:[-*•])\s+(.+)$/);
    const orderedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);

    if (bulletMatch) {
      if (listItems && listItems.ordered) flushList(`list-${idx}`);
      if (!listItems) listItems = { ordered: false, items: [] };
      listItems.items.push(bulletMatch[1]);
      return;
    }

    if (orderedMatch) {
      if (listItems && !listItems.ordered) flushList(`list-${idx}`);
      if (!listItems) listItems = { ordered: true, items: [] };
      listItems.items.push(orderedMatch[1]);
      return;
    }

    flushList(`list-${idx}`);

    const headingMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      blocks.push(
        <p
          key={`h-${idx}`}
          className={`font-bold text-xs tracking-tight pt-0.5 ${
            resolvedVariant === 'dark' ? 'text-amber-300' : 'text-indigo-950'
          }`}
        >
          {renderInlineFormattedText(headingMatch[1], resolvedVariant)}
        </p>
      );
      return;
    }

    blocks.push(
      <p key={`p-${idx}`} className="leading-relaxed">
        {renderInlineFormattedText(trimmed, resolvedVariant)}
      </p>
    );
  });

  flushList('list-end');

  return (
    <div className="space-y-2">
      {blocks.length > 0 && <div className="space-y-1.5">{blocks}</div>}

      {pageButtons.length > 0 && (
        <div
          className={`flex flex-wrap gap-1.5 pt-1.5 ${
            blocks.length > 0
              ? variant === 'dark'
                ? 'border-t border-white/15'
                : 'border-t border-slate-100'
              : ''
          }`}
        >
          {pageButtons.map(btn =>
            onNavigatePage ? (
              <button
                key={btn.page}
                type="button"
                onClick={() => onNavigatePage(btn.page)}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-950 hover:text-white hover:border-indigo-950 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-950 transition-colors cursor-pointer shadow-2xs"
              >
                <span>{btn.label}</span>
                <ArrowUpRight className="w-3 h-3 shrink-0" />
              </button>
            ) : (
              <span
                key={btn.page}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-950"
              >
                <Compass className="w-3 h-3 text-indigo-700 shrink-0" />
                <span>{btn.label}</span>
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
};
