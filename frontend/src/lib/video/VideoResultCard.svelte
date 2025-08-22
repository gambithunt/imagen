<script lang="ts">
  export let title = "Result";
  export let videoUrl: string | null = null;
  export let savedImage: string | null = null;
  export let savedVideoUrl: string | null = null;
  export let savedVideoPath: string | null = null;

  let signedVideoUrl: string | null = null;
  let signingError: string | null = null;

  // Get signed URL for R2 video if needed
  $: if (savedVideoUrl && savedVideoPath && !signedVideoUrl) {
    getSignedVideoUrl();
  }

  async function getSignedVideoUrl() {
    try {
      if (!savedVideoPath) return;

      const API_BASE =
        (typeof window !== "undefined" && (window as any).API_BASE) || "";
      const endpoint = API_BASE
        ? `${API_BASE}/api/video/sign`
        : "http://localhost:3000/api/video/sign";

      const response = await fetch(
        `${endpoint}?key=${encodeURIComponent(savedVideoPath)}`
      );
      if (response.ok) {
        const data = await response.json();
        signedVideoUrl = data.signedUrl;
        signingError = null;
      } else {
        signingError = `Failed to get signed URL: ${response.status}`;
        console.warn("Failed to get signed URL for video:", response.status);
      }
    } catch (e) {
      signingError = `Error signing URL: ${e}`;
      console.warn("Error getting signed video URL:", e);
    }
  }

  // Prefer signed R2 URL, then original R2 URL, then proxy for RunwayML URLs
  $: displayVideoUrl = (() => {
    if (signedVideoUrl) return signedVideoUrl;
    if (savedVideoUrl) {
      // If it's an R2 URL, try to use the proxy as fallback
      try {
        const url = new URL(savedVideoUrl);
        if (url.hostname.includes("r2.cloudflarestorage.com")) {
          const API_BASE =
            (typeof window !== "undefined" && (window as any).API_BASE) || "";
          const proxyBase = API_BASE || "http://localhost:3000";
          return `${proxyBase}/api/video/proxy?url=${encodeURIComponent(savedVideoUrl)}`;
        }
      } catch (e) {
        console.warn("Failed to parse saved video URL:", e);
      }
      return savedVideoUrl;
    }
    if (videoUrl) {
      // If it's a RunwayML CloudFront URL, use the proxy endpoint to avoid CORS
      try {
        const url = new URL(videoUrl);
        if (
          url.hostname.includes("cloudfront.net") ||
          url.hostname.includes("runwayml")
        ) {
          const API_BASE =
            (typeof window !== "undefined" && (window as any).API_BASE) || "";
          const proxyBase = API_BASE || "http://localhost:3000";
          return `${proxyBase}/api/video/proxy?url=${encodeURIComponent(videoUrl)}`;
        }
      } catch (e) {
        console.warn("Failed to parse video URL:", e);
      }
      return videoUrl;
    }
    return null;
  })();

  async function downloadVideo() {
    let downloadUrl = signedVideoUrl || savedVideoUrl || videoUrl;

    // If we have a savedVideoPath but no signed URL, get one for download
    if (!signedVideoUrl && savedVideoPath) {
      try {
        const API_BASE =
          (typeof window !== "undefined" && (window as any).API_BASE) || "";
        const endpoint = API_BASE
          ? `${API_BASE}/api/video/sign`
          : "http://localhost:3000/api/video/sign";

        const response = await fetch(
          `${endpoint}?key=${encodeURIComponent(savedVideoPath)}`
        );
        if (response.ok) {
          const data = await response.json();
          downloadUrl = data.signedUrl;
        }
      } catch (e) {
        console.warn("Failed to get signed URL for download:", e);
      }
    }

    if (!downloadUrl) return;

    // Create a temporary link element for download
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = savedVideoPath
      ? savedVideoPath.split("/").pop() || "video.mp4"
      : "video.mp4";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
</script>

<div class="border rounded p-3 bg-gray-800">
  <h3 class="font-semibold mb-2">{title}</h3>
  {#if displayVideoUrl}
    <div class="space-y-3">
      <video controls src={displayVideoUrl} class="max-w-full rounded">
        <track kind="captions" srcLang="en" label="English captions" />
        Your browser does not support the video tag.
      </video>
      <div class="flex gap-2">
        <button
          on:click={downloadVideo}
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors"
        >
          Download Video
        </button>
        {#if savedVideoUrl}
          <a
            href={savedVideoUrl}
            target="_blank"
            class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded text-sm font-medium transition-colors inline-block"
          >
            Open in New Tab
          </a>
        {/if}
        {#if savedVideoUrl && videoUrl && savedVideoUrl !== videoUrl}
          <span class="px-2 py-1 bg-green-600 text-xs rounded">Saved to R2</span
          >
        {/if}
        {#if signingError}
          <span
            class="px-2 py-1 bg-red-600 text-xs rounded"
            title={signingError}>Signing Error</span
          >
        {/if}
        {#if signedVideoUrl}
          <span class="px-2 py-1 bg-blue-600 text-xs rounded">Signed URL</span>
        {/if}
      </div>
    </div>
  {:else}
    <div class="flex gap-4 items-center">
      {#if savedImage}
        <img
          src={savedImage}
          alt="input"
          class="w-32 h-20 object-cover rounded shadow"
        />
      {/if}
      <div>
        <div class="text-sm text-gray-300">No video yet</div>
        {#if savedImage}
          <a
            class="text-blue-400 underline text-sm"
            href={savedImage}
            target="_blank">Open saved image</a
          >
        {/if}
      </div>
    </div>
  {/if}
</div>
