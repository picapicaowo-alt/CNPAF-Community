"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { useI18n } from "@/components/LocaleProvider";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { apiFetch, errorMessage } from "@/lib/api-client";
import {
  isOpenAiModelId,
  OPENAI_MODEL_CATALOG,
  type OpenAiModelId,
} from "@/lib/openai-model-catalog";

type ModelConfig = {
  id: string;
  providerConfigId: string;
  modelName: string;
  status: string;
};

type ProviderBundle = {
  provider: { id: string; key: string; displayName: string; status: string };
  models: ModelConfig[];
};

type WorkflowBundle = {
  workflow: {
    id: string;
    nameEn: string;
    nameZh: string;
    currentPublishedVersionId?: string | null;
  };
  versions: Array<{
    id: string;
    providerConfigId?: string | null;
    modelConfigId?: string | null;
  }>;
};

export function AiModelSettings() {
  const { locale } = useI18n();
  const [provider, setProvider] = useState<ProviderBundle | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowBundle[]>([]);
  const [selected, setSelected] = useState<OpenAiModelId>("gpt-5.4-mini");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [providerResponse, workflowResponse] = await Promise.all([
        apiFetch<{ providers: ProviderBundle[] }>("/api/v1/ai/provider-configs"),
        apiFetch<{ workflows: WorkflowBundle[] }>("/api/v1/ai/workflows"),
      ]);
      const openAiProvider = providerResponse.providers.find(
        (entry) => entry.provider.key === "openai",
      ) ?? null;
      setProvider(openAiProvider);
      setWorkflows(workflowResponse.workflows);

      if (openAiProvider) {
        const currentVersionModelIds = new Set(
          workflowResponse.workflows.flatMap((entry) => {
            const current = entry.versions.find(
              (version) => version.id === entry.workflow.currentPublishedVersionId,
            );
            return current?.providerConfigId === openAiProvider.provider.id && current.modelConfigId
              ? [current.modelConfigId]
              : [];
          }),
        );
        const currentNames = new Set(
          openAiProvider.models
            .filter((model) => currentVersionModelIds.has(model.id))
            .map((model) => model.modelName),
        );
        const currentName = currentNames.size === 1 ? [...currentNames][0] : "";
        if (isOpenAiModelId(currentName)) setSelected(currentName);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeBindings = useMemo(() => {
    if (!provider) return [];
    const modelById = new Map(provider.models.map((model) => [model.id, model]));
    return workflows.flatMap((entry) => {
      const current = entry.versions.find(
        (version) => version.id === entry.workflow.currentPublishedVersionId,
      );
      if (
        current?.providerConfigId !== provider.provider.id ||
        !current.modelConfigId ||
        !modelById.has(current.modelConfigId)
      ) return [];
      return [{ workflow: entry.workflow, model: modelById.get(current.modelConfigId)! }];
    });
  }, [provider, workflows]);

  const activeModelIds = useMemo(
    () => [...new Set(activeBindings.map((entry) => entry.model.id))],
    [activeBindings],
  );
  const activeModelNames = useMemo(
    () => [...new Set(activeBindings.map((entry) => entry.model.modelName))],
    [activeBindings],
  );
  const currentLabel = activeModelNames.length === 1
    ? OPENAI_MODEL_CATALOG.find((model) => model.id === activeModelNames[0])?.name ?? activeModelNames[0]
    : activeModelNames.length > 1
      ? locale === "zh" ? "多个模型" : "Mixed models"
      : locale === "zh" ? "尚未接入 OpenAI" : "OpenAI is not active";
  const unchanged = activeModelNames.length === 1 && activeModelNames[0] === selected;

  async function saveSelection() {
    if (!provider || activeModelIds.length === 0 || unchanged) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await Promise.all(
        activeModelIds.map((id) =>
          apiFetch(`/api/v1/ai/model-configs/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ modelName: selected }),
          }),
        ),
      );
      setNotice(
        locale === "zh"
          ? "模型已切换。新的洞察、问答和报告任务会使用该模型；正在运行的任务不受影响。"
          : "Model updated. New insight, chat, and report runs will use it; in-flight work is unchanged.",
      );
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack ai-model-settings">
      <PageHeader
        title={locale === "zh" ? "AI 模型" : "AI model"}
        description={
          locale === "zh"
            ? "为全站已发布的 OpenAI 工作流选择默认模型。只有具备 AI 配置权限的管理员可以修改。"
            : "Choose the default model for published OpenAI workflows across the site. Only AI administrators can change it."
        }
      />

      {error ? <ErrorState message={error} retry={load} /> : null}
      {notice ? <div className="feedback feedback-success" role="status"><strong>{notice}</strong></div> : null}
      {loading ? <LoadingState rows={4} /> : (
        <>
          <section className="ai-model-current" aria-labelledby="current-model-heading">
            <div className="ai-model-current-icon"><AppIcon name="sparkles" size={22} weight="fill" /></div>
            <div>
              <h2 id="current-model-heading">{locale === "zh" ? "当前全站模型" : "Current site-wide model"}</h2>
              <strong>{currentLabel}</strong>
              <p>
                {locale === "zh"
                  ? `覆盖 ${activeBindings.length} 个已发布工作流：${activeBindings.map((entry) => entry.workflow.nameZh).join("、") || "暂无"}`
                  : `Used by ${activeBindings.length} published workflows: ${activeBindings.map((entry) => entry.workflow.nameEn).join(", ") || "none"}`}
              </p>
            </div>
          </section>

          <form className="ai-model-form" onSubmit={(event) => { event.preventDefault(); void saveSelection(); }}>
            <fieldset className="ai-model-fieldset">
              <legend>{locale === "zh" ? "选择模型" : "Choose a model"}</legend>
              <p className="ai-model-help">
                {locale === "zh"
                  ? "质量更高的模型通常响应更慢、费用更高。实际可用性取决于当前 OpenAI 项目的模型权限。"
                  : "Higher-quality models are usually slower and more expensive. Availability depends on the connected OpenAI project."
                }
              </p>
              <div className="ai-model-options">
                {OPENAI_MODEL_CATALOG.map((model) => {
                  const checked = selected === model.id;
                  return (
                    <label className={`ai-model-option${checked ? " is-selected" : ""}`} key={model.id}>
                      <input
                        checked={checked}
                        name="model"
                        onChange={() => setSelected(model.id)}
                        type="radio"
                        value={model.id}
                      />
                      <span className="ai-model-radio" aria-hidden="true">{checked ? <AppIcon name="check" size={15} weight="bold" /> : null}</span>
                      <span className="ai-model-option-copy">
                        <span className="ai-model-option-heading">
                          <strong>{model.name}</strong>
                          <small>{locale === "zh" ? model.badgeZh : model.badgeEn}</small>
                        </span>
                        <span className="ai-model-description">{locale === "zh" ? model.descriptionZh : model.descriptionEn}</span>
                        <span className="ai-model-tradeoffs">
                          <span>{locale === "zh" ? "速度" : "Speed"}<b>{locale === "zh" ? model.speedZh : model.speedEn}</b></span>
                          <span>{locale === "zh" ? "成本" : "Cost"}<b>{locale === "zh" ? model.costZh : model.costEn}</b></span>
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <footer className="ai-model-actions">
              <p>
                {locale === "zh"
                  ? "切换会记录在审计日志中，并只影响之后新建的 AI 任务。"
                  : "The change is audited and applies only to new AI runs."
                }
              </p>
              <button
                className="button"
                disabled={saving || unchanged || activeModelIds.length === 0}
                type="submit"
              >
                <AppIcon name="sparkles" />
                {saving
                  ? locale === "zh" ? "正在切换…" : "Updating…"
                  : locale === "zh" ? "应用到全站" : "Apply site-wide"}
              </button>
            </footer>
          </form>
        </>
      )}
    </div>
  );
}
