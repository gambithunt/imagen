Request Body schema: application/json
required
text_prompts
required
Array of objects (TextPrompts) non-empty
An array of text prompts to use for generation.

Given a text prompt with the text A lighthouse on a cliff and a weight of 0.5, it would be represented as:

"text_prompts": [
{
"text": "A lighthouse on a cliff",
"weight": 0.5
}
]
height
integer (DiffuseImageHeight) multiple of 64 >= 128
Default: 512
Height of the image to generate, in pixels, in an increment divisible by 64.

width
integer (DiffuseImageWidth) multiple of 64 >= 128
Default: 512
Width of the image to generate, in pixels, in an increment divisible by 64.

cfg_scale
number (CfgScale) [ 0 .. 35 ]
Default: 7
How strictly the diffusion process adheres to the prompt text (higher values keep your image closer to your prompt)

clip_guidance_preset
string (ClipGuidancePreset)
Default: NONE
Enum: FAST_BLUE FAST_GREEN NONE SIMPLE SLOW SLOWER SLOWEST
sampler
string (Sampler)
Enum: DDIM DDPM K_DPMPP_2M K_DPMPP_2S_ANCESTRAL K_DPM_2 K_DPM_2_ANCESTRAL K_EULER K_EULER_ANCESTRAL K_HEUN K_LMS
Which sampler to use for the diffusion process. If this value is omitted we'll automatically select an appropriate sampler for you.

samples
integer (Samples) [ 1 .. 10 ]
Default: 1
Number of images to generate

seed
integer (Seed) [ 0 .. 4294967295 ]
Default: 0
Random noise seed (omit this option or use 0 for a random seed)

steps
integer (Steps) [ 10 .. 50 ]
Default: 30
Number of diffusion steps to run.

style_preset
string (StylePreset)
Enum: 3d-model analog-film anime cinematic comic-book digital-art enhance fantasy-art isometric line-art low-poly modeling-compound neon-punk origami photographic pixel-art tile-texture
Pass in a style preset to guide the image model towards a particular style. This list of style presets is subject to change.

extras
object (Extras)
Extra parameters passed to the engine. These parameters are used for in-development or experimental features and may change without warning, so please use with caution.

# example code

```
import fetch from 'node-fetch'
import fs from 'node:fs'

const engineId = 'stable-diffusion-xl-1024-v1-0'
const apiHost = process.env.API_HOST ?? 'https://api.stability.ai'
const apiKey = process.env.STABILITY_API_KEY

if (!apiKey) throw new Error('Missing Stability API key.')

const response = await fetch(
  `${apiHost}/v1/generation/${engineId}/text-to-image`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      text_prompts: [
        {
          text: 'A lighthouse on a cliff',
        },
      ],
      cfg_scale: 7,
      height: 1024,
      width: 1024,
      steps: 30,
      samples: 1,
    }),
  }
)

if (!response.ok) {
  throw new Error(`Non-200 response: ${await response.text()}`)
}

interface GenerationResponse {
  artifacts: Array<{
    base64: string
    seed: number
    finishReason: string
  }>
}

const responseJSON = (await response.json()) as GenerationResponse

responseJSON.artifacts.forEach((image, index) => {
  fs.writeFileSync(
    `./out/v1_txt2img_${index}.png`,
    Buffer.from(image.base64, 'base64')
  )
})

```
