# AZ-900 Exam Simulator

A lightweight, timed practice exam for **Microsoft Azure Fundamentals (AZ-900)**.
Mirrors the real OnVUE/Pearson experience: countdown timer, no feedback until you
submit, mark-for-review, a review grid, auto-submit on timeout, 700/1000 pass mark,
domain-by-domain score report, and a full answer review with explanations.

Built with React + Vite.

## Requirements
- Node.js 18 or newer (check with `node -v`)

## Run it (development)
```bash
npm install
npm run dev
```
Then open the URL it prints (default http://localhost:5173).

## Build a static version (to host or keep)
```bash
npm run build     # outputs to ./dist
npm run preview   # serve the built files locally to check them
```
The `dist/` folder is plain static HTML/JS/CSS — you can serve it from anything
(nginx, `python -m http.server`, a Tailscale node, etc.). `base` is set to `./`
so it works from any path.

## Deploy for cross-device access
This app is a static React/Vite site and can be deployed to providers like Netlify,
Vercel, Cloudflare Pages, GitHub Pages, or Azure Static Web Apps.

### Recommended quick deployment: Netlify
1. Push your repo to GitHub.
2. Create a new site in Netlify and connect your GitHub repository.
3. Set the build command to `npm run build` and the publish directory to `dist`.
4. Add the environment variables below in Netlify site settings.
5. Deploy the site.

### Set up remote score storage with Supabase
If you want scores to be available on multiple devices, configure Supabase:

1. Create a free Supabase account at https://supabase.com.
2. Create a new project.
3. In the SQL editor, run:
```sql
create table if not exists az900_history (
  user_id text primary key,
  history jsonb,
  updated_at timestamp with time zone default now()
);
```
4. In the project settings, copy the `Project URL` and the anon `public` API key.
5. In your deployment provider, add these env vars:
   - `VITE_SUPABASE_URL` = your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
   - optional: `VITE_SUPABASE_TABLE` = `az900_history`
6. Deploy the site and open it on your mobile device.
7. Enter the same sync ID on every device to share score history across browsers.

### Local fallback
If no sync ID or Supabase backend is configured, the app still works normally and
stores history locally in the browser.

## Your scores
Attempt history is saved in the browser's **localStorage** by default. With a sync ID and
Supabase backend configured, history is also saved remotely so it can be accessed from
multiple devices.

## Question types
Multiple choice, multiple response, drag-and-drop matching (drag on desktop,
tap-to-place on touch), yes/no statement series, and dropdown sentence completion.

## Note
Questions are original practice items written for study. They are **not**
Microsoft's real exam content, and this project is not affiliated with Microsoft.
