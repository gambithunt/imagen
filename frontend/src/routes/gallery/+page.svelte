<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import {
    fetchAllSessions,
    fetchSessionDetail,
    getSessionCategoryName,
    getSessionColorTheme,
    type Session,
    type SessionDetail,
  } from "$lib/sessionApi";

  let sessions: Session[] = [];
  let loading = true;
  let selected: SessionDetail | null = null;
  let activeFilter = "all";
  // Video element reference for autoplaying when modal opens
  let modalVideoEl: HTMLVideoElement | null = null;

  // When modal opens with a video, try to autoplay (muted + playsinline increases chance of success)
  $: if (selected && selected.type === "video") {
    // small timeout to allow DOM to update
    setTimeout(() => {
      try {
        if (modalVideoEl) {
          // attempt to play; browsers may block autoplay without user gesture if not muted
          modalVideoEl.play().catch((e) => {
            // ignore autoplay block errors; user can press play
            console.debug("Autoplay prevented:", e?.message || e);
          });
        }
      } catch (err) {
        console.debug("Error attempting to autoplay video:", err);
      }
    }, 100);
  }

  // Copy/share functionality
  let copyStatus: "idle" | "copied" | "error" = "idle";

  // Backend base URL for constructing absolute URLs
  const backendBase =
    import.meta.env && import.meta.env.DEV ? "http://localhost:3000" : "";

  // Filter sessions based on active filter
  $: filteredSessions = sessions.filter((session) => {
    if (activeFilter === "all") return true;
    const category = getSessionCategoryName(session);
    if (activeFilter === "imagen") return category.includes("Imagen");
    if (activeFilter === "stable") return category.includes("Stable");
    if (activeFilter === "runway") return category.includes("RunwayML");
    return false;
  });

  // Group sessions by category
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
    loading = true;
    try {
      sessions = await fetchAllSessions();
    } catch (error) {
      console.error("Failed to load sessions:", error);
    } finally {
      loading = false;
    }
  });

  async function openModal(session: Session) {
    // Reset copy status
    copyStatus = "idle";

    try {
      const detail = await fetchSessionDetail(session.sessionId, session.type);
      if (detail) {
        selected = detail;
      }
    } catch (error) {
      console.error("Failed to load session detail:", error);
    }
  }

  function closeModal() {
    selected = null;
  }

  function setFilter(filter: string) {
    activeFilter = filter;
  }

  function getImageUrl(session: Session): string {
    // For session list view, we'll use a special endpoint that serves images with signed URLs
    if (session.type === "image") {
      return `/api/gallery/image-session/${session.sessionId}/image`;
    } else {
      return `/api/gallery/video/${session.sessionId}/video`;
    }
  }

  function getDetailImageUrl(sessionDetail: SessionDetail): string {
    if (sessionDetail.type === "image") {
      return sessionDetail.imageUrl || "";
    } else {
      return sessionDetail.videoUrl || "";
    }
  }

  function getAbsoluteUrl(url: string): string {
    if (!url) return "";
    return url.match(/^https?:\/\//i)
      ? url
      : `${backendBase}${url.startsWith("/") ? url : `/${url}`}`;
  }

  // Navigate to generate page with session parameters
  function iterateSession(session: Session | null) {
    if (!session || session.type !== "image") return;

    const params = new URLSearchParams();

    // Set API and model based on session
    if (session.model.includes("Imagen")) {
      params.set("api", "Google Imagen");
      params.set("model", session.model);
    } else if (
      session.model.includes("SD") ||
      session.model.includes("Stable")
    ) {
      params.set("api", "Stable Diffusion");
      if (session.model.includes("Core")) params.set("model", "Stable Core");
      else if (session.model.includes("Ultra"))
        params.set("model", "Stable Ultra");
      else if (session.model.includes("XL")) params.set("model", "SD XL");
    }

    params.set("prompt", session.prompt || "");

    // Add other parameters if available
    if (session.numberOfImages)
      params.set("numberOfImages", session.numberOfImages.toString());
    if (session.aspectRatio) params.set("aspectRatio", session.aspectRatio);
    if (session.negative_prompt)
      params.set("negativePrompt", session.negative_prompt);
    if (session.seed) params.set("seed", session.seed);
    if (session.style_preset) params.set("stylePreset", session.style_preset);

    goto(`/?${params.toString()}`);
  }

  // Use image/video as reference for video generation
  async function useAsVideoReference(
    sessionLike: Session | SessionDetail | null
  ) {
    if (!sessionLike) return;

    // Determine if this is a Session or SessionDetail
    const isDetail = (obj: any): obj is SessionDetail =>
      "imageUrl" in obj || "videoUrl" in obj;
    let urlToSign = "";
    let type = sessionLike.type;
    if (isDetail(sessionLike)) {
      urlToSign =
        type === "image"
          ? (sessionLike as SessionDetail).imageUrl || ""
          : (sessionLike as SessionDetail).videoUrl || "";
    } else {
      urlToSign = getImageUrl(sessionLike as Session);
    }
    let signedUrl = null;
    try {
      const absUrl = getAbsoluteUrl(urlToSign);
      // If it's an R2 URL, sign it; otherwise, just use the absolute URL
      let r2Key = null;
      try {
        const u = new URL(absUrl);
        const isR2Host = /r2\.cloudflarestorage\.com/i.test(u.host);
        if (isR2Host) {
          r2Key = u.pathname.replace(/^\/+/, "");
        }
      } catch (e) {
        // Not a valid URL, skip
      }
      if (r2Key) {
        // Get a 1h signed URL from backend. Use API_BASE when available (set by runtime) otherwise default to localhost:3000
        try {
          const API_BASE =
            (typeof window !== "undefined" && window.API_BASE) || "";
          const signEndpoint = API_BASE
            ? `${API_BASE}/api/video/sign`
            : "http://localhost:3000/api/video/sign";
          const signResp = await fetch(
            `${signEndpoint}?key=${encodeURIComponent(r2Key)}`
          );
          if (signResp.ok) {
            const j = await signResp.json();
            if (j && j.signedUrl) {
              signedUrl = j.signedUrl;
            }
          }
        } catch (e) {
          console.warn("Failed to get signed URL for gallery image:", e);
        }
      } else {
        signedUrl = absUrl;
      }
    } catch (e) {
      signedUrl = getAbsoluteUrl(urlToSign);
    }
    const params = new URLSearchParams();
    params.set("ref", signedUrl);
    params.set("refType", type);
    goto(`/video?${params.toString()}`);
  }

  // Copy signed URL functionality
  async function copySignedUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      copyStatus = "copied";
      setTimeout(() => (copyStatus = "idle"), 2500);
    } catch (e) {
      console.warn("Clipboard copy failed", e);
      copyStatus = "error";
      setTimeout(() => (copyStatus = "idle"), 2500);
    }
  }
