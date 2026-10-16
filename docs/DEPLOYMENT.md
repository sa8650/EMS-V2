# Put EMS online — step by step

No terminal or command line is needed. You only use websites (GitHub, Cloudflare, Supabase, Brevo) and one free app, **GitHub Desktop**.

Menu names in the dashboards change from time to time. If a button is worded a little differently, look for the closest match.

---

## What you will do

| Part | What | Time |
| --- | --- | --- |
| 1 | Create the accounts you need | 10 min |
| 2 | Put the EMS files on GitHub | 10 min |
| 3 | Create the database ([DATABASE.md](DATABASE.md)) | 15 min |
| 4 | Create the website on Cloudflare | 10 min |
| 5 | Add the secret settings | 5 min |
| 6 | Open EMS and create the owner account | 2 min |
| 7 | Check that everything works | 15 min |
| 8 | Optional: email, file storage, your own domain, SMS, AI | — |

---

## Part 1 — Accounts

Create these accounts if you don't have them yet:

1. **GitHub**: <https://github.com/signup>
2. **Cloudflare**: <https://dash.cloudflare.com/sign-up>
3. **Supabase**: <https://supabase.com>. Only needed if you choose Supabase as your database. Read Part 3 first if you're not sure.
4. **Brevo**: <https://www.brevo.com>. Needed to send emails, including password-reset codes.

Also install **GitHub Desktop**: <https://desktop.github.com>. Open it once and sign in with your GitHub account:
- **Windows:** File → Options → Accounts → Sign in.
- **Mac:** GitHub Desktop → Settings → Accounts → Sign in.

---

## Part 2 — Put the EMS files on GitHub

You need the file **`EMS-5.zip`** from the `handoff` folder in this chat's workspace.

1. Download **`EMS-5.zip`** and unzip it:
   - **Windows:** right-click the file → **Extract All** → **Extract**.
   - **Mac:** double-click the file.

   You now have a folder called **`EMS-5`**.
2. Open **GitHub Desktop** and click **File → Add local repository…**.
3. Click **Choose…**, select the **`EMS-5`** folder, then click **Select Folder** (Windows) or **Add** (Mac).
4. GitHub Desktop says *"This directory does not appear to be a Git repository"*. Click the blue link **create a repository**.
5. In the window that opens, leave everything as it is and click **Create repository**.
6. If the left side now shows a list of files: type `EMS 5` in the **Summary** box at the bottom left, then click **Commit to main**.
7. Click **Publish repository** at the top.
8. Name: `ems-5`. Keep **Keep this code private** ticked. Click **Publish repository**.

**Check:** go to <https://github.com>, open your repositories, and click **ems-5**. You should see the folders `src`, `db` and `docs`.

> Your current EMS website (the old version) is not affected. This is a separate repository and a separate site.

---

## Part 3 — Create the database

Follow **[DATABASE.md](DATABASE.md)**, then come back here. You'll finish with one of these:

- **Supabase:** a **Project URL** and a **secret key**. Keep them for Part 5.
- **Cloudflare D1:** the Database ID pasted into `wrangler.jsonc` on GitHub. Nothing to keep for Part 5.

---

## Part 4 — Create the website on Cloudflare

1. Go to <https://dash.cloudflare.com>.
2. In the left menu, open **Workers & Pages** (it may be under **Compute**).
3. Click **Create application** (top right).
4. Next to **Import a repository**, click **Get started**.
5. Click **Connect GitHub** (the first time only):
   1. A GitHub page opens. Choose your account.
   2. Select **Only select repositories**, choose **ems-5**, then click **Install & Authorize**.
6. Back in Cloudflare, click the **ems-5** repository.
7. Fill in the settings exactly like this:

   | Field | What to enter |
   | --- | --- |
   | Project name | `ems-app` (exactly this) |
   | Build command | `npx @opennextjs/cloudflare build` |
   | Deploy command | `npx @opennextjs/cloudflare deploy` |
   | Builds for non-production branches | untick, if you see it |
   | Everything else | leave as it is |

8. Click **Deploy** (or **Save and Deploy**).
9. Wait about 3 to 6 minutes. A log shows the progress. When it says the deployment succeeded, continue.
   - If it says **failed**, see *If something goes wrong* at the end.
