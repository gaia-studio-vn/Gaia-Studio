# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

GAIA Studio is a multi-user web app for generating AI images and videos. Users sign in with Google, buy GAIA credits through PayOS, and spend them on generations. Generation runs on the third-party **Gommo** API (`https://api.gommo.net`), reached through the founder's 79ai account, so Gommo credits are GAIA's cost and never the user's balance. Supabase stores users, the library and the credit wallet.

All UI copy and most code comments are in Vietnamese (`<html lang="vi">`). Creator terms stay in English (prompt, model, ratio, resolution, start/end frame, reference, credit); actions and statuses are Vietnamese. The UI was rebuilt on 2026-10-08 from `../mockup-gaia/GAIA-Studio-mockup.html` (the "Phòng tối"/Darkroom design). Change the mockup and the app together, and match the mockup's classes in `app/globals.css`.

Stack: Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), Supabase (`@supabase/ssr` + `supabase-js`), `qrcode`. There is **no Tailwind**: styling is plain CSS in `app/globals.css`, ported from the mockup. Fonts come from `next/font` (Be Vietnam Pro as `--font-ui`, JetBrains Mono as `--font-mono`). The `@/*` alias points to the project root. `SETUP.md` (Vietnamese) covers the Supabase, Google OAuth and PayOS setup.

## Commands

```bash
npm run dev          # http://localhost:3000
npm run build
npm run lint         # ESLint 9 + React Compiler rules; the codebase is currently clean
npm run typecheck    # tsc --noEmit
```

There is no test framework. The SQL and pricing logic were verified with throwaway scripts (PGlite plus Node type-stripping). Re-verify that way after changing `supabase/migrations/*` or `lib/catalog.ts`.

## Next 16 specifics

- `proxy.ts` replaces `middleware.ts`. The exported function is named `proxy`.
- `params`, `searchParams` and `cookies()` are Promises and must be awaited.
- `getUser()` in `lib/auth.server.ts` calls `connection()`, so auth-gated pages always render per request.

## Page speed (measured 2026-10-12)

From the dev machine in VN, every Supabase call costs about 250 ms of network round trip. The Supabase work itself is about 20 ms, and the DB is in ap-southeast-1. Gommo `/ai/models` costs about 1.6 s. Page time is therefore the number of *sequential* round trips. Keep it at one.

- **`pageSession(nextPath)`** (`lib/auth.server.ts`) replaces `requireUserPage` in pages.
  - It gives `userId` from the locally verified JWT, so data loads start at once.
  - It also returns a `verified` promise (`getUser`, still checked against Supabase). Pages must `Promise.all` it with their data before rendering.
  - Use `getProfileRow(userId)` + `toProfile(user, row)` in the same `Promise.all`.
- **One query per need:**
  - `listLibrary` embeds versions (`versions:generations!root_id(...)`).
  - `getDetail` loads root and versions with one `or(id.eq.X,root_id.eq.X)`.
  - `getCreditSummary` runs its two queries in parallel.
- **`getCatalog`** serves a stale catalog immediately and refreshes it in the background after 5 min.
- **`app/studio/loading.tsx`, `app/credit/loading.tsx`** stream a spinner at once, so a click responds in about 100 ms instead of freezing until the server finishes.
- **`instrumentation.ts`** sets an undici global dispatcher with a 30 s keep-alive. The default 4 s meant almost every navigation re-opened HTTPS connections, adding ~3 RTT (/credit: 390 ms warm vs 850 ms after a 6 s pause).
  - `undici` is pinned to a 7.x version, matching Node's bundled undici major, and listed in `serverExternalPackages`.
- Results:
  - Steady state is ~0.4 s for detail pages and ~0.45–0.8 s for Studio/Credit, down from 0.9–1.5 s.
  - The first visit to a route after a dev restart or a `.next` wipe still compiles, which takes seconds. That is dev only.

## Auth: "not signed in" vs "Supabase unreachable"

These are two different states. Never treat an unreachable Supabase as signed out. On 2026-10-11 doing that caused false "Phiên đăng nhập đã hết hạn" messages and bounced users from /credit back to /studio.

