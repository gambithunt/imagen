# models

gen4_turbo
gen4_aleph

# gen4_turbo

720p videos in 5s or 10s duration in the following resolutions
1280:720
720:1280
1104:832
832:1104
960:960
1584:672

POST
/v1/image_to_video

seed
integer
[ 0 .. 4294967295 ]

duration
integer
Default:
10
Accepted values:
5
10

# gen4_aleph

Gen-3 Alpha Turbo outputs

720p videos in 5s or 10s duration in the following resolutions
1280:768
768:1280

Generate a video from a video
POST
/v1/video_to_video
This endpoint will start a new task to generate a video from a video.

Authentication
Authorization
Use the HTTP Authorization header with the Bearer scheme along with an API key.

Headers
X-Runway-Version
Required
string
This field must be set to the exact value 2024-11-06.

Request body
videoUri
Required
string
<uri>
A HTTPS URL pointing to a video or a data URI containing a video. See our docs on video inputs for more information.

promptText
Required
string
<= 1000 characters
A non-empty string up to 1000 characters (measured in UTF-16 code units). This should describe in detail what should appear in the output.

model
Required
string
The model variant to use.

This field must be set to the exact value gen4_aleph.

ratio
Required
string
Accepted values:
"1280:720"
"720:1280"
"1104:832"
"960:960"
"832:1104"
"1584:672"
"848:480"
"640:480"
The resolution of the output video.

seed
integer
[ 0 .. 4294967295 ]
If unspecified, a random number is chosen. Varying the seed integer is a way to get different results for the same other request parameters. Using the same seed integer for an identical request will produce similar results.

references
Array of
objects
Passing an image reference allows the model to emulate the style or content of the reference in the output.

type
Required
string
Accepted value:
"image"
uri
Required
string
<uri>
A HTTPS URL pointing to an image or a data URI containing an image. See our docs on image inputs for more information.

contentModeration
object
Settings that affect the behavior of the content moderation system.

publicFigureThreshold
string
Default:
"auto"
Accepted values:
"auto"
"low"
When set to low, the content moderation system will be less strict about preventing generations that include recognizable public figures.

## Upscale a video

POST
/v1/video_upscale
This endpoint will start a new task to upscale a video. Videos will be upscaled by a factor of 4X, capped at a maximum of 4096px along each side.

Authentication
Authorization
Use the HTTP Authorization header with the Bearer scheme along with an API key.

Headers
X-Runway-Version
Required
string
This field must be set to the exact value 2024-11-06.

Request body
videoUri
Required
string
<uri>
A HTTPS URL pointing to a video or a data URI containing a video. The video must be less than 4096px on each side. The video duration may not exceed 40 seconds. See our docs on video inputs for more information.

model
Required
string
The model variant to use.

This field must be set to the exact value upscale_v1.

## Control a character

POST
/v1/character_performance
This endpoint will start a new task to control a character's facial expressions and body movements using a reference video.

Authentication
Authorization
Use the HTTP Authorization header with the Bearer scheme along with an API key.

Headers
X-Runway-Version
Required
string
This field must be set to the exact value 2024-11-06.

Request body
character
Required
object
The character to control. You can either provide a video or an image. A visually recognizable face must be visible and stay within the frame.

One of the following shapes:
CharacterVideo
object
A video of your character. In the output, the character will use the reference video performance in its original animated environment and some of the character's own movements.

type
Required
string
This field must be set to the exact value video.

uri
Required
string
<uri>
A HTTPS URL pointing to a video or a data URI containing a video of your character. See our docs on video inputs for more information.

CharacterImage
object
An image of your character. In the output, the character will use the reference video performance in its original static environment.

type
Required
string
This field must be set to the exact value image.

uri
Required
string
<uri>
A HTTPS URL pointing to an image or a data URI containing an image of your character. See our docs on image inputs for more information.

reference
Required
object
type
Required
string
This field must be set to the exact value video.

uri
Required
string
<uri>
A HTTPS URL pointing to a video or a data URI containing a video of a person performing in the manner that you would like your character to perform. The video must be between 3 and 30 seconds in duration. See our docs on video inputs for more information.

model
Required
string
The model variant to use.

This field must be set to the exact value act_two.

ratio
Required
string
Accepted values:
"1280:720"
"720:1280"
"960:960"
"1104:832"
"832:1104"
"1584:672"
The resolution of the output video.

bodyControl
boolean
Default:
true
A boolean indicating whether to enable body control. When enabled, non-facial movements and gestures will be applied to the character in addition to facial expressions.

expressionIntensity
integer
[ 1 .. 5 ]
Default:
3
An integer between 1 and 5 (inclusive). A larger value increases the intensity of the character's expression.

seed
integer
[ 0 .. 4294967295 ]
If unspecified, a random number is chosen. Varying the seed integer is a way to get different results for the same other request parameters. Using the same seed integer for an identical request will produce similar results.

contentModeration
object
Settings that affect the behavior of the content moderation system.

publicFigureThreshold
string
Default:
"auto"
Accepted values:
"auto"
"low"
When set to low, the content moderation system will be less strict about preventing generations that include recognizable public figures.

## Cancel or delete a task

DELETE
/v1/tasks/{id}
Tasks that are running, pending, or throttled can be canceled by invoking this method. Invoking this method for other tasks will delete them.

The output data associated with a deleted task will be deleted from persistent storage in accordance with our data retention policy. Aborted and deleted tasks will not be able to be fetched again in the future.

Authentication
Authorization
Use the HTTP Authorization header with the Bearer scheme along with an API key.

Path parameters
id
Required
string
<uuid>
The ID of a previously-submitted task that has not been canceled or deleted.

Headers
X-Runway-Version
Required
string
This field must be set to the exact value 2024-11-06.

Responses

# general api reference and usage

`npm install --save @runwayml/sdk`

```
import fs from 'node:fs';
import RunwayML, { TaskFailedError } from '@runwayml/sdk';

const client = new RunwayML();

// Read the image file into a Buffer. Replace `example.png` with your own image path.
const imageBuffer = fs.readFileSync('example.png');

// Convert to a data URI. We're using `image/png` here because the input is a PNG.
const dataUri = `data:image/png;base64,${imageBuffer.toString('base64')}`;

// Create a new image-to-video task using the "gen4_turbo" model
try {
  const imageToVideo = await client.imageToVideo
    .create({
      model: 'gen4_turbo',
      // Point this at your own image file
      promptImage: dataUri,
      promptText: 'Generate a video',
      ratio: '1280:720',
      duration: 5,
    })
    .waitForTaskOutput();

  console.log('Task complete:', task);
} catch (error) {
  if (error instanceof TaskFailedError) {
    console.error('The video failed to generate.');
    console.error(error.taskDetails);
  } else {
    console.error(error);
  }
}
```
