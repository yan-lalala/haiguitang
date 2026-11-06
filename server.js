const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;
const STATIC_DIR = path.join(__dirname, 'dist', 'build', 'h5');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

// 创建统一的 HTTP 服务器（既托管静态 H5 游戏，又提供健康检查与 WebSocket 握手）
const server = http.createServer((req, res) => {
  // 跨域支持 (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/health' || req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  // 服务端 LLM 代理转发（彻底消除浏览器 CORS 限制）
  if (req.url === '/api/llm/proxy' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { endpoint, apiKey, body: reqBody } = payload;
        if (!endpoint || !apiKey) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: { message: '缺少 endpoint 或 apiKey 参数' } }));
          return;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);

        try {
          const apiRes = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey.trim()}`
            },
            body: JSON.stringify(reqBody),
            signal: controller.signal
          });

          const data = await apiRes.text();
          res.writeHead(apiRes.status, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(data);
        } finally {
          clearTimeout(timeout);
        }
      } catch (proxyErr) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: { message: `服务端代理请求失败: ${proxyErr.message}` } }));
      }
    });
    return;
  }

  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || !reqPath) reqPath = '/index.html';

  let filePath = path.join(STATIC_DIR, reqPath);

  if (!filePath.startsWith(STATIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(filePath).pipe(res);
    } else {
      // SPA Fallback: 路由重定向回 index.html
      const indexPath = path.join(STATIC_DIR, 'index.html');
      fs.stat(indexPath, (indexErr, indexStats) => {
        if (!indexErr && indexStats.isFile()) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(indexPath).pipe(res);
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<h1>Eurydice Manor Server is running!</h1><p>Please compile the frontend using <code>npm run build:h5</code>.</p>');
        }
      });
    }
  });
});

const wss = new WebSocketServer({ server });

// 内存房间映射表：roomId -> room
const rooms = new Map();

function generateRoomId() {
  let id;
  do {
    id = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(id));
  return id;
}

function broadcastToRoom(room, messageObj, excludeWs = null) {
  const payload = JSON.stringify(messageObj);
  room.players.forEach(p => {
    if (p.ws !== excludeWs && p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(payload);
    }
  });
}

function getSafeRoomState(room) {
  return {
    roomId: room.id,
    soupId: room.soupId,
    unlockedClueIds: room.unlockedClueIds,
    history: room.history,
    playerCount: room.players.length,
    players: room.players.map(p => ({ id: p.id, name: p.name, role: p.role }))
  };
}

wss.on('connection', (ws) => {
  let currentRoomId = null;
  let currentPlayerId = 'p_' + Math.random().toString(36).substring(2, 9);

  ws.on('message', (rawData) => {
    try {
      const data = JSON.parse(rawData.toString());

      switch (data.type) {
        // 创建庄园房间
        case 'CREATE_ROOM': {
          const roomId = generateRoomId();
          currentRoomId = roomId;
          const hostPlayer = {
            id: currentPlayerId,
            name: data.playerName || '调查员·房主',
            role: 'host',
            ws: ws
          };

          const newRoom = {
            id: roomId,
            soupId: data.soupId || 'case_001',
            unlockedClueIds: [],
            history: [],
            players: [hostPlayer]
          };

          rooms.set(roomId, newRoom);

          ws.send(JSON.stringify({
            type: 'ROOM_CREATED',
            roomId: roomId,
            player: { id: hostPlayer.id, name: hostPlayer.name, role: hostPlayer.role },
            roomState: getSafeRoomState(newRoom)
          }));
          console.log(`[房间创建] 庄园暗号: ${roomId}, 房主: ${hostPlayer.name}`);
          break;
        }

        // 输入暗号加入房间
        case 'JOIN_ROOM': {
          const targetRoomId = (data.roomId || '').trim();
          const room = rooms.get(targetRoomId);

          if (!room) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: `庄园暗号【${targetRoomId}】不存在或已失效！`
            }));
            return;
          }

          if (room.players.length >= 2) {
            ws.send(JSON.stringify({
              type: 'ERROR',
              message: `该案卷房间调查员已满员（限双人联机）！`
            }));
            return;
          }

          currentRoomId = targetRoomId;
          const guestPlayer = {
            id: currentPlayerId,
            name: data.playerName || '调查员·搭档',
            role: 'guest',
            ws: ws
          };

          room.players.push(guestPlayer);

          // 响应加入者
          ws.send(JSON.stringify({
            type: 'ROOM_JOINED',
            roomId: room.id,
            player: { id: guestPlayer.id, name: guestPlayer.name, role: guestPlayer.role },
            roomState: getSafeRoomState(room)
          }));

          // 广播通知房主有搭档加入
          broadcastToRoom(room, {
            type: 'PLAYER_JOINED',
            player: { id: guestPlayer.id, name: guestPlayer.name, role: guestPlayer.role },
            roomState: getSafeRoomState(room)
          }, ws);

          console.log(`[同伴加入] 房间: ${targetRoomId}, 同伴: ${guestPlayer.name}`);
          break;
        }

        // 切换案件
        case 'SWITCH_CASE': {
          if (!currentRoomId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;

          room.soupId = data.soupId;
          room.unlockedClueIds = [];
          room.history = [];

          broadcastToRoom(room, {
            type: 'CASE_SWITCHED',
            soupId: data.soupId,
            roomState: getSafeRoomState(room)
          });
          break;
        }

        // 提问与判定同步
        case 'SYNC_QUESTION': {
          if (!currentRoomId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;

          const qaRecord = {
            senderId: currentPlayerId,
            senderName: data.senderName,
            question: data.question,
            judgment: data.judgment,
            dmComment: data.dmComment,
            newClue: data.newClue
          };

          room.history.push(qaRecord);

          if (data.newClue && !room.unlockedClueIds.includes(data.newClue.id)) {
            room.unlockedClueIds.push(data.newClue.id);
          }

          broadcastToRoom(room, {
            type: 'NEW_QUESTION_BROADCAST',
            qaRecord: qaRecord,
            unlockedClueIds: room.unlockedClueIds
          });
          break;
        }

        // 终局指证同步
        case 'SUBMIT_TRUTH': {
          if (!currentRoomId) return;
          const room = rooms.get(currentRoomId);
          if (!room) return;

          broadcastToRoom(room, {
            type: 'TRUTH_RESULT_BROADCAST',
            senderName: data.senderName,
            passed: data.passed,
            score: data.score,
            summary: data.summary,
            attemptText: data.attemptText
          });
          break;
        }

        // 退出房间
        case 'LEAVE_ROOM': {
          handleDisconnect();
          break;
        }
      }
    } catch (err) {
      console.error('处理消息异常:', err);
    }
  });

  function handleDisconnect() {
    if (!currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;

    room.players = room.players.filter(p => p.ws !== ws);
    console.log(`[离开] 玩家离开房间: ${currentRoomId}, 剩余人数: ${room.players.length}`);

    if (room.players.length === 0) {
      rooms.delete(currentRoomId);
      console.log(`[注销] 房间 ${currentRoomId} 空置已销毁`);
    } else {
      broadcastToRoom(room, {
        type: 'PLAYER_LEFT',
        playerId: currentPlayerId,
        roomState: getSafeRoomState(room)
      });
    }
    currentRoomId = null;
  }

  ws.on('close', () => {
    handleDisconnect();
  });

  ws.on('error', (err) => {
    console.warn('Socket 连接错误:', err.message);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🕯️ 庄园云端服务器已在端口 ${PORT} 启动 (http://localhost:${PORT} / ws://localhost:${PORT})`);
});