- `isAuthUnavailable()` in `lib/supabase/network.ts` classifies the error. A retryable fetch error (network, timeout, 5xx), an unknown or non-JSON response, or a 429 counts as unreachable. A 4xx such as `bad_jwt`, or a missing session, means signed out.
- `getUser()` throws `AuthUnavailableError` (`lib/auth-unavailable.ts`) when Supabase is unreachable. How each caller handles it:
  - `requireUserApi` turns it into a 503 `auth_unavailable`. The client then shows the message and does not redirect to /login.
  - Pages let it reach `app/error.tsx`, which recognises it by `digest` (Next keeps a pre-set digest even in production) and offers "Thử lại".
  - Pages end their `Promise.all([verified, ...data])` with `.catch(preferAuthError(verified))`.
    - When Supabase is unreachable the data queries usually fail before `verified`, and the page then showed the generic "Có lỗi khi tải trang".
    - `preferAuthError` awaits `verified` first, so its error (the redirect or `AuthUnavailableError`) wins.
    - Verified on 2026-10-18 by QA case H01, run on a production build with a preload that makes every fetch to the Supabase host fail.
- `proxy.ts`:
  - If `getClaims()` is unreachable, it lets the request through and sets the `x-gaia-auth-unavailable` header. Pages then fail fast instead of waiting through supabase-js's ~25s refresh retry a second time.
  - On `/login` it checks with `getUser()`, not only the JWT signature, so a session revoked server-side cannot loop /login ↔ page.
  - It honours `next`, and its redirects copy the refreshed session cookies.
- The cookie-session clients use `fetchWithTimeout` (20s). The admin/DB client deliberately has no timeout: aborting a credit RPC that already ran would leave the charge state ambiguous.
- `/auth/callback` sends `error=network` when the code exchange fails because Supabase is unreachable. The login page shows the matching message.

## Architecture

### Money flows through Postgres functions

`supabase/migrations/0001_gaia_init.sql` defines the schema:

- Tables: `profiles`, `generations`, `credit_lots`, `credit_allocations`, `credit_ledger`, `payments`.
- RLS lets users only **read** their own rows.
- Every credit mutation is a `security definer` function that only `service_role` can execute. EXECUTE is revoked from PUBLIC, anon and authenticated.

The functions:

- `gaia_create_generation`: inserts the job and spends credits in one transaction. Spending is FIFO by lot expiry and records allocations. It raises `INSUFFICIENT_CREDITS` when the balance is short.
- `gaia_refund(generation, amount|null)`: idempotent. It never refunds more than was charged. Credits return to the lots they came from; if a lot has expired, it creates a 7-day refund lot instead.
- `gaia_apply_topup(payment)`: idempotent. Lots expire after 90 days.
- `gaia_grant`: an admin helper for granting credits manually.
- `gaia_balance` and `gaia_expire_lots`: expiry is lazy, applied on read, and writes "Credit hết hạn" rows to the ledger.

Each function takes a per-user advisory lock.

Server code uses the secret-key client `supabaseAdmin()` (`lib/supabase/admin.ts`). It bypasses RLS, so **every query must filter by `user_id`**. `lib/supabase/server.ts` is the cookie-session client, used only for auth.

### Pricing

- `lib/models.server.ts` fetches `/ai/models`, curates the list, converts prices to GAIA credits and caches the result in memory for 5 minutes.
  - Curation: video models need `startText` and must not be edit, lipsync, motion, upscale or per-second models. Image models must have a ratio other than `auto`.
  - Conversion: `ceil(gommo × GAIA_COST_PER_GOMMO_CREDIT × GAIA_MARKUP ÷ VND_PER_CREDIT)`.
  - Since 2026-10-21, 1 credit = 1đ (`VND_PER_CREDIT = 1` in `lib/topup-rules.ts`); it was 100đ before. `supabase/migrations/0002_credit_unit_vnd.sql` multiplies every stored credit amount by 100 under an exclusive lock, and records itself in `gaia_migrations` so a second run is a no-op. It was verified on PGlite (balances, ledger, allocations, payments ×100, credit functions still correct afterwards). Gommo-unit values (`gommo_cost`, `GAIA_PROVIDER_RESERVE`) are unchanged.
  - Allowlist: only models in `VERIFIED_MODELS` are sold. That includes models Gommo adds later, which stay hidden until tested. Each entry also switches on only the verified extras: `refs` (Reference images), `edit` (Sửa ảnh), `start` and `end` (Start/End frame). The catalog exposes these as `maxReferences`, `edit` and `frames`.
  - Founder controls: `VERIFIED_MODELS`, `MODEL_ORDER` and `FEATURED_MODELS`. The first available model in `MODEL_ORDER` is the composer default.
