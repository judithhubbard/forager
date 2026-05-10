# Forager — Commercial Valuation Report

*Generated 2026-05-10 by automated research agent. Single-shot snapshot;
not actively maintained.*

A realistic appraisal of Forager as a commercial product. The bottom line up front: this is a viable indie SaaS with a defensible niche, a plausible 5-year ARR ceiling in the **$30K–$200K range** (mid case ~$60–90K), and a real shot at being a profitable solo side business — but not a venture-scale company.

---

## 1. Comparable apps

| App | Model | Price | Users / Scale | Revenue (where known) |
|---|---|---|---|---|
| **Falling Fruit** | Free, donation-supported nonprofit | $0 (donations) | ~2.05M unique visitors lifetime; 1.53M map locations as of Aug 2025 | Volunteer-run; no public revenue figures. Built by Hack4Impact UIUC volunteers. |
| **Wild Edibles Forage** (Steve Brill) | Paid, one-time | $10 (lite free; full $10) | Long tail; "Foraging with the Wildman" launched 2011. Niche. | One-time purchase model. Likely sub-$100K/yr based on category rank. |
| **PictureThis** | Freemium subscription | ~$30/yr | 10M+ Play Store installs; 1M+ iOS reviews | **~$5M/month US iOS revenue alone** per Sensor Tower; multi-tens-of-millions ARR. Operated by Glority (large team). |
| **PlantNet** | Free (research/citizen science) | $0 | 25M+ downloads | Grant-funded by CIRAD, INRIA. Nonprofit. |
| **iNaturalist Seek** | Free | $0 | iNat parent has ~3M+ active observers | Nonprofit (California Academy of Sciences spinout). |
| **AllTrails** | Freemium subscription | $36/yr (Plus), $80/yr (Peak) | 60M+ users, 55M registered, ~1M+ paid | $37.9M revenue 2023 (per Latka); ~$70M+ run-rate by 2024. Spectrum Equity-backed; now ~385 employees. |
| **onX Hunt** | Paid subscription | $35/yr (Hunt), $100/yr (Elite) | 1M+ paying subscribers across products | Reported $5M–$25M revenue range (Owler/Growjo); Bozeman-based, ~250 employees. |
| **Mushroom Identifier / ID** | Freemium | $5–30/yr | Tens of thousands DAU each, fragmented | Small individual apps; estimated <$500K ARR each. |

Key takeaway: there are **two viable models** in this space — the volunteer/nonprofit model (Falling Fruit, PlantNet) and the freemium subscription model (AllTrails, onX, PictureThis). Forager's $30/yr plan slots into the second pattern but at a much smaller TAM. The closest direct conceptual analog is **Falling Fruit**, which is *free*, and that is the single biggest pricing-power risk.

---

## 2. User-count projections (5 years post-launch)

The total addressable market is constrained: foraging-curious adults in temperate North America who forage often enough to want a structured tool. iNaturalist (a much broader product) has ~3M active observers; serious foragers are a fraction of that — maybe 200–500K in NA. The **wild-foraging-app market** was estimated at ~$56M in NA revenue in 2024 (Growth Market Reports), but that's spread across all apps including ID-only competitors that you're not.

| Tier | Pessimistic | Mid | Optimistic |
|---|---|---|---|
| Anonymous monthly browsers | 5,000 | 25,000 | 100,000 |
| Signed-in free (watchlist) | 800 | 5,000 | 20,000 |
| Paid subscribers ($30/yr) | 100 | 1,500 | 6,000 |
| Implied free-to-paid conversion | 12.5% | 30% | 30% |
| Implied browser-to-signup | 16% | 20% | 20% |

Notes on these numbers:

