/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// import {GIFEncoder, quantize, applyPalette} from 'gifenc'
import {GIFEncoder, quantize, applyPalette} from 'https://unpkg.com/gifenc'
import useStore from './store'
import imageData from './imageData'
import {generateImage, generateVideo} from './llm'
import modes from './modes'

const get = useStore.getState
const set = useStore.setState
const gifSize = 512

const downloadFile = (url, name) => {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

export const init = () => {
  if (get().didInit) {
    return
  }

  set(state => {
    state.didInit = true
  })
}

const createMirroredImage = async base64Data => {
  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = base64Data
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const {width, height} = img

  canvas.width = width * 2
  canvas.height = height

  // Draw original image on the left
  ctx.drawImage(img, 0, 0, width, height)

  // Draw mirrored image on the right
  ctx.save()
  ctx.scale(-1, 1)
  ctx.drawImage(img, -width * 2, 0, width, height)
  ctx.restore()

  return canvas.toDataURL('image/jpeg')
}

export const snapPhoto = async b64 => {
  const id = crypto.randomUUID()
  const {activeMode, customPrompt} = get()
  imageData.inputs[id] = b64

  const modeInfo = modes[activeMode]

  if (activeMode === 'custom' || !modeInfo.isLocal) {
    set(state => {
      state.photos.unshift({
        id,
        mode: activeMode,
        isBusy: true,
        isVideo: !!modeInfo?.isVideo
      })
    })

    try {
      let result
      if (modeInfo?.isVideo) {
        result = await generateVideo({
          prompt: modeInfo.prompt,
          inputFile: b64
        })
      } else {
        result = await generateImage({
          model: 'gemini-2.5-flash-image-preview',
          prompt: activeMode === 'custom' ? customPrompt : modeInfo.prompt,
          inputFile: b64
        })
      }

      if (!result) {
        throw new Error('Generation returned no result')
      }

      imageData.outputs[id] = result

      set(state => {
        state.photos = state.photos.map(photo =>
          photo.id === id ? {...photo, isBusy: false} : photo
        )
      })

      const extension = modeInfo?.isVideo ? 'mp4' : 'png'
      const safeModeName = activeMode.replace(/[^a-z0-9]/gi, '_').toLowerCase()
      const fileName = `gembooth-${safeModeName}-${id.substring(0, 6)}.${extension}`
      downloadFile(result, fileName)
    } catch (err) {
      console.error('Photo generation failed', err)
      // On failure, remove the photo from the list
      set(state => {
        state.photos = state.photos.filter(p => p.id !== id)
      })
      delete imageData.inputs[id]
    }
  } else {
    // Handle local modes like mirror
    const result = await createMirroredImage(b64)
    imageData.outputs[id] = result
    set(state => {
      state.photos.unshift({
        id,
        mode: activeMode,
        isBusy: false,
        isVideo: false
      })
    })

    const safeModeName = activeMode.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    const fileName = `gembooth-${safeModeName}-${id.substring(0, 6)}.jpeg`
    downloadFile(result, fileName)
  }
}

export const deletePhoto = id => {
  set(state => {
    state.photos = state.photos.filter(photo => photo.id !== id)
  })

  delete imageData.inputs[id]
  delete imageData.outputs[id]
}

export const setMode = mode =>
  set(state => {
    state.activeMode = mode
  })

const processImageToCanvas = async (base64Data, size) => {
  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = base64Data
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = size
  canvas.height = size

  const imgAspect = img.width / img.height
  const canvasAspect = 1

  let drawWidth
  let drawHeight
  let drawX
  let drawY

  if (imgAspect > canvasAspect) {
    drawHeight = size
    drawWidth = drawHeight * imgAspect
    drawX = (size - drawWidth) / 2
    drawY = 0
  } else {
    drawWidth = size
    drawHeight = drawWidth / imgAspect
    drawX = 0
    drawY = (size - drawHeight) / 2
  }

  ctx.clearRect(0, 0, size, size)
  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)

  return ctx.getImageData(0, 0, size, size)
}

const addFrameToGif = (gif, imageData, size, delay) => {
  const palette = quantize(imageData.data, 256)
  const indexed = applyPalette(imageData.data, palette)

  gif.writeFrame(indexed, size, size, {
    palette,
    delay
  })
}

export const makeGif = async () => {
  const {photos} = get()

  set(state => {
    state.gifInProgress = true
  })

  try {
    const gif = new GIFEncoder()
    const readyPhotos = photos.filter(photo => !photo.isBusy)

    for (const photo of readyPhotos) {
      const inputImageData = await processImageToCanvas(
        imageData.inputs[photo.id],
        gifSize
      )
      addFrameToGif(gif, inputImageData, gifSize, 333)

      const outputImageData = await processImageToCanvas(
        imageData.outputs[photo.id],
        gifSize
      )
      addFrameToGif(gif, outputImageData, gifSize, 833)
    }

    gif.finish()

    const gifUrl = URL.createObjectURL(
      new Blob([gif.buffer], {type: 'image/gif'})
    )

    set(state => {
      state.gifUrl = gifUrl
    })
  } catch (error) {
    console.error('Error creating GIF:', error)
    return null
  } finally {
    set(state => {
      state.gifInProgress = false
    })
  }
}

export const hideGif = () =>
  set(state => {
    state.gifUrl = null
  })

export const setCustomPrompt = prompt =>
  set(state => {
    state.customPrompt = prompt
  })

init()