- `lib/catalog.ts` is shared by client and server.
  - `priceFor` picks the most specific matching row of the model's `prices` table, or returns `null` when the model doesn't sell that combination.
  - `resolveSelection` snaps a selection to a combination that is actually sold.
- `createGenerations` re-checks the selection server-side and **rejects (409) any request whose `expectedCredits` differs from the server price**. The user is never charged an amount the UI did not show.

### Provider balance guard (2026-10-19)

- `getProviderBalance()` (`lib/gommo.ts`) reads the 79ai `credits_ai` balance and caches it for 20 s. `noteProviderSpend` decrements the cached value after each accepted job.
- `createGenerations` and `editImage` call `ensureProviderBalance` after the user's own balance check and before any credit is charged.
  - If the balance after the job would fall below `GAIA_PROVIDER_RESERVE` (default 0), the request fails with 503 `provider_paused`: "GAIA đang tạm dừng nhận yêu cầu tạo mới. Credit của bạn chưa bị trừ."
  - If the balance can't be read, nothing is blocked; Gommo's own rejection plus the auto-refund still apply.
- `createTopup` refuses with 503 `topup_paused` when `GAIA_TOPUP_MIN_PROVIDER_BALANCE` is above 0 and the balance is below it. The default 0 keeps local PayOS testing possible.
- Verified on 2026-10-19 with a 2,750 balance: a 90-credit VEO request got 503 and the wallet was unchanged.

### Private group mode (2026-10-21)

The founder chose to run GAIA for themselves and a few invited friends, with no sales (legal reasons: selling needs a household-business registration and website notification under Decree 248/2026). `lib/access.ts` holds the switch.

- Private is the default. `GAIA_OPEN_SIGNUP=1` switches to public mode, where anyone with Google can sign in and top up via PayOS.
- **Who may sign in (since 2026-10-25):**
  - the owner, `GAIA_OWNER_EMAIL`;
  - rows in `gaia_members` (migration `0004_members.sql`, roles `admin` | `member`, RLS on, no policies).
  - This replaced the old `GAIA_ALLOWED_EMAILS` env list.
- **How `roleOf` / `isEmailAllowed` in `lib/access.ts` read the members:**
  - via its own supabase-js client (no `server-only`, because `proxy.ts` imports it);
  - kept in memory for 30 s and deduped. `invalidateMembers()` runs after admin mutations.
  - An email missing from the cached list triggers a re-read, at most every 3 s, so a new invite works at once on every instance. A removal can take up to 30 s on other instances.
  - A stale cache is used on a transient error. With no cache it throws `AccessUnavailableError`, which `getUser()` maps to `AuthUnavailableError`.
  - A missing table (PGRST205/42P01) counts as "nobody invited": only the owner gets in.
- `isEmailAllowed` is enforced in three places:
  - `/auth/callback` signs a non-invited user out right after the code exchange and sends them to `/login?error=not_invited`.
  - `getUser()` returns null for a non-invited email, so pages redirect to /login and APIs return 401. This also covers an email removed from the list while its session is still alive.
  - `proxy.ts` on `/login` signs that session out (`scope: 'local'`) and adds `?error=not_invited`.
- Top-up is off: `/api/topups` POST returns 403 `topup_disabled`. `CreditProvider` gets `canTopup={!isPrivateGroup()}`; with it false, every "Nạp credit" link and toast action is hidden, and the Credit page shows "Credit do chủ nhóm cấp" instead of the top-up panel. The 402 `insufficient_credits` message says to ask the group owner.
- Credits are granted from the admin page (owner only), which calls `gaia_grant`. The local `.env` sets `GAIA_MARKUP=1`, so a GAIA credit equals a Gommo credit (1đ of 79ai cost).
- **Admin page `/admin` (2026-10-25)**, built from mockup `#admin` as approved by the founder:
  - Files: `app/admin/page.tsx`, `components/admin/AdminPage.tsx`, `lib/admin.server.ts`, `app/api/admin/{route,members/route,grants/route}.ts`.
  - Permissions are all checked in `lib/admin.server.ts`:
    - owner: invites members and admins, changes roles, removes anyone but themself, grants credits;
    - admin: invites and removes members only;
    - anyone else gets 404.
  - The founder owns the 79ai money. Anyone with the Supabase secret key or Supabase admin rights can still run `gaia_grant`, so that restriction rests on trust.
  - The page shows the provider balance (labelled just "Số dư", no provider name) next to the sum of unexpired, unspent GAIA credit, and warns when the granted credit exceeds the balance.
  - Grant history = `credit_ledger` rows titled "Tặng credit".
  - The account menu shows "Quản trị" when `profile.role` is owner or admin. Pages pass `roleOf(user.email)` into `toProfile`.
