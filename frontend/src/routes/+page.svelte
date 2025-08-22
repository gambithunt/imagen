<script lang="ts">
  import Nav from "$lib/Nav.svelte";
  import { generateImageFilename } from "$lib/index";
  import { onMount } from "svelte";
  import { page } from "$app/stores";

  // Map model/api to output directory
  function getOutputDir(api: string, model: string): string {
    if (api === "Google Imagen") {
      if (model === "Imagen 4 Fast") return "/generated/imagen/fast";
      if (model === "Imagen 4") return "/generated/imagen/4";
      if (model === "Imagen 4 Ultra") return "/generated/imagen/4_ultra";
    } else if (api === "Stable Diffusion") {
      if (model === "SD XL") return "/generated/sd/xl";
      if (model === "Stable Core") return "/generated/sd/core";
      if (model === "Stable Ultra") return "/generated/sd/ultra";
    }
    return "/generated/other";
  }
  let api = "Google Imagen";
  let model = "Imagen 4 Fast";
  const imagenModels = ["Imagen 4 Fast", "Imagen 4", "Imagen 4 Ultra"];
  const sdModels = ["SD XL", "Stable Core", "Stable Ultra"];
  $: modelOptions = api === "Stable Diffusion" ? sdModels : imagenModels;
  $: if (api === "Stable Diffusion" && !sdModels.includes(model)) {
    model = sdModels[0];
  } else if (api === "Google Imagen" && !imagenModels.includes(model)) {
    model = imagenModels[0];
  }
  let prompt = "";
  let numberOfImages = 1;
  let sampleImageSize = "1k";
  let aspectRatio = "1:1";
  let personGeneration = "dont_allow";
  let sdImageFormat = "png";
  let sdStrength = 0.5;
  let sdNegativePrompt = "";
  let sdAspectRatio = "16:9";
  let sdSeed = Math.floor(Math.random() * 4294967296).toString();
  let sdStylePreset = "photographic";
  let sdResolution = "1024x1024";
  let sdSampler = "";
  let sdSamples = 1;
  let sdSteps = 30;

  // Handle URL parameters for iteration functionality
  onMount(() => {
    const unsubscribe = page.subscribe(($page) => {
      const params = $page.url.searchParams;

      // Set parameters from URL
      if (params.get("api")) api = params.get("api")!;
      if (params.get("model")) model = params.get("model")!;
      if (params.get("prompt")) prompt = params.get("prompt")!;
      if (params.get("numberOfImages"))
        numberOfImages = parseInt(params.get("numberOfImages")!) || 1;
      if (params.get("aspectRatio")) aspectRatio = params.get("aspectRatio")!;
      if (params.get("negativePrompt"))
        sdNegativePrompt = params.get("negativePrompt")!;
      if (params.get("seed")) sdSeed = params.get("seed")!;
      if (params.get("stylePreset")) sdStylePreset = params.get("stylePreset")!;
    });

    return () => unsubscribe();
  });
  const sdFormats = ["png", "jpg", "webp"];
  const sdUltraAspectRatios = [
    "16:9",
    "1:1",
    "21:9",
    "2:3",
    "3:2",
    "4:5",
    "5:4",
    "9:16",
    "9:21",
  ];
  const sdXLResolutions = [
    "1024x1024",
    "1152x896",
    "896x1152",
    "1216x832",
    "1344x768",
    "768x1344",
    "1536x640",
    "640x1536",
  ];
  const sdXLSamplers = [
    "",
    "DDIM",
    "DDPM",
    "K_DPMPP_2M",
    "K_DPMPP_2S_ANCESTRAL",
    "K_DPM_2",
    "K_DPM_2_ANCESTRAL",
    "K_EULER",
    "K_EULER_ANCESTRAL",
    "K_HEUN",
    "K_LMS",
  ];
  const sdStylePresets = [
    "3d-model",
    "analog-film",
    "anime",
    "cinematic",
    "comic-book",
    "digital-art",
    "enhance",
    "fantasy-art",
    "isometric",
    "line-art",
    "low-poly",
    "modeling-compound",
    "neon-punk",
    "origami",
    "photographic",
    "pixel-art",
    "tile-texture",
  ];
  let loading = false;
  let generatedImage: string | null = null;
  let sdUltraImage: File | null = null;
  let sessionId: string | null = null;

  async function handleSubmit() {
    loading = true;
    generatedImage = null;
    sessionId = null;
    let response, data;
    if (api === "Google Imagen") {
      response = await fetch("http://localhost:3000/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api,
          model,
          prompt,
          numberOfImages,
          sampleImageSize,
          aspectRatio,
          personGeneration,
        }),
      });
      data = await response.json();
      generatedImage = data.imageUrl;
      sessionId = data.sessionId || null;
    } else if (api === "Stable Diffusion") {
      if (model === "Stable Core") {
        const formData = new FormData();
        formData.append("prompt", prompt);
        formData.append("aspect_ratio", sdAspectRatio);
        if (sdNegativePrompt)
          formData.append("negative_prompt", sdNegativePrompt);
        if (sdSeed) formData.append("seed", sdSeed);
        if (sdStylePreset) {
          formData.append("style_preset", sdStylePreset);
        } else {
          formData.append("style_preset", "photographic");
        }
        if (sdImageFormat) formData.append("output_format", sdImageFormat);
        response = await fetch("http://localhost:3000/api/sd/core", {
          method: "POST",
          body: formData,
        });
        data = await response.json();
        if (data.image) {
          generatedImage = `data:image/${sdImageFormat};base64,${data.image}`;
        } else {
          generatedImage = null;
        }
        sessionId = data.sessionId || null;
      } else if (model === "Stable Ultra") {
        const formData = new FormData();
        formData.append("prompt", prompt);
        formData.append("aspect_ratio", sdAspectRatio);
        if (sdNegativePrompt)
          formData.append("negative_prompt", sdNegativePrompt);
        if (sdSeed) formData.append("seed", sdSeed);
        if (sdStylePreset) {
          formData.append("style_preset", sdStylePreset);
        } else {
          formData.append("style_preset", "photographic");
        }
        if (sdImageFormat) formData.append("output_format", sdImageFormat);
        if (sdUltraImage) {
          formData.append("image", sdUltraImage);
          if (sdStrength) formData.append("strength", sdStrength.toString());
        }
        response = await fetch("http://localhost:3000/api/sd/ultra", {
          method: "POST",
          body: formData,
        });
        data = await response.json();
        if (data.image) {
          generatedImage = `data:image/${sdImageFormat};base64,${data.image}`;
        } else {
          generatedImage = null;
        }
        sessionId = data.sessionId || null;
      } else if (model === "SD XL") {
        let [width, height] = sdResolution.split("x").map(Number);
        const payload = {
          text_prompts: [
            {
              text: prompt,
              weight: 1.0,
            },
          ],
          width,
          height,
          cfg_scale: 7,
          steps: sdSteps,
          samples: sdSamples,
          style_preset: sdStylePreset || "photographic",
        };
        if (sdSampler) (payload as any).sampler = sdSampler;
        if (sdSeed) (payload as any).seed = Number(sdSeed);
        response = await fetch("http://localhost:3000/api/sd/xl", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        data = await response.json();
        if (data.images && data.images.length > 0) {
          generatedImage = `data:image/png;base64,${data.images[0]}`;
        } else {
          generatedImage = null;
        }
        sessionId = data.sessionId || null;
      }
    }
    loading = false;
  }

  function handleSave() {
    if (!generatedImage) return;
    const link = document.createElement("a");
    link.href = generatedImage;
    const ext = generatedImage.split(".").pop()?.split("?")[0] || "png";
    link.download = `generated-image.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
</script>

<div class="bg-gray-900 min-h-screen text-white">
  <div class="container mx-auto p-8">
    <h1 class="text-4xl font-bold mb-8">Image Generator</h1>

    <!-- API Selection -->
    <div class="mb-8">
      <label for="api" class="block mb-2">API</label>
      <select id="api" class="w-full p-2 bg-gray-800 rounded" bind:value={api}>
        <option>Google Imagen</option>
        <option>Stable Diffusion</option>
      </select>
    </div>

    <!-- Model Selection -->
    <div class="mb-8">
      <label for="model" class="block mb-2">Model</label>
      <select
        id="model"
        class="w-full p-2 bg-gray-800 rounded"
        bind:value={model}
      >
        {#each modelOptions as option}
          <option>{option}</option>
        {/each}
      </select>
    </div>

    <!-- Prompt Input -->
    <div class="mb-8">
      <label for="prompt" class="block mb-2">Prompt</label>
      <textarea
        id="prompt"
        class="w-full p-2 bg-gray-800 rounded"
        rows="4"
        bind:value={prompt}
      ></textarea>
    </div>

    <!-- Options -->
    {#key model}
      {#if api === "Google Imagen"}
        <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div>
            <label for="numberOfImages" class="block mb-2"
              >Number of Images</label
            >
            <input
              type="number"
              id="numberOfImages"
              class="w-full p-2 bg-gray-800 rounded"
              bind:value={numberOfImages}
            />
          </div>
          <div>
            <label for="sampleImageSize" class="block mb-2">Image Size</label>
            <select
              id="sampleImageSize"
              class="w-full p-2 bg-gray-800 rounded"
              bind:value={sampleImageSize}
            >
              <option>1k</option>
              <option>2k</option>
            </select>
          </div>
          <div>
            <label for="aspectRatio" class="block mb-2">Aspect Ratio</label>
            <select
              id="aspectRatio"
              class="w-full p-2 bg-gray-800 rounded"
              bind:value={aspectRatio}
            >
              <option>1:1</option>
              <option>3:4</option>
              <option>4:3</option>
              <option>9:16</option>
              <option>16:9</option>
            </select>
          </div>
          <div>
            <label for="personGeneration" class="block mb-2"
              >Person Generation</label
            >
            <select
              id="personGeneration"
              class="w-full p-2 bg-gray-800 rounded"
              bind:value={personGeneration}
            >
              <option>dont_allow</option>
              <option>allow_adult</option>
              <option>allow_all</option>
            </select>
          </div>
        </div>
      {:else if model === "Stable Ultra"}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div>
            <label for="sdImageFormat" class="block mb-2">Image Format</label>
            <select
              id="sdImageFormat"
              class="w-full p-2 bg-gray-800 rounded"
              bind:value={sdImageFormat}
            >
              {#each sdFormats as fmt}
                <option>{fmt}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="sdUltraImage" class="block mb-2"
              >Start from Image (optional)</label
            >
            <input
              id="sdUltraImage"
              type="file"
              accept="image/*"
              class="w-full p-2 bg-gray-800 rounded"
              on:change={(e) => (sdUltraImage = e.target.files[0])}
            />
          </div>
          <div>
            <label for="sdStrength" class="block mb-2"
              >Strength: {sdStrength}</label
            >
            <input
              type="range"
              id="sdStrength"
              min="0"
              max="1"
              step="0.01"
              bind:value={sdStrength}
              class="w-full"
              disabled={!sdUltraImage}
            />
          </div>
          <div class="md:col-span-2">
            <label for="sdNegativePrompt" class="block mb-2"
              >Negative Prompt</label
            >
            <textarea
              id="sdNegativePrompt"
              class="w-full p-2 bg-gray-800 rounded"
              rows="2"
              bind:value={sdNegativePrompt}
            ></textarea>
          </div>
          <div>
            <label for="sdAspectRatio" class="block mb-2">Aspect Ratio</label>
            <select
              id="sdAspectRatio"
              class="w-full p-2 bg-gray-800 rounded"
              bind:value={sdAspectRatio}
            >
              {#each sdUltraAspectRatios as ar}
                <option>{ar}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="sdSeed" class="block mb-2">Seed</label>
            <input
              id="sdSeed"
              class="w-full p-2 bg-gray-800 rounded"
              type="text"
              bind:value={sdSeed}
            />
          </div>
          <div class="md:col-span-2">
            <label for="sdStylePreset" class="block mb-2">Style Preset</label>
            <select
              id="sdStylePreset"
              class="w-full p-2 bg-gray-800 rounded"
              bind:value={sdStylePreset}
            >
              {#each sdStylePresets as style}
                <option>{style}</option>
              {/each}
            </select>
          </div>
        </div>
      {:else if model === "Stable Core"}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div>
            <label for="sdImageFormat" class="block mb-2">Output Format</label>
            <select
              id="sdImageFormat"
              class="w-full p-2 bg-gray-800 rounded"
              bind:value={sdImageFormat}
            >
              {#each sdFormats as fmt}
                <option>{fmt}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="sdAspectRatio" class="block mb-2">Aspect Ratio</label>
            <select
              id="sdAspectRatio"
              class="w-full p-2 bg-gray-800 rounded"
              bind:value={sdAspectRatio}
            >
              {#each sdUltraAspectRatios as ar}
                <option>{ar}</option>
              {/each}
            </select>
          </div>
          <div class="md:col-span-2">
            <label for="sdNegativePrompt" class="block mb-2"
              >Negative Prompt</label
            >
            <textarea
              id="sdNegativePrompt"
              class="w-full p-2 bg-gray-800 rounded"
              rows="2"
              bind:value={sdNegativePrompt}
            ></textarea>
          </div>
          <div>
            <label for="sdSeed" class="block mb-2">Seed</label>
            <input
              id="sdSeed"
              class="w-full p-2 bg-gray-800 rounded"
              type="text"
              bind:value={sdSeed}
            />
          </div>
          <div class="md:col-span-2">
            <label for="sdStylePreset" class="block mb-2">Style Preset</label>
            <select
              id="sdStylePreset"
              class="w-full p-2 bg-gray-800 rounded"
              bind:value={sdStylePreset}
            >
              {#each sdStylePresets as style}
                <option>{style}</option>
              {/each}
            </select>
          </div>
        </div>
      {:else if model === "SD XL"}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div>
            <label for="sdResolution" class="block mb-2">Resolution</label>
            <select
              id="sdResolution"
              class="w-full p-2 bg-gray-800 rounded"
              bind:value={sdResolution}
            >
              {#each sdXLResolutions as res}
                <option>{res}</option>
              {/each}
            </select>
          </div>
          <div>
            <label for="sdSampler" class="block mb-2">Sampler</label>
            <select
              id="sdSampler"
              class="w-full p-2 bg-gray-800 rounded"
              bind:value={sdSampler}
            >
              {#each sdXLSamplers as sampler}
                <option value={sampler}
                  >{sampler === "" ? "None chosen" : sampler}</option
                >
              {/each}
            </select>
          </div>
          <div>
            <label for="sdSamples" class="block mb-2">Samples</label>
            <input
              id="sdSamples"
              class="w-full p-2 bg-gray-800 rounded"
              type="number"
              min="1"
              max="10"
              bind:value={sdSamples}
            />
          </div>
          <div>
            <label for="sdSeed" class="block mb-2">Seed</label>
            <input
              id="sdSeed"
              class="w-full p-2 bg-gray-800 rounded"
              type="number"
              min="0"
              max="4294967295"
              bind:value={sdSeed}
            />
          </div>
          <div>
            <label for="sdSteps" class="block mb-2">Steps: {sdSteps}</label>
            <input
              type="range"
              id="sdSteps"
              min="10"
              max="50"
              step="1"
              bind:value={sdSteps}
              class="w-full"
            />
          </div>
          <div class="md:col-span-2">
            <label for="sdStylePreset" class="block mb-2">Style Preset</label>
            <select
              id="sdStylePreset"
              class="w-full p-2 bg-gray-800 rounded"
              bind:value={sdStylePreset}
            >
              {#each sdStylePresets as style}
                <option>{style}</option>
              {/each}
            </select>
          </div>
        </div>
      {/if}
    {/key}

    <!-- Submit Button -->
    <button
      on:click={handleSubmit}
      class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full w-full transition-all duration-300 ease-in-out transform hover:scale-105 shadow-lg shadow-blue-500/50 {loading
        ? 'animate-pulse bg-yellow-500'
        : ''}"
    >
      {#if loading}
        Generating...
      {:else}
        Generate
      {/if}
    </button>

    <!-- Image Display -->
    {#if generatedImage}
      <div class="mt-8">
        <img
          src={generatedImage}
          alt="Generated Image"
          class="w-full rounded-lg shadow-lg"
        />
        <p class="mt-4 text-gray-400">{prompt}</p>
        {#if sessionId}
          <div class="mt-2 p-3 bg-gray-800 rounded-lg border border-gray-700">
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
        <button
          on:click={handleSave}
          class="mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-full w-full transition-all duration-300 ease-in-out transform hover:scale-105 shadow-lg shadow-green-500/50"
        >
          Save Image
        </button>
      </div>
    {/if}
  </div>
</div>
