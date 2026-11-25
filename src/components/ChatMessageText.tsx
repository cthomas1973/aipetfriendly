import { Fragment, ReactNode } from 'react';

function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <Fragment key={index}>{part.replace(/\*\*/g, '')}</Fragment>,
  );
}

type Block =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'ul' | 'ol'; items: string[] };

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    const last = blocks[blocks.length - 1];
    if (heading) {
      blocks.push({ type: 'h', text: heading[1] });
    } else if (bullet || numbered) {
      const type = bullet ? 'ul' : 'ol';
      const text = (bullet ?? numbered)![1];
      if (last && last.type === type) last.items.push(text);
      else blocks.push({ type, items: [text] });
    } else {
      blocks.push({ type: 'p', text: line });
    }
  }
  return blocks;
}

export function ChatMessageText({ content }: { content: string }) {
  return (
    <div className="space-y-2">
      {parseBlocks(content).map((block, index) => {
        if (block.type === 'h') {
          return <p key={index} className="font-bold text-slate-800">{renderInline(block.text)}</p>;
        }
        if (block.type === 'p') return <p key={index}>{renderInline(block.text)}</p>;
        const List = block.type === 'ol' ? 'ol' : 'ul';
        return (
          <List key={index} className={`space-y-1 pl-5 ${block.type === 'ol' ? 'list-decimal' : 'list-disc'}`}>
            {block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>)}
          </List>
        );
      })}
    </div>
  );
}
