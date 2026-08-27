"use client";

import { useEffect, useMemo, useState } from "react";
import { AppIcon } from "@/components/AppIcon";
import { StatusPill } from "@/components/ui";

export type TemplateChoice = {
  id: string;
  kind: "preset" | "library";
  sourceId: string;
  title: string;
  description: string;
  meta: string;
  recommended?: boolean;
};

export function TemplateLaunchModal({
  canAdd,
  canDelete,
  canEdit,
  choices,
  error,
  locale,
  onAdd,
  onChoose,
  onClose,
  onDelete,
  onEdit,
  onStartBlank,
  onToggleQuick,
  quickIds,
  workingId,
}: {
  canAdd: boolean;
  canDelete: boolean;
  canEdit: boolean;
  choices: TemplateChoice[];
  error: string;
  locale: "zh" | "en";
  onAdd: () => void;
  onChoose: (choice: TemplateChoice) => void;
  onClose: () => void;
  onDelete: (choice: TemplateChoice) => void;
  onEdit: (choice: TemplateChoice) => void;
  onStartBlank: () => void;
  onToggleQuick: (choiceId: string) => void;
  quickIds: string[];
  workingId: string;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  const matching = useMemo(() => {
    const value = query.trim().toLocaleLowerCase();
    if (!value) return choices;
    return choices.filter((choice) =>
      [choice.title, choice.description, choice.meta].some((part) =>
        part.toLocaleLowerCase().includes(value),
      ),
    );
  }, [choices, query]);
  const visible = query || showAll ? matching : matching.slice(0, 3);

  return (
    <div
      aria-labelledby="template-launch-title"
      aria-modal="true"
      className="modal-backdrop template-launch-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
      role="dialog"
    >
      <section className="modal-card template-launch-modal">
        <header className="template-launch-heading">
          <div>
            <span className="eyebrow">{locale === "zh" ? "新建表单" : "New form"}</span>
            <h2 id="template-launch-title">
              {locale === "zh" ? "从哪里开始？" : "Choose a starting point"}
            </h2>
            <p>
              {locale === "zh"
                ? "先显示最常用的 3 个模板；需要时再搜索或展开。"
                : "Start with three common templates, then search or expand when needed."}
            </p>
          </div>
          <div className="template-launch-heading-actions">
            {canAdd ? (
              <button
                className="button button-secondary button-small"
                onClick={onAdd}
                type="button"
              >
                <AppIcon name="plus" />
                {locale === "zh" ? "添加模板" : "Add template"}
              </button>
            ) : null}
            <button
              aria-label={locale === "zh" ? "关闭" : "Close"}
              className="icon-button"
              onClick={onClose}
              type="button"
            >
              <AppIcon name="close" />
            </button>
          </div>
        </header>

        <label className="search-control template-launch-search">
          <AppIcon name="search" />
          <input
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder={locale === "zh" ? "搜索模板名称、用途或类型" : "Search name, use case, or type"}
            type="search"
            value={query}
          />
        </label>

        {error ? (
          <div className="feedback feedback-error" role="alert">
            {error}
          </div>
        ) : null}

        {visible.length ? (
          <div className="template-choice-grid">
            {visible.map((choice) => {
              const quick = quickIds.includes(choice.id);
              const working = workingId === choice.sourceId;
              return (
                <article className="template-choice-card" key={choice.id}>
                  <button
                    className="template-choice-main"
                    disabled={working}
                    onClick={() => onChoose(choice)}
                    type="button"
                  >
                    <span className={`template-choice-icon ${choice.kind}`}>
                      <AppIcon name={choice.kind === "library" ? "template" : "forms"} />
                    </span>
                    <span className="template-choice-copy">
                      <span className="row template-choice-badges">
                        <StatusPill tone={choice.kind === "library" ? "violet" : "blue"}>
                          {choice.kind === "library"
                            ? locale === "zh" ? "团队模板" : "Team template"
                            : locale === "zh" ? "业务模板" : "Workflow"}
                        </StatusPill>
                        {choice.recommended ? (
                          <span className="caption">{locale === "zh" ? "推荐" : "Recommended"}</span>
                        ) : null}
                      </span>
                      <strong>{choice.title}</strong>
                      <span>{choice.description}</span>
                      <small>{choice.meta}</small>
                    </span>
                    <AppIcon className="template-choice-arrow" name="arrow" />
                  </button>
                  <div className="template-choice-actions">
                    <button
                      aria-pressed={quick}
                      className={quick ? "active" : ""}
                      onClick={() => onToggleQuick(choice.id)}
                      type="button"
                    >
                      <AppIcon name={quick ? "check" : "plus"} />
                      {quick
                        ? locale === "zh" ? "已加入 Quick Add" : "In Quick Add"
                        : "Quick Add"}
                    </button>
                    {canEdit || canDelete ? (
                      <span className="template-choice-manage-actions">
                        {canEdit && (choice.kind === "library" || canAdd) ? (
                          <button
                            disabled={working}
                            onClick={() => onEdit(choice)}
                            type="button"
                          >
                            <AppIcon name="edit" />
                            {locale === "zh" ? "编辑" : "Edit"}
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button
                            className="danger"
                            disabled={working}
                            onClick={() => onDelete(choice)}
                            type="button"
                          >
                            <AppIcon name="trash" />
                            {locale === "zh" ? "删除" : "Delete"}
                          </button>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="template-choice-empty">
            <AppIcon name="search" />
            <strong>{locale === "zh" ? "没有匹配模板" : "No matching templates"}</strong>
            <span>{locale === "zh" ? "换一个关键词，或从空白表单开始。" : "Try another term or start with a blank form."}</span>
          </div>
        )}

        <footer className="template-launch-footer">
          <div>
            {!query && matching.length > 3 ? (
              <button
                className="button button-ghost button-small"
                onClick={() => setShowAll((current) => !current)}
                type="button"
              >
                {showAll
                  ? locale === "zh" ? "收起" : "Show less"
                  : locale === "zh" ? `显示更多（${matching.length - 3}）` : `Show more (${matching.length - 3})`}
              </button>
            ) : <span />}
          </div>
          <button className="button button-secondary" onClick={onStartBlank} type="button">
            {locale === "zh" ? "从空白表单开始" : "Start with a blank form"}
            <AppIcon name="arrow" />
          </button>
        </footer>
      </section>
    </div>
  );
}
