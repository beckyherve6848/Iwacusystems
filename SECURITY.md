# Security deployment checklist

## Database and storage

Apply the SQL migrations, including `20261010210000_harden_auth_rls_and_storage.sql`, to the Supabase project before deploying the application. This migration restricts profile reads, prevents users from assigning themselves privileged roles, limits user-owned writes, validates maintenance request sizes, and makes login asset uploads admin-only with a 5 MB image limit.

Also apply `20261013200000_harden_login_asset_storage.sql`. It removes the original authenticated-user upload/delete policies and reasserts that only admins can upload or delete branding images. Public read access is intentional because the login logo/background must load before a user signs in; uploads remain limited to 5 MB and image MIME types.

The browser uses the Supabase anon key. Never add a Supabase service-role key or other server secret to Vite environment variables prefixed with `VITE_`.

## Authentication

Before production deployment, create a Cloudflare Turnstile widget and set its **site key** as `VITE_TURNSTILE_SITE_KEY` in the frontend deployment environment. Production builds fail if this variable is missing or still contains the `.env.example` placeholder. Configure the matching **secret key** in the Supabase project's Authentication bot/CAPTCHA protection settings, select Turnstile, and enable CAPTCHA verification for password sign-in and sign-up. The secret belongs only in Supabase; never expose it in a `VITE_` variable. The production login/registration form also fails closed if the public site key is missing, and sends completed CAPTCHA tokens to Supabase Auth for server-side verification. Verify both the frontend site key and Supabase-side secret/CAPTCHA enforcement are configured in the production environments before launch. The widget is optional in local development.

Configure the hosted Supabase project in **Authentication → Rate Limits**. Supabase documents its sign-up/sign-in IP bucket as 30 requests per 5 minutes by default; lower it carefully for expected shared-office/mobile-network traffic and monitor HTTP 429 responses. Supabase applies this limit to the endpoint by IP, not only to failed passwords, so it is not equivalent to a per-account “five failed passwords” rule.

In **Authentication → Providers → Email**, set a minimum password length of at least 8 characters and enable leaked-password protection if it is available on the project plan. New tenant registration in the app also requires at least 8 characters.

## Edge protection

Use Cloudflare WAF, DDoS protection, and rate limits for the deployed website domain. This app sends authentication requests directly to the configured Supabase project URL, so Cloudflare rules on the website hostname alone do not rate-limit Supabase Auth. Configure Supabase Auth limits separately; only route the Supabase API through Cloudflare if the Supabase project is explicitly configured for that proxy/custom-domain architecture.

## Capacity planning

The application source alone cannot guarantee support for 5,000 users or a specific number of concurrent users. Confirm the Supabase plan/compute, connection pooling, storage and egress limits against expected traffic, and run a staged load test against a production-like project before launch. Test normal and peak concurrency, login bursts, dashboard queries, Realtime subscriptions, uploads, and rate-limit behavior; monitor database CPU/memory, query latency, connection saturation, Auth 429s, and storage/egress. Do not load-test production without an approved window and safeguards.

## User activity audit and privacy

Apply `20261013210000_add_transparent_user_activity_audit.sql` before enabling the admin User Activity page. It records page views for tenants, Property Managers, and caretakers; database change operation/table/record ID and changed column names, plus only the non-text `status`, `priority`, and `is_active` values; and references to sent/read support messages. Administrators can review the corresponding message while it remains in the chat table. Deleting a chat message or conversation cascades its audit reference; deleting a user's activity history removes the audit rows but does not erase the source chat conversation. Deleting the user's profile cascades their audit records.

The application displays an English/French activity-tracking notice to affected roles. Provide any additional privacy notice or legal basis required for your users and jurisdiction before enabling message review. The audit does not capture passwords, keystrokes, unsent drafts, or free-text/database field values.

References: [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits), [Supabase CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha), [Supabase password security](https://supabase.com/docs/guides/auth/password-security), [Cloudflare WAF](https://developers.cloudflare.com/waf/).
