# Quick start

Short version. Full detail and the reasoning behind each step is in `SETUP.md`.

1. Create a GitHub account: github.com/signup
2. Create a Vercel account: vercel.com/signup, and choose **Continue with GitHub**
3. Open the repo link we send you, click **Fork**
4. Get your Mailchimp API key: avatar > Account & Billing > Extras > API keys > Create A Key
5. Get your Mailchimp audience ID: Audience > All contacts > Settings > Audience name and defaults
6. Get your Connect token: Settings > Private Integrations > Create new integration, ticking `contacts.write` and `locations/customFields.readonly`
7. Get your Connect location ID: Settings > Business Profile
8. Send us your Mailchimp merge tags and Connect custom fields, and we send back your field map
9. In Vercel: **Add New > Project**, pick your forked repo, **Import**, and stop before deploying
10. Add the five environment variables: `MAILCHIMP_API_KEY`, `MAILCHIMP_AUDIENCE_ID`, `GHL_TOKEN`, `GHL_LOCATION_ID`, `FIELD_MAP`
11. Click **Deploy**
12. Trigger the job once from the **Cron Jobs** tab, then read **Logs**
13. Once that run looks right, switch off your Mailchimp Zap in Zapier

Steps 1 to 7 you can do without us. Step 8 is the one to send our way: a wrong field map makes dates arrive as text and breaks every date filter in Connect with no error to tell you.
