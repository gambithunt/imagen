<script>
  import "../app.css";
  import Nav from "$lib/Nav.svelte";
  import { page } from "$app/stores";
  $: currentPath = $page.url.pathname;
</script>

<div class="bg-gray-900 min-h-screen text-white">
  <Nav current={currentPath} />
  <main>
    <slot />
  </main>
</div>
