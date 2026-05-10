<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { goto } from '$lib/utils/nav';
  import { activeRegion } from '$lib/stores/activeRegion';
  import { profile } from '$lib/stores/profile';
  import { profileLabel } from '$lib/services/profileService';
  import {
    listMembers,
    updateRole,
    removeMember,
    type MemberRow
  } from '$lib/services/membershipService';
  import {
    listForRegion as listInvites,
    createOrRefresh,
    revoke as revokeInvite,
    acceptUrl,
    type Invitation
  } from '$lib/services/invitationService';
  import type { MembershipRole } from '$lib/services/regionService';
  import ToolsMenu from '$lib/components/ToolsMenu.svelte';

  let members: MemberRow[] = [];
  let invites: Invitation[] = [];
  let loading = true;
  let errorMessage = '';

  // Invite form
  let formEmail = '';
  let formRole: MembershipRole = 'member';
  let formSubmitting = false;
  let formError = '';
  let lastCopied: string | null = null;

  // Per-row in-flight state
  let busyMember: string | null = null;
  let busyInvite: string | null = null;

  // Bounce non-admins. We wait for activeRegion to load — null while
  // loading, never-null after. Once we know the role, redirect or show.
  $: if ($activeRegion && $activeRegion.role !== 'admin') {
    goto('/', { replaceState: true });
  }

  $: if ($activeRegion && $activeRegion.role === 'admin') {
    void load($activeRegion.id);
  }

  async function load(regionId: string) {
    loading = true;
    errorMessage = '';
    try {
      [members, invites] = await Promise.all([
        listMembers(regionId),
        listInvites(regionId)
      ]);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to load.';
    } finally {
      loading = false;
    }
  }

  async function changeRole(m: MemberRow, role: MembershipRole) {
    if (m.role === role) return;
    busyMember = m.user_id;
    errorMessage = '';
    try {
      await updateRole(m.region_id, m.user_id, role);
      members = members.map((row) =>
        row.user_id === m.user_id ? { ...row, role } : row
      );
    } catch (err) {
      errorMessage = friendlyError(err, 'Could not change role.');
    } finally {
      busyMember = null;
    }
  }

  async function remove(m: MemberRow) {
    const label = profileLabel(m);
    if (!confirm(`Remove ${label} from this region?`)) return;
    busyMember = m.user_id;
    errorMessage = '';
    try {
      await removeMember(m.region_id, m.user_id);
      members = members.filter((row) => row.user_id !== m.user_id);
    } catch (err) {
      errorMessage = friendlyError(err, 'Could not remove member.');
    } finally {
      busyMember = null;
    }
  }

  async function sendInvite() {
    if (!$activeRegion) return;
    formSubmitting = true;
    formError = '';
    try {
      const inv = await createOrRefresh({
        regionId: $activeRegion.id,
        email: formEmail,
        role: formRole
      });
      // Refresh + present the link to copy.
      invites = [inv, ...invites.filter((i) => i.id !== inv.id)];
      formEmail = '';
      formRole = 'member';
      void copyLink(inv);
    } catch (err) {
      formError = friendlyError(err, 'Could not send invite.');
    } finally {
      formSubmitting = false;
    }
  }

  async function copyLink(inv: Invitation) {
    const url = acceptUrl(window.location.origin + getBasePath(), inv.token);
    try {
      await navigator.clipboard.writeText(url);
      lastCopied = inv.id;
      setTimeout(() => {
        if (lastCopied === inv.id) lastCopied = null;
      }, 2000);
    } catch {
      // Clipboard API unavailable: fall back to window.prompt so the
      // user can still long-press / select-all to copy manually.
      window.prompt('Copy this invite link:', url);
    }
  }

  function getBasePath(): string {
    // SvelteKit injects the base path; on a custom domain this is ''.
    return import.meta.env.BASE_URL.replace(/\/$/, '');
  }

  async function doRevoke(inv: Invitation) {
    if (!confirm(`Revoke invite for ${inv.email}?`)) return;
    busyInvite = inv.id;
    errorMessage = '';
    try {
      await revokeInvite(inv.id);
      invites = invites.filter((i) => i.id !== inv.id);
    } catch (err) {
      errorMessage = friendlyError(err, 'Could not revoke.');
    } finally {
      busyInvite = null;
    }
  }

  function friendlyError(err: unknown, fallback: string): string {
    const msg = err instanceof Error ? err.message : '';
    // Last-admin trigger uses RAISE EXCEPTION 'A region must have at
    // least one admin' with check_violation errcode.
    if (msg.includes('at least one admin')) {
      return 'A region must have at least one admin — promote someone else first.';
    }
    if (msg.includes('duplicate key')) {
      return 'A pending invite already exists for that email.';
    }
    return msg || fallback;
  }

  function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  }
  function isExpired(inv: Invitation): boolean {
    return new Date(inv.expires_at).getTime() < Date.now();
  }

  // Self-protection: only one admin? Block role/remove on yourself.
  $: adminCount = members.filter((m) => m.role === 'admin').length;
  $: isLastAdmin = (m: MemberRow) => m.role === 'admin' && adminCount === 1;
  $: isMe = (m: MemberRow) => $profile?.id === m.user_id;

  onMount(() => {});
