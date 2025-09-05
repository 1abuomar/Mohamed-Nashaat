/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {useRef, useState, useCallback} from 'react'
import c from 'clsx'
import {
  snapPhoto,
  setMode,
  deletePhoto,
  makeGif,
  hideGif,
  setCustomPrompt
} from '../lib/actions'
import useStore from '../lib/store'
import imageData from '../lib/imageData'
import modes from '../lib/modes'

const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d')
const modeKeys = Object.keys(modes)

export default function App() {
  const photos = useStore.use.photos()
  const customPrompt = useStore.use.customPrompt()
  const activeMode = useStore.use.activeMode()
  const gifInProgress = useStore.use.gifInProgress()
  const gifUrl = useStore.use.gifUrl()
  const [videoActive, setVideoActive] = useState(false)
  const [didInitVideo, setDidInitVideo] = useState(false)
  const [focusedId, setFocusedId] = useState(null)
  const [didJustSnap, setDidJustSnap] = useState(false)
  const [hoveredMode, setHoveredMode] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState({top: 0, left: 0})
  const [showCustomPrompt, setShowCustomPrompt] = useState(false)
  const videoRef = useRef(null)
  const fileInputRef = useRef(null)

  const focusedPhoto = focusedId ? photos.find(p => p.id === focusedId) : null

  const startVideo = async () => {
    setDidInitVideo(true)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {width: {ideal: 1920}, height: {ideal: 1080}},
      audio: false,
      facingMode: {ideal: 'user'}
    })
    setVideoActive(true)
    videoRef.current.srcObject = stream

    const {width, height} = stream.getVideoTracks()[0].getSettings()
    const squareSize = Math.min(width, height)
    canvas.width = squareSize
    canvas.height = squareSize
  }

  const takePhoto = () => {
    const video = videoRef.current
    const {videoWidth, videoHeight} = video
    const squareSize = canvas.width
    const sourceSize = Math.min(videoWidth, videoHeight)
    const sourceX = (videoWidth - sourceSize) / 2
    const sourceY = (videoHeight - sourceSize) / 2

    ctx.clearRect(0, 0, squareSize, squareSize)
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(
      video,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      -squareSize,
      0,
      squareSize,
      squareSize
    )
    snapPhoto(canvas.toDataURL('image/jpeg'))
    setDidJustSnap(true)
    setTimeout(() => setDidJustSnap(false), 1000)
  }

  const downloadFile = (url, name) => {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
  }

  const handleModeHover = useCallback((modeInfo, event) => {
    if (!modeInfo) {
      setHoveredMode(null)
      return
    }

    setHoveredMode(modeInfo)

    const rect = event.currentTarget.getBoundingClientRect()
    const tooltipTop = rect.top
    const tooltipLeft = rect.left + rect.width / 2

    setTooltipPosition({
      top: tooltipTop,
      left: tooltipLeft
    })
  }, [])

  const handleUploadClick = () => {
    fileInputRef.current.click()
  }

  const handleFileChange = e => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = loadEvent => {
        snapPhoto(loadEvent.target.result)
        setDidJustSnap(true)
        setTimeout(() => setDidJustSnap(false), 1000)
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <main>
      <input
        type="file"
        ref={fileInputRef}
        style={{display: 'none'}}
        accept="image/*"
        onChange={handleFileChange}
      />
      <div
        className="video"
        onClick={() => (gifUrl ? hideGif() : setFocusedId(null))}
      >
        {showCustomPrompt && (
          <div className="customPrompt">
            <button
              className="circleBtn"
              onClick={() => {
                setShowCustomPrompt(false)

                if (customPrompt.trim().length === 0) {
                  setMode(modeKeys[0])
                }
              }}
            >
              <span className="icon">close</span>
            </button>
            <textarea
              type="text"
              placeholder="Enter a custom prompt"
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  setShowCustomPrompt(false)
                }
              }}
            />
          </div>
        )}
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          disablePictureInPicture="true"
        />
        {didJustSnap && <div className="flash" />}
        {!videoActive && (
          <div className="startScreen">
            <h1>📸 GemBooth</h1>
            <button
              className="button"
              onClick={startVideo}
              disabled={didInitVideo}
            >
              {didInitVideo ? 'One sec…' : 'Start'}
            </button>
          </div>
        )}

        {videoActive && (
          <div className="videoControls">
            <div className="mainControls">
              <button
                onClick={handleUploadClick}
                className="shutter"
                aria-label="Upload photo"
              >
                <span className="icon">upload</span>
              </button>
              <button
                onClick={takePhoto}
                className="shutter"
                aria-label="Take photo"
              >
                <span className="icon">camera</span>
              </button>
            </div>

            <ul className="modeSelector">
              <li
                key="custom"
                onMouseEnter={e =>
                  handleModeHover({key: 'custom', prompt: customPrompt}, e)
                }
                onMouseLeave={() => handleModeHover(null)}
              >
                <button
                  className={c({active: activeMode === 'custom'})}
                  onClick={() => {
                    setMode('custom')
                    setShowCustomPrompt(true)
                  }}
                >
                  <span>✏️</span> <p>Custom</p>
                </button>
              </li>
              {Object.entries(modes).map(([key, {name, emoji, prompt}]) => (
                <li
                  key={key}
                  onMouseEnter={e => handleModeHover({key, prompt}, e)}
                  onMouseLeave={() => handleModeHover(null)}
                >
                  <button
                    onClick={() => setMode(key)}
                    className={c({active: key === activeMode})}
                  >
                    <span>{emoji}</span> <p>{name}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(focusedId || gifUrl) && (
          <div className="focusedPhoto" onClick={e => e.stopPropagation()}>
            <button
              className="circleBtn"
              onClick={() => (gifUrl ? hideGif() : setFocusedId(null))}
            >
              <span className="icon">close</span>
            </button>
            {gifUrl ? (
              <img src={gifUrl} alt="animated gif" draggable={false} />
            ) : focusedPhoto?.isVideo ? (
              <video
                src={imageData.outputs[focusedId]}
                autoPlay
                loop
                muted
                playsInline
                draggable={false}
              />
            ) : (
              <img
                src={imageData.outputs[focusedId]}
                alt="photo"
                draggable={false}
              />
            )}
            <div className="actions">
              {gifUrl && (
                <button
                  className="button downloadButton"
                  onClick={() => downloadFile(gifUrl, 'gembooth.gif')}
                >
                  Download GIF
                </button>
              )}
              {focusedPhoto && !gifUrl && (
                <>
                  <button
                    className="button downloadButton"
                    onClick={() => {
                      const extension = focusedPhoto.isVideo ? 'mp4' : 'png'
                      downloadFile(
                        imageData.outputs[focusedId],
                        `gembooth-${focusedPhoto.mode}.${extension}`
                      )
                    }}
                  >
                    <span className="icon">download</span>
                    Download
                  </button>
                  {!focusedPhoto.isVideo && (
                    <button
                      className="button printButton"
                      onClick={() => window.print()}
                    >
                      <span className="icon">print</span>
                      Print
                    </button>
                  )}
                </>
              )}
              {(gifUrl || focusedPhoto) && (
                <button
                  className="button whatsappButton"
                  onClick={() => {
                    const phoneNumber = '201555557337'
                    const messageText = gifUrl
                      ? 'Check out this cool GIF I made with GemBooth!'
                      : 'Check out this cool creation I made with GemBooth!'
                    const message = encodeURIComponent(messageText)
                    window.open(
                      `https://wa.me/${phoneNumber}?text=${message}`,
                      '_blank'
                    )
                  }}
                >
                  <span className="icon">share</span>
                  Share
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="results">
        <ul>
          {photos.length
            ? photos.map(({id, mode, isBusy, isVideo}) => (
                <li
                  className={c({isBusy, 'is-wide': mode === 'mirror'})}
                  key={id}
                >
                  <button
                    className="circleBtn deleteBtn"
                    onClick={() => {
                      deletePhoto(id)
                      if (focusedId === id) {
                        setFocusedId(null)
                      }
                    }}
                  >
                    <span className="icon">delete</span>
                  </button>
                  <button
                    className="photo"
                    onClick={() => {
                      if (!isBusy) {
                        setFocusedId(id)
                        hideGif()
                      }
                    }}
                  >
                    <img
                      src={
                        isVideo
                          ? imageData.inputs[id]
                          : isBusy
                          ? imageData.inputs[id]
                          : imageData.outputs[id]
                      }
                      draggable={false}
                    />
                    {isBusy && isVideo && (
                      <div className="loadingOverlay">Animating...</div>
                    )}
                    {!isBusy && isVideo && (
                      <span className="icon videoIcon">play_circle</span>
                    )}
                    <p className="emoji">
                      {mode === 'custom' ? '✏️' : modes[mode].emoji}
                    </p>
                  </button>
                </li>
              ))
            : videoActive && (
                <li className="empty" key="empty">
                  <p>
                    👉 <span className="icon">camera</span>
                  </p>
                  Snap a photo to get started.
                </li>
              )}
        </ul>
        {photos.filter(p => !p.isBusy).length > 1 && (
          <button
            className="button makeGif"
            onClick={makeGif}
            disabled={gifInProgress}
          >
            {gifInProgress ? 'One sec…' : 'Make GIF!'}
          </button>
        )}
      </div>

      {hoveredMode && (
        <div
          className={c('tooltip', {isFirst: hoveredMode.key === 'custom'})}
          role="tooltip"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: 'translateX(-50%)'
          }}
        >
          {hoveredMode.key === 'custom' && !hoveredMode.prompt.length ? (
            <p>Click to set a custom prompt</p>
          ) : (
            <>
              <p>"{hoveredMode.prompt}"</p>
              <h4>Prompt</h4>
            </>
          )}
        </div>
      )}
    </main>
  )
}