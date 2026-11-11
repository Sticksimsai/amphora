# Lovable prompts — Amphora frontend

Run these **in order**, one per message. Check each result before the next.
Prompts 1 and 2 decide everything after them.

Upload first: the four font families from `fonts/web/`, `assets/logo-wordmark.svg`, `assets/logo-mark.svg`,
`assets/logo-lockup-bone.png`, `assets/seal-bone.png`, `assets/poster-hero.png`
and `assets/brand-sheet.png`. Show Lovable the brand sheet and the poster with
Prompt 1: they are the reference.

---

## Prompt 1 — Design system

> Set up the design system for AMPHORA. Do not build pages yet. Tokens, fonts and
> base styles only. I've attached a brand sheet and a poster; match them.
>
> The register is a **printed exhibition poster**, not an app and not a luxury
> box: near-black with film grain, bone-white type and hairlines, and exactly one
> colour, a pale seafoam in Hyperliquid's family, used only as type and hairlines. Baroque fresco paintings
> supply all other colour. Everything else is greyscale.
>
> Colour tokens, exactly:
> - `--carbon: #101312` page ground
> - `--graphite: #1E1E1C` raised surfaces
> - `--smoke: #3A3A36` rules and borders on dark
> - `--ash: #969690` secondary text
> - `--bone: #ECE9E0` primary text and hairlines
> - `--accent: #C8F6E7` pale seafoam, the one accent
> - `--up: #5DCAA5` positive figures only
>
> **Accent rule:** the accent is **type and hairlines only**. Never a filled
> rectangle, never a button background, never a tinted panel. Emphasis is made
> by setting a phrase in the accent colour with a 2px accent hairline under it,
> or between two hairlines. Buttons are a bone hairline outline with bone text;
> the primary button uses accent text and an accent outline.
>
> Fonts, self-hosted from the files I uploaded, each with one job:
> - **GFS Didot** 400 — display. Capitals only, 40–160px, line-height 1.0.
>   Headlines and work titles. It has one weight; hierarchy comes from size.
>   The logo is the word AMPHORA with both A's set as the Greek capital lambda:
>   **ΛMPHORΛ**, letter-spacing 0.2em. Use the uploaded `logo-wordmark.svg`; never
>   retype it in another font. The short mark (favicon, stamps) is the Λ alone.
> - **Montserrat** 500/600 — small copy. Uppercase, 11–15px, letter-spacing
>   0.22–0.34em for labels; 0.02em for short justified text blocks.
> - **JetBrains Mono** 400/700 — every number, price, hash, address and odds.
> - **Cormorant Garamond** italic — signatures only.
>
> Global: `border-radius: 0` (2px maximum on inputs). No shadows except under a
> slab. No gradients. No glassmorphism. No second accent colour. A fixed
> full-page grain overlay: an SVG `feTurbulence` noise at 7% opacity,
> `pointer-events: none`, `mix-blend-mode: overlay`.
>
> Build these primitives as components now:
> - `<Arch>` — a round-headed window (rectangle under a semicircle) that
>   cover-fits an image, with a 5px accent stroke on the **left side and crown
>   only**, ending about 60% across the top. Prop `mono` renders the image
>   greyscale.
> - `<Orbit>` — an absolutely positioned 2px bone ellipse, rotated −9°, meant to
>   cross behind and in front of other elements.
> - `<Sparkle>` — a four-point star with concave sides, bone.
> - `<Sunburst>` — sixteen thin radiating lines, alternating long and short.
> - `<Barcode>` — a full-width strip of irregular vertical bars, bone, 18–40px
>   tall. Decorative.
> - `<DotGrid>` — a 3×3 grid of ash discs, some carrying two characters in
>   Montserrat 600 carbon. (The only filled shapes in the system.)
> - `<Accent>` — wraps a phrase: accent-coloured text with a 2px accent hairline
>   beneath. Prop `ruled` puts a hairline above as well.
> - `<Eyebrow>` — `N° 0X — THE THING` in Montserrat, ash, tracked 0.34em.
> - `<Headline a="EVERY BOX," b="ONE FRAGMENT" />` — `a` in bone GFS Didot, then `b`
>   in the same size inside `<Accent>` on the same baseline.

---

## Prompt 2 — Landing page

