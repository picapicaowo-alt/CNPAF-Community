# Google Workspace task notifications

CNPAF keeps task notifications in the application. When Gmail delivery is
enabled, the same task assignment and reminder events are also queued for the
assigned member's organization email address. Network calls run after the
database transaction; failed sends remain visible in the internal job and
delivery records for retry.

## Workspace setup

1. In a dedicated Google Cloud project, enable the Gmail API and create a
   service account with domain-wide delegation enabled.
2. In Google Admin Console, open **Security → Access and data control → API
   controls → Manage Domain Wide Delegation**. Add the service account's
   **numeric client ID**, not its email address.
3. Grant only `https://www.googleapis.com/auth/gmail.send`.
4. Choose an active CNPAF Workspace mailbox as the delegated sender. The
   service account impersonates only this mailbox to send task messages.
5. Put the values below in each ignored, access-restricted deployment env file.
   Never commit the downloaded service-account JSON or private key.

Google's current references: [server-to-server and domain-wide delegation](https://developers.google.com/identity/protocols/oauth2/service-account), [Gmail send scope](https://developers.google.com/workspace/gmail/api/auth/scopes), and [message sending format](https://developers.google.com/workspace/gmail/api/guides/sending).

```dotenv
APP_BASE_URL=https://community.cnpaf.org
NOTIFICATION_EMAIL_PROVIDER=gmail
GMAIL_API_BASE_URL=https://gmail.googleapis.com/gmail/v1
GMAIL_OAUTH_SCOPE=https://www.googleapis.com/auth/gmail.send
NOTIFICATION_EMAIL_ALLOWED_DOMAINS=cnpaf.org
GMAIL_DELEGATED_SENDER=notifications@cnpaf.org
GMAIL_FROM_NAME=CNPAF Community
# Preferred on self-managed hosts: an absolute path outside every release.
GMAIL_SERVICE_ACCOUNT_CREDENTIALS_FILE=/home/ubuntu/apps/cnpaf-community/shared/secrets/gmail-notification-sender.json
TASK_AUTOMATION_SECRET=replace-with-a-long-random-secret
TASK_RECURRENCE_LOOKAHEAD_DAYS=7
```

Keep the credential file readable only by the application user (`0600`) and
its parent secret directory private (`0700`). Inline
`GMAIL_SERVICE_ACCOUNT_CLIENT_EMAIL` and `GMAIL_SERVICE_ACCOUNT_PRIVATE_KEY`
remain supported for a managed secret store, but must not be combined with the
file-based setting.

`NOTIFICATION_EMAIL_ALLOWED_DOMAINS` is comma-separated. Delivery is skipped
for addresses outside this list, preventing an accidental task assignment from
becoming an external email disclosure.

System-generated email subjects and bodies are English by default, regardless
of the recipient's interface language. The delegated sender is the dedicated
CNPAF mailbox `notifications@cnpaf.org`.

## Notification events and customization

Email and in-app delivery use the same organization-scoped template for these
events:

- account onboarding and password reset;
- task/activity assignment, reassignment, and reminder;
- people-group and program membership changes;
- role/access-scope changes; and
- school or institution affiliation changes.

Administrators with `notifications.manage_templates` can edit the in-app title,
email subject, message body, and action-button label under **More → Notification
management**. Each event exposes a bounded variable list such as
`{{recipient_name}}`, `{{organization_name}}`, `{{entity_name}}`, and
`{{action_url}}`; unknown variables are rejected at the API boundary. Account
creation also accepts a one-person welcome note, while task detail keeps its
editable manual reminder message.

Onboarding and forgot-password verification tokens are random, validated
against SHA-256 hashes, single-use, and expire after 24 hours. The retryable
notification outbox retains the delivery link with the same restricted access
as other email payloads. The public forgot-password endpoint
returns the same accepted response for matching and non-matching addresses and
applies a five-minute per-account issuance cooldown. A successful password
reset invalidates existing sessions.

## Recurrence runner

The authenticated `POST /api/v1/automation/tasks` endpoint creates task
occurrences due within the configured lookahead window and processes only
notification-email jobs. It does not run queued AI work.

On the AWS host, install and enable the included systemd runner:

```bash
sudo install -m 0755 environments/aws/scripts/run-task-automation.sh \
  /usr/local/sbin/cnpaf-community-task-automation
sudo install -m 0644 environments/aws/systemd/cnpaf-community-task-automation@.service \
  environments/aws/systemd/cnpaf-community-task-automation@.timer \
  /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cnpaf-community-task-automation@dev.timer \
  cnpaf-community-task-automation@prod.timer
```

Verify one environment without exposing its bearer token:

```bash
sudo systemctl start cnpaf-community-task-automation@dev.service
sudo systemctl status cnpaf-community-task-automation@dev.service
```
