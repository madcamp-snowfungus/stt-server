require('dotenv').config()
const WebSocket = require('ws')
const express = require('express')
const { SpeechClient } = require('@google-cloud/speech')
const fs = require('fs')

// GCP 인증
process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS

const app = express()
const server = require('http').createServer(app)
const wss = new WebSocket.Server({ server })

const speechClient = new SpeechClient()

const createSTTStream = (onData) => {
  const request = {
    config: {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'ko-KR',
    },
    interimResults: true,
  }

  return speechClient
    .streamingRecognize(request)
    .on('error', console.error)
    .on('data', onData)
}

wss.on('connection', (ws) => {
  console.log('🔌 Client connected')

  let recognizeStream = createSTTStream((data) => {
    if (
      data.results[0] &&
      data.results[0].alternatives[0]
    ) {
      const transcript = data.results[0].alternatives[0].transcript
      const isFinal = data.results[0].isFinal
      console.log(`${isFinal ? '✔ Final' : '⏳ Interim'}: ${transcript}`)

      // 참가자 모두에게 STT 전송
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'stt', text: transcript, final: isFinal }))
        }
      })
    }
  })

  ws.on('message', (msg) => {
    if (!recognizeStream) {
      recognizeStream = createSTTStream()
    }
    recognizeStream.write(msg)
  })

  ws.on('close', () => {
    console.log('❌ Client disconnected')
    if (recognizeStream) {
      recognizeStream.end()
    }
  })
})

const port = process.env.PORT || 8080
server.listen(port, () => {
  console.log(`🚀 WebSocket STT server running at http://localhost:${port}`)
})
