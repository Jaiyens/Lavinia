# Terra

Marketing site for **Terra** — an AI-native operating system for farms. Built with
Next.js (App Router), TypeScript, Tailwind CSS v4, and Motion.

## Sections

`Header → Hero → Problem → Products (The Brain + The Eyes) → Case Study (PG&E) → Traction → About Us → Inquire → Footer`

Nav: **Products · About Us · Inquire**. Color scheme: white + grass green.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
```

## The inquire form

The contact form posts to `POST /api/inquire`. It works out of the box in development —
without credentials, submissions are validated and logged to the server console
(`delivered: false`). To actually receive emails:

1. Copy `.env.local.example` → `.env.local`.
2. Add a [Resend](https://resend.com) API key and set `INQUIRY_TO_EMAIL`.
3. For production, verify your domain in Resend and set `INQUIRY_FROM_EMAIL` to an
   address on it (e.g. `Terra <hello@terra.farm>`).

## Deploy (Vercel)

1. Push this folder to a Git repo and import it at [vercel.com/new](https://vercel.com/new)
   (Vercel auto-detects Next.js — no config needed).
2. Add the same env vars (`RESEND_API_KEY`, `INQUIRY_TO_EMAIL`, `INQUIRY_FROM_EMAIL`)
   under **Project → Settings → Environment Variables**.
3. Deploy. `npm run build` must pass locally first.

## Content

All copy lives in [`src/lib/site.ts`](src/lib/site.ts) — sourced from the Terra deck.
Edit it in one place to update stats, founders, case-study numbers, etc.
