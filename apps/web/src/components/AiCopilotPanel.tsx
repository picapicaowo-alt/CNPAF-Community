"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { apiFetch, errorMessage } from "@/lib/api-client";

type AskMessage = { id: string; role: "user" | "assistant"; content: string };
type AskSource = { id: string; messageId: string; citationLabel?: string | null; excerpt?: string | null };
type AskBundle = { conversation: { id: string }; messages: AskMessage[]; sources: AskSource[] };

type Props = {
  locale: "zh" | "en";
  title: string;
  description?: string;
  conversationTitle: string;
  scope?: Record<string, unknown>;
  datasetVersionId?: string;
  contextSources?: Array<{ label: string; statement: string }>;
  initialPrompt?: string;
  starterPrompts?: string[];
  onUseAnswer?: (answer: string) => void;
};

export function AiCopilotPanel({
  locale,
  title,
  description,
  conversationTitle,
  scope = {},
  datasetVersionId,
  contextSources = [],
  initialPrompt,
  starterPrompts = [],
  onUseAnswer,
}: Props) {
  const [bundle, setBundle] = useState<AskBundle | null>(null);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const conversationId = useRef("");
  const initialRun = useRef("");
  const scopeKey = JSON.stringify({ contextSources, datasetVersionId, scope });

  const sourcesByMessage = useMemo(() => {
    const result = new Map<string, AskSource[]>();
    for (const source of bundle?.sources ?? []) result.set(source.messageId, [...(result.get(source.messageId) ?? []), source]);
    return result;
  }, [bundle]);

  const sendPrompt = useCallback(async (rawPrompt: string) => {
    const content = rawPrompt.trim();
    if (!content) return;
    setSending(true);
    setError("");
    try {
      let id = conversationId.current;
      if (!id) {
        const created = await apiFetch<{ conversation: { id: string } }>("/api/v1/ask-collect/conversations", {
          method: "POST",
          body: JSON.stringify({ title: conversationTitle, scope, datasetVersionId, contextSources }),
        });
        id = created.conversation.id;
        conversationId.current = id;
      }
      await apiFetch(`/api/v1/ask-collect/conversations/${id}/messages`, { method: "POST", body: JSON.stringify({ content }) });
      setBundle(await apiFetch<AskBundle>(`/api/v1/ask-collect/conversations/${id}`));
      setQuestion("");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSending(false);
    }
  }, [conversationTitle, datasetVersionId, scopeKey]);

  useEffect(() => {
    if (!initialPrompt || initialRun.current === `${scopeKey}:${initialPrompt}`) return;
    initialRun.current = `${scopeKey}:${initialPrompt}`;
    void sendPrompt(initialPrompt);
  }, [initialPrompt, scopeKey, sendPrompt]);

  const visibleMessages = (bundle?.messages ?? []).filter((message, index) => !(index === 0 && message.role === "user" && message.content === initialPrompt));
  const lastAssistant = [...visibleMessages].reverse().find((message) => message.role === "assistant");

  return (
    <section className="card insight-ai-panel ai-copilot-panel">
      <div className="insight-ai-heading">
        <span className="dataset-ai-avatar"><AppIcon name="sparkles" /></span>
        <div><h2>{title}</h2><p>{description ?? (locale === "zh" ? "ChatGPT 只使用你有权限访问的已批准证据，并保留来源引用。" : "ChatGPT uses only approved evidence you are authorized to access and preserves citations.")}</p></div>
      </div>
      {error ? <div className="feedback feedback-error" role="alert">{error}</div> : null}
      <div className="insight-ai-body">
        {sending && !visibleMessages.length ? (
          <div className="ai-copilot-thinking" role="status"><AppIcon name="sparkles" />{locale === "zh" ? "ChatGPT 正在结合图表与已批准证据生成初步解读…" : "ChatGPT is reading the chart and approved evidence…"}</div>
        ) : visibleMessages.length ? (
          <div className="insight-ai-messages" aria-live="polite">
            {visibleMessages.map((message) => (
              <article className={`dataset-chat-message ${message.role}`} key={message.id}>
                <MarkdownMessage>{message.content}</MarkdownMessage>
                {sourcesByMessage.get(message.id)?.length ? <details className="dataset-chat-sources"><summary>{locale === "zh" ? "查看证据来源" : "View evidence sources"}</summary>{sourcesByMessage.get(message.id)?.map((source) => <div className="evidence" key={source.id}><strong>{source.citationLabel ?? (locale === "zh" ? "来源" : "Source")}</strong><p>{source.excerpt}</p></div>)}</details> : null}
                {message.role === "assistant" && onUseAnswer ? <button className="button button-secondary button-small" onClick={() => onUseAnswer(message.content)} type="button">{locale === "zh" ? "用于当前内容" : "Use in current content"}</button> : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="insight-ai-prompts">{starterPrompts.map((prompt) => <button disabled={sending} key={prompt} onClick={() => void sendPrompt(prompt)} type="button"><span>{prompt}</span><AppIcon name="arrow" /></button>)}</div>
        )}
      </div>
      {lastAssistant && starterPrompts.length ? <div className="ai-copilot-suggestions">{starterPrompts.slice(0, 3).map((prompt) => <button disabled={sending} key={prompt} onClick={() => void sendPrompt(prompt)} type="button">{prompt}</button>)}</div> : null}
      <div className="insight-ai-compose">
        <textarea aria-label={locale === "zh" ? "与 ChatGPT 共创" : "Co-create with ChatGPT"} disabled={sending} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendPrompt(question); } }} placeholder={locale === "zh" ? "围绕当前内容继续提问、比较或改写…" : "Ask a follow-up, compare evidence, or co-write…"} rows={2} value={question} />
        <button className="button" disabled={sending || !question.trim()} onClick={() => void sendPrompt(question)} type="button"><AppIcon name="sparkles" />{sending ? (locale === "zh" ? "分析中…" : "Analyzing…") : (locale === "zh" ? "发送" : "Send")}</button>
      </div>
    </section>
  );
}
