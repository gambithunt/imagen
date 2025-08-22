---
applyTo: "*.*"
---

How to use
Please invoke this endpoint with a POST request.

The headers of the request must include an API key in the authorization field. The body of the request must be multipart/form-data. The accept header should be set to one of the following:

image/\* to receive the image in the format specified by the output_format parameter.
application/json to receive the image in the format specified by the output_format parameter, but encoded to base64 in a JSON response.
The only required parameter is the prompt field, which should contain the text prompt for the image generation.

The body of the request should include:

prompt - text to generate the image from
The body may optionally include:

image - the image to use as the starting point for the generation
strength - controls how much influence the image parameter has on the output image
aspect_ratio - the aspect ratio of the output image
negative_prompt - keywords of what you do not wish to see in the output image
seed - the randomness seed to use for the generation
output_format - the format of the output image

# options

Request Body schema: multipart/form-data
prompt
required
string [ 1 .. 10000 ] characters
What you wish to see in the output image. A strong, descriptive prompt that clearly defines elements, colors, and subjects will lead to better results.

To control the weight of a given word use the format (word:weight), where word is the word you'd like to control the weight of and weight is a value between 0 and 1. For example: The sky was a crisp (blue:0.3) and (green:0.8) would convey a sky that was blue and green, but more green than blue.

negative_prompt
string <= 10000 characters
A blurb of text describing what you do not wish to see in the output image. This is an advanced feature.

aspect_ratio
string
Default: 1:1
Enum: 16:9 1:1 21:9 2:3 3:2 4:5 5:4 9:16 9:21
Controls the aspect ratio of the generated image.

seed
number [ 0 .. 4294967294 ]
Default: 0
A specific value that is used to guide the 'randomness' of the generation. (Omit this parameter or pass 0 to use a random seed.)

output_format
string
Default: png
Enum: jpeg png webp
Dictates the content-type of the generated image.

image
string <binary>
The image to use as the starting point for the generation.

Important: The strength parameter is required when image is provided.

Supported Formats:

jpeg
png
webp
Validation Rules:

Width must be between 64 and 16,384 pixels
Height must be between 64 and 16,384 pixels
Total pixel count must be at least 4,096 pixels
style_preset
string
Enum: 3d-model analog-film anime cinematic comic-book digital-art enhance fantasy-art isometric line-art low-poly modeling-compound neon-punk origami photographic pixel-art tile-texture
Guides the image model towards a particular style.

strength
number [ 0 .. 1 ]
Sometimes referred to as denoising, this parameter controls how much influence the image parameter has on the generated image. A value of 0 would yield an image that is identical to the input. A value of 1 would be as if you passed in no image at all.

Important: This parameter is required when image is provided.

# example

```
import fs from "node:fs";
import axios from "axios";
import FormData from "form-data";

const payload = {
  prompt: "Lighthouse on a cliff overlooking the ocean",
  output_format: "webp"
};

const response = await axios.postForm(
  `https://api.stability.ai/v2beta/stable-image/generate/ultra`,
  axios.toFormData(payload, new FormData()),
  {
    validateStatus: undefined,
    responseType: "arraybuffer",
    headers: {
      Authorization: `Bearer sk-MYAPIKEY`,
      Accept: "image/*"
    },
  },
);

if(response.status === 200) {
  fs.writeFileSync("./lighthouse.webp", Buffer.from(response.data));
} else {
  throw new Error(`${response.status}: ${response.data.toString()}`);
}
```