- **Pessimistic** assumes Falling Fruit retains the urban-foraging niche, your launch goes quietly, and signups come from word-of-mouth only.
- **Mid** assumes one hit blog post, one moderate Reddit/HN moment, and steady SEO from "[city] foraging map" queries against your municipal-tree-inventory pages — those are highly findable.
- **Optimistic** assumes ~6K paying users, which is **1.5× current onX-Hunt-pricing-tier penetration of the foraging niche**. AllTrails took 10+ years and $150M of VC to reach 1M paid; reaching 6K solo is plausible but requires sustained content and community work.
- 30% conversion from signed-in-free to paid is high but defensible for a watchlist-with-notifications hook — the watchlist creates a clear "I want this notification when X is ripe nearby" moment that monetizes well. AllTrails sits at ~2% paid against total registered, but their free tier is much more useful; your free tier is intentionally narrower.

---

## 3. Revenue projections at maturity (annual)

| | Pessimistic | Mid | Optimistic |
|---|---|---|---|
| Gross subs (paid × $30) | $3,000 | $45,000 | $180,000 |
| Stripe fees (2.9% + $0.30) | -$117 | -$1,755 | -$7,020 |
| Effective Stripe rate | ~3.9% | ~3.9% | ~3.9% |
| Infra costs (see §4) | -$600 | -$2,400 | -$9,600 |
| Apple Dev Program | -$99 | -$99 | -$99 |
| Domain / email / misc | -$300 | -$500 | -$800 |
| **Net before tax** | **~$1,900** | **~$40,000** | **~$162,000** |
| Net margin | 63% | 89% | 90% |

These ignore one-time costs (logo, legal review, initial marketing) of ~$2–5K. Recurring revenue is the entire model — there's no upsell ladder, no enterprise tier, no API resale. Some optionality from sponsorships (foraging-tool brands, field-guide publishers) but I wouldn't underwrite revenue against it.

A note on the $30/yr price: this is **competitive but not premium**. AllTrails is $36, onX Hunt $35, PictureThis ~$30. You could probably charge $40 with no measurable conversion drop given the active-user investment in personal pin data (high lock-in once a user has 50+ pins logged). I'd test $30 → $40 in year 2.

---

## 3a. Year-by-year growth model

Steady-state numbers above are year-5 endpoints. Here's a realistic ramp showing how the curve gets there. SaaS growth is usually slow in year 1 (no audience yet), accelerates in years 2–3 as SEO / content / referrals compound, then tapers in years 4–5 as the product approaches its addressable market.

**Mid case** (most likely outcome):

| Year | Anonymous MAU | Free signed-in | Paid subs | Gross/yr | Costs/yr | Net/yr | Cumulative net |
|---|---|---|---|---|---|---|---|
| 1 | 2,500 | 500 | 75 | $2,250 | $720 | ~$1,500 | $1,500 |
| 2 | 7,500 | 1,500 | 300 | $9,000 | $1,200 | ~$7,500 | $9,000 |
| 3 | 15,000 | 3,000 | 750 | $22,500 | $1,800 | ~$19,500 | $28,500 |
| 4 | 22,000 | 4,200 | 1,200 | $36,000 | $2,200 | ~$31,500 | $60,000 |
| 5 | 25,000 | 5,000 | 1,500 | $45,000 | $2,400 | ~$40,000 | $100,000 |

Mid-case **5-year cumulative net: ~$100K**. Break-even on infrastructure spend: month 4 of year 1. The single-developer hours-per-week peak around year 2–3 (15–20 hrs/wk during SEO + content push) before settling to ~7–10 hrs/wk steady state.

**Pessimistic case** (Falling Fruit dominates the niche, no breakout moment, slow word-of-mouth only):

| Year | Anonymous MAU | Free signed-in | Paid subs | Gross/yr | Costs/yr | Net/yr | Cumulative net |
|---|---|---|---|---|---|---|---|
| 1 | 500 | 50 | 5 | $150 | $480 | -$330 | -$330 |
| 2 | 1,500 | 200 | 20 | $600 | $480 | $120 | -$210 |
| 3 | 3,000 | 400 | 50 | $1,500 | $540 | ~$960 | $750 |
| 4 | 4,000 | 600 | 80 | $2,400 | $600 | ~$1,800 | $2,550 |
| 5 | 5,000 | 800 | 100 | $3,000 | $600 | ~$2,400 | $4,950 |

