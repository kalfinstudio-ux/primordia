# Supabase Cloud Setup Guide — PRIMORDIA

PRIMORDIA works 100% offline in **Local Guest Mode** out of the box. To enable cloud saves, settings synchronization, and the global leaderboard, connect a free Supabase project:

## 1. Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Open **Project Settings → API** and copy:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon / public key** (Never copy or expose the `service_role` secret key in the frontend).

## 2. Run Database Schema & RLS Policies
1. In the Supabase dashboard, open **SQL Editor**.
2. Paste and run the contents of `supabase/schema.sql`.
3. Paste and run the contents of `supabase/policies.sql`.

## 3. Configure Environment Variables
Create a `.env` file (or set GitHub Actions Repository Secrets for GitHub Pages builds):

```env
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_ANON_KEY="your-public-anon-key"
```

## 4. Enable Email / Magic Link Auth
In **Authentication → Providers**, ensure **Email** is enabled and add your GitHub Pages URL (e.g. `https://username.github.io/primordia/`) to **Authentication → URL Configuration → Redirect URLs**.
