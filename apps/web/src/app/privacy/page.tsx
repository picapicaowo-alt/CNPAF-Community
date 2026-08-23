export default function PrivacyPage() {
  return (
    <article className="card stack">
      <h1>Privacy Policy 隐私政策</h1>
      <p>
        CNPAF Collect is an operational field-intelligence system for CNPAF volunteers and coordinators. It is not
        claimed to be HIPAA compliant. Whether health-privacy law applies depends on organizational role and data.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Account email, name, and role.</li>
        <li>Field notes about group-level activities. Resident names and medical records are not requested.</li>
        <li>Professor names and literature titles/URLs when you choose those source types.</li>
        <li>Optional environment photos. EXIF is stripped. Photos are not sent to external AI providers.</li>
      </ul>
      <h2>AI</h2>
      <p>
        Submitted text is privacy-scanned on our servers before any external model is called. Flagged field notes are
        not sent to third-party AI. Human review is required before AI themes/concerns become official.
      </p>
      <h2>Research use</h2>
      <p>
        Operational records are not automatically a research dataset. Research use requires a separate status and
        review (`researchUseStatus`).
      </p>
      <h2>Retention and deletion</h2>
      <p>
        Signed-in users may export or request deletion via account API (<code>/api/v1/account</code>). Coordinators
        retain audit logs of submit, review, and privacy flags.
      </p>
      <p className="muted">Last updated 2026-08-22.</p>
    </article>
  );
}
