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
      }
    } catch (error) {
      console.error("Failed to load session detail:", error);
    }
  }

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
              {#if selectedSession.inputImagePath}
                <div>
                  <span class="text-gray-400">Input Image:</span>
                  <div class="text-white">{selectedSession.inputImagePath}</div>
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
                <!-- svelte-ignore a11y-media-has-caption -->
                <video
                  src={selectedSession.videoUrl}
                  controls
                  class="max-w-full max-h-96 object-contain rounded-lg mx-auto"
                  preload="metadata"
                >
                  Your browser does not support the video tag.
                </video>
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
