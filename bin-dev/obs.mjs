#!/usr/bin/env node
// Minimal OBS WebSocket v5 client (no dependencies beyond `ws` from the workspace):
//   node bin-dev/obs.mjs status|start|stop|scene <name>|scenes|items|split
// Reads the password from %APPDATA%\obs-studio\plugin_config\obs-websocket\config.json.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(join(process.cwd(), 'ai-company', 'package.json'))
const WebSocket = require('ws')

const config = JSON.parse(readFileSync(join(process.env.APPDATA, 'obs-studio', 'plugin_config', 'obs-websocket', 'config.json'), 'utf8'))
const url = `ws://127.0.0.1:${config.server_port || 4455}`
const [command = 'status', ...rest] = process.argv.slice(2)

const ws = new WebSocket(url)
let nextId = 1
const pending = new Map()
const request = (requestType, requestData = {}) => new Promise((resolve, reject) => {
  const requestId = String(nextId++)
  pending.set(requestId, { resolve, reject })
  ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }))
})

ws.on('message', async (raw) => {
  const message = JSON.parse(raw.toString())
  if (message.op === 0) {
    const identify = { rpcVersion: 1 }
    if (message.d.authentication) {
      const { challenge, salt } = message.d.authentication
      const secret = createHash('sha256').update(config.server_password + salt).digest('base64')
      identify.authentication = createHash('sha256').update(secret + challenge).digest('base64')
    }
    ws.send(JSON.stringify({ op: 1, d: identify }))
    return
  }
  if (message.op === 2) {
    try { await run() } catch (error) { console.error(error.message); process.exitCode = 1 }
    ws.close()
    return
  }
  if (message.op === 7) {
    const entry = pending.get(message.d.requestId)
    if (!entry) return
    pending.delete(message.d.requestId)
    if (message.d.requestStatus.result) entry.resolve(message.d.responseData ?? {})
    else entry.reject(new Error(`${message.d.requestType}: ${message.d.requestStatus.comment}`))
  }
})
ws.on('error', (error) => { console.error(`OBS websocket not reachable at ${url}: ${error.message} — enable Tools → WebSocket Server Settings`); process.exit(1) })

async function run() {
  if (command === 'status') {
    const [record, scene, stats] = await Promise.all([request('GetRecordStatus'), request('GetCurrentProgramScene'), request('GetStats')])
    console.log(`scene: ${scene.currentProgramSceneName}`)
    console.log(`recording: ${record.outputActive ? 'ON ' + record.outputTimecode : 'off'}${record.outputPaused ? ' (paused)' : ''}`)
    console.log(`fps: ${stats.activeFps.toFixed(1)} · dropped frames: ${stats.outputSkippedFrames}`)
  } else if (command === 'scenes') {
    const { scenes } = await request('GetSceneList')
    for (const scene of scenes) console.log(`- ${scene.sceneName}`)
  } else if (command === 'items') {
    const scene = await request('GetCurrentProgramScene')
    const { sceneItems } = await request('GetSceneItemList', { sceneName: scene.currentProgramSceneName })
    for (const item of sceneItems) console.log(`- ${item.sourceName} (${item.inputKind ?? item.sourceType}) ${item.sceneItemEnabled ? '' : '[hidden]'}`)
  } else if (command === 'shot') {
    const scene = await request('GetCurrentProgramScene')
    const { imageData } = await request('GetSourceScreenshot', { sourceName: scene.currentProgramSceneName, imageFormat: 'jpg', imageWidth: 1280, imageCompressionQuality: 70 })
    const file = rest[0] ?? 'obs-shot.jpg'
    writeFileSync(file, Buffer.from(imageData.split(',')[1], 'base64'))
    console.log(`frame → ${file}`)
  } else if (command === 'layout') {
    // Window capture of the app and the trace console, two thirds + one third of the canvas.
    // Display capture is black inside a remote session, so the windows are captured directly.
    const scene = (await request('GetCurrentProgramScene')).currentProgramSceneName
    const video = await request('GetVideoSettings')
    const split = Math.round(video.baseWidth * 2 / 3)
    const wanted = [
      { name: 'App (Chrome)', window: 'Google Chrome:Chrome_WidgetWin_1:chrome.exe', x: 0, width: split },
      { name: 'Trace (terminal)', window: 'AI Agency on Open Mercato - trace:CASCADIA_HOSTING_WINDOW_CLASS:WindowsTerminal.exe', x: split, width: video.baseWidth - split },
    ]
    const { sceneItems } = await request('GetSceneItemList', { sceneName: scene })
    for (const item of sceneItems) {
      if (item.inputKind === 'monitor_capture') await request('SetSceneItemEnabled', { sceneName: scene, sceneItemId: item.sceneItemId, sceneItemEnabled: false })
    }
    for (const source of wanted) {
      const settings = { window: source.window, priority: 2, method: 0, cursor: true, client_area: true }
      let sceneItemId = sceneItems.find((item) => item.sourceName === source.name)?.sceneItemId
      if (sceneItemId === undefined) {
        ({ sceneItemId } = await request('CreateInput', { sceneName: scene, inputName: source.name, inputKind: 'window_capture', inputSettings: settings, sceneItemEnabled: true }))
      } else {
        await request('SetInputSettings', { inputName: source.name, inputSettings: settings, overlay: true })
        await request('SetSceneItemEnabled', { sceneName: scene, sceneItemId, sceneItemEnabled: true })
      }
      await request('SetSceneItemTransform', { sceneName: scene, sceneItemId, sceneItemTransform: {
        positionX: source.x, positionY: 0, boundsType: 'OBS_BOUNDS_SCALE_INNER', boundsAlignment: 0, boundsWidth: source.width, boundsHeight: video.baseHeight, scaleX: 1, scaleY: 1, rotation: 0,
      } })
      console.log(`${source.name}: ${source.width}x${video.baseHeight} at ${source.x}`)
    }
  } else if (command === 'set') {
    // set <inputName> <json settings> — overlay input settings, e.g. set "Trace (terminal)" '{"method":2}'
    await request('SetInputSettings', { inputName: rest[0], inputSettings: JSON.parse(rest[1] ?? '{}'), overlay: true })
    console.log(JSON.stringify((await request('GetInputSettings', { inputName: rest[0] })).inputSettings))
  } else if (command === 'scene') {
    await request('SetCurrentProgramScene', { sceneName: rest.join(' ') })
    console.log(`scene → ${rest.join(' ')}`)
  } else if (command === 'start') {
    const status = await request('GetRecordStatus')
    if (status.outputActive) { console.log(`already recording ${status.outputTimecode}`); return }
    await request('StartRecord')
    console.log('recording started')
  } else if (command === 'stop') {
    const { outputPath } = await request('StopRecord')
    console.log(`recording stopped → ${outputPath}`)
  } else if (command === 'split') {
    await request('SplitRecordFile')
    console.log('file split')
  } else {
    console.log('usage: node bin-dev/obs.mjs status|start|stop|scenes|items|layout|shot [file]|scene <name>|split')
  }
}
