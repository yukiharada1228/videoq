# Cloudflare token rotation and expiry notifications

[`.github/cloudflare-token-expiry.json`](../.github/cloudflare-token-expiry.json)
is the source of truth for expiry dates. It stores token names, expiry dates,
secret locations, and notification owners, without storing token values.
The deployment and resource-sync tokens issued on 2026-09-18 both expire on
**2026-12-17**. Rotate them no later than the preceding day to switch before expiry.

## Automated notifications

The [`Cloudflare Token Expiry`](../.github/workflows/cloudflare-token-expiry.yml)
workflow checks expiry dates daily at 09:17 JST. It also runs when monitoring
configuration changes on main and can be run manually.

- 30 days before expiry: Group tokens with the same expiry date into one issue, assign it to `yukiharada1228`, and mention that user.
- 14 days, 7 days, and 1 day before expiry, and on the expiry date: Mention the owner again in the same issue. A delayed run catches up to the applicable stage.
- From 7 days before expiry until rotation: Fail the monitoring workflow so it also appears in Actions failure notifications.
- Do not create duplicate issues or comments for the same stage. Closing the issue alone causes it to be reopened.
- After the updated dates are merged into main, automatically close issues for old dates that no longer have any tokens assigned to them.

The monitoring job has only `contents: read` and `issues: write` permissions. It
does not use Cloudflare, AWS, or database secrets, production environments, or
external email-service keys. It does not query the actual Cloudflare tokens, so
updating the recorded expiry date is a required part of rotation.

Enable the following in [GitHub notification settings](https://github.com/settings/notifications).
Both were confirmed enabled on 2026-09-18.

- Participating, @mentions and custom: On GitHub + Email
- Actions: On GitHub + Email + Failed workflows only

This workflow cannot verify whether email was sent or delivered. See
[Actions notification settings](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications)
and [notification recipients for scheduled runs](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs).

Scheduled workflows in public repositories are
[automatically disabled after 60 days of inactivity](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
and can run later than their scheduled time. Add backup calendar reminders before
expiry and update their dates when rotating tokens. This workflow does not update
the calendar automatically.

## Rotation procedure

1. Issue new Cloudflare tokens. See [DEPLOY.md](DEPLOY.md) for the required permissions.
2. Update the GitHub Environment secrets.
   - Deployment: `production-app.CLOUDFLARE_API_TOKEN` and `production-infra.CLOUDFLARE_API_TOKEN`
   - Resource sync: `production-infra.CLOUDFLARE_INFRA_TOKEN`
3. Confirm that CD and resource sync succeed with the new tokens.
4. Verify where the old tokens are used, then revoke them.
5. Update the relevant `name` and `expiresOn` entries in `.github/cloudflare-token-expiry.json`
   to match the actual new tokens, and merge the change into main through a PR.
   Do not merely postpone the recorded expiry date.
6. Update the backup calendar reminders to the new expiry dates.
7. Confirm that `Cloudflare Token Expiry` passes and the issues for old expiry dates close.

If the new expiry date is more than 30 days away, no issue is created until the
30-day threshold. If only one token is rotated, the issue for the other token's
old expiry date remains open.

## Test without sending notifications

Under Actions → Cloudflare Token Expiry → Run workflow, enable `dry_run` and set
`preview_date` to `2026-11-17` (30 days before expiry) or `2026-12-10` (7 days before
expiry). A custom date is allowed only in dry-run mode. The workflow writes the
result to the job summary without creating issues or comments. Normal monitoring
also fails on GitHub API errors or missing expiry configuration.
