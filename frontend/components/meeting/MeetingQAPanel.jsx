'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, MessageSquare, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import api from '@/lib/axios';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';

export default function MeetingQAPanel({ meetingId, meetingName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);

  // Only scrolls the messages area, never the page
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading || isStreaming) return;

    const question = input.trim();
    setInput('');
    setIsLoading(true);
    setMessages(prev => [...prev, { type: 'user', content: question }]);

    try {
      setIsStreaming(true);
      setMessages(prev => [...prev, { type: 'assistant', content: '', sources: [] }]);

      const response = await api.post(`/meetings/${meetingId}/qa`, { question });

      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.type === 'assistant') {
          last.content = response.data.answer;
          last.sources = response.data.sources || [];
        }
        return updated;
      });
    } catch (error) {
      toast.error('Failed to get answer. Please try again.');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  return (
    // Fixed height, flex-col: header fixed + messages scroll + input fixed
    <div className="bg-card border border-muted rounded-xl flex flex-col overflow-hidden" style={{ height: '480px' }}>

      {/* ── Header — fixed, never scrolls ── */}
      <div className="shrink-0 border-b border-muted px-4 py-3 flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-blue-400" />
        <span className="font-semibold text-base">Ask about this meeting</span>
        <Badge variant="secondary" className="ml-auto bg-muted text-muted-foreground text-xs">
          RAG Powered
        </Badge>
      </div>

      {/* ── Messages — only this div scrolls ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2">
            <MessageSquare className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Ask questions about the meeting</p>
            <p className="text-xs text-muted-foreground">
              Try: "What were the key decisions?" or "What action items were assigned?"
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div key={index} className={cn('flex gap-2', message.type === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-medium',
                  message.type === 'user' ? 'bg-blue-500 text-white' : 'bg-purple-500 text-white'
                )}>
                  {message.type === 'user' ? 'You' : 'AI'}
                </div>
                <div className={cn(
                  'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                  message.type === 'user' ? 'bg-primary/20 text-foreground' : 'bg-muted text-foreground'
                )}>
                  {message.type === 'assistant' ? (
                    <ReactMarkdown className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-strong:text-white prose-ul:my-1 prose-li:my-0">
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}
                  {message.sources?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-700/50">
                      <p className="text-xs text-slate-500 mb-1">Sources:</p>
                      <div className="flex flex-wrap gap-1">
                        {message.sources.map((source, i) => {
                          const label = typeof source === 'string'
                            ? source
                            : source?.metadata?.chunkIndex !== undefined
                              ? `Chunk ${source.metadata.chunkIndex + 1}`
                              : `Source ${i + 1}`;
                          const score = source?.relevanceScore
                            ? ` · ${Math.round(source.relevanceScore * 100)}%` : '';
                          return (
                            <Badge key={i} variant="outline" className="text-xs border-border text-muted-foreground">
                              {label}{score}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isStreaming && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-purple-500 flex items-center justify-center shrink-0 text-xs text-white">AI</div>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            {/* Auto-scroll anchor */}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input — fixed at bottom, never scrolls away ── */}
      <div className="shrink-0 border-t border-muted px-4 py-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={isLoading || isStreaming}
            className="bg-muted border-border text-sm"
          />
          <Button type="submit" disabled={!input.trim() || isLoading || isStreaming} size="icon">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          Answers are generated from meeting transcripts using RAG
        </p>
      </div>
    </div>
  );
}