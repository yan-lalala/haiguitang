const { WebSocketServer, WebSocket } = require('ws');

const PORT = 3000;
const wss = new WebSocketServer({ port: PORT });

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

console.log(`🕯️ 庄园双人联机 WebSocket 服务器已在端口 ${PORT} 启动 (ws://localhost:${PORT})`);