- `/rules` ("Quy ước dùng chung") replaces Terms/Privacy on the login page. `/terms` and `/privacy` stay as drafts for a future public launch.
- Verified on 2026-10-21 against dev :3100 with two temporary users created by magic link and deleted afterwards: an invited user gets 200 on pages and the API and 403 on top-up; a non-invited user gets 401 from the API and a redirect to /login, and is then signed out. The Google callback path itself was not exercised.

### Deploy target: Vercel Hobby (2026-10-24)

GAIA is free to host on Vercel Hobby in private group mode because nothing on the site takes payment. The deploy steps are in SETUP.md, Bước 7. Limits were checked against Vercel docs on 2026-10-24:

- **4.5 MB request/response body.** `prepareImage` (`lib/client/upload.ts`) always re-encodes to JPEG at q0.92, stepping quality down until the data URL is under 4 MB. Transparent pixels get a white background. Images already at the right ratio, small enough and ≤ 3 MB are sent as-is.
  - Before this change, PNG sources stayed PNG. Gommo outputs are PNG (1.3–2 MB at 1K), so a 2K/4K image reused as a frame would have been rejected with a 413.
  - Verified on the prod build: a 9 MB 4096px PNG was sent as 0.78 MB JPEG, a 12 MB noise PNG as 2.63 MB, and a small 16:9 PNG kept as PNG.
  - The video download route streams `upstream.body`. Vercel says streaming responses are not subject to the 4.5 MB limit, but this is not yet tried on Vercel.
- **Region.** `vercel.json` sets `regions: ["sin1"]` so functions run next to Supabase (ap-southeast-1). Vercel's default is iad1, and Hobby allows one region.
- **Daily cron.** `vercel.json` runs `/api/cron/daily` at `0 20 * * *` (UTC). Hobby allows at most daily, ±59 min. The route:
  - checks `Authorization: Bearer ${CRON_SECRET}`, which Vercel sends automatically, and returns 401 without it;
  - runs `syncAllRunning()`, which syncs every user's running jobs (limit 200), so stuck jobs time out and refund even when nobody has Studio open;
  - by doing that DB read, keeps the Supabase Free project from pausing after 7 days of low activity.
  - Verified: 401 with no secret or a wrong one; with the secret, a 10-minute-old unsent job became `error`.
- **Duration.** Fluid compute allows 300 s per request on Hobby, which is enough: Gommo calls are submit-then-poll.

### Generation lifecycle

`lib/generations.server.ts` drives each job:

1. `gaia_create_generation` charges credits. The row starts as `pending`.
2. `submitToGommo` calls `/ai/generateImage` or `/ai/create-video` and stores `gommo_id`.
3. `POST /api/generations/sync`, which the client polls every 4 s while jobs are running, asks Gommo for each running job's status.
   - Success: stores the URLs.
   - Error, an unknown video status, or a timeout (image 30 min, video 4 h): sets status to error and refunds in full.
   - Status transitions use `update … where status in ('pending','processing')`, so only one request can finish a job.

Gommo's response shapes:

| | Image | Video |
|---|---|---|
| Status request body | `{ id_base }` → `imageInfo` | `{ videoId }` → `videoInfo` |
| Success | `SUCCESS` + `url` (`url_thumb` = 480px CDN thumbnail) | `MEDIA_GENERATION_STATUS_SUCCESSFUL` + `download_url` (may lag a few seconds) |
| Cost field | `imageInfo.credit` | `videoInfo.credit_fee` |
| Ratio format | whatever the model's option `type` is (`16_9` or `16:9`) | same |

**Verified 2026-10-10** (9 sample generations sent straight to Gommo, see SETUP.md):

