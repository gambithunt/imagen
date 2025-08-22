<script lang="ts">
  import VideoForm from "$lib/video/VideoForm.svelte";
  import VideoPreview from "$lib/video/VideoPreview.svelte";
  import VideoResultCard from "$lib/video/VideoResultCard.svelte";
  import { createVideo } from "$lib/video/videoApi";
  import { onMount } from "svelte";
  import { page } from "$app/stores";

  let selectedImageUrl: string | null = null;
  let results: any[] = [];
  let loading = false;
  let error: string | null = null;
  let progress: any = null;
  let sessionId: string | null = null;

  function onFilechange(e: CustomEvent<{ file?: File }>) {
    const file = e.detail.file;
    if (file) {
      selectedImageUrl = URL.createObjectURL(file);
    } else {
      selectedImageUrl = null;
    }
  }

  onMount(() => {
    // If a ref query parameter is present, use it as the selected image URL
    const unsubscribe = page.subscribe(($page) => {
      const ref = $page.url.searchParams.get("ref");
      if (ref) {
        (async () => {
          // If the ref is an R2 public URL without signing params, request a signed URL
          try {
            const u = new URL(ref);
            const isR2Host = /\br2\.cloudflarestorage\.com\b/i.test(u.host);
            const hasSignature =
              u.searchParams.has("X-Amz-Signature") ||
              u.searchParams.has("X-Amz-Expires");
            if (isR2Host && !hasSignature) {
              // extract key from pathname
              const key = u.pathname.replace(/^\/+/, "");
              try {
                const API_BASE =
                  (typeof window !== "undefined" && window.API_BASE) || "";
                const signEndpoint = API_BASE
                  ? `${API_BASE}/api/video/sign`
                  : "http://localhost:3000/api/video/sign";
                const signResp = await fetch(
                  `${signEndpoint}?key=${encodeURIComponent(key)}`
                );
                if (signResp.ok) {
                  const j = await signResp.json();
                  if (j && j.signedUrl) {
                    selectedImageUrl = j.signedUrl;
                    return;
                  }
                }
              } catch (e) {
                console.warn("Failed to get signed URL for ref", e);
              }
            }
          } catch (e) {
            // not a full URL or parsing failed
          }
          selectedImageUrl = ref;
        })();
      }
    });
    return () => unsubscribe();
  });

  async function onSubmit(e: CustomEvent<any>) {
    error = null;
    progress = null;
    loading = true;
    sessionId = null;
    const data = e.detail;
    try {
      if (!data.imageFile && selectedImageUrl) {
        try {
          if (selectedImageUrl.startsWith("blob:")) {
            const res = await fetch(selectedImageUrl);
            if (res.ok) {
              const blob = await res.blob();
              const contentType = blob.type || "image/png";
              const filename = `ref_${Date.now()}.png`;
              const file = new File([blob], filename, { type: contentType });
              data.imageFile = file;
            }
          } else {
            data.imageUrl = selectedImageUrl;
          }
        } catch (fetchErr) {
          console.warn("Failed to prepare reference image:", fetchErr);
        }
      }

      // Add progress callback
      data._onProgress = (status: unknown) => {
        progress = status as any;
        console.log("Progress update:", status);
      };

      const resp = await createVideo(data);
      sessionId = resp.sessionId || null;
      results = [
        {
          id: resp.id,
          videoUrl: resp.videoUrl,
          savedImage: resp.savedImage,
          savedVideoUrl: resp.savedVideoUrl,
          savedVideoPath: resp.savedVideoPath,
        },
        ...results,
      ];
    } catch (err) {
      error = String(err);
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Video - Create</title>
</svelte:head>

<div class="bg-gray-900 min-h-screen text-white">
  <div class="container mx-auto p-8">
    <h1 class="text-4xl font-bold mb-8">Create Video from Image (RunwayML)</h1>

    <div class="grid md:grid-cols-2 gap-8">
      <div>
        <div class="mb-6">
          <VideoForm on:submit={onSubmit} on:filechange={onFilechange} />
        </div>
        {#if loading}
          <div class="p-4 bg-yellow-500 text-black rounded">
            <div>Creating video... please wait.</div>
            {#if progress}
              <div class="text-sm mt-2">
                Status: {progress.status || "processing"}
                {#if progress.error}
                  <div class="text-red-600 font-medium">
                    Error: {progress.error}
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
        {#if error}
          <div class="p-4 bg-red-600 text-white rounded">{error}</div>
        {/if}

        {#if sessionId}
          <div class="p-3 bg-gray-800 rounded-lg border border-gray-700">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-300">Session ID:</span>
              <code class="text-xs text-blue-400 bg-gray-900 px-2 py-1 rounded"
                >{sessionId}</code
              >
            </div>
            <a
              href="/sessions"
              class="text-xs text-blue-400 hover:text-blue-300 underline mt-1 inline-block"
            >
              View all sessions →
            </a>
          </div>
        {/if}

        <div class="space-y-6">
          <div>
            <h2 class="text-xl font-semibold mb-2">Preview</h2>
            <VideoPreview imageUrl={selectedImageUrl} />
          </div>

          <div>
            <h2 class="text-xl font-semibold mb-2">Results</h2>
            {#if results.length === 0}
              <div class="p-4 text-gray-400">No results yet</div>
            {/if}
            {#each results as r}
              <VideoResultCard
                title={r.id}
                videoUrl={r.videoUrl}
                savedImage={r.savedImage}
                savedVideoUrl={r.savedVideoUrl}
                savedVideoPath={r.savedVideoPath}
              />
            {/each}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- styling is provided by container classes (Tailwind-like classes are used in markup) -->
</div>
