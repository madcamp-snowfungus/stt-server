// server/game.js
const WebSocket = require('ws');
const http = require('http');
// const https = require('https');
// const fs = require('fs');

const server = http.createServer();
// const server = https.createServer({
//   cert: fs.readFileSync('/etc/letsencrypt/live/funguess.duckdns.org/fullchain.pem'),
//   key: fs.readFileSync('/etc/letsencrypt/live/funguess.duckdns.org/privkey.pem')
// });

// const server = http.createServer();
// const wss = new WebSocket.Server({ server });

const rooms = {}; // { [roomId]: { clients: Set, turn: number, timer: number, interval: Timer, totalTurns: number, gameId: number } }

function broadcastToRoom(roomId, message) {
  const room = rooms[roomId];
  if (!room) return;

  for (const client of room.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }
}

function startTurn(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  clearInterval(room.interval); // 이전 타이머 정지
  room.timer = 10;

  console.log(`🎯 Starting turn ${room.turn} for room ${roomId}`);

  broadcastToRoom(roomId, { type: 'turn', turn: room.turn });
  
  // 타이머는 클라이언트의 requestTimer 요청을 기다림
  // AI 모달이 완전히 닫힌 후에 타이머가 시작됨
}

wss.on('connection', (ws) => {
  let roomId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'start') {
        const room = rooms[data.roomId];
        if (!room) return;
      
        if (!room.started) {
          room.started = true;
      
          console.log(`🚀 Game started for room ${data.roomId}`);
      
          // ✅ 1. 모든 유저에게 'gameStart' 메시지 전송
          broadcastToRoom(data.roomId, { type: 'gameStart' });
      
          // ✅ 2. 첫 턴 시작
          startTurn(data.roomId);
        }
      }

      if (data.type === 'join') {
        roomId = data.roomId;

        if (!rooms[roomId]) {
          rooms[roomId] = {
            clients: new Set(),
            turn: 0,
            timer: 10,
            interval: null,
            totalTurns: data.totalTurns || 8,
            gameId: data.gameId,
            started: false
          };
        }

        rooms[roomId].clients.add(ws);
        console.log(`👥 Client joined room: ${roomId} (${rooms[roomId].clients.size} clients)`);

        // 첫 클라이언트가 입장하면 게임 시작
        if (rooms[roomId].clients.size === 1 && !rooms[roomId].started) {
          rooms[roomId].started = true;
          startTurn(roomId);
          
          // 첫 번째 턴은 AI 모달이 없으므로 바로 타이머 시작
          setTimeout(() => {
            const room = rooms[roomId];
            if (room && room.turn === 0) {
              console.log(`🚀 First turn timer start for room ${roomId}`);
              broadcastToRoom(roomId, { type: 'timer', timer: room.timer });

              room.interval = setInterval(() => {
                room.timer -= 1;

                broadcastToRoom(roomId, { type: 'timer', timer: room.timer });

                if (room.timer <= 0) {
                  clearInterval(room.interval);
                  
                  console.log(`⏰ Timer expired for turn ${room.turn} in room ${roomId}`);
                  
                  broadcastToRoom(roomId, { type: 'turnEnd', timerExpired: true, turn: room.turn });
                  
                  room.turn += 1;

                  if (room.turn >= room.totalTurns) {
                    console.log(`🏁 Game ended after ${room.turn} turns`);
                    broadcastToRoom(roomId, { type: 'gameEnd' });
                  } else {
                    startTurn(roomId);
                  }
                }
              }, 1000);
            }
          }, 2000); // 2초 후 타이머 시작
        }
      }

      if (data.type === 'turnEnd') {
        const room = rooms[data.roomId];
        if (!room) return;

        console.log(`🔄 TurnEnd received for room ${data.roomId}, current turn: ${room.turn}`);

        // 클라이언트로부터 받은 turnEnd는 분석 결과만 브로드캐스트
        if (data.analysisData) {
          broadcastToRoom(roomId, { 
            type: 'turnEnd', 
            analysisData: data.analysisData 
          });
        }
      }

      if (data.type === 'requestTimer') {
        const room = rooms[data.roomId];
        if (!room) return;

        console.log(`🚀 Timer start requested for room ${data.roomId}, turn ${room.turn}`);
        
        // 타이머 즉시 시작
        broadcastToRoom(roomId, { type: 'timer', timer: room.timer });

        room.interval = setInterval(() => {
          room.timer -= 1;

          broadcastToRoom(roomId, { type: 'timer', timer: room.timer });

          if (room.timer <= 0) {
            clearInterval(room.interval);
            
            console.log(`⏰ Timer expired for turn ${room.turn} in room ${roomId}`);
            
            // 10초가 지났을 때 turnEnd 이벤트를 브로드캐스트 (handleTurnEnd 호출)
            broadcastToRoom(roomId, { type: 'turnEnd', timerExpired: true, turn: room.turn });
            
            room.turn += 1;

            if (room.turn >= room.totalTurns) {
              console.log(`🏁 Game ended after ${room.turn} turns`);
              broadcastToRoom(roomId, { type: 'gameEnd' });
            } else {
              startTurn(roomId);
            }
          }
        }, 1000);
      }

    } catch (e) {
      console.error('Invalid message:', message);
    }
  });

  ws.on('close', () => {
    if (roomId && rooms[roomId]) {
      rooms[roomId].clients.delete(ws);
      if (rooms[roomId].clients.size === 0) {
        clearInterval(rooms[roomId].interval);
        delete rooms[roomId];
        console.log(`🗑️ Room ${roomId} deleted`);
      }
    }
  });
});

server.listen(8081, () => {
  console.log('🎮 Game WebSocket server running on ws://localhost:8081');
});