- `credit`/`credit_fee` are the real charge and equal the `/ai/models` price row: the balance dropped by exactly the listed 6,800. `GAIA_SETTLE_ACTUAL_COST=1` is safe to enable (still off).
- Gommo does not return the translated prompt for `translate_to_en`; `videoInfo.prompt` stays the Vietnamese original, so `prompt_sent` stays empty.

**Verified 2026-10-11** (the founder's QA run through the app):

- `subjects` as `[{ id_base, url }]` works: reference images are used. Video `images` (start/end frames) go through the same `toGommoImageRefs` but are still untested.
- Jobs keep running after the tab closes.
- An edit costs the same as a create (Nano Banana 2 vip 1k = 400 Gommo credits).
- `users/paymentsHistory` (`currency_name=credits_ai`) lists every real charge and refund for free. Use it to audit costs.

**Upscale was removed on 2026-10-11.** Gommo's `ai_templates/tools` `image_resolution` returned `Upload ảnh thất bại (HTTP 401)` for public source URLs. It charged 200 credits once with no output. The founder chose to drop the feature and build one later. Old `op='upscale'` rows stay in the DB (the check constraint allows them), and the server filters them out of versions and summaries.

Images are versioned. Edits (`op='edit'`, `editImage` + `base64Image` data URL, 1–4 per request) are `generations` rows with `root_id`/`source_id`. The library lists roots only (`root_id is null`), with version count, total credits and the latest successful version as the thumbnail. A layers badge on the card marks images with more than one version.

**Library pages by day (2026-10-24).** The library is grouped by day (Vietnam time), 8 items per page per day (2 rows × 4 cards; `.lib-grid` is capped at 4 columns). The founder chose numbered pages next to each day title (`components/studio/DayPager.tsx`; ≤ 6 pages show all, otherwise first, last, current ± 1 and "…").

- `supabase/migrations/0003_library_days.sql` adds the generated column `generations.day` (`(created_at at time zone 'Asia/Ho_Chi_Minh')::date`), the partial index `(user_id, day desc, created_at desc)` on live roots, and two service-role-only SQL functions. No page number is stored, since it would change on every create/delete. Verified on PGlite (VN midnight boundary, counts, kind filter, `p_before`, rerun-safe).
- `GET /api/generations` → `listLibraryDays`: `gaia_library_days` (day + total, one extra row to know if older days exist) and `gaia_library_first_pages` (first 8 per day, returned as `generations` rows so versions embed in the same call) run in parallel. One load covers `LIBRARY_DAYS_PER_LOAD` (7) days; "Xem các ngày trước" passes `before=<oldest loaded day>`.
- `GET /api/generations?day=YYYY-MM-DD&page=N` → `listLibraryDay`: a plain range query with `count: 'exact'`. A page past the end (after deletes) falls back to the last page.
- Client (`StudioApp`): `items` stays a flat list of what is on screen (sync merges, selection and Shift-ranges keep working on it), plus `dayMeta` (total and page per day) and `nextBefore`. `loadDay` swaps one day's items in place (`replaceDay`), dropping stale responses per day.
  - After trash, undo or rerun, `refreshDays` reloads the affected days' current pages, so a page refills to 8 and totals match the server.
  - A new generation goes to today's page 1. If today is on another page, it jumps back to page 1.
- Running jobs can sit on a page that isn't shown, so polling also runs while `serverRunning` > 0 (from `runningCount()` on load and from each sync response). The "xong" toasts fire for every job a sync reports as finished, visible or not.
- The Trash stays a flat list sorted by `deleted_at` with "Xem thêm".

**Trash (Thùng rác).**

- "Chuyển vào thùng rác" soft-deletes the root and its versions with one `deleted_at` stamp. The undo toast restores the rows that carry that stamp.
- The Studio tab "Thùng rác" lists deleted roots (`?trash=1`, ordered by `deleted_at`). From there an item can be restored (`POST /restore` without `deletedAt` reuses the item's own stamp) or deleted permanently (`DELETE ?scope=permanent`). "Dọn thùng rác" is `DELETE /api/generations/trash`.
- Permanent delete really deletes the rows. Versions cascade, and `credit_ledger.generation_id` is set null, so the history stays intact. Files on Gommo can't be deleted (no API).
- Items in the trash for `TRASH_DAYS` (30, `lib/trash.ts`) are purged lazily whenever the trash is listed.
- Running jobs are never hard-deleted.
- Deleting a single edit version ("Xoá phiên bản này") stays a soft delete with undo. It doesn't show in the trash and is purged after 30 days.
- Multi-select ("Chọn") works in the library and the Trash. Click the "Chọn" button, or tick a card's checkbox (shown on hover on desktop). Shift+click selects a range, and Esc exits.
  - In this mode, clicking a card toggles it instead of opening the detail page. The selection bar replaces the filter tabs.
  - Running jobs can't be selected in the library. In the Trash they can be restored but not purged.
  - All bulk actions go through `POST /api/generations/bulk { action: 'trash' | 'restore' | 'purge', ids, deletedAt? }`, with at most `MAX_BULK` (500) ids, chunked to 100 per Supabase query.
  - A bulk trash uses one stamp, so a single undo (`restore` + `deletedAt`) brings everything back.
  - Compare `deleted_at` as a time, not a string: Supabase returns `…+00:00`, while JS stamps end in `Z`.
- UI tests of this flow (headless Chrome + temporary magic-link session + `[QA]` dummy rows that are deleted afterwards) are stable only against a production build on :3100.
  - In Next 16.4 dev, a cold-compile error on `/studio` ("The server could not finish this Suspense boundary") can turn into a reload loop. Browser logs written to `.next/dev/logs` trigger recompiles, which trigger reloads, which log the error again.
  - Don't build while the user's dev server is running.
  - **Never recursively delete a `.next` folder on Windows**, including a temp worktree's: no `Remove-Item -Recurse`, `git worktree remove` or `rm -rf`. `next build` (Turbopack) creates junctions in `.next/node_modules/` (e.g. `undici-<hash>`) that point at the real packages in `serverExternalPackages`, and the delete follows them.
    - On 2026-10-18 this emptied `node_modules/undici`. `npm install` restored it.
    - Remove those junctions first with `cmd /c rmdir <junction>`.

Downloads go through `/api/generations/[id]/download`, because Gommo's CDN is cross-origin and `<a download>` can't force a download.

Prompt translation sits behind `preparePrompt()` (`lib/prompt.server.ts`). For now it sends Gommo's `translate_to_en` only for video prompts that contain Vietnamese diacritics. It is invisible to users.

### Payments (PayOS)

`lib/payos.server.ts` signs requests with HMAC-SHA256 as documented at https://payos.vn/docs/api/. `lib/payments.server.ts` handles the rest:

- `createTopup` inserts the `payments` row first, then creates the payment link, then renders the VietQR string as SVG.
- `getTopup` polls PayOS while an order is pending, so credits arrive even without a webhook. This is useful locally.
- `/api/payos/webhook` verifies the signature and applies the top-up.
- Rules (1.000đ = 1.000 credit, minimum 20.000đ, +5% bonus from 200k, +10% from 500k) live in `lib/topup-rules.ts`.

### UI

- Pages (server components) authenticate, load initial data and render one client component:
  - `components/studio/StudioApp.tsx`: library, composer, polling, toasts and the first-run suggestions.
  - `components/detail/ImageDetail.tsx` and `components/detail/VideoDetail.tsx`.
  - `components/credit/CreditPage.tsx`.
- `CreditProvider` shares the balance and `ToastProvider` shows toasts.
- The client calls the API through `lib/client/api.ts`, which turns `{ error, message }` responses into `ClientError` with the Vietnamese message. Upload images through `lib/client/upload.ts`; it downscales to 2048px before `/api/uploads`, which uploads to Gommo.
- Start/End frames are centre-cropped in the browser to the selected video ratio (`processFrame` in `StudioApp.tsx`). Gommo/Veo doesn't crop; it pillarboxes a mismatched frame with black bars (verified 2026-10-11).
  - Each frame `Upload` keeps its `source` (the file, or the CDN URL of a reused frame) and the `ratio` it was prepared for. When the ratio or model changes, an effect re-crops and re-uploads it.
  - A reused frame that already matches is kept, not re-uploaded. Gommo's CDN sends `Access-Control-Allow-Origin: *`, so reused frames can be fetched and cropped.
  - The frame chip shows "đã cắt 16:9", and its thumbnail opens a preview of exactly what will be sent.
- Gommo's capability flags can be wrong. `START_FRAME_REQUIRED` in `lib/models.server.ts` lists video models that need a Start frame despite `startText: true`. The composer blocks Tạo with a hint, and `cleanInputs` rejects such requests on the server.
  - No free API field reveals this. A wrong entry only shows up as an instant, uncharged Gommo rejection.
- Per-model tests on 2026-10-16 and 2026-10-18 (results in `docs/qa/`):
  - A model or extra goes into `VERIFIED_MODELS` only after a real run through GAIA's API **and a visual check of the output**. A `success` status alone is not enough.
    - Edits on Z-Image and Kling Colors 1.5/2.1 "succeeded" but drew a new picture that ignored the source.
    - Wan 3.0 Start/End frame runs "succeeded" with an unrelated scene.
    - Check frames with Chrome headless; there is no ffmpeg on this machine.
  - Models Gommo lists as ON can still reject every job: "gói dịch vụ không khả dụng", `#vid_maintenance`, `#img_bp` and similar. Leave them out of `VERIFIED_MODELS`.
  - `ALLOWED_MODES` restricts modes. `google_image_gen_banana_pro` is VIP-only. Grok's "Spicy" mode is hidden by founder decision.
  - `TESTED_RANGE` (video) sells only the modes and resolutions already generated successfully through GAIA, with durations inside the tested min–max.
    - Its `exclude` blocks combos Gommo prices but rejects, such as Kling 2.5 Relax 10s and VEO 3.1 4s.
    - It filters the option lists and the price rows, so the composer, "từ X credit" and the server's 409 check all follow it.
    - Widen a range only after a real run. Results are in `docs/qa/`.
  - `editImage` rejects a model without `edit`, and the detail page's edit model picker only lists those models.
  - Price rows whose mode/resolution/duration is not a selectable option are dropped, so "từ X credit" is the real minimum.
- Sync never fails a job on an unknown Gommo status.
  - For `FAILED`/`ERROR` it first records the message in `error_message` while the job stays running (`confirmFailure`). It fails and refunds only if the error persists for 60 s or more.
  - A Seedance job reported "Đang chuyển máy chủ xử lý..." and later succeeded, after the old code had already refunded it.
- `END_FRAME_MODES` (same file) lists models whose Start + End frame only works in some modes. `kling_video_2_5` needs `professional`; Gommo rejected relax instantly on 2026-10-12. The composer shows a hint and blocks Tạo, and `createGenerations` rejects it on the server.
- The Studio library tracks which tab `items` belong to (`itemsFor`). While a tab switch is loading it shows a spinner and drops stale responses. Before this, library items briefly rendered as Trash cards, and clicking Khôi phục on them returned 404.
- Elapsed timers and dates use the Asia/Ho_Chi_Minh time zone (`lib/format.ts`), and clocks only start after mount, to avoid hydration mismatches.
- Gommo's suggestion feeds (`midjourney/kling/sora_feed_suggested`) returned nothing on 2026-10-08, so first-run ideas are GAIA's own (`lib/suggestions.ts`).
- The landing page (`app/page.tsx`, reworked 2026-10-10 to look less templated) is product-led:
  - Its prompt box (`components/home/HomePrompt.tsx`) is a GET form to `/studio?kind=&prompt=`. The proxy carries the query through `/login?next=…` (the login page shows the carried prompt), and `/studio` pre-fills the composer and then strips the query from the URL.
  - Its "Model và giá" table lists the live catalog (available models, featured first) with each model's "from" price.
- No placeholder art anywhere (no colour blocks standing in for images). `Suggestion.sample` in `lib/suggestions.ts` is only for real GAIA outputs stored in `public/samples/`; suggestion cards and the landing "Tạo bằng GAIA" section render media only when a sample exists.
- Mono type is for numbers, params and credit only, not for labels or eyebrows. Media labels read "Ảnh · 3:4" / "Video · 16:9", not uppercase.
- Library cells always show the whole image or video ("Trọn khung"). The founder removed the "Lấp đầy" (cover) option on 2026-10-11.
- Pasting an image (Ctrl+V) into the composer's prompt box adds it: as a Reference in image mode, or as the Start and then End frame in video mode (`pasteImages` in `StudioApp`). Pasting text behaves normally.
- The credit history can be sorted Mới nhất / Cũ nhất (`/api/credits?order=asc|desc`; `before` is the id cursor in either direction).