Pessimistic **5-year cumulative net: ~$5K** — net-negative through year 1, nominal returns thereafter. The product would still pay for itself but not return on the time invested. Worth running for personal use; not worth it as a side-business if this is the actual trajectory.

**Optimistic case** (one breakthrough content moment in year 2, durable SEO from per-city foraging-map pages, watchlist conversion lands well):

| Year | Anonymous MAU | Free signed-in | Paid subs | Gross/yr | Costs/yr | Net/yr | Cumulative net |
|---|---|---|---|---|---|---|---|
| 1 | 5,000 | 1,000 | 200 | $6,000 | $720 | ~$4,500 | $4,500 |
| 2 | 25,000 | 4,000 | 1,000 | $30,000 | $2,400 | ~$25,000 | $29,500 |
| 3 | 60,000 | 12,000 | 3,000 | $90,000 | $5,400 | ~$80,000 | $109,500 |
| 4 | 90,000 | 17,000 | 4,500 | $135,000 | $7,800 | ~$120,000 | $229,500 |
| 5 | 100,000 | 20,000 | 6,000 | $180,000 | $9,600 | ~$160,000 | $389,500 |

Optimistic **5-year cumulative net: ~$390K**. Break-even on Apple Dev Program + total infra: month 2. At this scale, the time investment becomes the constraint — at 4.5K paying users, support and content-update demands push toward 25–30 hrs/wk, which forces either hiring help or quality erosion.

**Cross-case comparison at year 3** (the most informative "is this working?" milestone):

| Case | Y3 paid subs | Y3 net/yr | Cumulative through Y3 |
|---|---|---|---|
| Pessimistic | 50 | ~$1K | $750 |
| Mid | 750 | ~$20K | $28K |
| Optimistic | 3,000 | ~$80K | $110K |

Year 3 is the decision point: if Forager is in the pessimistic trajectory by then, the realistic move is to make peace with it as a personal-use tool and stop investing growth time. Mid case at year 3 is when it starts looking like a real side income; optimistic is when it could plausibly become full-time.

**Conversion model assumptions** (constant across years; you can sanity-check these against your own funnel data once live):

- 16–20% of anonymous browsers eventually create a free account (driven by watchlist + ripening notifications)
- 15% of free signed-in convert to paid in year 1 (early adopters, foraging hobbyists with disposable income); rises to 30% by year 5 as the watchlist features deepen
- 10–15% annual churn on paid (typical for $30/yr subscription apps without aggressive lock-in features); offset by gross adds
- These ramp curves assume **steady content output** (~1 blog post/week or equivalent SEO content). Cut content production and the curves flatten by year 2.

---

## 4. Cost model (monthly, by tier)

| Item | Pess. (~5K MAU) | Mid (~25K MAU) | Optim. (~100K MAU) |
|---|---|---|---|
| Supabase Pro base | $25 | $25 | $25 |
| Supabase DB storage overage | $0 | ~$2 (16GB) | ~$10 (80GB) |
| Supabase file storage overage (photos) | $0 | ~$10 (~500GB) | ~$50 (~2.5TB) |
| Supabase egress overage | $0 | ~$45 (~750GB over) | ~$270 (~3TB over) |
| Cloudflare CDN (Free or Pro $20) | $0 | $20 | $20 |
| Tile provider (Mapbox if OSM rate-limits) | $0 | $0–50 | $200–500 |
| Transactional email (Resend / Postmark) | $0 | $20 | $50 |
| SMS (skip — keep email-only) | $0 | $0 | $0 |
| Domain | $1 | $1 | $1 |
| Sentry / error reporting | $0 | $26 | $26 |
| Apple Dev Program (annualized) | $8 | $8 | $8 |
| Misc dev tools (GitHub, etc.) | $0 | $20 | $40 |
| **Total / month** | **~$35** | **~$180** | **~$700** |

