<script lang="ts">
  export let current: string;
  const links = [
    { name: "Generate", href: "/" },
    { name: "Gallery", href: "/gallery" },
    { name: "Video", href: "/video" },
    { name: "Sessions", href: "/sessions" },
  ];
</script>

<nav
  class="bg-gray-900 text-white py-4 px-6 flex gap-6 items-center border-b border-gray-800"
>
  {#each links as link}
    <a
      href={link.href}
      class="hover:text-blue-400 transition-colors duration-150 px-2 py-1 rounded-md {current ===
      link.href
        ? 'bg-gray-800 text-blue-400'
        : ''}"
      aria-current={current === link.href ? "page" : undefined}
    >
      {link.name}
    </a>
  {/each}
</nav>
