/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {GoogleGenAI, Modality} from '@google/genai'
import pLimit from 'p-limit'

const timeoutMs = 123_333
const maxRetries = 5
const baseDelay = 1_233
const ai = new GoogleGenAI({apiKey: process.env.API_KEY})

const safetySettings = [
  'HARM_CATEGORY_HATE_SPEECH',
  'HARM_CATEGORY_SEXUALLY_EXPLICIT',
  'HARM_CATEGORY_DANGEROUS_CONTENT',
  'HARM_CATEGORY_HARASSMENT'
].map(category => ({category, threshold: 'BLOCK_NONE'}))

const generateImageFn = async ({model, prompt, inputFile, signal}) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs)
      )

      const parts = [{text: prompt}]
      if (inputFile) {
        const [meta, data] = inputFile.split(',')
        const mimeType = (meta.match(/:(.*?);/) || [])[1] || 'image/jpeg'
        parts.push({
          inlineData: {
            data,
            mimeType
          }
        })
      }

      const modelPromise = ai.models.generateContent(
        {
          model,
          config: {responseModalities: [Modality.TEXT, Modality.IMAGE]},
          contents: [{role: 'user', parts}],
          safetySettings
        },
        {signal}
      )

      const response = await Promise.race([modelPromise, timeoutPromise])

      if (!response.candidates || response.candidates.length === 0) {
        throw new Error('No candidates in response')
      }

      const inlineDataPart = response.candidates[0].content.parts.find(
        p => p.inlineData
      )
      if (!inlineDataPart) {
        throw new Error('No inline data found in response')
      }

      return 'data:image/png;base64,' + inlineDataPart.inlineData.data
    } catch (error) {
      if (signal?.aborted || error.name === 'AbortError') {
        return
      }

      if (attempt === maxRetries - 1) {
        throw error
      }

      const delay = baseDelay * 2 ** attempt
      await new Promise(res => setTimeout(res, delay))
      console.warn(
        `Attempt ${attempt + 1} failed, retrying after ${delay}ms...`
      )
    }
  }
}

const generateVideoFn = async ({prompt, inputFile, signal}) => {
  const [meta, data] = inputFile.split(',')
  const mimeType = (meta.match(/:(.*?);/) || [])[1] || 'image/jpeg'

  let operation = await ai.models.generateVideos({
    model: 'veo-2.0-generate-001',
    prompt,
    image: {
      imageBytes: data,
      mimeType
    },
    config: {
      numberOfVideos: 1
    }
  })

  while (!operation.done) {
    if (signal?.aborted) {
      throw new Error('Aborted')
    }
    await new Promise(resolve => setTimeout(resolve, 10000))
    operation = await ai.operations.getVideosOperation({operation})
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri
  if (!downloadLink) {
    throw new Error('Video generation failed, no download link found.')
  }

  const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`)
  const videoBlob = await response.blob()
  return URL.createObjectURL(videoBlob)
}

const imageLimiter = pLimit(2)
const videoLimiter = pLimit(1)

export const generateImage = args => imageLimiter(() => generateImageFn(args))
export const generateVideo = args => videoLimiter(() => generateVideoFn(args))
