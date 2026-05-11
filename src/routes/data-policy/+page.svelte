<script lang="ts">
  // Public-tier Data Policy page. The Phase 3 outreach email to city
  // urban-forestry programs links here, so the page needs to read
  // standalone — as if the visitor has never seen Forager before — and
  // commit to four things in writing:
  //
  //   1. City tree-inventory data is always free, always public, never
  //      paywalled.
  //   2. Attribution + link-back on every imported pin.
  //   3. City sets the harvest-policy tag; Forager honors it.
  //   4. Removal on request within 48 hours.
  //
  // Plain prose, no tracking, no marketing language. The audience here
  // is a city open-data office or urban-forestry program manager, not
  // a casual forager.

  import { goto } from '$lib/utils/nav';
</script>

<svelte:head>
  <title>Data Policy · Forager</title>
  <meta name="description" content="How Forager uses public tree-inventory data from cities, universities, and open-data programs. Attribution, licensing, harvest-policy controls, and removal policy." />
</svelte:head>

<header>
  <button class="back" on:click={() => goto('/')}>← Back</button>
  <h1>Data Policy</h1>
</header>

<main>
  <p class="lead">
    Forager is a foraging-education map. The public layer is built from
    openly-licensed tree inventories published by cities, parks
    departments, universities, and similar open-data programs. This page
    explains how that data is used, credited, and controlled.
  </p>

  <section>
    <h2>1. Public data stays free and public</h2>
    <p>
      Forager has two tiers:
    </p>
    <ul>
      <li>
        <strong>Free tier (including anonymous visitors):</strong> full
        access to every tree imported from a city or institutional
        inventory. Species ID, harvest windows, photos, location,
        seasonality timeline — all visible without an account.
      </li>
      <li>
        <strong>Paid tier ($30/year):</strong> features for individual
        users who want to <em>contribute</em> — save their own pins, log
        harvest observations with photos, track quality ratings
        year-over-year, share private spots with a group, and receive
        notifications when species ripen near them.
      </li>
    </ul>
    <p>
      <strong>City-owned tree inventory data is never paywalled.</strong>
      The paid tier funds user-contribution features, not data access.
      A city resident sees their city's trees on the map whether they
      pay or not, whether they sign in or not.
    </p>
  </section>

  <section>
    <h2>2. Every imported tree carries attribution</h2>
    <p>
      Each pin shows the source ("Source: City of Cincinnati Open Data,"
      "Source: Boston Parks and Recreation," etc.) on its detail panel,
      with a direct link back to the city's published feed. The
      attribution appears even when a user adds an observation or photo
      to one of these trees — the source credit stays attached.
    </p>
    <p>
      We import under <strong>CC&nbsp;BY&nbsp;4.0</strong> or whatever
      permissive license the source publishes under. If your office
      prefers a different attribution string or licensing tag, we use
      what you specify.
    </p>
  </section>

  <section>
    <h2>3. You set the harvest expectation</h2>
    <p>
      A city's tree inventory is just data — it doesn't say whether
      foragers should harvest from those trees. Many cities have
      opinions on this (pesticide treatment, liability, conservation,
      active food-forest programs), and we want to surface those
      opinions to users.
    </p>
    <p>
      When we import a city's data, we ask the source to choose one of
      these tags:
    </p>
    <ul class="policy-list">
      <li>
        <span class="policy-badge policy-not-addressed">No specific guidance</span>
        — silence. The default if no preference is shared. Users see no
        policy banner.
      </li>
      <li>
        <span class="policy-badge policy-personal-use">Personal-use harvest permitted</span>
        — modest personal harvest is welcome.
      </li>
      <li>
        <span class="policy-badge policy-encouraged">Foraging encouraged</span>
        — for cities with active food-forest, gleaning, or
        community-orchard programs.
      </li>
      <li>
        <span class="policy-badge policy-discouraged">Asks foragers not to harvest</span>
        — typical for street trees with chemical treatment, or where
        the city has liability concerns.
      </li>
      <li>
        <span class="policy-badge policy-prohibited">Harvest prohibited</span>
        — for protected conservation areas or other legal restrictions.
      </li>
    </ul>
    <p>
      The selected tag appears as a banner on every pin from your
      source, alongside any free-text note you'd like users to read
      ("Street trees may be sprayed with insecticide in May/June — do
      not harvest within four weeks of application," for example).
      The note is shown verbatim.
    </p>
  </section>

  <section>
    <h2>4. Removal on request, within 48 hours</h2>
    <p>
      If you ever want your inventory pulled from Forager — for any
      reason, with no requirement to explain — email
      <a href="mailto:outreach@foragermap.org">outreach@foragermap.org</a>
      and the import will be removed within 48 hours. We'll keep an
      audit record (who requested, when, source affected) but nothing
      from your dataset remains visible to users.
    </p>
    <p>
      The same goes for individual species, geographic subsets, or
      anything else more specific than a whole-source pull.
    </p>
  </section>

  <section>
    <h2>5. What we don't do</h2>
    <ul>
      <li>
        We don't resell tree-inventory data. The public layer is
        view-only on the Forager map; bulk export of city data is not
        offered.
      </li>
      <li>
        We don't track open-data office visitors or correlate them with
        their public-tier browsing. The contact path is email.
      </li>
      <li>
        We don't add private user observations or photos onto the
        public-tier view of imported trees. User-contributed content
        from the paid tier stays scoped to the user's region.
      </li>
      <li>
        We don't claim copyright over your data. Imports retain their
        source license; our own contribution (the map UI, species
        catalog, harvest-window calibration) is under CC BY-NC-SA 4.0.
      </li>
    </ul>
  </section>

  <section>
    <h2>6. Updates from your office</h2>
    <p>
      Tree inventories drift — trees die, get planted, get renumbered.
      Forager users can flag pins as <em>gone</em>, <em>wrong species</em>,
      or <em>inaccessible</em>. If your office would find that signal
      useful, we can forward a monthly digest of flags affecting your
      data. Just ask.
    </p>
    <p>
      We also re-import on a roughly annual cadence to pick up your
      office's own updates, or sooner on request.
    </p>
  </section>

  <section>
    <h2>Contact</h2>
    <p>
      Questions, removal requests, harvest-policy updates, or interest
      in joining the public layer:
      <a href="mailto:outreach@foragermap.org">outreach@foragermap.org</a>.
    </p>
    <p class="muted small">
      Last revised 2026-05-11.
    </p>
  </section>
</main>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.5rem 1rem;
    background: white;
    border-bottom: 1px solid #e1e8e1;
    height: 56px;
    box-sizing: border-box;
  }
  header h1 {
    margin: 0;
    font-size: 1.05rem;
    color: #3a5a3a;
  }
  .back {
    background: transparent;
    border: 0;
    color: #3a5a3a;
    font-size: 0.9rem;
    cursor: pointer;
    padding: 0.4rem 0.6rem;
    border-radius: 0.3rem;
  }
  .back:hover { background: #f0f5ef; }
  main {
    max-width: 42rem;
    margin: 0 auto;
    padding: 1.5rem 1.2rem 3rem;
    font-size: 0.95rem;
    line-height: 1.55;
    color: #2c3a2c;
  }
  .lead {
    font-size: 1.02rem;
    color: #3a5a3a;
    border-left: 3px solid #c7d4c7;
    padding-left: 0.85rem;
    margin: 0 0 1.5rem;
  }
  h2 {
    font-size: 1.05rem;
    color: #3a5a3a;
    margin: 1.75rem 0 0.5rem;
  }
  section { margin-bottom: 0.5rem; }
  ul {
    padding-left: 1.2rem;
    margin: 0.4rem 0 0.8rem;
  }
  li { margin-bottom: 0.5rem; }
  p { margin: 0 0 0.65rem; }
  .policy-list {
    list-style: none;
    padding-left: 0;
  }
  .policy-list li {
    margin-bottom: 0.6rem;
    padding-left: 0;
  }
  .policy-badge {
    display: inline-block;
    padding: 0.12rem 0.55rem;
    font-size: 0.78rem;
    font-weight: 600;
    border-radius: 0.3rem;
    margin-right: 0.35rem;
    border: 1px solid;
  }
  .policy-not-addressed {
    background: #f3f5f3; border-color: #d0d4d0; color: #6b7a6b;
  }
  .policy-personal-use {
    background: #e3eff5; border-color: #a8cde0; color: #1a4a66;
  }
  .policy-encouraged {
    background: #e6f3e0; border-color: #8cc26a; color: #2d4d20;
  }
  .policy-discouraged {
    background: #fcf3df; border-color: #d6b95c; color: #6a4f15;
  }
  .policy-prohibited {
    background: #f8e0e0; border-color: #c46060; color: #6a1f1f;
  }
  .muted { color: #6b7a6b; }
  .small { font-size: 0.82rem; }
  a { color: #3a5a3a; }
</style>