Key driver at scale: **Supabase egress is the silent killer**. Pro includes 250GB egress; map tiles and photos at 25K MAU will blow past that. Photo storage at $0.021/GB is cheap; egress at $0.09/GB is not. Mitigation: Cloudflare in front of photo URLs (signed-URL-compatible cache), aggressive thumbnail-only loading on map views, prune unviewed photos from CDN.

OSM tile usage policy explicitly forbids high-volume apps; you'll need to migrate to a paid tile provider (MapTiler ~$25/mo for 250K loads, or self-hosted Protomaps on R2 for ~$5/mo) somewhere between mid and optimistic scale.

---

## 5. Pitfalls and risks (most material first)

1. **Falling Fruit sets a free anchor.** Forager's public-tier dataset bootstrapped from municipal tree inventories overlaps directly with what FF offers free. Your differentiation is calibrated harvest windows, watchlists, and personal pins — those are real, but in user-search terms ("urban foraging map") you compete with a free incumbent with ~2M lifetime users. **This is the single biggest risk** to paid conversion. Mitigation: lead with the calibrated phenology and watchlist-notifications, not the map.

2. **App Store rejection risk is real but manageable.** Apple has not historically rejected foraging apps wholesale — Wild Edibles, multiple Mushroom Identifier apps, and Foraging ID are all live. But Apple has rejected mushroom-ID apps that lacked safety disclaimers. Your app is *not* an ID app (the user identifies; you record), which is a much safer posture. Required: prominent disclaimer in onboarding and ToS — "Forager does not identify species or vouch for safety; users are responsible for what they harvest and consume." This was the right call in PLAN §1 non-goals.

3. **Liability — theoretical, not zero.** Worst plausible case: a paid user forages from a pin where the species data is wrong, eats a poisonous look-alike, gets sick or dies, family sues. Defenses: (a) you're not making ID claims; (b) ToS waiver; (c) general liability insurance ($500–1,500/yr from Hiscox or similar once you have revenue). The mushroom angle is the highest-risk; consider excluding mushroom species from public-dataset auto-pinning (they aren't in municipal inventories anyway) and gating mushroom species behind explicit user pin-creation only. The existing PLAN §1 non-goals already align with this.

4. **Public-data licensing variability.** NYC and Chicago tree inventories are explicitly open (NYC under their Open Data Law, ODbL-compatible; Chicago under their Open Data portal terms). Many smaller cities are CC-BY or "public domain implied." Cornell CUGIR is permissive. **Some municipal datasets prohibit commercial redistribution** even when free to use. Mitigation: maintain `ImportSource.license` text (PLAN §6.6 already commits to this) and audit every source before promoting it to the public-tier dataset; exclude any with NC clauses from the paid product. This is real legal homework, ~10 hours of paralegal-ish work.

5. **Content moderation at the paid tier.** A bad-actor user pinning private property as "free fruit here" or pinning a poisonous look-alike with the wrong species ID creates real liability. Mitigation: pins remain private to the paying user by default; "publishing" to the shared public dataset is gated and reviewed (or never permitted in v1). PLAN already takes this position.

6. **Niche audience size — 100K MAU is achievable, paid at scale is harder.** AllTrails reached 60M users on $150M of VC. Hitting 100K MAU solo is in the optimistic case; *converting them at 6%* is the actual math problem. Look at the iNaturalist user funnel: 3M+ observers, $0 paid product. The audience exists but they self-select for free tools.

7. **Geographic ceiling.** Forageable species are concentrated in temperate zones (USDA 3a–9b). Tropical-climate users need different species data; equatorial users get little value. This caps practical TAM at North America + Europe + parts of East Asia/Australia/NZ. Phenology refresh requires per-zone calibration — PLAN §5.10 already captures this challenge honestly.

