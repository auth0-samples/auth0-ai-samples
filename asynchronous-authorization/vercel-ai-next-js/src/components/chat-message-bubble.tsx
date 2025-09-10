import { type UIMessage } from 'ai';
import { MemoizedMarkdown } from './memoized-markdown';
import { cn } from '@/utils/cn';

function uiMessageToText(message: UIMessage): string {
  if (Array.isArray((message as any).parts)) {
    return (message as any).parts
      .map((p: any) => {
        if (typeof p === 'string') return p;
        if (typeof p?.text === 'string') return p.text;
        if (typeof p?.content === 'string') return p.content;
        return '';
      })
      .join('');
  }
  return (message as any).content ?? '';
}

export function ChatMessageBubble(props: { message: UIMessage; aiEmoji?: string }) {
  const { message, aiEmoji } = props;
  const text = uiMessageToText(message);

  return (
    <div
      className={cn(
        'rounded-[24px] max-w-[80%] mb-8 flex',
        message.role === 'user' ? 'bg-secondary text-secondary-foreground px-4 py-2' : null,
        message.role === 'user' ? 'ml-auto' : 'mr-auto',
      )}
    >
      {message.role !== 'user' && (
        <div className="mr-4 -mt-2 mt-1 border bg-secondary rounded-full w-10 h-10 flex-shrink-0 flex items-center justify-center">
          {aiEmoji}
        </div>
      )}

      <div className="chat-message-bubble whitespace-pre-wrap flex flex-col prose dark:prose-invert max-w-none">
        <MemoizedMarkdown content={text} id={message.id as any} />
      </div>
    </div>
  );
}