> Build the landing page. Single scroll. Carbon ground throughout.
>
> **Hero**, full viewport, composed like the attached poster: a tall `<Arch>`
> left of centre holding the ceiling fresco in colour; a greyscale fresco
> fragment (transparent PNG) overlapping the arch's right edge with a soft
> shadow; one `<Orbit>` crossing both; a `<Sparkle>` on the crown of the arch;
> `<DotGrid>` top-left; `<Sunburst>` top-right. Across the foot of the arch **DRAW**
> at about 16vw in the accent colour, overlapping the arch's foot, with "A
> FRAGMENT" beside it in bone and one bone hairline beneath the row. Under it, a justified Montserrat block, max
> 520px: "One box. One numbered fragment of a real work, graded and sealed. The
> odds are written on-chain before anyone opens anything, and the Ferryman will
> buy back whatever you draw at eighty percent of its mark." A `<Barcode>` and
> the lockup close the hero. On scroll, the arch image moves at 0.85× and the
> fragment at 1.1×.
>
> **N° 01 — The ladder.** `<Headline a="EVERY BOX," b="ONE FRAGMENT" />`, then a
> table driven by `GET /public/machines`: class in GFS Didot, then edition, mark,
> "Ferryman pays", chance, all in JetBrains Mono. Mortal is plain. Hero carries one small
> accent `<Sparkle>` after its name. **Olympian carries two, is set entirely in the
> accent colour, and has an accent hairline beneath it.** No filled rows.
> A class whose probability is 0 renders "NOT YET STOCKED" and no odds.
> Underneath, small caps: "Box {price} HYPE. Expected value {ev} HYPE,
> {ratio}% of the box."
>
> **N° 02 — The Ferryman.** `<Headline a="A FLOOR," b="NOT A PROMISE" />`. Three
> columns divided by vertical hairlines, no boxes: "YOU HOLD 0.35", "THE FERRYMAN
> PAYS 0.28" (this figure in the accent), "YOU WAIT 0". Figures in GFS Didot 120px.
>
> **N° 03 — Fairness.** Bone on carbon, no accent. Four numbered steps in mono, and
> a text link to `/verify`.
>
> Footer: `<Barcode>`, lockup, links, and this line in Montserrat 11px ash:
> "Boxes are randomised. Expected value is below the box price. HYPE is volatile.
> Only spend what you can afford to lose."

---

## Prompt 3 — API layer

> Add a typed API client for `https://api.amphora.example` using TanStack Query.
> Endpoints: `/public/machines`, `/public/draws/recent`, `/draws/{address}`,
> `/public/fairness/{drawId}`, `/public/stats`, `/public/funds`,
> `/desk/quote/{certId}`, `POST /desk/sell`, `/meta/{certId}`,
> `/redeem/eligibility/{tokenId}`.
>
> **All money is HYPE.** Fields end in `Hype` (a decimal number for display) or
> `Wei` (a string, 18 decimals, for transactions). Never do arithmetic on the
> `Hype` numbers for anything sent on-chain; use the `Wei` strings with bigint.
> Add a `formatHype(n)` helper: at least two decimals, at most four, trailing
> zeros trimmed, always followed by " HYPE".
>
> Images: `/meta/{id}/image` and `/meta/{id}/card-front` take an **artwork** id,
> not a certificate id. For a certificate, call `/meta/{certId}` and use the
> `image` URL it returns. Never build an image URL from a certificate id.

---

## Prompt 4 — Wallet

> Add wallet connection with wagmi + viem. Use EIP-6963 provider discovery and
> show a picker; do not read `window.ethereum` directly (Phantom overrides it).
>
> Define the chain by hand. Do **not** import any chain called elysium from
> `viem/chains` or pick it from a wallet list; those are a different network.
>
> ```ts
> export const elysium = defineChain({
>   id: 99901,
>   name: 'Elysium',
>   nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
>   rpcUrls: { default: { http: [import.meta.env.VITE_RPC_URL] } },
>   blockExplorers: { default: { name: 'Elysium Explorer', url: 'https://elysium.kinetiq.xyz/explorer' } },
> });
> ```
>
> After connecting: request the chain switch, then **re-read the chain id**.
> Several wallets resolve the promise without switching. If it is not 99901,
> block every purchase button and show "Switch to Elysium" in `<Accent>`.
> The header shows the connected address in mono and the native HYPE balance.
> If the balance is below the box price plus a little gas, the buy button reads
> "GET HYPE ON ELYSIUM" and links to `https://elysium.kinetiq.xyz/bridge`.

---

## Prompt 5 — The amphora (the purchase page)

> Build `/draw`. Centre: a large `<Arch mono>` with a slab floating in front of
> it and an `<Orbit>`. Right: the live ladder from Prompt 2, the box price in
> GFS Didot 96px with "HYPE" beside it in Montserrat, the published EV, and the buy
> button — full width, accent hairline outline, accent text, "DRAW · {price} HYPE".
>
> Buying is **one transaction** and there is no approval step:
>
> ```ts
> const clientSeed = toHex(crypto.getRandomValues(new Uint8Array(32)));
> const hash = await writeContract({
>   address: GACHA, abi: gachaAbi, functionName: 'openBox',
>   args: [1, clientSeed], value: priceWei,   // exact; the contract reverts otherwise
> });
> ```
>
> Read `priceWei` from the contract (`machines(1)`), not from the API, right
> before sending. On the `BoxOpened` event in the receipt, take `drawId` and
> navigate to `/pull/{drawId}`. Map the `WrongPayment` revert to "The box price
> changed. Refresh and try again."
>
> Respect the geo gate: a 451 from the API disables the button with the message
> it returns.

