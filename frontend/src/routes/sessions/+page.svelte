<script lang="ts">
  import { onMount } from "svelte";
  import {
    fetchAllSessions,
    fetchSessionDetail,
    deleteSession,
    getSessionCategoryName,
    getSessionColorTheme,
    type Session,
    type SessionDetail,
  } from "$lib/sessionApi";

  let sessions: Session[] = [];
  let loading = true;
  let selectedSession: SessionDetail | null = null;
  let activeFilter: "all" | "image" | "video" = "all";
  let deleteConfirm: Session | null = null;
  let deleting = false;
  let signedVideoUrl: string | null = null;
  let signingError: string | null = null;

  // Helper: resolve API base consistently
  //  - prefer runtime `window.API_BASE` (if injected)
  //  - then `import.meta.env.VITE_API_BASE` (Vite build-time)
  //  - otherwise return empty string so we use relative `/api/...` endpoints
  function getApiBase(): string {
    try {
      if (typeof window !== "undefined" && (window as any).API_BASE) {
        return String((window as any).API_BASE).replace(/\/$/, "");
      }
    } catch (e) {
      // ignore
    }
    try {
      const v = (import.meta as any)?.env?.VITE_API_BASE;
      if (v) return String(v).replace(/\/$/, "");
    } catch (e) {
      // ignore for environments without import.meta
    }
    // Since we have Vite proxy configured to forward /api to backend,
    // return empty string so relative /api/... paths work correctly
    return "";
  }

  // If a path starts with '/api/', and an API base is configured, prefix it.
  // Otherwise return the original path so relative requests continue to work.
  function prefixApiBase(path: string | null | undefined) {
    if (!path) return path || null;
    try {
      const p = String(path);
      if (p.startsWith("/api/")) {
        const base = getApiBase();
        return base ? `${base}${p}` : p;
      }
      return p;
    } catch (e) {
      return path as any;
    }
  }

  // Filtered sessions based on active filter
  $: filteredSessions = sessions.filter((session) => {
    if (activeFilter === "all") return true;
    return session.type === activeFilter;
  });

  // Group sessions by model/category
  $: groupedSessions = filteredSessions.reduce(
    (acc, session) => {
      const category = getSessionCategoryName(session);
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(session);
      return acc;
    },
    {} as Record<string, Session[]>
  );

  onMount(async () => {
    await loadSessions();
  });

  async function loadSessions() {
    loading = true;
    try {
      sessions = await fetchAllSessions();
    } catch (error) {
      console.error("Failed to load sessions:", error);
    } finally {
      loading = false;
    }
  }

  async function openSessionDetail(session: Session) {
    try {
      const detail = await fetchSessionDetail(session.sessionId, session.type);
      if (detail) {
        selectedSession = detail;
        // reset any previously cached signing state when a new session is selected
        signedVideoUrl = null;
        signingError = null;
      }
    } catch (error) {
      console.error("Failed to load session detail:", error);
    }
  }

  async function getSignedVideoUrlFor(key: string | null | undefined) {
    if (!key) return;
    try {
      const API_BASE = getApiBase();
      const endpoint = API_BASE
        ? `${API_BASE}/api/video/sign`
        : `/api/video/sign`;
      const response = await fetch(
        `${endpoint}?key=${encodeURIComponent(key)}`
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

  // Try to locate an image session by matching an image URL or filename.
  // This is a best-effort helper used when clicking a reference image thumbnail
  // from a video session; if a matching image session is found, open its
  // details in the modal.
  async function openImageSessionFromUrl(url: string) {
    try {
      // Make sure we have the latest sessions list
      if (!sessions || sessions.length === 0) await loadSessions();

      // Normalize URL and filename for matching
      let filename = null;
      try {
        const u = new URL(url);
        filename = u.pathname.split("/").pop();
      } catch (e) {
        filename = url.split("/").pop() || url;
      }

      // First try to match by imageUrl exactly
      let found = sessions.find(
        (s) => s.type === "image" && (s.imageUrl === url || s.imageKey === url)
      );

      // Fallback: match by filename appearing in imageKey or imageFilename
      if (!found && filename) {
        found = sessions.find(
          (s) =>
            s.type === "image" &&
            ((s.imageFilename && s.imageFilename.endsWith(filename)) ||
              (s.imageKey && s.imageKey.endsWith(filename)))
        );
      }

      if (found) {
        await openSessionDetail(found);
      } else {
        // If not found, open the raw image URL in a new tab as a fallback
        window.open(url, "_blank", "noopener");
      }
    } catch (e) {
      console.error("Failed to open image session from url", e);
      window.open(url, "_blank", "noopener");
    }
  }

  // Return a best-effort MIME type for common video file extensions so the
  // browser can correctly recognize the <source> element. Defaults to
  // 'video/mp4' when unknown which is widely supported.
  function getMimeType(url: string | null | undefined) {
    if (!url) return "video/mp4";
    try {
      // If url is a proxy with an encoded url parameter, inspect the inner URL
      let probe = url;
      const qIdx = String(url).indexOf("?url=");
      if (qIdx !== -1) {
        try {
          const encoded = String(url).slice(qIdx + 5);
          probe = decodeURIComponent(encoded);
        } catch (e) {
          // ignore and fall back to outer URL
        }
      }
      const path = String(probe).split("?")[0].split("#")[0];
      const ext = path.split(".").pop()?.toLowerCase();
      switch (ext) {
        case "mp4":
        case "m4v":
          return "video/mp4";
        case "webm":
          return "video/webm";
        case "mov":
          return "video/quicktime";
        case "ogv":
          return "video/ogg";
        case "avi":
          return "video/x-msvideo";
        default:
          return "video/mp4";
      }
    } catch (e) {
      return "video/mp4";
    }
  }

  // Prefer using the backend redirect endpoint for video playback so the
  // browser receives the original signed URL and proper headers (Content-Type,
  // Accept-Ranges). If sessionId is available use that endpoint; otherwise
  // fall back to any provided videoUrl from metadata.
  function getPlayableVideoSrc(session: any) {
    if (!session) return null;
    try {
      // If metadata provides a proxy URL (backend sets /api/video/proxy?url=...), prefer it
      if (
        session.videoUrl &&
        String(session.videoUrl).includes("/api/video/proxy")
      ) {
        return session.videoUrl;
      }

      // If videoUrl is an absolute signed URL (http(s)://...), proxy it so we control CORS & headers
      if (session.videoUrl && /^https?:\/\//i.test(String(session.videoUrl))) {
        return (
          prefixApiBase(
            `/api/video/proxy?url=${encodeURIComponent(session.videoUrl)}`
          ) || `/api/video/proxy?url=${encodeURIComponent(session.videoUrl)}`
        );
      }

      // If we have a raw signed URL exposed on the metadata, proxy that as well
      if (
        session._signedVideoUrl &&
        /^https?:\/\//i.test(String(session._signedVideoUrl))
      ) {
        return (
          prefixApiBase(
            `/api/video/proxy?url=${encodeURIComponent(session._signedVideoUrl)}`
          ) ||
          `/api/video/proxy?url=${encodeURIComponent(session._signedVideoUrl)}`
        );
      }

      // If we at least have a sessionId, use the gallery redirect endpoint which will 302 to the signed URL
      if (session.sessionId) {
        return (
          prefixApiBase(`/api/gallery/video/${session.sessionId}/video`) ||
          `/api/gallery/video/${session.sessionId}/video`
        );
      }
    } catch (e) {
      // ignore
    }
    return session.videoUrl || null;
  }

  // Compute a display URL for the selected session mirroring VideoResultCard's logic
  $: displayVideoUrl = (() => {
    if (!selectedSession) return null;

    const s: any = selectedSession as any;

    // If we already obtained a signed R2 URL for the stored path, use it
    if (signedVideoUrl) return signedVideoUrl;

    // If selectedSession.videoUrl exists, examine it
    if (s.videoUrl) {
      try {
        const url = new URL(s.videoUrl, window?.location?.origin);
        // Prefer proxy for R2-hosted or cloud provider URLs to avoid CORS
        if (url.hostname.includes("r2.cloudflarestorage.com")) {
          const API_BASE = getApiBase();
          return API_BASE
            ? `${API_BASE}/api/video/proxy?url=${encodeURIComponent(s.videoUrl)}`
            : `/api/video/proxy?url=${encodeURIComponent(s.videoUrl)}`;
        }
        if (
          url.hostname.includes("cloudfront.net") ||
          url.hostname.includes("runwayml")
        ) {
          const API_BASE = getApiBase();
          return API_BASE
            ? `${API_BASE}/api/video/proxy?url=${encodeURIComponent(s.videoUrl)}`
            : `/api/video/proxy?url=${encodeURIComponent(s.videoUrl)}`;
        }
      } catch (e) {
        console.warn("Failed to parse selectedSession.videoUrl:", e);
      }
      return prefixApiBase(s.videoUrl) || s.videoUrl;
    }

    // If metadata exposes an internal signed URL field, proxy that
    if (s._signedVideoUrl && /^https?:\/\//i.test(String(s._signedVideoUrl))) {
      const API_BASE = getApiBase();
      return API_BASE
        ? `${API_BASE}/api/video/proxy?url=${encodeURIComponent(s._signedVideoUrl)}`
        : `/api/video/proxy?url=${encodeURIComponent(s._signedVideoUrl)}`;
    }

    // If we have a stored object path in metadata, attempt to sign it (async)
    // and meanwhile return null so the <video> won't be given an invalid src.
    const candidateKey = s.videoPath || s.savedVideoPath || s.videoKey || null;
    if (candidateKey && !signedVideoUrl && !signingError) {
      // Kick off async signing; result will populate signedVideoUrl and update displayVideoUrl
      getSignedVideoUrlFor(candidateKey);
      return null;
    }

    // Fallback: if sessionId is present, use gallery redirect endpoint
    if (s.sessionId) {
      return (
        prefixApiBase(`/api/gallery/video/${s.sessionId}/video`) ||
        `/api/gallery/video/${s.sessionId}/video`
      );
    }

    return null;
  })();

  function closeModal() {
    selectedSession = null;
    deleteConfirm = null;
  }

  function confirmDelete(session: Session) {
    deleteConfirm = session;
  }

  async function handleDelete() {
    if (!deleteConfirm) return;

    deleting = true;
    try {
      const success = await deleteSession(
        deleteConfirm.sessionId,
        deleteConfirm.type
      );
      if (success) {
        // Remove from local list
        sessions = sessions.filter(
          (s) => s.sessionId !== deleteConfirm!.sessionId
        );
        closeModal();
      } else {
        alert("Failed to delete session");
      }
    } catch (error) {
      console.error("Delete failed:", error);
      alert("Failed to delete session");
    } finally {
      deleting = false;
    }
  }

  function formatDate(timestamp: string | number): string {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }

  function formatPrompt(prompt: string, maxLength = 50): string {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + "...";
  }
</script>

<svelte:head>
  <title>Sessions - Image & Video History</title>
</svelte:head>

<div
  class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 min-h-screen text-white"
>
  <div class="container mx-auto p-8">
    <!-- Header -->
    <div class="text-center mb-12">
      <h1
        class="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"
      >
        Session History
      </h1>
      <p class="text-gray-400 text-lg">
        Manage your generation sessions and view detailed metadata
      </p>
    </div>

    <!-- Filter Tabs -->
    <div class="flex justify-center mb-8">
      <div
        class="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-2 border border-gray-700/50"
      >
        <div class="flex space-x-2">
          <button
            class="px-6 py-3 rounded-xl font-medium transition-all duration-300 {activeFilter ===
            'all'
              ? 'bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg transform scale-105'
              : 'text-gray-300 hover:text-white hover:bg-gray-700/50'}"
            on:click={() => (activeFilter = "all")}
          >
            All Sessions ({sessions.length})
          </button>
          <button
            class="px-6 py-3 rounded-xl font-medium transition-all duration-300 {activeFilter ===
            'image'
              ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg transform scale-105'
              : 'text-gray-300 hover:text-white hover:bg-gray-700/50'}"
            on:click={() => (activeFilter = "image")}
          >
            Images ({sessions.filter((s) => s.type === "image").length})
          </button>
          <button
            class="px-6 py-3 rounded-xl font-medium transition-all duration-300 {activeFilter ===
            'video'
              ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg transform scale-105'
              : 'text-gray-300 hover:text-white hover:bg-gray-700/50'}"
            on:click={() => (activeFilter = "video")}
          >
            Videos ({sessions.filter((s) => s.type === "video").length})
          </button>
        </div>
      </div>
    </div>

    <!-- Refresh Button -->
    <div class="flex justify-center mb-8">
      <button
        class="px-6 py-3 bg-gray-700/50 hover:bg-gray-700 text-white rounded-lg transition-colors duration-200 border border-gray-600/50"
        on:click={loadSessions}
        disabled={loading}
      >
        {loading ? "Loading..." : "Refresh"}
      </button>
    </div>

    {#if loading}
      <div class="flex justify-center items-center py-20">
        <div class="relative">
          <div
            class="w-12 h-12 border-4 border-gray-600 border-t-blue-500 rounded-full animate-spin"
          ></div>
          <div class="mt-4 text-gray-400 text-center">Loading sessions...</div>
        </div>
      </div>
    {:else if sessions.length === 0}
      <div class="text-center py-20">
        <div class="text-6xl mb-4">📁</div>
        <div class="text-xl text-gray-400">No sessions found</div>
        <div class="text-gray-500 mt-2">
          Generate some images or videos to see session history here!
        </div>
      </div>
    {:else}
      <!-- Sessions by Category -->
      <div class="space-y-12">
        {#each Object.entries(groupedSessions) as [category, categorySessions]}
          <div class="category-section">
            <!-- Category Header -->
            <div class="flex items-center mb-6">
              <div class="flex items-center space-x-4">
                <div
                  class="w-4 h-4 rounded-full {getSessionColorTheme(
                    categorySessions[0]
                  )} shadow-lg"
                ></div>
                <h2 class="text-2xl font-bold text-white">
                  {category}
                </h2>
                <div
                  class="bg-gray-700/50 backdrop-blur-sm px-3 py-1 rounded-full text-sm text-gray-300"
                >
                  {categorySessions.length}
                  {categorySessions.length === 1 ? "session" : "sessions"}
                </div>
              </div>
            </div>

            <!-- Sessions List -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {#each categorySessions as session}
                <div
                  class="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 hover:border-gray-500/50 transition-all duration-300 hover:scale-105 hover:shadow-xl"
                >
                  <!-- Thumbnail for reference image (video sessions) -->
                  {#if session.type === "video" && session.inputImagePath}
                    <div class="mb-4">
                      <a
                        href={`/video?ref=${encodeURIComponent(
                          session.inputImagePath
                        )}`}
                        title="Open reference image in video create page"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src={session.inputImagePath}
                          alt="reference thumbnail"
                          class="w-24 h-16 object-cover rounded-md border border-gray-700"
                        />
                      </a>
                    </div>
                  {/if}
                  <!-- Session Header -->
                  <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center space-x-3">
                      <div
                        class="w-3 h-3 rounded-full {getSessionColorTheme(
                          session
                        )}"
                      ></div>
                      <div class="text-sm text-gray-400">
                        {session.type.toUpperCase()}
                      </div>
                    </div>
                    <div class="text-xs text-gray-500">
                      {formatDate(session.timestamp)}
                    </div>
                  </div>

                  <!-- Session Content -->
                  <div class="mb-4">
                    <h3 class="text-white font-medium mb-2">
                      {formatPrompt(
                        session.type === "image"
                          ? session.prompt
                          : session.promptText
                      )}
                    </h3>
                    <div class="text-sm text-gray-400 space-y-1">
                      <div>Model: {session.model}</div>
                      <div>Session: {session.sessionId.split("_")[0]}</div>
                    </div>
                  </div>

                  <!-- Action Buttons -->
                  <div class="flex space-x-2">
                    <button
                      class="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors duration-200 text-sm font-medium"
                      on:click={() => openSessionDetail(session)}
                    >
                      View Details
                    </button>
                    <button
                      class="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200 text-sm font-medium"
                      on:click={() => confirmDelete(session)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<!-- Session Detail Modal -->
{#if selectedSession}
  <div
    class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    on:click={closeModal}
    on:keydown={(e) => e.key === "Escape" && closeModal()}
    role="dialog"
    aria-modal="true"
    tabindex="0"
  >
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      class="relative max-w-4xl max-h-[90vh] bg-gray-900/90 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-2xl overflow-y-auto"
      on:click|stopPropagation
      role="document"
    >
      <!-- Header -->
      <div
        class="sticky top-0 bg-gray-900/95 backdrop-blur-sm p-6 border-b border-gray-700/50"
      >
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-2xl font-bold text-white mb-2">Session Details</h3>
            <div class="flex items-center space-x-4">
              <div class="flex items-center space-x-2">
                <div
                  class="w-3 h-3 rounded-full {getSessionColorTheme(
                    selectedSession
                  )}"
                ></div>
                <span class="text-gray-300 text-sm">
                  {getSessionCategoryName(selectedSession)}
                </span>
              </div>
              <div class="text-xs text-gray-500">
                {selectedSession.type.toUpperCase()}
              </div>
            </div>
          </div>
          <button
            class="w-10 h-10 bg-gray-800 hover:bg-gray-700 text-white rounded-full flex items-center justify-center transition-colors duration-200"
            on:click={closeModal}
            aria-label="Close modal"
          >
            <svg
              class="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              ></path>
            </svg>
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="p-6 space-y-6">
        <!-- Basic Info -->
        <div class="space-y-4">
          <h4 class="text-lg font-semibold text-white">Basic Information</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span class="text-gray-400">Session ID:</span>
              <div class="text-white font-mono">
                {selectedSession.sessionId}
              </div>
            </div>
            <div>
              <span class="text-gray-400">Created:</span>
              <div class="text-white">
                {formatDate(selectedSession.timestamp)}
              </div>
            </div>
            <div>
              <span class="text-gray-400">Model:</span>
              <div class="text-white">{selectedSession.model}</div>
            </div>
            <div>
              <span class="text-gray-400">Type:</span>
              <div class="text-white capitalize">{selectedSession.type}</div>
            </div>
          </div>
        </div>

        <!-- Prompt/Text -->
        <div class="space-y-4">
          <h4 class="text-lg font-semibold text-white">Prompt</h4>
          <div class="bg-gray-800/50 rounded-lg p-4">
            <div class="text-white">
              {selectedSession.type === "image"
                ? selectedSession.prompt
                : selectedSession.promptText}
            </div>
          </div>
        </div>

        <!-- Image Session Specific -->
        {#if selectedSession.type === "image"}
          <div class="space-y-4">
            <h4 class="text-lg font-semibold text-white">
              Generation Parameters
            </h4>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              {#if selectedSession.numberOfImages}
                <div>
                  <span class="text-gray-400">Number of Images:</span>
                  <div class="text-white">{selectedSession.numberOfImages}</div>
                </div>
              {/if}
              {#if selectedSession.aspectRatio}
                <div>
                  <span class="text-gray-400">Aspect Ratio:</span>
                  <div class="text-white">{selectedSession.aspectRatio}</div>
                </div>
              {/if}
              {#if selectedSession.sampleImageSize}
                <div>
                  <span class="text-gray-400">Image Size:</span>
                  <div class="text-white">
                    {selectedSession.sampleImageSize}
                  </div>
                </div>
              {/if}
              {#if selectedSession.negative_prompt}
                <div class="md:col-span-3">
                  <span class="text-gray-400">Negative Prompt:</span>
                  <div class="text-white">
                    {selectedSession.negative_prompt}
                  </div>
                </div>
              {/if}
              {#if selectedSession.seed}
                <div>
                  <span class="text-gray-400">Seed:</span>
                  <div class="text-white font-mono">{selectedSession.seed}</div>
                </div>
              {/if}
              {#if selectedSession.style_preset}
                <div>
                  <span class="text-gray-400">Style Preset:</span>
                  <div class="text-white">{selectedSession.style_preset}</div>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Video Session Specific -->
        {#if selectedSession.type === "video"}
          <div class="space-y-4">
            <h4 class="text-lg font-semibold text-white">Video Information</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span class="text-gray-400">Task ID:</span>
                <div class="text-white font-mono">{selectedSession.taskId}</div>
              </div>
              {#if selectedSession.inputImagePath || selectedSession.referenceImage}
                <div>
                  <span class="text-gray-400">Reference Image:</span>
                  <div class="mt-2 flex items-center space-x-3">
                    {#if selectedSession.referenceImage}
                      <button
                        class="p-0 bg-transparent border-0"
                        on:click={() => {
                          if (
                            selectedSession &&
                            selectedSession.referenceImage
                          ) {
                            openImageSessionFromUrl(
                              selectedSession.referenceImage
                            );
                          }
                        }}
                        title="Open image session"
                      >
                        <img
                          src={selectedSession.referenceImage}
                          alt="reference thumbnail"
                          class="w-28 h-20 object-cover rounded-md border border-gray-700"
                        />
                      </button>
                    {/if}
                    <!-- Thumbnail is the clickable link to open the image session; hide raw URL per UX request -->
                  </div>
                </div>
              {/if}
              <div>
                <span class="text-gray-400">Created:</span>
                <div class="text-white">
                  {formatDate(selectedSession.createdAt)}
                </div>
              </div>
              {#if selectedSession.completedAt}
                <div>
                  <span class="text-gray-400">Completed:</span>
                  <div class="text-white">
                    {formatDate(selectedSession.completedAt)}
                  </div>
                </div>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Preview -->
        {#if selectedSession.imageUrl || selectedSession.videoUrl}
          <div class="space-y-4">
            <h4 class="text-lg font-semibold text-white">Preview</h4>
            <div class="bg-gray-800/30 rounded-lg p-4">
              {#if selectedSession.imageUrl}
                <img
                  src={selectedSession.imageUrl}
                  alt="Generated content"
                  class="max-w-full max-h-96 object-contain rounded-lg mx-auto"
                />
              {:else if selectedSession.videoUrl}
                <!-- Use the same display logic as the gallery VideoResultCard: -->
                <!-- compute `displayVideoUrl` (signed/proxied) and use it as the video src -->
                {#key displayVideoUrl}
                  <!-- svelte-ignore a11y-media-has-caption -->
                  <video
                    controls
                    playsinline
                    crossorigin="anonymous"
                    src={displayVideoUrl}
                    class="max-w-full max-h-96 object-contain rounded-lg mx-auto"
                    preload="metadata"
                  >
                    {#if displayVideoUrl}
                      <source
                        src={displayVideoUrl}
                        type={getMimeType(displayVideoUrl)}
                      />
                    {/if}
                    Your browser does not support the video tag.
                  </video>
                {/key}
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Delete Confirmation Modal -->
{#if deleteConfirm}
  <div
    class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
    on:click={closeModal}
    on:keydown={(e) => e.key === "Escape" && closeModal()}
    role="dialog"
    aria-modal="true"
    tabindex="0"
  >
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      class="relative max-w-md bg-gray-900/95 backdrop-blur-sm rounded-2xl border border-gray-700/50 shadow-2xl p-6"
      on:click|stopPropagation
      role="document"
    >
      <h3 class="text-xl font-bold text-white mb-4">Confirm Delete</h3>
      <p class="text-gray-300 mb-6">
        Are you sure you want to delete this {deleteConfirm.type} session? This action
        cannot be undone.
      </p>
      <div class="bg-gray-800/50 rounded-lg p-3 mb-6">
        <div class="text-sm text-gray-400">Session:</div>
        <div class="text-white">
          {formatPrompt(
            deleteConfirm.type === "image"
              ? deleteConfirm.prompt
              : deleteConfirm.promptText
          )}
        </div>
      </div>
      <div class="flex space-x-3">
        <button
          class="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors duration-200"
          on:click={closeModal}
          disabled={deleting}
        >
          Cancel
        </button>
        <button
          class="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors duration-200"
          on:click={handleDelete}
          disabled={deleting}
        >
          {deleting ? "Deleting..." : "Delete"}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .category-section {
    animation: slideInUp 0.6s ease-out forwards;
  }

  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
