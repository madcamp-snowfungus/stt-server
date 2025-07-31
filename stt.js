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

// 각 클라이언트별 발언 누적을 위한 저장소
const clientTranscripts = new Map()

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
  
  // 클라이언트별 발언 누적 초기화
  clientTranscripts.set(ws, '')

  let recognizeStream = createSTTStream((data) => {
    if (
      data.results[0] &&
      data.results[0].alternatives[0]
    ) {
      const transcript = data.results[0].alternatives[0].transcript
      const isFinal = data.results[0].isFinal
      console.log(`${isFinal ? '✔ Final' : '⏳ Interim'}: ${transcript}`)

      if (isFinal) {
        // 최종 결과일 때만 누적
        const currentTranscript = clientTranscripts.get(ws) || ''
        const updatedTranscript = currentTranscript + ' ' + transcript
        clientTranscripts.set(ws, updatedTranscript.trim())
        console.log(`📝 Accumulated transcript for client: ${updatedTranscript.trim()}`)
      }

      // 참가자 모두에게 STT 전송 (실시간 업데이트용)
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ 
            type: 'stt', 
            text: transcript, 
            final: isFinal,
            accumulated: clientTranscripts.get(ws) || ''
          }))
        }
      })
    }
  })

  ws.on('message', (msg) => {
    // JSON 메시지 처리 (턴 종료 등)
    try {
      const data = JSON.parse(msg)
      if (data.type === 'turnEnd') {
        // 턴 종료 시 누적된 발언 전송
        const accumulatedTranscript = clientTranscripts.get(ws) || ''
        console.log(`🎤 Turn end - Final accumulated transcript: ${accumulatedTranscript}`)
        
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ 
              type: 'stt', 
              text: accumulatedTranscript, 
              final: true,
              accumulated: accumulatedTranscript,
              turnEnd: true
            }))
          }
        })
        
        // 누적 발언 초기화
        clientTranscripts.set(ws, '')
        
        // 턴 종료 후 빈 메시지로 초기화
        setTimeout(() => {
          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ 
                type: 'stt', 
                text: '', 
                final: true,
                accumulated: '',
                clear: true
              }))
            }
          })
        }, 1000) // 1초 후 초기화
        return
      }
    } catch (e) {
      // 바이너리 데이터 (오디오) 처리
      if (!recognizeStream) {
        recognizeStream = createSTTStream()
      }
      recognizeStream.write(msg)
    }
  })

  ws.on('close', () => {
    console.log('❌ Client disconnected')
    if (recognizeStream) {
      recognizeStream.end()
    }
    // 클라이언트별 발언 누적 데이터 정리
    clientTranscripts.delete(ws)
  })
})

const port = process.env.PORT || 8080
server.listen(port, () => {
  console.log(`🚀 WebSocket STT server running at http://localhost:${port}`)
})
