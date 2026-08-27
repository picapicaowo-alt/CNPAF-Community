import { JWT } from "google-auth-library";
import { getNotificationEmailRuntimeConfig } from "@/config/server";

export type GmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export async function sendGmailMessage(message: GmailMessage) {
  const config = getNotificationEmailRuntimeConfig();
  if (!config.enabled) throw new Error("Gmail notification delivery is disabled");
  const recipientDomain = message.to.split("@").at(-1)?.toLowerCase();
  if (!recipientDomain || !config.allowedRecipientDomains.has(recipientDomain)) {
    throw new Error("Recipient domain is not allowed for notification email delivery");
  }

  const auth = new JWT({
    email: config.serviceAccountEmail,
    key: config.serviceAccountPrivateKey,
    scopes: [config.oauthScope],
    subject: config.delegatedSender,
  });
  const accessTokenResult = await auth.getAccessToken();
  const accessToken =
    typeof accessTokenResult === "string" ? accessTokenResult : accessTokenResult.token;
  if (!accessToken) throw new Error("Google did not return an access token");

  const response = await fetch(
    `${config.apiBaseUrl}/users/${encodeURIComponent(config.delegatedSender)}/messages/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encodeMimeMessage(config.delegatedSender, config.fromName, message) }),
    },
  );
  const result = await response.json() as { id?: string; error?: { message?: string } };
  if (!response.ok || !result.id) {
    throw new Error(result.error?.message || `Gmail API returned HTTP ${response.status}`);
  }
  return { providerMessageId: result.id };
}

function encodeMimeMessage(sender: string, fromName: string, message: GmailMessage) {
  const boundary = `cnpaf_${crypto.randomUUID().replaceAll("-", "")}`;
  const lines = [
    `From: ${encodeHeader(fromName)} <${sanitizeHeader(sender)}>`,
    `To: ${sanitizeHeader(message.to)}`,
    `Subject: ${encodeHeader(message.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    message.text,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    message.html,
    `--${boundary}--`,
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]/g, " ").trim();
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(sanitizeHeader(value), "utf8").toString("base64")}?=`;
}