</script>

<header>
  <button class="back" on:click={() => goto('/')}>← Back</button>
  <h1>Admin</h1>
  <div class="header-spacer"></div>
  <ToolsMenu />
</header>

<main>
  {#if !$activeRegion}
    <p class="hint">Loading…</p>
  {:else if $activeRegion.role !== 'admin'}
    <p class="hint">Redirecting…</p>
  {:else if loading}
    <p class="hint">Loading…</p>
  {:else}
    {#if errorMessage}<p class="error">{errorMessage}</p>{/if}

    <section>
      <h2>Tools</h2>
      <ul class="tools-list">
        <li><a href="{base}/admin/calibration">Calibration viewer</a> — review per-species, per-zone harvest windows across data sources</li>
        <li><a href="{base}/admin/feedback">Feedback inbox</a> — user-submitted bug reports + suggestions</li>
        <li><a href="{base}/admin/ux-events">UX events</a> — anonymized event log: locate-me hits, recording lifecycle, GPS errors, wake-lock outcomes</li>
      </ul>
    </section>

    <section>
      <h2>Members <span class="muted">({members.length})</span></h2>
      <ul class="members">
        {#each members as m}
          <li>
            <div class="who">
              <strong>{profileLabel(m)}</strong>
              {#if m.username && m.display_name}
                <span class="handle">@{m.username}</span>
              {/if}
              {#if isMe(m)}<span class="me-tag">you</span>{/if}
            </div>
            <span class="joined">joined {fmtDate(m.joined_at)}</span>
            <select
              bind:value={m.role}
              on:change={() => changeRole(m, m.role)}
              disabled={busyMember === m.user_id}
              title={isLastAdmin(m) ? 'Promote someone else first' : ''}
            >
              <option value="member">member</option>
              <option value="admin">admin</option>
            </select>
            <button
              class="remove"
              on:click={() => remove(m)}
              disabled={busyMember === m.user_id}
              title={isLastAdmin(m) ? 'Cannot remove the last admin' : 'Remove'}
            >Remove</button>
          </li>
        {/each}
      </ul>
    </section>

    <section>
      <h2>Send invite</h2>
      <form class="invite-form" on:submit|preventDefault={sendInvite}>
        <input
          type="email"
          bind:value={formEmail}
          placeholder="friend@example.com"
          required
          autocomplete="off"
          disabled={formSubmitting}
        />
        <select bind:value={formRole} disabled={formSubmitting}>
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit" disabled={formSubmitting || !formEmail.trim()}>
          {formSubmitting ? 'Sending…' : 'Send invite'}
        </button>
      </form>
      {#if formError}<p class="error">{formError}</p>{/if}
      <p class="hint">
        We don't email the invite — you'll get a copy-able link to share by
        whatever channel you like.
      </p>
    </section>

    <section>
      <h2>Pending invitations <span class="muted">({invites.filter((i) => !i.accepted_at).length})</span></h2>
      {#if invites.length === 0}
        <p class="hint">No invitations.</p>
      {:else}
        <ul class="invites">
          {#each invites as inv}
            <li class:accepted={!!inv.accepted_at} class:expired={!inv.accepted_at && isExpired(inv)}>
              <div class="who">
                <strong>{inv.email}</strong>
                <span class="role-tag">{inv.role}</span>
                {#if inv.accepted_at}
                  <span class="ok-tag">accepted</span>
                {:else if isExpired(inv)}
                  <span class="bad-tag">expired</span>
                {/if}
              </div>
              <span class="joined">
                created {fmtDate(inv.created_at)}
                {#if !inv.accepted_at} · expires {fmtDate(inv.expires_at)}{/if}
              </span>
              {#if !inv.accepted_at}
                <button class="copy" on:click={() => copyLink(inv)}>
                  {lastCopied === inv.id ? 'Copied ✓' : 'Copy link'}
                </button>
                <button
                  class="remove"
                  on:click={() => doRevoke(inv)}
                  disabled={busyInvite === inv.id}
                >Revoke</button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</main>

<style>
  header {
    display: flex; align-items: center; gap: 1rem;
    padding: 0.5rem 1rem; background: white;
    border-bottom: 1px solid #e1e8e1;
    height: 56px; box-sizing: border-box;
  }
  header h1 { margin: 0; font-size: 1.05rem; color: #3a5a3a; }
  .header-spacer { flex: 1; }
  .back { background: transparent; border: 0; color: #3a5a3a; font-size: 0.9rem; cursor: pointer; }

  main { padding: 1rem; max-width: 44rem; margin: 0 auto; }
  .hint { color: #6b7a6b; }
  .error { color: #b03030; font-size: 0.9rem; }
  .muted { color: #8a948a; font-weight: 400; }

  section { margin-bottom: 1.6rem; }
  h2 { color: #3a5a3a; font-size: 1rem; margin: 0 0 0.5rem; }

  ul.tools-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  ul.tools-list li {
    padding: 0.5rem 0.7rem;
    background: white;
    border: 1px solid #d0d8d0;
    border-radius: 0.4rem;
    font-size: 0.9rem;
  }
  ul.tools-list a { color: #3a5a3a; font-weight: 600; text-decoration: none; }
  ul.tools-list a:hover { text-decoration: underline; }

  ul.members, ul.invites {
    list-style: none; margin: 0; padding: 0;
  }
  ul.members li, ul.invites li {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 0.5rem;
    align-items: center;
    padding: 0.5rem 0;
    border-bottom: 1px solid #ebefeb;
    font-size: 0.9rem;
  }
  ul.invites li.accepted { opacity: 0.55; }
  ul.invites li.expired .joined { color: #b03030; }

  .who { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; min-width: 0; }
  .who strong { color: #1f2a1f; font-weight: 600; }
  .handle { color: #8a948a; font-size: 0.78rem; }
  .me-tag, .role-tag, .ok-tag, .bad-tag {
    font-size: 0.7rem;
    padding: 0.1rem 0.4rem;
    border-radius: 0.2rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .me-tag { background: #e1e8e1; color: #3a5a3a; }
  .role-tag { background: #f0e8d6; color: #6e5b1f; }
  .ok-tag { background: #d6e8d6; color: #2f7a3e; }
  .bad-tag { background: #f0d6d6; color: #b03030; }

  .joined { color: #8a948a; font-size: 0.78rem; white-space: nowrap; }

  select { padding: 0.2rem 0.4rem; border: 1px solid #c7d0c7; border-radius: 0.25rem; font-size: 0.85rem; }
  button {
    border: 1px solid #c7d0c7; background: white;
    padding: 0.25rem 0.6rem; border-radius: 0.25rem;
    font-size: 0.8rem; cursor: pointer; color: #3a5a3a;
  }
  button:disabled { opacity: 0.5; cursor: default; }
  .remove { color: #b03030; }
  .copy { color: #3a5a3a; }

  .invite-form {
    display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;
  }
  .invite-form input[type='email'] {
    flex: 1; min-width: 12rem;
    padding: 0.4rem 0.55rem;
    border: 1px solid #c7d0c7; border-radius: 0.3rem;
    font-size: 0.9rem;
  }
  .invite-form button[type='submit'] {
    background: #3a5a3a; color: white; border: 0;
    padding: 0.45rem 1rem;
  }

  @media (max-width: 640px) {
    ul.members li, ul.invites li {
      grid-template-columns: 1fr 1fr;
      gap: 0.4rem 0.5rem;
    }
    .joined { grid-column: 1 / -1; }
  }
</style>