---

## Prompt 6 — The reveal

> Build `/pull/{drawId}`. This is the signature moment and it is a poster being
> printed.
>
> Render immediately. Poll `/draws/{address}` every 1500ms. Reveal **only** when
> the row is `settled` with a tier present. Allow 10s to find the row and 60s to
> settle, then exit gracefully with a link to the collection and, after ten
> minutes, a "TAKE YOUR HYPE BACK" action that calls `refundUnsettled(drawId)`.
> Never show a label without its value.
>
> Waiting state: an empty `<Arch>` outline in bone, an `<Orbit>` slowly
> rotating, grain, and one line of small caps: "THE SEED IS BEING REVEALED".
>
> Reveal, 1.6s: the arch fills with the work in greyscale; the slab rises in
> front of it in colour; the work's title fades up in GFS Didot between two hairlines
> that draw in from the left. Then, by class: **Mortal** — class line in ash.
> **Hero** — class line in the accent. **Olympian** — the title itself is in the accent, the
> `<Sparkle>` pulses once, and nothing else moves. No confetti, no particles,
> no sound by default.
>
> Beneath: edition number, mark and the Ferryman's price in HYPE, and three
> actions: KEEP, SELL TO THE FERRYMAN, VERIFY THIS DRAW.

---

## Prompt 7 — Collection, Sherd and work pages

> `/vault`: the connected wallet's Sherds as slabs on carbon, four across, each
> hanging on a shared top line. Under each: work id in mono ash, title in GFS Didot
> 18px, class tag.
>
> `/c/{certId}`: the slab large on the left inside an `<Arch mono>` of its own
> work. On the right: `<Eyebrow>`, title in GFS Didot, then a mono data table —
> class, grade, edition number, mark, Ferryman's price, minted, draw id, owner.
> Actions: sell (calls `/desk/quote` then `POST /desk/sell`; if the API answers
> `desk_float_low` say "The Ferryman is being refilled. Your Sherd has not
> moved."), redeem, download certificate (`/coa/{certId}`). A redeemed Sherd
> shows "BOUND TO ITS CARD" in `<Accent ruled>` and no sell button.
>
> `/w/{workId}`: the work, its edition, and its holders by number.
> `/t/{serial}`: the page the NFC chip opens. One screen, no navigation: seal,
> title, "Nº 047 OF 300", owner, and "AUTHENTIC" in `<Accent ruled>`.

---

## Prompt 8 — Verify

> `/verify/{drawId}`. Fetch `/public/fairness/{drawId}`. Show server seed, client
> seed, prior commitment, user and draw id in mono, each copyable. Then
> **recompute in the browser** with viem: check
> `keccak256(serverSeed) === priorCommit`; compute
> `keccak256(abi.encode(serverSeed, clientSeed, user, drawId))`; take it mod
> 1,000,000 and walk the published ppm ladder. Show the roll, the band it fell
> in, and MATCH or MISMATCH in `<Accent ruled>`. No server call decides the result.

---

## Prompt 9 — Floor, transparency, funds

> `/floor`: the recent draws feed. A dense mono table, newest first. Olympian
> rows are set in the accent colour.
>
> `/transparency`: from `/public/stats`. Draws, collectors, Sherds, claims, the
> Ferryman's float and the Reserve in HYPE, and **observed against published
> odds** as paired bars (bone = published, ash = observed) with the note "small
> samples drift". Do not show revenue.
>
> `/funds`: four acquisition funds filling in sequence from `/public/funds`.
> Targets are in USD; the Reserve holds HYPE. Show both, and this note verbatim:
> "A bar can move when HYPE's price moves, even though nothing has been spent."
> If `priceStale` is true, show the HYPE balance and hide the bars.

---

## Prompt 10 — Responsible play, legal, polish

> Add `/limits`: a daily spend cap in HYPE and self-exclusion, from
> `/user/{address}/limits`. Limits tighten instantly and never loosen in-session.
> Add the legal pages from `TERMS.md`.
>
> Then audit: no rounded corners; no gradients; the accent is never a fill; no
> price without "HYPE"; no dollar sign anywhere except `/funds`; every number is
> in JetBrains Mono; the chain id 99901 check guards every transaction; no
> generated image is presented as a vault work.
