<script lang="ts">
  export let imageUrl: string | null = null;
  export let videoUrl: string | null = null;
  export let isVideoMode: boolean = false;
</script>

{#if isVideoMode && videoUrl}
  <div class="border p-2 rounded">
    <video src={videoUrl} controls class="max-w-full h-auto rounded" preload="metadata">
      <track kind="captions" label="No captions" />
      Your browser does not support the video tag.
    </video>
  </div>
{:else if !isVideoMode && imageUrl}
  <div class="border p-2 rounded">
    <img src={imageUrl} alt="Preview" class="max-w-full h-auto rounded" />
  </div>
{:else}
  <div class="border p-4 rounded text-sm text-gray-500">
    No {isVideoMode ? 'video' : 'image'} selected
  </div>
{/if}
