import type { UIMessage } from 'ai';
import { MemoizedMarkdown } from './memoized-markdown';
import { cn } from '@/utils/cn';

export function ChatMessageBubble(props: { message: UIMessage; aiEmoji?: string }) {
  return (
    <div
      className={cn(
        `rounded-[24px] max-w-[80%] mb-8 flex`,
        props.message.role === 'user' ? 'bg-secondary text-secondary-foreground px-4 py-2' : null,
        props.message.role === 'user' ? 'ml-auto' : 'mr-auto',
      )}
    >
      {props.message.role !== 'user' && (
        <div className="mr-4 mt-1 border bg-secondary -mt-2 rounded-full w-10 h-10 flex-shrink-0 flex items-center justify-center">
          {props.aiEmoji}
        </div>
      )}

      <div className="chat-message-bubble whitespace-pre-wrap flex flex-col prose dark:prose-invert max-w-none">
        <MemoizedMarkdown content={(props.message?.parts[props.message.parts.length - 1] as any)?.text ?? ''} id={props.message.id} />
      </div>
    </div>
  );
}
