"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppIcon } from "@/components/AppIcon";
import { AskMarkdownMessage } from "@/components/AskMarkdownMessage";
import { AiSourceList, type AiDisplaySource } from "@/components/AiSourceList";
import { RichTextComposerInput } from "@/components/RichTextComposerInput";
import { useI18n } from "@/components/LocaleProvider";
import { ErrorState, LoadingState } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
type Source = AiDisplaySource & {
  messageId: string;
  sourceId: string;
};
type Bundle = {
  conversation: { id: string; title?: string | null };
  messages: Message[];
  sources: Source[];
};

export default function AskConversationPage() {
  const { locale } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Bundle | null>(null);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      setData(
        await apiFetch<Bundle>(`/api/v1/ask-collect/conversations/${id}`),
      );
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  const sourcesByMessage = useMemo(() => {
    const map = new Map<string, Source[]>();
    for (const source of data?.sources ?? [])
      map.set(source.messageId, [...(map.get(source.messageId) ?? []), source]);
    return map;
  }, [data]);
  async function send() {
    if (!question.trim()) return;
    setSending(true);
    setError("");
    try {
      await apiFetch(`/api/v1/ask-collect/conversations/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: question.trim() }),
      });
      setQuestion("");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSending(false);
    }
  }
  return (
    <div className="chat-shell">
      <header className="row-between mobile-stack">
        <div>
          <div className="eyebrow">ChatGPT · {locale === "zh" ? "已批准证据" : "Approved evidence"}</div>
          <h1>
            {data?.conversation.title ||
              (locale === "zh" ? "证据问答" : "Evidence question")}
          </h1>
          <p className="muted">
            {locale === "zh"
              ? "回答以你有权访问的已批准证据为主，可补充外部公开视角；外部来源均附可验证链接。"
              : "Answers are grounded in approved evidence you can access and may add public outside perspective; every external source includes a verifiable link."}
          </p>
        </div>
      </header>
      {error ? <ErrorState message={error} retry={load} /> : null}
      {!data && !error ? (
        <LoadingState rows={5} />
      ) : (
        <div className="chat-messages">
          {data?.messages.map((message) => (
            <article
              className={`chat-message ${message.role}`}
              key={message.id}
            >
              <AskMarkdownMessage
                content={message.content}
                locale={locale}
                sources={sourcesByMessage.get(message.id) ?? []}
              />
              <AiSourceList locale={locale} sources={sourcesByMessage.get(message.id) ?? []} />
            </article>
          ))}
        </div>
      )}
      <div className="chat-compose">
        <RichTextComposerInput
          ariaLabel={locale === "zh" ? "问题" : "Question"}
          disabled={sending}
          onSubmit={() => void send()}
          onValueChange={setQuestion}
          placeholder={
            locale === "zh"
              ? "继续询问已批准证据…"
              : "Ask a follow-up about approved evidence…"
          }
          value={question}
        />
        <button
          className="button"
          disabled={sending || !question.trim()}
          onClick={send}
          type="button"
        >
          <AppIcon name="sparkles" />
          {sending
            ? locale === "zh"
              ? "分析中…"
              : "Analyzing…"
            : locale === "zh"
              ? "发送"
              : "Send"}
        </button>
      </div>
    </div>
  );
}
