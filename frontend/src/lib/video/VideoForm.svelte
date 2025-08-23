<script lang="ts">
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();

  // Available models for the video creation UI. Removed `gen3a_aleph` and
  // added `gen4_turbo` and `gen4_aleph` per product update.
  export let models = ["gen3a_turbo", "gen4_turbo", "gen4_aleph"];

  // Define a modular mapping from model -> allowed resolutions (as strings
  // in the form `WIDTH:HEIGHT`). This makes it easy to add new models and
  // their supported resolutions in the future.
  const MODEL_RESOLUTIONS: Record<string, string[]> = {
    // gen4 family uses the existing Runway defaults (landscape & portrait)
    gen4_turbo: ["1280:720", "720:1280"],
    gen4_aleph: ["1280:720", "720:1280"],
    // gen3a_turbo supports 768:1280 (portrait) and 1280:768 (landscape)
    gen3a_turbo: ["768:1280", "1280:768"],
  };

  let promptText = "";
  let model = models[0];
  // Default to the first supported resolution for the selected model (if
  // available), otherwise fall back to a sensible default.
  const FALLBACK_RESOLUTIONS = ["1280:720", "720:1280"];
  let ratio = MODEL_RESOLUTIONS[model]?.[0] ?? FALLBACK_RESOLUTIONS[0];

  // Helper to format option labels e.g. "1280:720 (Landscape)"
  function formatResolutionLabel(res: string) {
    const parts = res.split(":").map(Number);
    if (parts.length !== 2 || parts.some(Number.isNaN)) return res;
    const [w, h] = parts;
    const orientation =
      w > h ? "(Landscape)" : w < h ? "(Portrait)" : "(Square)";
    return `${res} ${orientation}`;
  }

  // Ensure ratio remains valid when the model changes. If the current ratio
  // is not in the new model's allowed list, set it to the first allowed
  // resolution for that model.
  $: {
    const allowed = MODEL_RESOLUTIONS[model] ?? FALLBACK_RESOLUTIONS;
    if (!allowed.includes(ratio)) {
      ratio = allowed[0];
    }
  }
  let duration = 5;
  let seed: number | "" = "";
  let imageFile: File | null = null;

  function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    imageFile = input.files?.[0] ?? null;
    dispatch("filechange", { file: imageFile });
  }

  function submit(e: Event) {
    e.preventDefault();
    dispatch("submit", {
      promptText,
      model,
      ratio,
      duration,
      seed: seed === "" ? undefined : Number(seed),
      imageFile,
    });
  }
</script>

<form class="space-y-4" on:submit|preventDefault={submit}>
  <div>
    <label for="model" class="block mb-2">Model</label>
    <select
      id="model"
      bind:value={model}
      class="w-full p-2 bg-gray-800 rounded"
    >
      {#each models as m}
        <option value={m}>{m}</option>
      {/each}
    </select>
  </div>

  <div>
    <label for="promptText" class="block mb-2">Prompt</label>
    <textarea
      id="promptText"
      bind:value={promptText}
      rows={3}
      class="w-full p-2 bg-gray-800 rounded"
      required
    ></textarea>
  </div>

  <div class="grid grid-cols-2 gap-4">
    <div>
      <label for="ratio" class="block mb-2">Resolution</label>
      <select
        id="ratio"
        bind:value={ratio}
        class="w-full p-2 bg-gray-800 rounded"
      >
        {#each MODEL_RESOLUTIONS[model] ?? FALLBACK_RESOLUTIONS as res}
          <option value={res}>{formatResolutionLabel(res)}</option>
        {/each}
      </select>
    </div>
    <div>
      <label for="duration" class="block mb-2">Duration (s)</label>
      <select
        id="duration"
        bind:value={duration}
        class="w-full p-2 bg-gray-800 rounded"
      >
        <option value={5}>5</option>
        <option value={10}>10</option>
      </select>
    </div>
  </div>

  <div class="grid grid-cols-2 gap-4">
    <div>
      <label for="seed" class="block mb-2">Seed (optional)</label>
      <input
        id="seed"
        type="number"
        bind:value={seed}
        min={0}
        class="w-full p-2 bg-gray-800 rounded"
      />
    </div>
    <div>
      <label for="image" class="block mb-2">Image</label>
      <input
        id="image"
        type="file"
        accept="image/*"
        on:change={onFileChange}
        class="w-full p-2 bg-gray-800 rounded"
      />
    </div>
  </div>

  <div class="space-y-2">
    <button
      class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full w-full transition-all duration-300 transform hover:scale-105 shadow-lg"
      type="submit">Create Video</button
    >
    <button
      type="button"
      class="w-full bg-gray-800 text-gray-200 py-2 px-4 rounded"
      on:click={() => dispatch("reset")}>Reset</button
    >
  </div>
</form>

<style>
  /* small local overrides if needed */
</style>
