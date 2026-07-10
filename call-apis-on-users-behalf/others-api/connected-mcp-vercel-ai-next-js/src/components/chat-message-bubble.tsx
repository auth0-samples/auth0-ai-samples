import type { UIMessage } from 'ai';
import { LoaderCircle, Check, TriangleAlert } from 'lucide-react';
import { MemoizedMarkdown } from './memoized-markdown';
import { cn } from '@/utils/cn';

type Part = UIMessage['parts'][number];

function isToolPart(part: Part): boolean {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-');
}

function toolName(part: Part): string {
  // Dynamic (MCP) tools carry `toolName`; static tools encode it as `tool-<name>`.
  return (part as { toolName?: string }).toolName ?? part.type.replace(/^tool-/, '');
}

/** Turns a tool slug like "notion-create-pages" into "Notion: create pages". */
function humanizeTool(name: string): string {
  const cleaned = name.replace(/[-_]/g, ' ').trim();
  const [first, ...rest] = cleaned.split(' ');
  const capped = first.charAt(0).toUpperCase() + first.slice(1);
  return rest.length === 0 ? capped : `${capped}: ${rest.join(' ')}`;
}

function ThinkingStatus(props: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm text-muted-foreground" aria-label={props.label}>
      <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
      <span>{props.label}</span>
      <span className="flex items-center gap-1">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="w-1 h-1 rounded-full bg-muted-foreground/60 animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </span>
    </div>
  );
}

function ToolStep(props: { part: Part }) {
  const state = (props.part as { state?: string }).state;
  const done = state === 'output-available' || state === 'output-error';
  const errored = state === 'output-error';
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
      {errored ? (
        <TriangleAlert className="w-3.5 h-3.5 text-amber-500" />
      ) : done ? (
        <Check className="w-3.5 h-3.5 text-emerald-500" />
      ) : (
        <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
      )}
      <span>
        {done ? 'Used' : 'Using'} <strong className="font-medium">{humanizeTool(toolName(props.part))}</strong>
      </span>
    </div>
  );
}

export function ChatMessageBubble(props: { message: UIMessage; aiEmoji?: string }) {
  const { message } = props;
  const isUser = message.role === 'user';

  const text = message.parts
    .filter((p): p is Part & { text: string } => p.type === 'text' && typeof (p as { text?: unknown }).text === 'string')
    .map((p) => p.text)
    .join('');

  const reasoning = message.parts
    .filter((p): p is Part & { text: string } => p.type === 'reasoning' && typeof (p as { text?: unknown }).text === 'string')
    .map((p) => p.text)
    .join('');

  const toolParts = message.parts.filter(isToolPart);
  const hasText = text.trim().length > 0;

  return (
    <div
      className={cn(
        `rounded-[24px] max-w-[80%] mb-8 flex`,
        isUser ? 'bg-secondary text-secondary-foreground px-4 py-2' : null,
        isUser ? 'ml-auto' : 'mr-auto',
      )}
    >
      {!isUser && (
        <div className="mr-4 mt-1 border bg-secondary -mt-2 rounded-full w-10 h-10 flex-shrink-0 flex items-center justify-center">
          {props.aiEmoji}
        </div>
      )}

      <div className="chat-message-bubble whitespace-pre-wrap flex flex-col prose dark:prose-invert max-w-none">
        {!isUser && reasoning.trim().length > 0 && (
          <div className="text-sm text-muted-foreground italic mb-2 border-l-2 border-muted pl-3">{reasoning}</div>
        )}

        {!isUser && toolParts.map((part, i) => <ToolStep key={i} part={part} />)}

        {hasText ? (
          <MemoizedMarkdown content={text} id={message.id} />
        ) : !isUser && toolParts.length === 0 ? (
          <ThinkingStatus label="Thinking" />
        ) : null}
      </div>
    </div>
  );
}
