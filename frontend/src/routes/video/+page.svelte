<script lang="ts">
  import VideoForm from "$lib/video/VideoForm.svelte";
  import VideoPreview from "$lib/video/VideoPreview.svelte";
  import VideoResultCard from "$lib/video/VideoResultCard.svelte";
  import { createVideo, pollVideoStatus } from "$lib/video/videoApi";
  import { onMount } from "svelte";
  import { page } from "$app/stores";

  let selectedImageUrl: string | null = null;
  let selectedVideoUrl: string | null = null;
  let results: any[] = [];
  let loading = false;
  let error: string | null = null;
  let progress: any = null;
  let sessionId: string | null = null;
  let initialModel: string | null = null;
  let timedOutTaskId: string | null = null;
  let restartLoading = false;

  function onFilechange(e: CustomEvent<{ file?: File }>) {
    const file = e.detail.file;
    if (file) {
      selectedImageUrl = URL.createObjectURL(file);
    } else {
      selectedImageUrl = null;
    }
  }

  function onVideoFilechange(e: CustomEvent<{ file?: File }>) {
    const file = e.detail.file;
    if (file) {
      selectedVideoUrl = URL.createObjectURL(file);
    } else {
      selectedVideoUrl = null;
    }
  }

  onMount(() => {
    // If a ref query parameter is present, use it as the selected reference URL
    const unsubscribe = page.subscribe(($page) => {
      const ref = $page.url.searchParams.get("ref");
      const refType = $page.url.searchParams.get("refType") || "image"; // default to image for backward compatibility
      
      if (ref) {
        // Preselect gen4_aleph when using a reference from gallery
        initialModel = "gen4_aleph";
        
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
                    if (refType === "video") {
                      selectedVideoUrl = j.signedUrl;
                    } else {
                      selectedImageUrl = j.signedUrl;
                    }
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
          
          if (refType === "video") {
            selectedVideoUrl = ref;
          } else {
            selectedImageUrl = ref;
          }
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
      // Handle image reference for non-gen4_aleph models
      if (!data.imageFile && !data.videoFile && selectedImageUrl && data.model !== "gen4_aleph") {
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

      // Handle video reference for gen4_aleph model
      if (!data.videoFile && selectedVideoUrl && data.model === "gen4_aleph") {
        try {
          if (selectedVideoUrl.startsWith("blob:")) {
            const res = await fetch(selectedVideoUrl);
            if (res.ok) {
              const blob = await res.blob();
              const contentType = blob.type || "video/mp4";
              const filename = `ref_${Date.now()}.mp4`;
              const file = new File([blob], filename, { type: contentType });
              data.videoFile = file;
            }
          } else {
            // If it's a gallery URL, extract the direct signed URL
            if (selectedVideoUrl.includes('/api/gallery/video/') || selectedVideoUrl.includes('/api/video/proxy')) {
              try {
                const res = await fetch(selectedVideoUrl);
                if (res.ok) {
                  const blob = await res.blob();
                  const contentType = blob.type || "video/mp4";
                  const filename = `ref_${Date.now()}.mp4`;
                  const file = new File([blob], filename, { type: contentType });
                  data.videoFile = file;
                }
              } catch (fetchErr) {
                console.warn("Failed to fetch video from gallery URL:", fetchErr);
                // Fallback: still try to send the URL
                data.videoUrl = selectedVideoUrl;
              }
            } else {
              data.videoUrl = selectedVideoUrl;
            }
          }
        } catch (fetchErr) {
          console.warn("Failed to prepare reference video:", fetchErr);
        }
      }

      // Add progress callback
      data._onProgress = (status: unknown) => {
        progress = status as any;
        console.log("Progress update:", status);
        
        // Check if this is a timeout with taskId
        if (status && typeof status === 'object' && 'error' in status && 'taskId' in status) {
          const statusObj = status as any;
          if (statusObj.error === 'timeout' && statusObj.taskId) {
            timedOutTaskId = statusObj.taskId;
          }
        }
      };

      const resp = await createVideo(data);
      sessionId = resp.sessionId || null;
      
      // Check if we got a timeout (taskId but no video)
      if (resp.id && !resp.videoUrl && progress?.error === 'timeout') {
        timedOutTaskId = resp.id;
      }
      
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

  async function restartPolling() {
    if (!timedOutTaskId) return;
    
    restartLoading = true;
    error = null;
    progress = { status: "restarting polling..." };
    
    try {
      const result = await pollVideoStatus(timedOutTaskId, (status) => {
        progress = status;
        console.log("Restart progress update:", status);
      });
      
      // Update the most recent result with the completed video
      if (results.length > 0 && results[0].id === timedOutTaskId) {
        results[0] = {
          ...results[0],
          videoUrl: result.videoUrl,
          savedVideoUrl: result.savedVideoUrl,
          savedVideoPath: result.savedVideoPath,
        };
        results = [...results]; // Trigger reactivity
      }
      
      timedOutTaskId = null;
      progress = { status: "completed", done: true };
    } catch (err) {
      error = `Restart failed: ${String(err)}`;
      progress = { error: String(err) };
    } finally {
      restartLoading = false;
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
          <VideoForm {initialModel} on:submit={onSubmit} on:filechange={onFilechange} on:videofilechange={onVideoFilechange} />
        </div>
        {#if loading || restartLoading}
          <!-- pulsing glow while loading -->
          <div
            class="p-4 bg-yellow-500 text-black rounded relative overflow-hidden animate-pulse ring-4 ring-yellow-300/40 shadow-lg"
          >
            <div>{restartLoading ? "Restarting polling..." : "Creating video... please wait."}</div>
            {#if progress}
              <div class="text-sm mt-2">
                Status: {progress.status || "processing"}
                {#if progress.error && progress.error !== 'timeout'}
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
        
        {#if timedOutTaskId && !loading && !restartLoading}
          <div class="p-4 bg-orange-600 text-white rounded-lg border-l-4 border-orange-400">
            <div class="flex items-center justify-between">
              <div>
                <div class="font-medium">Job Timed Out</div>
                <div class="text-sm text-orange-100 mt-1">
                  The video generation took longer than expected. You can restart polling to check if it completed.
                </div>
                <div class="text-xs text-orange-200 mt-1">Task ID: {timedOutTaskId}</div>
              </div>
              <button
                on:click={restartPolling}
                class="ml-4 bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
              >
                Restart Polling
              </button>
            </div>
          </div>
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
            <VideoPreview 
              imageUrl={selectedImageUrl} 
              videoUrl={selectedVideoUrl}
              isVideoMode={!!selectedVideoUrl}
            />
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
