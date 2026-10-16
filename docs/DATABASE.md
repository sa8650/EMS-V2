# Set up the database — step by step

No terminal or command line is needed. Everything is done in the browser.

EMS 5 starts with a **new, empty database**. Nothing is copied from the old EMS.

---

## Choose your database

Pick **one**. If you're not sure, choose **Supabase**.

| | Supabase | Cloudflare D1 |
| --- | --- | --- |
| Where | supabase.com (separate account) | inside your Cloudflare account |
| Setup | paste 3 files, copy 2 values | paste 2 files, edit 1 file on GitHub |
| Viewing your data | Supabase **Table Editor** | Cloudflare **D1 → Tables** |
| Good to know | Free projects pause after a period without visits. Use a paid plan for a live business. | Everything stays on Cloudflare. |

You cannot switch later without starting again, so choose before you go live.

### Three rules

1. **Always use a new database for EMS 5.** Never use your old EMS database. EMS 5 refuses to start on it anyway.
2. **Run each file once, in order.** If something went wrong halfway, create a new database and start again. Don't run the files a second time.
3. **Keep keys private.** The Supabase secret key only goes into Cloudflare's **Secret** fields (Deployment guide, Part 5).

### How to copy a file from GitHub

You will copy files from your **ems-5** repository (made in the Deployment guide, Part 2):

1. On <https://github.com>, open **ems-5**.
2. Click the folders to reach the file, for example **db → postgres → migrations → 0001_initial_schema.sql**.
3. Click the **Copy raw file** button (two overlapping squares, top right of the file).

You can also open the file from the unzipped **EMS-5** folder with Notepad (Windows) or TextEdit (Mac), then select all and copy.

---

## Option A — Supabase

### A1. Create the project

1. Go to <https://supabase.com/dashboard> and click **New project**.
2. Fill in:
   - **Name:** `ems`
   - **Database password:** click **Generate a password**, then save it in your password manager.
   - **Region:** the closest to your customers. For Bangladesh, choose **Mumbai** or **Singapore**.
   - If you see **Data API** options, keep the Data API **turned on**. The other choices can stay as they are.
3. Click **Create new project** and wait until it says the project is ready (1–2 minutes).

### A2. Add the EMS tables

1. In the left menu, click **SQL Editor**.
2. Click **+ New query** (or **New SQL snippet**).
3. Copy the file **`db/postgres/migrations/0001_initial_schema.sql`** from GitHub and paste it into the editor.
4. Click **Run**. Wait for **Success. No rows returned**.
5. Click **+ New query** again. Copy **`db/postgres/migrations/0002_functions.sql`**, paste it, and click **Run**.
   - If Supabase warns about a *destructive operation*, click **Run this query**. It only prepares the **Factory reset** button.
6. Click **+ New query** again. Copy **`db/postgres/migrations/0003_seed.sql`**, paste it, and click **Run**.

### A3. Check it worked

1. In the left menu, click **Table Editor**. You should see many tables, such as `admins`, `shops`, `products` and `invoices`.
2. Click the table **`settings`**. It has exactly **one row**, with the key **`schema`**.
3. Click the table **`addons`**. It has **five rows**: ConnectX, Zudo AI, AI Business Health, TrueBill and Vaultium.

### A4. Copy the two values for Cloudflare

1. **Project URL:**
   1. Click **Connect** at the top of the project page, or go to **Project Settings → Data API**.
   2. Copy the **Project URL**. It looks like `https://abcdefgh.supabase.co`.
2. **Secret key:**
   1. Go to **Project Settings → API Keys**.
   2. Under **Secret keys**, copy the key that starts with `sb_secret_`. Click the eye or **Reveal** first if it's hidden. If there is none, click **Add new secret key**.
   3. Don't use the *publishable* key.

Add both as **Secrets** in Cloudflare, as described in the Deployment guide, Part 5:
- `SUPABASE_URL` gets the Project URL.
- `SUPABASE_SERVICE_ROLE_KEY` gets the secret key.

