import assert from "node:assert/strict";
import test from "node:test";
import {
  getNotificationTemplateDefinition,
  renderNotificationTemplate,
  templateVariables,
} from "../src/lib/notification-template-catalog";

test("notification templates render controlled variables without leaving placeholders", () => {
  assert.equal(
    renderNotificationTemplate(
      "Hello {{ recipient_name }}, open {{action_url}}. {{message}}",
      { recipient_name: "Alex", action_url: "https://community.cnpaf.org/tasks/1", message: null },
    ),
    "Hello Alex, open https://community.cnpaf.org/tasks/1.",
  );
});

test("notification template catalog declares onboarding and recurring task delivery events", () => {
  assert.equal(getNotificationTemplateDefinition("account_onboarding")?.kindKey, "account_onboarding");
  assert.equal(getNotificationTemplateDefinition("task_reminder")?.labelEn, "Task / activity reminder");
  assert.deepEqual(templateVariables("{{recipient_name}} / {{unknown_value}}"), ["recipient_name", "unknown_value"]);
});
