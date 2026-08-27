"use client";

import { useI18n } from "@/components/LocaleProvider";

export default function PrivacyPage() {
  const { locale } = useI18n();
  return (
    <main style={{ width: "min(100% - 36px, 860px)", margin: "0 auto", padding: "42px 0 72px" }}>
      <article className="card stack" style={{ padding: "clamp(22px, 5vw, 48px)" }}>
        <a className="inline-link" href="/login">
          {locale === "zh" ? "← 返回登录" : "← Back to CNPAF Community"}
        </a>
        <h1>{locale === "zh" ? "隐私政策" : "Privacy Policy"}</h1>
        <p>
          {locale === "zh"
            ? "CNPAF Community 是供 CNPAF 志愿者与协调员使用的一线信息采集系统。本系统不声明符合 HIPAA；健康隐私法律是否适用，取决于机构角色与数据内容。"
            : "CNPAF Community is an operational field-intelligence system for CNPAF volunteers and coordinators. It is not claimed to be HIPAA compliant. Whether health-privacy law applies depends on organizational role and data."}
        </p>
        <h2>{locale === "zh" ? "我们收集什么" : "What we collect"}</h2>
        <ul>
          <li>{locale === "zh" ? "账号邮箱、姓名与角色。" : "Account email, name, and role."}</li>
          <li>{locale === "zh" ? "群体活动的一线记录；系统不要求填写住户姓名或病历。" : "Field notes about group-level activities. Resident names and medical records are not requested."}</li>
          <li>{locale === "zh" ? "选择相应来源类型时填写的教授姓名、文献标题与链接。" : "Professor names and literature titles or URLs when you choose those source types."}</li>
          <li>{locale === "zh" ? "可选的环境照片；系统会移除 EXIF 信息，且不会把照片发送给外部 AI 服务。" : "Optional environment photos. EXIF is removed, and photos are not sent to external AI providers."}</li>
        </ul>
        <h2>{locale === "zh" ? "人工智能" : "AI"}</h2>
        <p>
          {locale === "zh"
            ? "提交的文本在调用外部模型前会先在服务器完成隐私扫描。被标记的一线记录不会发送给第三方 AI。AI 主题或关注点必须经过人工审核才能成为正式结论。公开网络搜索只能补充外部背景，不得包含私有证据或内部标识；使用的外部来源会附上可核验链接。"
            : "Submitted text is privacy-scanned on our servers before any external model is called. Flagged field notes are not sent to third-party AI. Human review is required before AI themes or concerns become official. Public web search may add outside context, but private evidence and internal identifiers must not be included in search queries. External sources are shown with verification links."}
        </p>
        <h2>{locale === "zh" ? "研究使用" : "Research use"}</h2>
        <p>{locale === "zh" ? "运营记录不会自动成为研究数据集；研究使用需要单独的状态与审核。" : "Operational records do not automatically become a research dataset. Research use requires a separate status and review."}</p>
        <h2>{locale === "zh" ? "保留与删除" : "Retention and deletion"}</h2>
        <p>{locale === "zh" ? "已登录用户可以通过账号功能导出数据或申请删除。协调员会保留提交、审核与隐私标记的审计日志。" : "Signed-in users may export data or request deletion through account features. Coordinators retain audit logs for submissions, reviews, and privacy flags."}</p>
        <p className="muted">{locale === "zh" ? "最后更新：2026 年 8 月 22 日。" : "Last updated August 22, 2026."}</p>
      </article>
    </main>
  );
}