Supabase is done. Go back to the [Deployment guide](DEPLOYMENT.md), Part 4.

---

## Option B — Cloudflare D1

### B1. Create the database

1. Go to <https://dash.cloudflare.com>.
2. In the left menu, open **D1 SQL Database** (it may be under **Storage & databases**).
3. Click **Create Database** (or **Create**).
4. Name: `ems-d1`. For **Location**, you may choose **Asia-Pacific**, or leave it automatic.
5. Click **Create**.

### B2. Add the EMS tables

1. Open the **ems-d1** database you just created and click the **Console** tab.
2. Copy the file **`db/d1/migrations/0001_initial_schema.sql`** from GitHub, paste the whole text into the console box, and click **Execute**. Wait until it finishes without a red error.
3. Clear the box. Copy **`db/d1/migrations/0002_seed.sql`**, paste it, and click **Execute**.

### B3. Check it worked

1. Click the **Tables** tab. You should see many tables, such as `admins`, `shops`, `products` and `invoices`.
2. Open the table **`settings`**. It has exactly **one row**, with the key **`schema`**.
3. Open the table **`addons`**. It has **five rows**.

### B4. Copy the Database ID

On the **ems-d1** page (Overview or Settings), find **Database ID** and copy it. It is a long code like `1a2b3c4d-…`.

### B5. Connect the database to EMS (on GitHub)

1. On <https://github.com>, open **ems-5** and click the file **`wrangler.jsonc`**.
2. Click the **pencil icon** (Edit this file).
3. Find the 8 lines that start with `// "d1_databases"` and end with `// ],`.
4. On each of those 8 lines, delete the two slashes `//` and the space after them at the start of the line.
5. On the line with `PASTE-YOUR-D1-DATABASE-ID`, replace that text with your Database ID. Keep the quotation marks around it.
6. The finished part must look like this, with your own ID:

   ```text
     "d1_databases": [
       {
         "binding": "DB",
         "database_name": "ems-d1",
         "database_id": "1a2b3c4d-0000-0000-0000-000000000000",
         "migrations_dir": "db/d1/migrations"
       }
     ],
   ```

7. Click **Commit changes…**, then **Commit changes** again.

If the website already exists on Cloudflare, it rebuilds automatically with the database connected (**ems-app → Deployments**). If not, continue with the [Deployment guide](DEPLOYMENT.md), Part 4.

> With D1, do **not** add the `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets in Cloudflare.

---

## After the website is online: is the database connected?

Open **your site address + `/setup`**:

| What you see | Meaning |
| --- | --- |
| A form to create the platform owner | Connected and ready. Create the owner now. |
| *The platform owner has already been set up* | Connected. Sign in at `/login` → **Owner**. |
| *The database has not been initialised* | The files were not run. Do A2 or B2. |
| *not an EMS 5 database* | The website points to another database. Check the Supabase values (A4) or the D1 ID (B5). |
| *Server configuration is incomplete* | A secret is missing (Deployment guide, Part 5). |

---

## Looking at your data

- **Supabase:** **Table Editor**, then click a table.
- **D1:** Cloudflare → **D1 SQL Database → ems-d1 → Tables**.

Use these screens to **look** only. Make all changes inside EMS. Editing tables by hand can break the records.

---

## Backups

- **Supabase:**
  - Paid plans make daily backups (**Project Settings/Database → Backups**).
  - On the free plan you can save a table yourself: **Table Editor** → open the table → **Export → CSV**.
- **D1:** Cloudflare keeps the last 30 days of changes automatically (Time Travel). Restoring needs the command line, so ask your developer or Cloudflare support if you need it.

---

## Starting again

- **Erase everything in EMS:** **Owner console → System → Factory reset**. Enter your password and the confirmation text. All records and accounts are deleted, and EMS starts again at `/setup`.
- **Use a fresh database instead:**
  1. Create a new Supabase project or a new D1 database.
  2. Repeat this guide.
  3. Update the Cloudflare secrets (Supabase) or the Database ID in `wrangler.jsonc` (D1).
