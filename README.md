# TripTok

TripTok is a lightweight web app for turning messy TikTok (or social) comments into an Airbnb shortlist you can organise, compare, and share.

## What it does
Paste a comment full of links, extract Airbnb listings, and save them into trips. Each trip becomes a clean, structured shortlist with titles, notes, and quick actions.

## Why it exists
When planning trips from TikTok, links are scattered across comments, screenshots, and DMs. TripTok makes it easy to collect those listings, keep context, and compare options without losing track.

## Main features
- Extract Airbnb links from pasted comments (including short/slink URLs).
- Save links to trips with titles, notes, and metadata chips.
- Bulk selection, auto-open control, and duplicate detection.
- Compare up to 4 listings side-by-side.
- Share read-only trip links with friends.

## Run locally
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

## Short roadmap
- Better parsing of TikTok comments and other short-link formats.
- Import/export trips for backup.
- Rich compare view (price, location, rating details).
- Optional trip sharing with expiration.

---
Built for fast, real-world trip planning from social discovery.
