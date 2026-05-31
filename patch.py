import sys

# 1. Update app.js
with open(r'C:\Users\wecan\.openclaw\workspace\line-poker\app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

app_js = app_js.replace("const path = require('path');", "const path = require('path');\nconst http = require('http');\nconst { Server } = require('socket.io');")
app_js = app_js.replace("const app = express();", "const app = express();\nconst server = http.createServer(app);\nconst io = new Server(server, { cors: { origin: '*' } });\n\nconst broadcastState = (gameId) => {\n    if (GAMES[gameId]) io.to(gameId).emit('game_update', GAMES[gameId].toJSON());\n};")

app_js = app_js.replace("this.latestVoice = '';", "this.latestVoice = '';\n        this.turnDeadline = 0;\n        this.turnTimeout = null;")

disconnect_func = """
    handleDisconnect(userId) {
        const p = this.players[userId];
        if (!p || p.sittingOut) return;
        p.sittingOut = true;
        this.messages.push(`${p.name} 斷線離開了牌桌`);
        
        if (this.getCurrentPlayer() && this.getCurrentPlayer().userId === userId) {
            const callAmount = this.currentBetAmount - p.currentBet;
            this.playerAction(userId, callAmount === 0 ? 'check' : 'fold');
        } else {
            const activeCount = this.playersOrder.filter(id => !this.players[id].sittingOut && this.players[id].chips > 0).length;
            if (activeCount < 2 && ['pre_flop', 'flop', 'turn', 'river'].includes(this.gameState)) {
                this.endRoundSingleWinner();
            }
        }
    }
"""
app_js = app_js.replace("addPlayer(userId, name, avatar = '') {", disconnect_func + "\n    addPlayer(userId, name, avatar = '') {")

start_timer_func = """
    startTurnTimer() {
        if (this.turnTimeout) { clearTimeout(this.turnTimeout); this.turnTimeout = null; }
        if (['waiting_for_players', 'game_over', 'showdown', 'waiting_for_next_round'].includes(this.gameState)) {
            this.turnDeadline = 0;
            return;
        }
        
        const currentPlayer = this.getCurrentPlayer();
        if (!currentPlayer) return;

        if (currentPlayer.isBot) {
            this.turnDeadline = Date.now() + 3000;
            this.turnTimeout = setTimeout(() => {
                if (this.getCurrentPlayer() && this.getCurrentPlayer().userId === currentPlayer.userId) {
                    this.makeBotDecision(currentPlayer);
                }
            }, 2000 + Math.random() * 1000);
        } else {
            this.turnDeadline = Date.now() + 20000; // 20 seconds
            this.turnTimeout = setTimeout(() => {
                if (this.getCurrentPlayer() && this.getCurrentPlayer().userId === currentPlayer.userId) {
                    const callAmount = this.currentBetAmount - currentPlayer.currentBet;
                    this.playerAction(currentPlayer.userId, callAmount === 0 ? 'check' : 'fold');
                }
            }, 20000);
        }
        broadcastState(this.gameId);
    }
"""
app_js = app_js.replace("""    triggerBotIfNeeded() {
        const currentPlayer = this.getCurrentPlayer();
        if (currentPlayer && currentPlayer.isBot && ['pre_flop', 'flop', 'turn', 'river'].includes(this.gameState)) {
            if (this.botTimer) clearTimeout(this.botTimer);
            this.botTimer = setTimeout(() => {
                if (this.getCurrentPlayer() && this.getCurrentPlayer().userId === currentPlayer.userId) {
                    this.makeBotDecision(currentPlayer);
                }
            }, 1800);
        }
    }""", start_timer_func)

app_js = app_js.replace("this.triggerBotIfNeeded();", "this.startTurnTimer();")

app_js = app_js.replace("current_bet_amount: this.currentBetAmount,", "current_bet_amount: this.currentBetAmount,\n            turn_deadline: this.turnDeadline,")

app_js = app_js.replace("res.json({ success: true, game_id: gameId, game_state: GAMES[gameId].toJSON(user_id) });", "res.json({ success: true, game_id: gameId, game_state: GAMES[gameId].toJSON(user_id) });\n    broadcastState(gameId);")
app_js = app_js.replace("res.json({ success: ok, message: msg, game_state: game.toJSON(user_id) });", "res.json({ success: ok, message: msg, game_state: game.toJSON(user_id) });\n    broadcastState(game_id);")
app_js = app_js.replace("res.json({ success: true, game_state: game.toJSON(user_id) });", "res.json({ success: true, game_state: game.toJSON(user_id) });\n    broadcastState(game_id);")

socket_logic = """
io.on('connection', socket => {
    socket.on('join_room', ({ game_id, user_id }) => {
        socket.join(game_id);
        socket.userId = user_id;
        socket.gameId = game_id;
        if (GAMES[game_id] && GAMES[game_id].players[user_id]) {
            GAMES[game_id].players[user_id].sittingOut = false; // Came back!
            broadcastState(game_id);
        }
    });
    socket.on('join_voice', () => {
        socket.to(socket.gameId).emit('voice_user_joined', socket.id);
    });
    socket.on('leave_voice', () => {
        socket.to(socket.gameId).emit('voice_user_left', socket.id);
    });
    socket.on('voice_signal', data => {
        socket.to(data.target).emit('voice_signal', { ...data, from: socket.id });
    });
    socket.on('disconnect', () => {
        if (socket.gameId && socket.userId && GAMES[socket.gameId]) {
            GAMES[socket.gameId].handleDisconnect(socket.userId);
            broadcastState(socket.gameId);
        }
    });
});
"""
app_js = app_js.replace("const PORT = process.env.PORT || 5000;", socket_logic + "\nconst PORT = process.env.PORT || 5000;")
app_js = app_js.replace("app.listen(PORT", "server.listen(PORT")

with open(r'C:\Users\wecan\.openclaw\workspace\line-poker\app.js', 'w', encoding='utf-8') as f:
    f.write(app_js)

# 2. Update index.html
with open(r'C:\Users\wecan\.openclaw\workspace\line-poker\index.html', 'r', encoding='utf-8') as f:
    idx_html = f.read()

idx_html = idx_html.replace("<script src=\"https://static.line-scdn.net/liff/sdk/2.21.1/liff.js\"></script>", "<script src=\"https://static.line-scdn.net/liff/sdk/2.21.1/liff.js\"></script>\n    <script src=\"/socket.io/socket.io.js\"></script>")

voice_btn_html = """
        <div style="display: flex; gap: 5px;">
            <button id="voice-chat-btn" class="btn-blue" style="padding:4px 8px; font-size:0.8em;" onclick="toggleVoiceChat()">📞 開啟通話</button>
        </div>
"""
idx_html = idx_html.replace("""<button id="voice-toggle" style="background:none; border:1px solid #777; border-radius:15px; color:white; padding:2px 10px; font-size:0.8em; cursor:pointer;" onclick="toggleVoice()">🔊 語音: 開</button>""", voice_btn_html)

timer_html = """
            <div id="turn-timer-display" style="color: #ff4757; font-weight: bold; font-size: 1.2em; height: 1.5em; margin-bottom: 5px;"></div>
"""
idx_html = idx_html.replace("""<div style="color: #aaa; font-size: 0.8em; margin-bottom: -10px;">房號: <span id="room-id"></span></div>""", """<div style="color: #aaa; font-size: 0.8em; margin-bottom: -10px;">房號: <span id="room-id"></span></div>\n""" + timer_html)

webrtc_js = """
        let socket = null;
        let localStream = null;
        const peers = {};
        let timerInterval = null;

        function initSocket() {
            socket = io(BACKEND_URL);
            socket.on('connect', () => {
                if (gameId && userId) socket.emit('join_room', { game_id: gameId, user_id: userId });
            });
            socket.on('game_update', state => {
                updateUI(state);
            });
            
            socket.on('voice_user_joined', async (remoteSocketId) => {
                if (!localStream) return;
                const pc = createPeer(remoteSocketId);
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('voice_signal', { target: remoteSocketId, type: 'offer', sdp: pc.localDescription });
            });

            socket.on('voice_signal', async ({ from, type, sdp, candidate }) => {
                if (!localStream) return;
                let pc = peers[from];
                if (!pc) pc = createPeer(from);

                if (type === 'offer') {
                    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    socket.emit('voice_signal', { target: from, type: 'answer', sdp: pc.localDescription });
                } else if (type === 'answer') {
                    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
                } else if (type === 'candidate') {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                }
            });
            
            socket.on('voice_user_left', (remoteSocketId) => {
                if (peers[remoteSocketId]) {
                    peers[remoteSocketId].close();
                    delete peers[remoteSocketId];
                }
                const audio = document.getElementById('audio-' + remoteSocketId);
                if (audio) audio.remove();
            });
        }

        async function toggleVoiceChat() {
            if (!socket) return alert('尚未連線');
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
                localStream = null;
                socket.emit('leave_voice');
                Object.values(peers).forEach(p => p.close());
                for (let key in peers) delete peers[key];
                document.getElementById('voice-chat-btn').textContent = '📞 開啟通話';
                document.getElementById('voice-chat-btn').classList.replace('btn-red', 'btn-blue');
            } else {
                try {
                    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    socket.emit('join_voice');
                    document.getElementById('voice-chat-btn').textContent = '📞 關閉通話';
                    document.getElementById('voice-chat-btn').classList.replace('btn-blue', 'btn-red');
                } catch (e) { alert('麥克風存取失敗，請確認權限'); }
            }
        }

        function createPeer(remoteSocketId) {
            const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            peers[remoteSocketId] = pc;
            localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
            pc.onicecandidate = e => {
                if (e.candidate) socket.emit('voice_signal', { target: remoteSocketId, type: 'candidate', candidate: e.candidate });
            };
            pc.ontrack = e => {
                let audio = document.getElementById('audio-' + remoteSocketId);
                if (!audio) {
                    audio = document.createElement('audio');
                    audio.id = 'audio-' + remoteSocketId;
                    audio.autoplay = true;
                    document.body.appendChild(audio);
                }
                audio.srcObject = e.streams[0];
            };
            pc.oniceconnectionstatechange = () => {
                if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                    pc.close();
                    delete peers[remoteSocketId];
                    const audio = document.getElementById('audio-' + remoteSocketId);
                    if (audio) audio.remove();
                }
            };
            return pc;
        }

        function startTimerUI(deadline) {
            if (timerInterval) clearInterval(timerInterval);
            const timerEl = document.getElementById('turn-timer-display');
            if (!timerEl) return;
            timerInterval = setInterval(() => {
                const remaining = Math.max(0, deadline - Date.now());
                timerEl.textContent = `⏳ 剩餘思考時間: ${(remaining/1000).toFixed(1)}s`;
                if (remaining === 0) {
                    clearInterval(timerInterval);
                    timerEl.textContent = '';
                }
            }, 100);
        }
"""
idx_html = idx_html.replace("let userAvatar = '';", "let userAvatar = '';\n" + webrtc_js)

idx_html = idx_html.replace("if(document.getElementById('playerNameInput')) document.getElementById('playerNameInput').value = userName;\n                }", "if(document.getElementById('playerNameInput')) document.getElementById('playerNameInput').value = userName;\n                }\n                initSocket();")
idx_html = idx_html.replace("if(document.getElementById('playerNameInput')) document.getElementById('playerNameInput').value = userName;\n            }\n        }", "if(document.getElementById('playerNameInput')) document.getElementById('playerNameInput').value = userName;\n            }\n            initSocket();\n        }")

idx_html = idx_html.replace("isHost = true;\n                showGame();", "isHost = true;\n                if(socket) socket.emit('join_room', { game_id: gameId, user_id: userId });\n                showGame();")
idx_html = idx_html.replace("gameId = inputId;\n                showGame();", "gameId = inputId;\n                if(socket) socket.emit('join_room', { game_id: gameId, user_id: userId });\n                showGame();")

idx_html = idx_html.replace("setInterval(refresh, 2000); // 縮短更新頻率讓機器人動作更順暢", "")
idx_html = idx_html.replace("document.getElementById('next-btn').style.display = (isHost && isRoundEnd && state.game_state !== 'game_over') ? 'block' : 'none';", "document.getElementById('next-btn').style.display = (isHost && isRoundEnd && state.game_state !== 'game_over') ? 'block' : 'none';\n\n            if (state.turn_deadline > 0) {\n                startTimerUI(state.turn_deadline);\n            } else {\n                if (timerInterval) clearInterval(timerInterval);\n                document.getElementById('turn-timer-display').textContent = '';\n            }")

import re
idx_html = re.sub(r'function toggleVoice\(\).*?\}\s*', '', idx_html, flags=re.DOTALL)
idx_html = re.sub(r'// Voice synthesis for actions.*?\}\s*\}', '', idx_html, flags=re.DOTALL)

with open(r'C:\Users\wecan\.openclaw\workspace\line-poker\index.html', 'w', encoding='utf-8') as f:
    f.write(idx_html)

print("Patch applied.")
