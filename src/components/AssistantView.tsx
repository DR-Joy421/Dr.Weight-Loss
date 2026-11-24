import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Send, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { AssistantMessage } from '../types';
import { getTodayIso } from '../utils/date';

const SUGGESTED_QUESTIONS = [
  'How many calories have I consumed today?',
  'How many calories are remaining?',
  'Did I meet my protein target?',
  'Was my diet balanced today?',
  'What should I eat for dinner?',
  'How can I increase my protein intake?',
  'Compare my diet this week with last week.',
];

// Safe inline bold formatter without raw HTML injection
function renderFormattedInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-[#142018]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function SafeMessageBody({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((raw, idx) => {
        const line = raw.trim();
        if (!line) return <div key={idx} className="h-1" />;
        if (line.startsWith('### ') || line.startsWith('## ')) {
          return (
            <h4 key={idx} className="font-semibold text-[#142018] pt-1">
              {renderFormattedInline(line.replace(/^#{2,3}\s+/, ''))}
            </h4>
          );
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={idx} className="flex gap-2 pl-1">
              <span className="text-[#2D6A4F] select-none">•</span>
              <span className="flex-1">{renderFormattedInline(line.slice(2))}</span>
            </div>
          );
        }
        return <p key={idx}>{renderFormattedInline(line)}</p>;
      })}
    </div>
  );
}

export const AssistantView: React.FC = () => {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(true);
  const [input, setInput] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api
      .getChatHistory()
      .then((rows) => setMessages(rows))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoadingHistory(false));
  }, []);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = async (questionText?: string) => {
    const q = (questionText ?? input).trim();
    if (!q || sending) return;
    if (!questionText) setInput('');
    setError(null);
    setSending(true);

    // Optimistic pending user bubble
    const tempId = -Date.now();
    const optimisticUser: AssistantMessage = {
      id: tempId,
      role: 'user',
      content: q,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUser]);

    try {
      const { userMessage, assistantMessage } = await api.sendChatMessage(q, getTodayIso());
      setMessages((prev) =>
        prev.filter((m) => m.id !== tempId).concat([userMessage, assistantMessage])
      );
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setError((err as Error).message || 'Could not reach AI Nutrition Assistant.');
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    await api.clearChatHistory();
    setMessages([]);
  };

  return (
    <div className="space-y-5 flex flex-col h-[calc(100vh-11rem)] lg:h-[calc(100vh-6rem)]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
        <div>
          <p className="text-xs font-medium text-[#526056]">
            Grounded in your logged meals, water intake &amp; weight history
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#142018] font-display mt-0.5">
            AI Nutrition Assistant
          </h1>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={handleClear}
            className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[#DCE5DE] bg-white px-3 py-1.5 text-xs font-medium text-[#526056] hover:bg-[#F7F9F7] self-start sm:self-auto"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear Conversation
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-[#E5B8AD] bg-[#FDF4F2] px-4 py-3 text-sm text-[#9C3A22] shrink-0">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Chat Container */}
      <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-[#E2E8E2] bg-white shadow-xs overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {loadingHistory ? (
            <div className="space-y-3">
              <div className="h-14 w-2/3 rounded-xl bg-[#EEF3EF] animate-pulse" />
              <div className="h-20 w-3/4 rounded-xl bg-[#EEF3EF] animate-pulse" />
            </div>
          ) : messages.length === 0 ? (
            <div className="py-6 space-y-5 max-w-2xl">
              <div className="space-y-1.5">
                <h2 className="text-base font-semibold text-[#142018] font-display">
                  Ask your personal nutrition coach
                </h2>
                <p className="text-sm text-[#526056]">
                  Every answer uses your actual saved food entries, daily targets, hydration logs, and weight records.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => handleSend(q)}
                    className="min-h-[40px] rounded-xl border border-[#DCE5DE] bg-[#F8FAF8] px-3.5 py-2 text-left text-xs font-medium text-[#142018] hover:border-[#2D6A4F] hover:bg-[#EDF6F0] transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-[#1B4332] text-white'
                        : 'border border-[#E8EEE9] bg-[#F8FAF8] text-[#142018]'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="text-sm">{msg.content}</p>
                    ) : (
                      <SafeMessageBody content={msg.content} />
                    )}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-2xl border border-[#E8EEE9] bg-[#F8FAF8] px-4 py-3 text-sm text-[#526056]">
                    <Loader2 className="h-4 w-4 animate-spin text-[#2D6A4F]" />
                    Reviewing your nutrition records...
                  </div>
                </div>
              )}
              <div ref={scrollEndRef} />
            </>
          )}
        </div>

        {/* Quick prompts bar when chat is populated */}
        {messages.length > 0 && (
          <div className="border-t border-[#EDF2EE] bg-[#FAFBF9] px-4 py-2 flex items-center gap-2 overflow-x-auto">
            {SUGGESTED_QUESTIONS.slice(0, 4).map((q) => (
              <button
                key={q}
                type="button"
                disabled={sending}
                onClick={() => handleSend(q)}
                className="shrink-0 rounded-lg border border-[#DCE5DE] bg-white px-2.5 py-1 text-[11px] font-medium text-[#526056] hover:text-[#142018] hover:border-[#2D6A4F] whitespace-nowrap"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="border-t border-[#E8EEE9] bg-white p-3 sm:p-4 flex items-center gap-2.5"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about today's calories, protein target, dinner ideas, or weekly comparison..."
            className="flex-1 min-h-[44px] rounded-xl border border-[#DCE5DE] bg-[#F8FAF8] px-4 py-2 text-sm text-[#142018] focus:bg-white focus:border-[#2D6A4F] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-[#1B4332] px-4 text-white hover:bg-[#2D6A4F] disabled:opacity-50 transition-colors"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
