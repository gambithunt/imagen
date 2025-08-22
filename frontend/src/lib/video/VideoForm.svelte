<script lang="ts">
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();

  export let models = ["gen3a_turbo", "gen3a_aleph"];

  let promptText = "";
  let model = models[0];
  let ratio = "1280:768";
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
      <label for="ratio" class="block mb-2">Ratio</label>
      <select
        id="ratio"
        bind:value={ratio}
        class="w-full p-2 bg-gray-800 rounded"
      >
        <option value="1280:768">1280:768 (Landscape)</option>
        <option value="768:1280">768:1280 (Portrait)</option>
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
