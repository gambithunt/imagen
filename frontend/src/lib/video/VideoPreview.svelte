<script lang="ts">
  export let imageUrl: string | null = null;
</script>

{#if imageUrl}
  <div class="border p-2 rounded">
    <img src={imageUrl} alt="Preview" class="max-w-full h-auto rounded" />
  </div>
{:else}
  <div class="border p-4 rounded text-sm text-gray-500">No image selected</div>
{/if}