</script>

<div
  class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 min-h-screen text-white"
>
  <div class="container mx-auto p-8">
    <!-- Header -->
    <div class="text-center mb-12">
      <h1
        class="text-5xl font-bold mb-4 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"
      >
        AI Gallery
      </h1>
      <p class="text-gray-400 text-lg">
        Explore images and videos generated by different AI models
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
            on:click={() => setFilter("all")}
          >
            All Models
          </button>
          <button
            class="px-6 py-3 rounded-xl font-medium transition-all duration-300 {activeFilter ===
            'imagen'
              ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg transform scale-105'
              : 'text-gray-300 hover:text-white hover:bg-gray-700/50'}"
            on:click={() => setFilter("imagen")}
          >
            Imagen
          </button>
          <button
            class="px-6 py-3 rounded-xl font-medium transition-all duration-300 {activeFilter ===
            'stable'
              ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg transform scale-105'
              : 'text-gray-300 hover:text-white hover:bg-gray-700/50'}"
            on:click={() => setFilter("stable")}
          >
            Stable Diffusion
          </button>
          <button
            class="px-6 py-3 rounded-xl font-medium transition-all duration-300 {activeFilter ===
            'runway'
              ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg transform scale-105'
              : 'text-gray-300 hover:text-white hover:bg-gray-700/50'}"
            on:click={() => setFilter("runway")}
          >
            RunwayML
          </button>
        </div>
      </div>
    </div>

    {#if loading}
      <div class="flex justify-center items-center py-20">
        <div class="relative">
          <div
            class="w-12 h-12 border-4 border-gray-600 border-t-blue-500 rounded-full animate-spin"
          ></div>
          <div class="mt-4 text-gray-400 text-center">Loading gallery...</div>
        </div>
      </div>
    {:else if sessions.length === 0}
      <div class="text-center py-20">
        <div class="text-6xl mb-4">🎨</div>
        <div class="text-xl text-gray-400">No content found</div>
        <div class="text-gray-500 mt-2">
          Generate some images or videos to see them here!
        </div>
      </div>
    {:else}
      <!-- Categories -->
      <div class="space-y-12">
        {#each Object.keys(groupedSessions) as category}
          {@const categoryItems = groupedSessions[category]}
          {@const sampleSession = categoryItems[0]}
          {@const colorTheme = getSessionColorTheme(sampleSession)}

          <div class="category-section transition-all duration-500 ease-out">
            <!-- Category Header -->
            <div class="flex items-center mb-6">
              <div class="flex items-center space-x-4">
                <div class="w-4 h-4 rounded-full {colorTheme} shadow-lg"></div>
                <h2 class="text-2xl font-bold text-white">{category}</h2>
                <div
                  class="bg-gray-700/50 backdrop-blur-sm px-3 py-1 rounded-full text-sm text-gray-300"
                >
                  {categoryItems.length}
                  {categoryItems.length === 1 ? "item" : "items"}
                </div>
              </div>
            </div>

            <!-- Items Grid -->
            <div
              class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4"
            >
              {#each categoryItems as session, index}
                {@const imageUrl = getImageUrl(session)}
                {@const absoluteUrl = getAbsoluteUrl(imageUrl)}

                <div
                  class="group cursor-pointer transition-all duration-300 hover:scale-105"
                  style="animation-delay: {index * 50}ms"
                >
                  <div
                    class="relative overflow-hidden rounded-xl bg-gray-800/50 backdrop-blur-sm border border-gray-700/50
                           group-hover:border-gray-500/50 group-hover:shadow-2xl group-hover:shadow-blue-500/20
                           transition-all duration-300"
                    on:click={() => openModal(session)}
                    role="button"
                    tabindex="0"
                    on:keydown={(e) =>
                      (e.key === "Enter" || e.key === " ") &&
                      openModal(session)}
                    aria-label={`Open session ${session.sessionId}`}
                  >
                    <!-- Content -->
                    <div class="aspect-square overflow-hidden">
                      {#if session.type === "video"}
                        <!-- Video thumbnail -->
                        <video
                          src={absoluteUrl}
                          class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                          muted
                          preload="metadata"
                        ></video>
                        <!-- Video play icon -->
                        <div
                          class="absolute inset-0 flex items-center justify-center pointer-events-none"
                        >
                          <div
                            class="bg-black/60 backdrop-blur-sm rounded-full p-3"
                          >
                            <svg
                              class="w-8 h-8 text-white"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                      {:else}
                        <!-- Image -->
                        <img
                          src={absoluteUrl}
                          alt={session.prompt || "Generated image"}
                          class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                          loading="lazy"
                        />
                      {/if}
                    </div>

                    <!-- Overlay -->
                    <div
                      class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent
                                opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    >
                      <div class="absolute bottom-0 left-0 right-0 p-3">
                        <div
                          class="text-white text-sm font-medium truncate mb-1"
                        >
                          {session.type === "image"
                            ? session.prompt
                            : session.promptText}
                        </div>
                        <div class="text-xs text-gray-300 opacity-80">
                          {category}
                        </div>
                      </div>
                    </div>

                    <!-- Type Badge -->
                    <div
                      class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    >
                      <div
                        class="bg-black/70 backdrop-blur-sm px-2 py-1 rounded-lg text-xs text-white"
                      >
                        {session.type === "video" ? "VIDEO" : "IMAGE"}
                      </div>
                    </div>
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

<!-- Enhanced Modal -->
{#if selected}
  {@const colorTheme = getSessionColorTheme(selected)}
  {@const categoryName = getSessionCategoryName(selected)}
  {@const imageUrl = getDetailImageUrl(selected)}
  {@const absoluteUrl = getAbsoluteUrl(imageUrl)}

  <div
    class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4
           transition-all duration-300 ease-out"
    on:click={closeModal}
    role="dialog"
    aria-modal="true"
    tabindex="0"
    on:keydown={(e) => e.key === "Escape" && closeModal()}
    style="animation: fadeIn 0.3s ease-out;"
  >
    <!-- svelte-ignore a11y-click-events-have-key-events -->
    <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
    <div
      class="relative max-w-7xl max-h-[90vh] bg-gray-900/90 backdrop-blur-sm rounded-2xl
             border border-gray-700/50 shadow-2xl overflow-hidden"
      on:click|stopPropagation
      role="document"
      style="animation: modalSlideIn 0.3s ease-out;"
    >
      <!-- Content Container -->
      <div class="relative">
        {#if selected.type === "video"}
          <!-- Video Player -->
          <video
            bind:this={modalVideoEl}
            src={absoluteUrl}
            controls
            class="max-w-full max-h-[80vh] object-contain"
            preload="metadata"
            muted
            playsinline
          >
            <track kind="captions" label="No captions" />
            Your browser does not support the video tag.
          </video>
        {:else}
          <!-- Image -->
          <img
            src={absoluteUrl}
            alt={selected.prompt || "Generated image"}
            class="max-w-full max-h-[80vh] object-contain"
            loading="lazy"
          />
        {/if}

        <!-- Close Button -->
        <button
          class="absolute top-4 right-4 w-10 h-10 bg-black/70 backdrop-blur-sm text-white
                 rounded-full flex items-center justify-center hover:bg-black/90
                 transition-all duration-200 hover:scale-110 border border-gray-600/50"
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

      <!-- Content Info -->
      <div class="p-6 border-t border-gray-700/50">
        <div class="flex items-start justify-between">
          <div class="flex-1 space-y-3">
            <h3 class="text-xl font-bold text-white">
              {selected.type === "image"
                ? selected.prompt
                : selected.promptText}
            </h3>

            <div class="flex items-center space-x-4">
              <div class="flex items-center space-x-2">
                <div class="w-3 h-3 rounded-full {colorTheme}"></div>
                <span class="text-gray-300 text-sm">{categoryName}</span>
              </div>
              <div class="text-xs text-gray-500">
                {selected.type.toUpperCase()}
              </div>
              <div class="text-xs text-gray-500">
                {new Date(selected.timestamp).toLocaleString()}
              </div>
            </div>

            <div class="text-sm text-gray-400">
              <span class="text-gray-300">Session ID:</span>
              <code
                class="text-xs text-blue-400 bg-gray-900 px-2 py-1 rounded ml-1"
              >
                {selected.sessionId}
              </code>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex flex-col space-y-2 ml-6">
            <div class="flex items-center space-x-2">
              <button
                class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg
                       transition-colors duration-200 text-sm font-medium"
                on:click={() => window.open(absoluteUrl, "_blank")}
              >
                View Full Size
              </button>

              {#if selected.type === "image"}
                <button
                  class="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg
                         transition-colors duration-200 text-sm font-medium"
                  on:click={() => {
                    iterateSession(selected);
                    closeModal();
                  }}
                >
                  Iterate
                </button>
              {/if}
            </div>

            <div class="flex items-center space-x-2">
              <button
                class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg
                       transition-colors duration-200 text-sm font-medium"
                on:click={() => {
                  useAsVideoReference(selected);
                  closeModal();
                }}
              >
                Use as Video Ref
              </button>

              <button
                class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg
                       transition-colors duration-200 text-sm font-medium"
                on:click={() => {
                  closeModal();
                  goto("/sessions");
                }}
              >
                View Sessions
              </button>

              <button
                class="px-4 py-2 bg-gray-800/60 hover:bg-gray-800 text-white rounded-lg
                       transition-colors duration-200 text-sm font-medium border border-gray-600/50"
                on:click={() => copySignedUrl(absoluteUrl)}
                aria-label="Copy signed URL"
              >
                {#if copyStatus === "copied"}
                  Copied
                {:else if copyStatus === "error"}
                  Error
                {:else}
                  Share (15min)
                {/if}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes modalSlideIn {
    from {
      opacity: 0;
      transform: scale(0.9) translateY(20px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

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

  .grid > * {
    animation: fadeInScale 0.6s ease-out forwards;
    opacity: 0;
  }

  @keyframes fadeInScale {
    from {
      opacity: 0;
      transform: scale(0.8) translateY(20px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }
</style>
