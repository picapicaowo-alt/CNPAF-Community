"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { AiPromptComposer } from "@/components/AiPromptComposer";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { apiFetch, errorMessage } from "@/lib/api-client";
import type { OpenAiModelId } from "@/lib/openai-model-catalog";

type AskAttachment = { id: string; name: string; mimeType: string; byteSize: number };
type AskMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: { attachments?: AskAttachment[]; modelName?: string };
};
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
  const [model, setModel] = useState<OpenAiModelId>("gpt-5.6-terra");
  const [files, setFiles] = useState<File[]>([]);
  const [privacyAttested, setPrivacyAttested] = useState(false);
  const conversationId = useRef("");
  const initialRun = useRef("");
  const scopeKey = JSON.stringify({ contextSources, datasetVersionId, scope });

  const sourcesByMessage = useMemo(() => {
    const result = new Map<string, AskSource[]>();
    for (const source of bundle?.sources ?? []) result.set(source.messageId, [...(result.get(source.messageId) ?? []), source]);
    return result;
  }, [bundle]);

  const sendPrompt = useCallback(async (rawPrompt: string, selectedFiles: File[] = []) => {
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
      if (selectedFiles.length) {
        const formData = new FormData();
        formData.set("content", content);
        formData.set("modelName", model);
        formData.set("privacyAttested", String(privacyAttested));
        for (const file of selectedFiles) formData.append("files", file);
        await apiFetch(`/api/v1/ask-collect/conversations/${id}/messages`, { method: "POST", body: formData });
      } else {
        await apiFetch(`/api/v1/ask-collect/conversations/${id}/messages`, {
          method: "POST",
          body: JSON.stringify({ content, modelName: model, privacyAttested: false }),
        });
      }
      setBundle(await apiFetch<AskBundle>(`/api/v1/ask-collect/conversations/${id}`));
      setQuestion("");
      setFiles([]);
      setPrivacyAttested(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSending(false);
    }
  }, [conversationTitle, datasetVersionId, model, privacyAttested, scopeKey]);

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
                {message.metadata?.attachments?.length ? (
                  <div className="ai-message-attachments">
                    {message.metadata.attachments.map((attachment) => (
                      <span key={attachment.id}><AppIcon name={attachment.mimeType.startsWith("image/") ? "image" : "file"} size={15} />{attachment.name}</span>
                    ))}
                  </div>
                ) : null}
                {message.role === "assistant" && message.metadata?.modelName ? (
                  <div className="ai-message-model">
                    <AppIcon name="sparkles" size={14} />
                    ChatGPT · {message.metadata.modelName}
                  </div>
                ) : null}
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
        <AiPromptComposer
          files={files}
          locale={locale}
          model={model}
          onFilesChange={setFiles}
          onModelChange={setModel}
          onPrivacyAttestedChange={setPrivacyAttested}
          onSubmit={() => void sendPrompt(question, files)}
          onValueChange={setQuestion}
          placeholder={locale === "zh" ? "围绕当前内容继续提问、比较、上传文件或共同撰写…" : "Ask a follow-up, compare evidence, attach files, or co-write…"}
          privacyAttested={privacyAttested}
          sending={sending}
          value={question}
        />
      </div>
    </section>
  );
}
