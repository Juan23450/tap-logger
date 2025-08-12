# Tap Logger (Vercel build)

A tiny React + Vite + Tailwind app with Supabase auth + cloud storage.

## Deploy on Vercel

1. Create a new GitHub repo and upload this folder's contents.
2. On Vercel: **New Project → Import** your repo.
3. In **Settings → Environment Variables**, add:
   - `VITE_SB_URL` — your Supabase project URL
   - `VITE_SB_ANON` — your Supabase anon key
4. Deploy.
5. In Supabase → **Auth → URL Configuration → Redirect URLs**, add your Vercel domain.
6. Open the deployed site, enter your email, click the magic link, and start logging.

## Local dev (optional)
```bash
npm install
npm run dev
```
