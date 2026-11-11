# Lovable prompts — ARTEFRACTS frontend

Run these **in order**, one per message. Let each finish and check the result before moving on. Lovable degrades badly when you stack requirements in a single prompt — the whole point of this sequence is that each step is small enough to land cleanly.

Prompts 1 and 2 are the ones to get right. If the design system is wrong, everything after inherits it.

---

## Prompt 1 — Design system

> Set up the design system for ARTEFRACTS, a platform where you open randomised boxes containing tokenised fine art. Do not build any pages yet. I only want the tokens, fonts, and base styles.
>
> The visual world is **the artefact and the fracture**. The name is artefact + fraction: a whole work breaks into facets, and you hold one facet that still shows the whole. Around that, the register is institutional — exhibition signage, auction catalogue lot numbers, condition reports, brass hardware. Restrained, expensive, quiet. Absolutely no gradients, no glassmorphism, no purple, no neon, no glow effects, no rounded pill buttons.
>
> Colour tokens — use exactly these. They are read off the Artefracts logo mark, which is warm brass on cream:
> - `--ink: #14130F` (warm near-black, all body text and the reveal ground)
> - `--cream: #F7F3E7` (the default page background — the gallery wall)
> - `--paper: #FFFDF6` (raised surfaces: cases, tables, panels)
> - `--brass: #9C8460` (the logo's own colour — hairline rules, fracture lines, eyebrows, hardware)
> - `--brass-lit: #C9A96E` (brass raised for dark grounds: the lit facet, and the Grail tier)
> - `--stone: #E4DCC8` (dividers, disabled states, chart fills)
> - `--lot: #9E3B2A` (lot numbers, the Original tier, and destructive actions — **nothing else**)
>
> Brass carries every accent job, so use it scarcely or the page turns to mud. There is no blue, no green, no purple anywhere in this system.
>
> Typography — four faces, each with exactly one job. The moment a price appears in the display face or a heading appears in the body face, the system stops reading as intentional.
>
> - **Display — Mogilte.** Self-hosted webfont (I'll provide `Mogilte.woff2`; add it to the project and declare it with `@font-face`). Wordmark, hero, and page titles only, 40–96px. **It has exactly one weight (400).** There is no bold and no light. Hierarchy inside it comes only from size. Set `font-synthesis: none` globally so the browser never fakes a bold by smearing the outlines. Never set numbers in it.
> - **Subhead — The Seasons.** Self-hosted webfont, weights 300–400, 20–34px. Section headings and artwork titles. Artwork titles are italic. If the file isn't available yet, fall back to `Cormorant Garamond` from Google Fonts and swap later.
> - **Body — Jost** from Google Fonts, weights 300 and 400, 13–20px. All running text, labels, and buttons.
> - **Data — JetBrains Mono** from Google Fonts, 400/500. Every lot number, hash, seed, probability, price, and share count. This is not decoration: the mono/proportional split is how the interface signals which values a user can independently verify.
>
> **Weight rule, and it matters for accessibility:** Jost 300 only above 16px. Everything smaller — tables, captions, form labels, error text — is weight 400. Never go below 300 anywhere. Light type on a cream ground loses contrast fast, and this product asks people to read odds and wallet addresses before spending money.
>
> Type scale: 12 / 14 / 16 / 20 / 28 / 44 / 72px. Body line-height 1.55, display line-height 1.05.
>
> Border radius: 2px maximum, everywhere. Corners are nearly square.
> Borders: 1px solid ink at 12% opacity. For emphasis, 1px solid brass.
> Shadows: none, except a single tight shadow on the lit facet during a reveal.
> Spacing scale: 4 / 8 / 16 / 24 / 40 / 64 / 96px. Be generous — gallery hangs breathe.
>
> Build one reusable component now: `<WallLabel>`. It reproduces a museum wall label and is the atomic unit of the whole interface. Props: `artist`, `title`, `year`, `medium`, `dimensions`, `lotNumber`, `tier`. Layout: artist name in Jost 500 uppercase with 0.08em letter-spacing; title in The Seasons italic on the next line; then year, medium and dimensions in 12px separated by ` · `; lot number in JetBrains Mono, top-right, prefixed with `№`, in lot red. Left-aligned, max-width 280px, 1px brass rule above.

---

## Prompt 2 — Landing page

> Build the landing page. Single scroll, no navigation drawer.
>
> **Hero.** The thesis is "trading the token buys the art". Full-viewport, cream background. Centred, a single large Mogilte line: "A vault that fills itself." Beneath it, one sentence in Jost 300 at 20px: "Every trade of $FRACT routes 70% of the pool fee into a treasury that buys tokenised artwork. The vault only grows." Beneath that, two live counters in JetBrains Mono at 44px, side by side with a brass hairline between them: total works in the vault, and total appraised value in USD. Counters animate up from zero on load over 1.2 seconds. Use placeholder values 247 and $84,310 for now.
>
> **The hang.** Below the fold, a wide horizontal band on a `--paper` background showing the current vault as a gallery hang: artwork images in a row, aligned on a shared horizontal centre line (like a real gallery hang, NOT a card grid — images vary in height and hang from a common centre), each with a `<WallLabel>` beneath. Horizontally scrollable. No card borders, no shadows on the images.
>
> **How it works.** Four steps in a single row, separated by vertical brass hairlines. Each step is a number in JetBrains Mono, a three-word heading in The Seasons, and two lines of body text. The steps: "Trade the token" / "Fees fill the treasury" / "Treasury buys art" / "Open a box". Do not use icons.
>
> **Odds disclosure strip.** A full-width band in ink with cream text. Heading: "Published odds. Verifiable draws." Then one sentence explaining that every box's odds are fixed on-chain and every draw can be independently reproduced from its seed. A text link to `/verify`.
>
> Footer: brass hairline, then links to Vault, Boxes, Treasury, Verify, Docs. Plus a plain-text risk line in 12px: "Boxes are randomised. Outcomes vary. Only spend what you can afford to lose."

---

## Prompt 3 — Connect Supabase and the API layer

> Connect this project to Supabase.
>
> Then create `src/lib/api.ts` as the single typed client for our backend REST API. Base URL comes from `VITE_API_URL`. Implement these functions with full TypeScript return types and React Query hooks for each:
>
> - `getVaultStats()` → `GET /public/vault/stats` → `{ itemCount, totalAppraisedUsd, cumulativeCreatorFeesEth, lastProofOfReserve }`
> - `getMachines()` → `GET /public/machines` → array of `{ machineId, name, priceUsd, version, odds: Array<{tier, probability, oddsLabel, floorUsd, depth}>, expectedValueUsd, evRatio, available }`
> - `getVaultItems(params)` → `GET /vault/items?tier=&inPool=&limit=&offset=`
> - `getRecentDraws()` → `GET /public/draws/recent`
> - `getMyDraws(address)` → `GET /draws/:address`
> - `getFairness(drawId)` → `GET /public/fairness/:drawId`
> - `verifyDraw(body)` → `POST /public/fairness/verify`
> - `getToken()` → `GET /public/token`
> - `getLimits(address)` → `GET /user/:address/limits`
> - `setLimits(address, body)` → `POST /user/:address/limits`
>
> Handle a `451` response specially: the API returns 451 when box opening is unavailable in the user's region. Expose this as a `regionBlocked` flag that the UI can read, and never retry a 451.
>
> Set up React Query with a 30-second stale time for stats and machines, and 5 seconds for recent draws.

---

## Prompt 4 — Wallet connection

> Add wallet connection using wagmi v2, viem, and RainbowKit.
>
> Configure a single custom chain — Robinhood Chain:
> - id `4663`, name "Robinhood Chain"
> - native currency: Ether / ETH / 18 decimals
> - RPC: `https://rpc.mainnet.chain.robinhood.com`
> - block explorer: "Blockscout" at `https://robinhoodchain.blockscout.com`
>
> The connect button lives top-right, fixed, styled as a 2px-radius outlined button with a brass border and JetBrains Mono label. When connected it shows the truncated address in mono.
>
> If the user is connected but on the wrong network, replace the entire page content with a centred panel that says "Switch to Robinhood Chain" and a single button that calls `switchChain`. Do not let them interact with anything else until they switch.

---

## Prompt 5 — The boxes page

> Build `/boxes`.
>
> Three machines side by side on desktop, stacked on mobile: Studio Box ($25), Gallery Box ($100), Vault Box ($500). Fetch them with the `useMachines` hook — do not hardcode.
>
> Each machine renders as a **case**: a tall rectangle with a 1px brass border, a `--paper` interior, and a subtle inner shadow at the top edge to read as glass. Inside: the machine name in The Seasons, the price in JetBrains Mono at 28px, and a full odds table.
>
> The odds table is the most important element on this page and must be completely legible. One row per tier (Study / Print / Edition / Original / Grail), showing tier name, the floor value, the probability as a percentage to 4 decimal places, and the "1 in N" label. All numbers in JetBrains Mono, right-aligned, decimal-aligned. Grail row in brass, Original row in lot red. Above the table, a line reading "Expected value: $X (Y% of price)" using `expectedValueUsd` and `evRatio`.
>
> Below the table, a "Open box" button. Disable it when `available` is false and show "Restocking" instead. Also disable it when `regionBlocked` is true, with the text "Unavailable in your region".
>
> Under each machine in 12px: "Odds version {version}. Fixed on-chain. Changing them requires a new machine configuration and is visible here."

---

## Prompt 6 — The opening sequence (this is the signature moment)

> Build the box-opening flow as a full-screen modal. Get the choreography exactly right — this is the moment the whole product is remembered by.
>
> **Step 1 — Seed.** Before paying, the user sees their client seed. Generate 32 random bytes client-side, display as hex in JetBrains Mono, with a "Randomise" button to regenerate. Above it: "Your seed is mixed into the result. We cannot predict your draw, and neither can you." Below, the current server commitment hash, also in mono, labelled "Server commitment, published before your draw."
>
> **Step 2 — Approve and open.** Two transactions: an ERC-20 approve for the pay token if the allowance is insufficient, then `openBox(machineId, clientSeed)`. Show them as a two-line checklist with a mono status against each. Never leave the user without a status line.
>
> **Step 3 — The whole work.** After `openBox` confirms, show the artwork whole, centred, on a dark ground. Hold it there while the settler transaction lands. It typically takes under a second — do not add artificial delay beyond a 600ms minimum so it does not flash. Poll `getMyDraws` or watch for the `DrawSettled` event.
>
> **Step 4 — The fracture.** This is the signature moment of the entire product and it should depict what the product does. Over about 900ms: hairline brass fracture lines propagate across the artwork from a single origin point, spreading like a break in glass. The plane then separates into irregular angular facets — not a grid, not equal sizes. All facets dim to 25% except one, which stays at full brightness and lifts 4px with a tight shadow. That lit facet is the share you won. Then the `<WallLabel>` slides up from beneath over 250ms.
>
> The order matters enormously: the artist and title are legible on the whole work **before** it fractures, so the user learns *what* they pulled before they learn *how much of it*. Reveal the share count last, in mono, as the quietest element on screen. Pulling "a Basquiat" and then discovering it is 0.02% is a far better sequence than leading with the fraction.
>
> Nothing bounces, nothing scales past 1.0, no confetti, no particles. The restraint is the effect. Respect `prefers-reduced-motion` by cutting the whole sequence to a simple crossfade from the whole work to the single lit facet.
>
> **Step 5 — Actions.** Three text buttons under the label: "Keep it", "Sell to desk — $X" (85% of appraised value), and "Verify this draw" which links to `/verify?drawId=N`.
>
> If settlement has not landed after 10 minutes, replace the artwork with a refund panel explaining that the draw did not settle and offering a button that calls `refundUnsettled(drawId)`.

---

## Prompt 7 — The verifier

> Build `/verify`. This page is a trust artifact — it should read like documentation, not marketing.
>
> Top: a plain-English explanation of the fairness scheme, in body text, no illustrations. Cover: we generate a chain of seeds by repeated hashing, publish the last one on-chain before any draw, and reveal them in reverse order, so each revealed seed hashes to the previously published value. Then: the result comes from hashing the server seed together with your client seed, your address, and the draw ID.
>
> Then a verification form. Four inputs, all JetBrains Mono: server seed, client seed, wallet address, draw ID. A "Verify" button. If the URL has `?drawId=N`, fetch that draw from `getFairness` and pre-fill everything.
>
> On submit, do the computation **client-side in the browser** using viem's `keccak256` and `encodeAbiParameters` — do not call our API to verify. The whole point is that the user does not have to trust our server. Then show:
> 1. The hash-chain check: `keccak256(serverSeed)` and the prior on-chain commitment, side by side, with a green rule between them if they match and a lot-red one if not.
> 2. The computed result hash.
> 3. `result mod 1,000,000` and where it falls on the odds ladder, drawn as a horizontal bar segmented by tier with a marker at the user's roll position.
> 4. The resulting tier, and whether it matches what was recorded on-chain.
>
> At the bottom, put the verification function as a copyable code block so a user can run it independently of this site.

---

## Prompt 8 — Treasury and proof of reserve

> Build `/treasury`. Data-dense, no decoration, closer to a financial report than a landing page.
>
> **Top row:** four figures in JetBrains Mono at 44px with 12px labels beneath — cumulative creator fees earned, total spent on acquisitions, current vault appraised value, works held. Separated by vertical brass hairlines.
>
> **Fee flow.** A horizontal diagram, drawn with hairlines and labels only, no boxes or icons: `Token trade → 1% pool fee → 70% creator share → Treasury`. Then the treasury splits into five labelled sleeves with their percentages: Acquisition 55%, Buyback liquidity 15%, Token buyback and burn 15%, Operations 10%, Insurance 5%. Show the current balance of each sleeve in mono.
>
> **Acquisitions table.** Every artwork bought, newest first: date, artist, title, price paid, appraised value now, tier, and a link to its source listing. Sortable. Use a plain table with hairline rules, no zebra striping, no card wrapper.
>
> **Proof of reserve.** A panel showing the latest attestation: the Merkle root in mono, the item count, the timestamp, and a link to the publishing transaction on Blockscout. If `hasDiscrepancies` is true, render the entire panel bordered in lot red with the heading "Discrepancy detected" and list the affected items. Do not hide this or soften it — an unbacked receipt is the single worst thing that can happen here and burying it is worse than the fault itself.
>
> Add a line beneath: "Artworks are custodied off-chain on Ethereum. Vault NFTs are receipts against that custody, not trustless escrow."

---

## Prompt 9 — Responsible play controls

> Add a "Limits" section to the account page at `/account`, and a link to it from the wallet menu.
>
> Controls:
> - Daily spend cap. A number input in USD. Fetch the current cap and today's spend from `getLimits`. Show today's spend against the cap as a plain horizontal bar, no gradient.
> - Self-exclusion. Buttons for 24 hours, 7 days, 30 days, and 6 months. Each opens a confirmation dialog explaining that the choice cannot be reversed early.
>
> Enforce the rule that limits tighten immediately but never loosen instantly: if the user tries to raise their cap, show that the change takes effect in 24 hours and keep the old cap active until then.
>
> Above the controls, put a short paragraph in plain language: boxes are randomised, most draws return less than the ticket price, and the expected value is published on every machine. Then a link to a support resource. Write this without hedging or apology — state it directly and move on.
>
> On the boxes page, if today's spend is above 80% of the cap, show a mono line beneath the machines: "You've spent $X of your $Y daily limit."

---

## Prompt 10 — Vault browser and polish

> Build `/vault` as the full browsable inventory.
>
> Gallery hang layout, same as the landing page band but as a full page: rows of images aligned on a shared centre line, `<WallLabel>` beneath each. Filters along the top as plain text toggles with a brass underline on the active one: tier, in-pool vs held by collectors, and a value range. Sort by appraised value or acquisition date.
>
> Clicking a work opens a detail view: the image large on the left, and on the right the full wall label plus a provenance block in mono showing source chain, source contract, source token ID, custody address, appraisal value, appraisal date and source, and its Vault NFT token ID. Each address links to the relevant explorer.
>
> Finally, across the whole app:
> - Make every page responsive down to 375px. The gallery hang becomes a single column on mobile with labels beneath each work.
> - Every interactive element gets a visible keyboard focus ring in facet blue, 2px offset.
> - Every empty state gets real copy that says what to do next, never just "No results".
> - Every error state names what went wrong and what to try. No apologies, no vagueness.
> - Audit the whole app and remove any element that does not earn its place. The design should feel underdressed rather than decorated.

---

## After Lovable

Two things Lovable will not do well, which you should hand-write once the shape is right:

1. **The reveal animation.** Prompt 6 will get you 80% there. The last 20% — the light sweep timing, the label slide easing — is worth doing by hand in Framer Motion. It is the one moment users will screenshot.
2. **Transaction state machines.** Approve → open → settle → reveal has more failure branches than Lovable will enumerate (rejected signature, insufficient allowance, insufficient balance, chain switch mid-flow, settler timeout, tx replaced). Write this as an explicit state machine, not chained promises.

Point Lovable at `VITE_API_URL` on a staging deploy of the backend from day one. Building the frontend against mocked data and integrating later is where this kind of project loses a week.
