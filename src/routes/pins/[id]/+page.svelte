<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$lib/utils/nav';
  import PinDetailContent from '$lib/components/PinDetailContent.svelte';

  $: pinId = $page.params.id as string;
</script>

<header>
  <button class="back" on:click={() => goto('/')}>← Back to map</button>
  <h1>Pin detail</h1>
</header>

<main>
  <PinDetailContent {pinId} />
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
  }
  main {
    max-width: 36rem;
    margin: 0 auto;
  }
</style>