10. Find your site address on the Worker's page. It looks like `https://ems-app.YOUR-NAME.workers.dev` and appears under **Domains & Routes** or next to **Visit**. Copy it; you need it in Part 5.

> If you open the address now, you will see *"Server configuration is incomplete"*. That's normal until Part 5 is done.

---

## Part 5 — Add the secret settings

1. In Cloudflare, open **Workers & Pages → ems-app → Settings → Variables and Secrets**.
2. For each row below:
   1. Click **+ Add**.
   2. Choose **Type: Secret** (always Secret, never Text).
   3. Enter the **Variable name** and the **Value**.
3. When all rows are added, click **Deploy**. This saves the settings.

| Variable name | Value | When |
| --- | --- | --- |
| `SESSION_SECRET` | A random password of **64 characters** (letters and numbers). Create it with the password generator in any password manager. Use it only here. | always |
| `SUPABASE_URL` | Your Supabase **Project URL** (see DATABASE.md) | Supabase only |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase **secret key**, which starts with `sb_secret_` | Supabase only |
| `SITE_URL` | Your site address from Part 4, step 10, starting with `https://`. If you add your own domain later, change it to that domain. | recommended |
| `BREVO_API_KEY` | Your Brevo API key (see Part 8 → Email) | for emails |

> Using Cloudflare D1? Do **not** add the two `SUPABASE_` rows.

Wait one minute, then open your site address again. You should see the EMS home page.

---

## Part 6 — Create the owner account (do this right away)

The first person to complete this step becomes the platform owner, so do it before you share the address with anyone.

1. Open **your site address + `/setup`**, for example `https://ems-app.YOUR-NAME.workers.dev/setup`.
2. Enter your name, email and a password of at least 12 characters, then click **Create platform owner**.
3. You are now in the **Owner console**. Set these up first:
   1. **Licence plans** → **New plan**: create at least one plan, so administrators can buy a licence.
   2. **Branding**: your product name, contact email and phone.
   3. **Pages**: write your **About**, **Terms** and **Privacy** text.
   4. **ConnectX**: set the email sender, after Part 8 → Email.

---

## Part 7 — Check that everything works

Use two browser windows. Keep the owner signed in in the normal window, and open a **private/incognito** window for the administrator.

1. **Normal window:** the home page, **Pricing** (shows your plan), **Contact** and **Blog** all open.
2. **Private window:** go to your address + `/register` and create an administrator account. You land in the **Administrator** console.
3. **Private window:** **Licence** → choose your plan → fill in the payment details → **Send request**.
4. **Normal window:** **Licence requests** → **Approve** → **Activate licence**.
5. **Private window:** **Shops** → **New shop** → fill in the name → **Create shop**. Then click **Open** next to the shop.
6. In the shop console:
   1. **Inventory** → **Add product**.
   2. **Purchases** → **New purchase**: add the product, quantity 10, a price → **Save purchase**.
   3. **Sales** → **New sale**: add the product, quantity 1 → **Save sale**. The invoice opens. Click **Print** to see the printed version.
   4. **Inventory** now shows 9 in stock. The **Dashboard** shows today's sale.
7. **Staff** → **Add staff**: give a user ID and a password, and tick some permissions. Open another private window, go to `/login`, and sign in with the **Shop ID** (shown in **Settings**), that user ID and that password. The staff member only sees the sections you allowed.
8. **Email check** (after Part 8 → Email): on the sign-in page, click **Forgot password?** and use your owner email. A 6-digit code should arrive.

If all of this works, EMS is ready.

---

## Part 8 — Optional extras

### Email (Brevo)

1. Sign in to <https://app.brevo.com>.
2. Open **Senders, Domains & Dedicated IPs → Senders → Add a sender**. Enter the email address EMS should send from, then confirm it from the email Brevo sends you.
3. Open **SMTP & API → API Keys → Generate a new API key**. Give it any name, then **copy the key**.
4. In Cloudflare, go to **ems-app → Settings → Variables and Secrets → + Add**:
   - Type: **Secret**
   - Name: `BREVO_API_KEY`
   - Value: the key you copied

   Click **Deploy**.
