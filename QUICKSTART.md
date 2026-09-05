# Quick start

Short version. Full detail and the reasoning behind each step is in `SETUP.md`.

1. Create a GitHub account: github.com/signup
2. Create a Vercel account: vercel.com/signup, and choose **Continue with GitHub**
3. Open the repo link we send you, click **Fork**
4. Get your Mailchimp API key: avatar > Account & Billing > Extras > API keys > Create A Key
5. Get your Mailchimp audience ID: Audience > All contacts > Settings > Audience name and defaults
6. Get your Connect token: Settings > Private Integrations > Create new integration, ticking `contacts.write`, `contacts.readonly` and `locations/customFields.readonly`. Create it from **inside your clinic's location**, not an agency-level view
7. Get your Connect location ID: Settings > Business Profile
8. Send us your Mailchimp merge tags and Connect custom fields, and we send back your field map
9. Generate a cron secret. In a terminal: `openssl rand -hex 32`, and keep the output
10. In Vercel: **Add New > Project**, pick your forked repo, **Import**, and stop before deploying
11. Add six environment variables: `MAILCHIMP_API_KEY`, `MAILCHIMP_AUDIENCE_ID`, `GHL_TOKEN`, `GHL_LOCATION_ID`, `FIELD_MAP`, `CRON_SECRET`
12. Click **Deploy**
13. Trigger the job once from the **Cron Jobs** tab, then read **Logs**
14. Once that run looks right, switch off your Mailchimp Zap in Zapier

Steps 1 to 7 and 9 you can do without us. Step 8 is the one to send our way: a wrong field map makes dates arrive as text and breaks every date filter in Connect with no error to tell you.

Three that catch people out:

**`CRON_SECRET` is yours to create**: Vercel offers to generate one when you add a schedule through its dashboard, and this repo declares the schedule in a file instead, so nothing prompts you. It's what stops anyone who finds your sync address from triggering it, and the job now refuses to run until it's set.

**`contacts.readonly` is not optional**: the unsubscribe direction searches your contacts before it can act, so without it that half of the sync fails every run.

**Wrong-location tokens look fine**: a token created outside your clinic's location returns something valid-looking, then fails on every request with "token does not have access to this location".
