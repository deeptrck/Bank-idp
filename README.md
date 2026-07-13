# Sentinel IDP

KYC document intake app for a bank onboarding flow, built with Next.js (App Router) + TypeScript.

## Structure

```
sentinel-idp/
├── app/
│   ├── layout.tsx          # Root layout, imports global styles
│   ├── page.tsx            # Redirects to /login
│   ├── globals.css         # Design tokens (CSS variables) + base styles
│   ├── login/
│   │   └── page.tsx        # Staff sign-in screen
│   ├── dashboard/
│   │   └── page.tsx        # Onboarding queue table
│   └── review/
│       └── [applicant]/
│           └── page.tsx    # Placeholder per-applicant review screen
├── package.json
├── tsconfig.json
├── next.config.js
└── .gitignore
```

## Getting started

1. Open this folder in VS Code.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the dev server:
   ```bash
   npm run dev
   ```
4. Open http://localhost:3000 — it redirects to `/login`. Signing in (any
   email/password, since auth isn't wired up yet) takes you to `/dashboard`.
   Clicking a row in the dashboard table goes to `/review/[applicant]`.

## Notes / next steps

- **Auth**: `login/page.tsx` currently just redirects on submit. Swap in your
  real auth (Clerk, NextAuth, etc.) inside `handleSubmit`.
- **Data**: the `rows` array in `dashboard/page.tsx` is hardcoded sample data.
  Replace with a fetch to your API / MongoDB.
- **Icons**: uses the Tabler Icons webfont via CDN (imported in
  `globals.css`). Swap for the `@tabler/icons-react` package if you'd rather
  bundle icons instead of loading from a CDN.
- **Design tokens**: all colors, radii, and surfaces are CSS variables
  defined once in `app/globals.css` under `:root`, so re-theming (e.g. a dark
  mode) just means adding a second variable block.