8. **Single-developer bus factor.** Solo product. If you stop, it stops. Subscribers churn the moment software stagnates — onX Hunt's 318% subscription growth came from constant feature shipping. Indie projects in this space typically plateau when the dev burns out. Plan for 5–8 hrs/week steady-state maintenance once at mid scale; 15–20 hrs/wk during growth phases.

9. **Capacitor mobile build adds work.** PWA-on-iOS push-notification limitations are real, and the watchlist hook leans on notifications. Capacitor wrap is the right call but adds App Store review cycles, native crash debugging, and Apple's $99/yr fee. Budget ~1 calendar month to get it into both stores cleanly.

---

## 6. Bottom line

**Realistic 5-year revenue range:** $3K–$180K gross / $2K–$160K net. **Mid-case point estimate: $45K gross / $40K net by year 5.**

**Time investment:** ~7–10 hrs/week steady-state to keep a mid-case Forager healthy: ~3 hrs maintenance/bugs, ~2 hrs user support and content (calibration improvements, new species, blog SEO), ~3 hrs feature shipping. Front-loaded: years 1–2 will need 15–20 hrs/wk to reach mid case.

**Defensible business case:** Yes, conditionally. As a **profitable indie side project** at $40–60K/yr net by year 3–5, this is realistic and worth doing. As a full-time business this requires hitting the optimistic case, which I'd put at ~15% probability without VC money or a co-founder doing growth/content.

**The realistic decision frame:** would you do this for $40K/yr in year 4, on top of a day job, in exchange for ~8 hrs/wk and full creative control of a product you personally use? That's the actual offer on the table. The asymmetric upside — you might land in the optimistic case — is real but should not anchor planning.

**One strategic note:** The tail-trimmed phenology calibration (per your iNat-bias memory) is genuinely defensible IP. No competitor — not Falling Fruit, not the ID apps, not AllTrails — does per-zone harvest-window prediction. If anything in this app warrants patient long-term investment, it's the calibration data and the per-zone phenology. That's the moat that makes Forager not-just-another-Falling-Fruit. Consider whether the calibration dataset itself could be licensed to research institutions or extension services as a separate revenue stream — small but plausibly $5–20K/yr at maturity.

---

### Sources

- [Falling Fruit](https://fallingfruit.org/)
- [Atlas Obscura — Falling Fruit user/location stats](https://www.atlasobscura.com/articles/falling-fruit-urban-foraging-map)
- [AllTrails revenue (Latka)](https://getlatka.com/companies/alltrails)
- [AllTrails growth case study (RevenueCat)](https://www.revenuecat.com/blog/growth/alltrails-product-channel/)
- [onX Hunt subscriber/revenue (Owler)](https://www.owler.com/company/onxmaps)
- [onX Hunt pricing](https://www.onxmaps.com/hunt/app/pricing)
- [PictureThis revenue (Sensor Tower via Apple)](https://app.sensortower.com/overview/1252497129?country=US)
- [Wild Edibles Forage app](https://apps.apple.com/us/app/wild-edibles-forage/id431504588)
- [Plant ID accuracy comparison study (Hart 2023)](https://besjournals.onlinelibrary.wiley.com/doi/full/10.1002/pan3.10460)
- [Wild Foraging Identifier App Market Report](https://growthmarketreports.com/report/wild-foraging-identifier-app-market)
- [Supabase pricing](https://supabase.com/pricing)
- [Supabase pricing breakdown (DesignRevision)](https://designrevision.com/blog/supabase-pricing)
- [Stripe real fee breakdown for SaaS (Freemius)](https://freemius.com/blog/stripe-transaction-fees-real-cost/)
- [Galloway Wild Foods on plant/fungi ID app accuracy and liability](https://gallowaywildfoods.com/plant-and-fungi-identification-apps-careful-now/)
