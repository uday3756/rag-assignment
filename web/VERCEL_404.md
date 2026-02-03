# Resolving Vercel NOT_FOUND (404)

## 1. Fix

**Set Root Directory to `web` in Vercel.**

1. Vercel Dashboard → your project → **Settings** → **General**.
2. Under **Root Directory**, click **Edit**.
3. Enter `web` (no leading/trailing slash).
4. Save and **redeploy** (Deployments → … → Redeploy).

If you get 404 on a specific path (e.g. `/foo`): that route doesn’t exist. The app only has `/` and `/api/ask`. Use the home page or fix the URL. A custom **Not Found** page is in `app/not-found.tsx` for unknown paths.

---

## 2. Root cause

**What was happening vs what was needed**

- **What happened:** Vercel cloned the repo and ran build from the **repository root** (where `README.md`, `rag_system.py`, `web/`, etc. live). At the root there is no `package.json` with Next.js and no `app/` folder, so Vercel didn’t get a valid Next.js app. The deployed “app” was either empty or default, and requests (e.g. to `/`) returned **404 NOT_FOUND**.
- **What was needed:** Build and run must start from the **Next.js app directory** (`web/`), where `package.json`, `next.config.ts`, and `app/` live. That’s why Vercel has a **Root Directory** setting: for monorepos, you point it at the subfolder that contains the app.

**What triggered the error**

- The project is a **monorepo**: repo root = assignment (Python + `web/`); the deployable app is only inside `web/`.
- Root Directory was left **empty** (or wrong), so Vercel used the repo root.
- Request to `/` (or any path) hit a deployment that had no matching route → **NOT_FOUND**.

**Misconception**

- Assuming “import from GitHub” means “build the repo root.” On Vercel, “project” = one deployable app; for a monorepo, that app is often in a **subfolder**, which you must set explicitly.

---

## 3. Underlying concept

**Why NOT_FOUND exists**

- The server must respond for every request. If no route or file matches the URL, it responds **404 Not Found** so the client and crawlers know “this resource doesn’t exist” instead of hanging or 500.
- On Vercel, “resource” includes: correct project (build), correct framework (Next.js), and a route that matches the path. If the build is wrong (wrong root), there are effectively no routes, so everything is “not found.”

**Mental model**

- **Repo** = whole Git repo (e.g. `rag-assignment` with Python + `web/`).
- **Vercel project** = one deployed application, tied to one **Root Directory**.
- **Root Directory** = the folder Vercel treats as the app root (where it runs `install` and `build`). For this repo, that folder is `web`.
- **Routes** = in Next.js, `app/` file structure defines routes. Wrong root ⇒ wrong or no `app/` ⇒ no routes ⇒ 404.

**How this fits**

- Vercel is built for both single-app repos and monorepos. Root Directory is the knob for “which subfolder is this app.” Next.js then maps URLs to files under that root (e.g. `app/page.tsx` → `/`, `app/api/ask/route.ts` → `/api/ask`). If the root is wrong, the mapping is wrong and you get NOT_FOUND.

---

## 4. Warning signs and similar mistakes

**What to check**

- Monorepo but Root Directory **empty** or **wrong** (e.g. root instead of `web`).
- After adding a new app in a subfolder, forgetting to set (or update) Root Directory in Vercel.
- Typo in Root Directory (e.g. `webb` or `Web` on case-sensitive systems).
- Visiting a path that doesn’t exist (e.g. `/dashboard`) and expecting a page — you’ll get 404 until you add that route.

**Similar pitfalls**

- **Netlify:** “Base directory” or “Publish directory” — same idea: point at the app subfolder.
- **Railway / Render:** “Root directory” or “Build path” — same.
- **CI/CD:** Scripts that run `npm run build` from the repo root instead of `cd web && npm run build`.

**Code smells**

- Repo has both “non-app” files (e.g. Python, docs) and a `web/` (or `frontend/`) app, but deployment docs don’t mention Root Directory.
- README says “cd web && npm run dev” but deploy instructions don’t set the equivalent for the host.

---

## 5. Alternatives and trade-offs

**Option A: Root Directory = `web` (recommended)**

- **What:** Keep repo as-is; in Vercel set Root Directory to `web`.
- **Pros:** One repo for assignment + app; no file moves; clear separation.
- **Cons:** Must remember to set Root Directory for this project and any clone.

**Option B: Separate repo for the app**

- **What:** Push only `web/` to a different repo (e.g. `rag-assignment-ui`); connect that repo to Vercel; leave Root Directory blank.
- **Pros:** No Root Directory; deploy is “just this app.”
- **Cons:** Two repos to maintain; assignment and UI are split.

**Option C: Move Next.js to repo root**

- **What:** Move contents of `web/` to the repo root (so `package.json`, `app/`, etc. are at root); remove `web/` folder.
- **Pros:** Root Directory can stay empty on Vercel.
- **Cons:** Python and Node in same root; more mixed structure; harder to keep “assignment” and “app” clearly separate.

**Recommendation:** Use **Option A** (Root Directory = `web`) so one repo stays the single source of truth and Vercel explicitly targets the app folder.
