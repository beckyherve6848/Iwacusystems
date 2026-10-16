# Use your own Supabase project

The SQL files in `migrations` are the database schema and policy history. They can be applied to a Supabase project in your own account with the Supabase CLI.

## Deploy the frontend with GitHub and Vercel

1. Create a **private GitHub repository** for this project and push the project folder contents. Keep `.env`, `.devburundi`, `node_modules`, `dist`, `.vercel`, and `supabase/.temp` out of the repository; `.gitignore` excludes them. Commit `.env.example` only, and never commit Supabase service-role keys, database passwords, or Turnstile secret keys.
2. In Vercel, import the GitHub repository. Use the project root as the Root Directory, `npm run build` as the Build Command, and `dist` as the Output Directory. `vercel.json` provides the SPA rewrite so direct navigation and refreshes on app routes return to the React application.
3. Add these environment variables in Vercel for **Production**, and also Preview if you want preview deployments to connect to Supabase:

   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-project-anon-or-publishable-key
   VITE_TURNSTILE_SITE_KEY=your-cloudflare-turnstile-site-key
   ```

   Use the public anon/publishable key only. Never add a service-role key or Turnstile secret to Vercel `VITE_` variables. Redeploy after changing environment variables.
4. Add the Vercel production domain to Supabase **Authentication → URL Configuration** as the Site URL and an allowed redirect URL. Configure the Turnstile secret and CAPTCHA verification in Supabase Auth as described in `../SECURITY.md`.

The repository stores application source and migrations, not the live database or user data. Deploying the frontend does not apply migrations; use the Supabase steps below for that.

## Create and connect your Supabase project

Create a new project in the Supabase Dashboard under an organization where your account has permission to create projects. Choose the region and database password there; keep the password private. The Supabase CLI cannot create or access a project unless the logged-in account has the required organization/project permissions.

Then copy the new project's **Project URL** and **anon / publishable key** from **Project Settings → API Keys** into the ignored `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-new-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-project-anon-or-publishable-key
VITE_TURNSTILE_SITE_KEY=your-cloudflare-turnstile-site-key
```

Never put a `service_role` or secret key in a `VITE_` variable. Vite exposes `VITE_` values to the browser.

For production authentication, configure Cloudflare Turnstile in Supabase Auth's CAPTCHA/bot-protection settings and add the matching public site key as `VITE_TURNSTILE_SITE_KEY` to the frontend deployment environment before building. Production builds fail if the site key is missing or still set to the `.env.example` placeholder; sign-in and registration are also blocked at runtime without it. Keep the matching Turnstile secret in Supabase only, enable CAPTCHA verification for password sign-in and sign-up, and verify the production Supabase settings before launch.

## Apply the migrations

In a terminal in the project folder, authenticate with an account that has access to your new project, then run:

```sh
npx supabase login
npm run supabase:setup
```

The setup command prompts for the new project's reference (the subdomain in its Project URL), links this local project, updates `supabase/config.toml`, and applies unapplied files in `supabase/migrations` in timestamp order. Review the CLI migration plan and confirm before it changes the remote database.

After the initial setup, new app registrations are handled automatically. To apply future database migrations, run:

```sh
npm run supabase:push
```

Deploy the staff-invitation function after applying the migrations:

```sh
npx supabase functions deploy admin-create-staff
```

The function checks that the caller is an administrator and uses Supabase's server-side service-role environment variable to send an invitation. Never expose the service-role key in the browser or in a `VITE_` variable. Set the Supabase project's **Site URL** and allowed redirect URLs under **Authentication → URL Configuration** so invitation links return to this app.

If you cannot use the CLI, apply the SQL files from `supabase/migrations` in timestamp order in the Supabase Dashboard **SQL Editor**. Migrations can depend on functions and tables created by earlier migrations. For example, `20261011140000_add_property_manager_role.sql` requires `public.current_app_role()`, created in `20261010210000_harden_auth_rls_and_storage.sql`. The Property Manager role constraint is also updated by `20261012093000_allow_property_manager_profile_role.sql`.

The auth-signup profile migration installs a database trigger that creates each new tenant's `profiles` row from signup metadata. Apply the migrations before enabling tenant registration; otherwise profile creation may fail under row-level security.

The `20261012112000_add_property_and_house_assignments.sql` migration adds a separate `properties` table and links each house to one property. Existing houses are preserved and placed in temporary `Unassigned - ...` groups because their original property grouping is not stored; edit those houses to move them under the correct property. Create a property such as **Mirango** first, then add its houses under it. Caretakers are assigned to one whole property, while Property Managers are assigned available individual houses. A house already assigned to another Property Manager cannot be assigned again.

Deploy the updated `admin-create-staff` function after applying this migration so new caretaker invitations can save the selected property assignment.

The `20261012123000_fix_profiles_rls_recursion.sql` migration fixes recursive `profiles` row-level security checks. Apply it before saving staff details if the app reports `infinite recursion detected in policy for relation "profiles"`.

The `20261011070000_add_utility_invoices.sql` migration creates the rent and utility invoices table used by the admin and tenant invoice pages. If Supabase reports that `public.utility_invoices` is missing, apply the unapplied migrations in timestamp order (including the earlier role helper migration `20261010210000_harden_auth_rls_and_storage.sql`) using `npm run supabase:push` or the Dashboard SQL Editor, then refresh the app.

The `20261013140000_allow_property_managers_to_manage_assigned_invoices.sql` migration adds invoice access for Property Managers, limited to tenants in their assigned houses, and allows them to notify those tenants when an invoice is created. `20261013150000_allow_caretakers_to_manage_assigned_invoices.sql` is superseded by `20261013160000_limit_caretaker_invoices_to_read_only.sql`: after applying the latter, caretakers can view and print invoices for their assigned property but cannot create, edit, delete, or change invoice status. Administrators can see invoices created by Property Managers; the admin policy in the base invoice migration continues to apply. The `20261013170000_hide_paid_tenant_invoices_and_cleanup_notifications.sql` migration hides paid invoices from tenants, deletes their linked notification on payment, and cascades invoice deletion to its notification. Apply the invoice, assignment, and invoice-access migrations in timestamp order.

The `20261013100000_track_notification_delivery.sql` migration links each sent notification to its announcement and sender, enabling administrators to see recipient read status. The following `20261013120000_delete_notification_copies_with_announcement.sql` migration adds an administrator-only database operation that deletes linked recipient copies and the announcement together. Apply both with `npm run supabase:push` before using notification read tracking or sender-side deletion.

The `20261014200000_add_property_manager_call_center.sql` migration adds separate landlord/tenant, landlord/property-manager, and property-manager/tenant conversations. Property Managers can start chats with tenants assigned to their houses and message the landlord; tenants can reply to manager-started conversations. `20261014210000_allow_tenants_to_start_assigned_manager_chats.sql` adds the tenant-specific manager lookup used to show names for existing chats and briefly allows tenants to start manager chats. `20261014220000_add_chat_presence_status.sql` adds the chat-only online/last-seen status shown to conversation participants. `20261014230000_revoke_tenant_manager_chat_creation.sql` removes tenant chat-creation permission. `20261014240000_add_chat_contact_profile_photos.sql` exposes assigned managers' private profile photos to their tenants and updates the tenant manager lookup to return profile-photo paths; access is restricted to profile-photo files for managers assigned to that tenant. `20261014250000_allow_caretaker_landlord_chat.sql` gives caretakers access to a private landlord conversation, including sending and reading messages, without granting tenant or manager conversation access. `20261014260000_allow_assigned_managers_to_read_tenant_chat_photos.sql` lets a Property Manager read a tenant's private chat photo only when that manager has a conversation with the tenant. Tenant photos uploaded from the Tenants page must be 500 × 500 PNG/JPG images; the private image is displayed in the tenant navigation and authorized chats. Administrators can search for tenants and managers, read all conversations, and permanently delete conversations and their messages. Managers and caretakers cannot delete conversations or messages, and manager/tenant chats remain separate from landlord/tenant conversations. Apply these migrations in timestamp order.

The `20261013180000_property_manager_maintenance_notifications.sql` migration explicitly allows Property Managers to view and update maintenance requests for assigned houses and notify the affected tenant when request status changes. Administrators retain their existing maintenance access. Apply this after the Property Manager assignment migrations.

The `20261013190000_delete_maintenance_notifications_with_request.sql` migration links maintenance status notifications to their request and removes those notifications automatically when the request is deleted. Apply it after the maintenance and notifications tables exist.

The `20261013200000_harden_login_asset_storage.sql` migration removes legacy authenticated-user upload/delete policies for the public login branding bucket and restricts branding image writes to administrators. Public reads are retained so the sign-in screen can display its branding.

The `20261013210000_add_transparent_user_activity_audit.sql` migration creates an administrator-only activity audit for tenant, Property Manager, and caretaker page visits, structured database changes, and sent/read support-message references. It records changed field names and only the values of status/priority/active-state fields, never free-text values. Show users the in-app activity-tracking notice before enabling this feature. Audit references to chat messages are deleted when the underlying message is deleted; clearing an activity history removes only audit records, not the original support conversation. See `../SECURITY.md` for the privacy scope.

These migrations create the schema, policies, and app features in the target project; they do not copy existing users, tenant records, payments, or other data from a different Supabase project. Back up and migrate existing data separately if you need it.

For deployments serving 5,000 users, capacity depends on the Supabase plan, database compute, concurrency, and query patterns. Complete a staged load test and review Auth/database/storage limits before launch; see `../SECURITY.md`.
