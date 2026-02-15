# Stash

Save anything online.  
Organise it.  
Share it when it matters.

![showcase](docs/assets/app-showcase.png)

---

## What Stash Is

Stash is a clean, decision-focused saving platform.

It lets you save links from anywhere online — fashion, travel, products, ideas — organise them into structured collections, compare options side-by-side, and share curated collections with others.

It’s not just a bookmark tool.  
It’s a workspace for making better decisions.

---

## Core Features

### 🔖 Save Anything
- Paste any link from social media, shopping sites, travel platforms, or articles
- Save directly from the Chrome extension
- Automatic duplicate detection
- Smart cover image generation (with graceful fallbacks)

### 📚 Structured Collections
- Organise into categories (Fashion / Travel / General)
- Create focused collections (e.g. “Dresses for Prom”, “Portugal Trip”, “New Monitor”)
- Add titles, notes, tags, and cover images
- Clean dark UI with consistent design system

### ⚖️ Decision Workspace
- Shortlist and chosen states
- Group similar items automatically for comparisons
- Compare up to 4 items side-by-side
- Resolve comparison groups once a decision is made

### 🌍 Social & Sharing
- Share read-only collection links
- Clean public collection view
- Foundations for Explore and social discovery

---

## Chrome Extension

Stash lives in your browser so you can save something the moment you see it.

![extension showcase](docs/assets/extension-showcase.png)

- One-click saving
- Instant collection selection
- Works alongside the main web app

---

## Run Locally

From the project root:

```bash
# Install frontend deps
npm install

# Install server deps
cd server
npm install

# Start server (API on http://localhost:5000)
npm start

```

In another terminal:

```bash
# Start frontend (http://localhost:3000)
cd ..
npm start
```

## Environment variables
Create a `.env.local` file in the project root:

```
REACT_APP_SUPABASE_URL=your_supabase_url
REACT_APP_SUPABASE_ANON_KEY=your_supabase_anon_key
# Optional: public URL used in shared links (e.g. ngrok/domain)
REACT_APP_SHARE_ORIGIN=https://your-public-domain.com
```

Optional: set this Supabase Edge Function secret to use Unsplash as an extra cover source:

```bash
supabase secrets set UNSPLASH_ACCESS_KEY=your_unsplash_access_key
```

Automatic cover generation works without Unsplash by using Wikimedia/Wikipedia lookups, then query-based fallback image providers, and only then gradients.

## Project structure
```text
.
├─ src/                 # React web app source
│  ├─ components/
│  ├─ hooks/
│  ├─ lib/
│  └─ pages/
├─ public/              # Static web assets
├─ server/              # Local API server + social services
├─ supabase/
│  ├─ functions/        # Edge functions
│  └─ ...
├─ extension/           # Browser extension source
├─ migrations/          # SQL migrations
├─ docs/
│  ├─ assets/           # README/media assets
│  └─ screenshots/
└─ README.md
```

## Short roadmap
- Better parsing of TikTok comments and other short-link formats.
- Import/export collections for backup.
- Rich compare view (price, location, rating details).
- Optional collection sharing with expiration.

---
Built for fast, real-world trip planning from social discovery.
