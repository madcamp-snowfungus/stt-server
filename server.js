// require('dotenv').config()
// const WebSocket = require('ws')
// const express = require('express')
// const { SpeechClient } = require('@google-cloud/speech')
// const fs = require('fs')

// // GCP 인증
// process.env.GOOGLE_APPLICATION_CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS

// const app = express()
// const server = require('http').createServer(app)
// const wss = new WebSocket.Server({ server })

// const speechClient = new SpeechClient()

// const createSTTStream = (onData) => {
//   const request = {
//     config: {
//       encoding: 'LINEAR16',
//       sampleRateHertz: 16000,
//       languageCode: 'ko-KR',
//     },
//     interimResults: true,
//   }

//   return speechClient
//     .streamingRecognize(request)
//     .on('error', console.error)
//     .on('data', onData)
// }

// wss.on('connection', (ws) => {
//   console.log('🔌 Client connected')

//   let recognizeStream = createSTTStream((data) => {
//     if (
//       data.results[0] &&
//       data.results[0].alternatives[0]
//     ) {
//       const transcript = data.results[0].alternatives[0].transcript
//       const isFinal = data.results[0].isFinal
//       console.log(`${isFinal ? '✔ Final' : '⏳ Interim'}: ${transcript}`)

//       // 참가자 모두에게 STT 전송
//       wss.clients.forEach((client) => {
//         if (client.readyState === WebSocket.OPEN) {
//           client.send(JSON.stringify({ type: 'stt', text: transcript, final: isFinal }))
//         }
//       })
//     }
//   })

//   ws.on('message', (msg) => {
//     if (!recognizeStream) {
//       recognizeStream = createSTTStream()
//     }
//     recognizeStream.write(msg)
//   })

//   ws.on('close', () => {
//     console.log('❌ Client disconnected')
//     if (recognizeStream) {
//       recognizeStream.end()
//     }
//   })
// })

// const port = process.env.PORT || 8080
// server.listen(port, () => {
//   console.log(`🚀 WebSocket STT server running at http://localhost:${port}`)
// })


// require('dotenv').config()
// const WebSocket = require('ws')
// const express = require('express')
// const http = require('http')

// const app = express()
// const server = http.createServer(app)
// const wss = new WebSocket.Server({ server })

// // 클라이언트가 /voice로 연결되면 audio relay용으로 분기
// const voiceClients = new Set()

// wss.on('connection', (ws, req) => {
//   // 연결된 URL 경로 확인
//   const isVoice = req.url === '/voice'

//   if (isVoice) {
//     console.log('🎤 Voice client connected')
//     voiceClients.add(ws)

//     ws.on('message', (data) => {
//       // 받은 binary chunk를 모든 다른 클라이언트에게 broadcast
//       voiceClients.forEach((client) => {
//         if (client !== ws && client.readyState === WebSocket.OPEN) {
//           client.send(data)
//         }
//       })
//     })

//     ws.on('close', () => {
//       console.log('❌ Voice client disconnected')
//       voiceClients.delete(ws)
//     })

//     return
//   }

//   // 그 외 경로 → 무시 또는 STT용 분기 가능
//   console.log('🌐 Unknown WebSocket connection')
//   ws.close()
// })

// const port = process.env.PORT || 8080
// server.listen(port, () => {
//   console.log(`🚀 Voice WebSocket server running at ws://localhost:${port}/voice`)
// })

require('dotenv').config()
const WebSocket = require('ws')
const express = require('express')
const http = require('http')
const { SpeechClient } = require('@google-cloud/speech')

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ noServer: true }) // path-based 분기 위해 변경

const speechClient = new SpeechClient()
const voiceClients = new Set()

// STT용 recognizeStream 생성 함수
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

// 클라이언트 upgrade 시 path 분기 처리
server.on('upgrade', (req, socket, head) => {
  const { url } = req

  wss.handleUpgrade(req, socket, head, (ws) => {
    if (url === '/voice') {
      handleVoice(ws)
    } else if (url === '/stt') {
      handleSTT(ws)
    } else {
      socket.destroy()
    }
  })
})

// 🎤 음성 공유용 핸들러
function handleVoice(ws) {
  console.log('🎤 Voice client connected')
  voiceClients.add(ws)

  ws.on('message', (data) => {
    voiceClients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data)
      }
    })
  })

  ws.on('close', () => {
    console.log('❌ Voice client disconnected')
    voiceClients.delete(ws)
  })
}

// 🧠 STT용 핸들러
function handleSTT(ws) {
  console.log('🧠 STT client connected')

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
}

const port = process.env.PORT || 8080
server.listen(port, () => {
  console.log(`🚀 Server ready at ws://localhost:${port}`)
  console.log('👉 /voice for audio relay, /stt for STT streaming')
})