5. In EMS: **Owner console → ConnectX**. Tick **Shops may send email**, enter the same sender email as in step 2, then click **Save**.

### File storage (Vaultium documents, App Store uploads)

1. In Cloudflare, open **R2 Object Storage** in the left menu (it may be under **Storage & databases**). If asked, activate R2; Cloudflare may ask for a payment method even though there is a free allowance.
2. Click **Create bucket**. Name: `ems-files`. Click **Create bucket**.
3. On GitHub, open your **ems-5** repository and click the file **`wrangler.jsonc`**.
4. Click the **pencil icon** (Edit this file).
5. Find the line that starts with `// "r2_buckets"` and delete the two slashes and the space before `"r2_buckets"`. The line must then start with `"r2_buckets"`.
6. Click **Commit changes…**, then **Commit changes** again.
7. Cloudflare rebuilds the site automatically within a few minutes. You can watch it under **ems-app → Deployments**.

### Your own domain

1. Your domain must be added to Cloudflare first: **Websites/Domains → Add a domain**, then follow the steps.
2. Open **Workers & Pages → ems-app → Settings → Domains & Routes → + Add → Custom domain**.
3. Enter the domain or subdomain (for example `ems.yourdomain.com`), then click **Add domain**.
4. Change the secret **`SITE_URL`** to the new address (Part 5), then click **Deploy**.

> If your old EMS website uses this domain, first remove the domain from the old site: **Workers & Pages → (old site) → Custom domains → remove**. Then add it here. The old site's data does not move to EMS 5; EMS 5 starts fresh.

### SMS from your phone (Connect App)

**Owner console → Connect App.** Paste the Connect Endpoint shown in the ConnectX Android app, click **Send pairing request**, and approve it on the phone. Shops can then send SMS from **ConnectX → SMS**.

### AI (Zudo AI and Business Health)

**Owner console → AI settings.** Tick **Enabled** and choose a model.
- Models marked **Cloudflare** work without anything else.
- Other providers need their key as a **Secret** in Cloudflare, named for example `GEMINI_API_KEY`, `GROQ_API_KEY` or `OPENROUTER_API_KEY`.

---

## Updating EMS later

When you receive a new **`EMS-5.zip`**:

1. Unzip it.
2. Copy everything from the new folder into your existing **`EMS-5`** folder and choose **Replace** for all files. Exception: if you edited **`wrangler.jsonc`** for D1 or file storage, keep your own copy of that file. Choose **Skip** for it.
3. Open **GitHub Desktop**. The changes are listed on the left. Type `Update` in **Summary**, then click **Commit to main**.
4. Click **Push origin** at the top.
5. Cloudflare rebuilds and updates the site automatically (**ems-app → Deployments**).

---

## If something goes wrong

| What you see | Where to fix it |
| --- | --- |
| The build **failed** in Cloudflare | Open **ems-app → Deployments**, then the failed build, to read the log. Then check below. |
| Build log: *name … must match the name of your Worker* | The project must be named exactly `ems-app`. Create it again in Part 4 with that name. |
| Build log mentions *R2 bucket* or *ems-files* | Create the bucket (Part 8 → File storage), or put the two slashes back in front of `"r2_buckets"` in `wrangler.jsonc`. |
| Build log mentions *d1_databases* or *database_id* | Check your edit in `wrangler.jsonc` ([DATABASE.md](DATABASE.md), Option B, step B5). All 8 lines must have their slashes removed, and the ID must be pasted exactly. |
| The site says *Server configuration is incomplete* | A secret is missing. Add it in Part 5 and click **Deploy**. |
| The site says *The database has not been initialised* | The database files were not run. Follow [DATABASE.md](DATABASE.md). |
| The site says *not an EMS 5 database* | The settings point to a different (for example, old) database. Use the new database from [DATABASE.md](DATABASE.md). |
| *permission denied for table* (Supabase) | The database files were run out of order or only partly. Create a new Supabase project and run the three files again, in order. |
| Password-reset codes never arrive | Check `BREVO_API_KEY` (Part 8 → Email), and that the sender in **Owner console → ConnectX** is verified in Brevo. |
| Someone else created the owner account | Owner console → **System** → **Factory reset** erases everything. Then do Part 6 again yourself. |
