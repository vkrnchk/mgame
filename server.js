const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://арифметикус.рф', 
          'https://www.арифметикус.рф',
          'https://xn--80akibkj0angmf.xn--p1ai',
          'https://www.xn--80akibkj0angmf.xn--p1ai'] 
      : '*',
    methods: ["GET", "POST"]
  }
});

// Хранилище комнат
const rooms = new Map();

// Генерация случайного примера (ИСПРАВЛЕНО - убрана рекурсия)
function generateProblem() {
  const maxAttempts = 50; // Ограничиваем попытки
  
  for (let i = 0; i < maxAttempts; i++) {
    const a = Math.floor(Math.random() * 11);
    const b = Math.floor(Math.random() * 11);
    const op = Math.random() < 0.5 ? '+' : '-';
    
    let answer = op === '+' ? a + b : a - b;
    
    // Проверяем, что ответ в пределах [0, 10]
    if (answer >= 0 && answer <= 10) {
      // Для вычитания убеждаемся, что a >= b (чтобы избежать отрицательных в процессе)
      if (op === '-' && a < b) {
        continue; // Пропускаем, если a < b для вычитания
      }
      return { problem: `${a} ${op} ${b}`, answer };
    }
  }
  
  // Если не нашли хороший пример, возвращаем запасной вариант
  console.warn('⚠️ Не удалось сгенерировать пример, использую запасной');
  return { problem: '5 + 3', answer: 8 };
}

// Валидация имени (УЛУЧШЕНО - более мягкая)
function validateName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > 20) return false;
  // Запрещаем только потенциально опасные символы
  return !/[<>{}]/.test(trimmed);
}

// Вспомогательная функция для получения базового URL
function getBaseUrl() {
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const host = process.env.HOST || 'localhost';
  const port = process.env.PORT || 3000;
  
  if (process.env.NODE_ENV === 'production') {
    return `${protocol}://${host}`;
  } else {
    return `${protocol}://${host}:${port}`;
  }
}

// Генерация уникального ID для комнаты (6 символов)
function generateUniqueRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const maxAttempts = 100;
    let attempts = 0;
    let roomId;
    
    do {
        roomId = '';
        for (let i = 0; i < 6; i++) {
            roomId += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        attempts++;
        
        if (attempts > maxAttempts) {
            console.warn('⚠️ Много попыток генерации уникального кода!');
            roomId = 'ROOM' + Date.now().toString().slice(-3);
            break;
        }
    } while (rooms.has(roomId));
    
    return roomId;
}

// Валидация кода комнаты
function validateRoomId(roomId) {
    if (!roomId || typeof roomId !== 'string') return false;
    return /^[A-Z0-9]{6}$/.test(roomId);
}

// Отправка нового примера
function sendNewProblem(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  const problem = generateProblem();
  room.currentProblem = problem;
  
  io.to(roomId).emit('newProblem', {
    problem: problem.problem
  });
}

// Очистка комнаты
function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
  
  rooms.delete(roomId);
  console.log(`🧹 Комната ${roomId} полностью очищена`);
}

// Запуск таймера игры (45 секунд)
// Запуск таймера игры (ИСПРАВЛЕНО - добавляем проверку существования комнаты)
function startGameTimer(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    console.log(`❌ Не удалось запустить таймер: комната ${roomId} не найдена`);
    return;
  }
  
  console.log(`▶️ Запуск таймера для комнаты ${roomId} (45 секунд)`);
  
  const endTime = Date.now() + 45 * 1000;
  
  // ✅ ЕДИНСТВЕННОЕ ИЗМЕНЕНИЕ: добавляем проверку существования комнаты в каждом тике
  room.timer = setInterval(() => {
    // Проверяем, существует ли еще комната
    const currentRoom = rooms.get(roomId);
    if (!currentRoom) {
      console.log(`⏱️ Таймер для комнаты ${roomId} остановлен (комната удалена)`);
      clearInterval(room.timer);
      room.timer = null;
      return;
    }
    
    const timeLeft = Math.max(0, endTime - Date.now());
    
    io.to(roomId).emit('timerUpdate', {
      timeLeft: Math.floor(timeLeft / 1000)
    });
    
    if (timeLeft <= 0) {
      clearInterval(room.timer);
      room.timer = null;
      
      const [p1Id, p2Id] = room.players;
      const winner = room.scores[p1Id] > room.scores[p2Id] ? p1Id : p2Id;
      
      console.log(`🏁 Игра в комнате ${roomId} завершена. Победитель: ${room.names[winner]}`);
      
      io.to(roomId).emit('gameOver', {
        scores: room.scores,
        names: room.names,
        winner: winner,
        gameCount: room.gameCount + 1
      });
      
      room.status = 'waiting_rematch';
      room.rematchVotes = {};
      room.gameCount++;
      room.lastActivity = Date.now();
      
      console.log(`⏳ Комната ${roomId} ожидает рематч (голосов: 0/${room.players.length})`);
    }
  }, 1000);
}

// Также добавим очистку таймера при удалении комнаты
function cleanupRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  
  // ✅ Добавляем очистку таймера перед удалением комнаты
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
    console.log(`⏱️ Таймер комнаты ${roomId} остановлен при очистке`);
  }
  
  rooms.delete(roomId);
  console.log(`🧹 Комната ${roomId} полностью очищена`);
}

// Сброс игры для рематча (УЛУЧШЕНО - единый таймер)
function resetGameForRematch(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    console.log(`❌ Не удалось сбросить игру: комната ${roomId} не найдена`);
    return false;
  }
  
  console.log(`🔄 Сброс игры для комнаты ${roomId}`);
  
  // Сброс счетов
  room.players.forEach(id => { 
    room.scores[id] = 0; 
  });
  
  room.status = 'playing';
  room.rematchVotes = {};
  room.currentProblem = null;
  
  // Очищаем старый таймер, если есть
  if (room.timer) {
    clearInterval(room.timer);
    room.timer = null;
  }
  
  // Отправляем событие о начале рематча
  io.to(roomId).emit('rematchStart', {
    roomId: roomId,
    players: room.players.map(id => ({
      id,
      name: room.names[id],
      score: 0
    })),
    totalTime: 45
  });
  
  console.log(`🎮 Рематч в комнате ${roomId} начинается через 1.5 секунды`);
  
  // Единый таймер для старта игры
  setTimeout(() => {
    sendNewProblem(roomId);
    startGameTimer(roomId);
  }, 1500);
  
  return true;
}

// ==================== СТРАНИЦА ПРИГЛАШЕНИЯ (ОБНОВЛЕНО - новый текст) ====================
app.get('/join/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    
    if (!rooms.has(roomId)) {
        return res.status(404).send(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Комната не найдена - Math Battle</title>
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
                <style>
                    :root {
                        --primary: #4F46E5;
                        --primary-dark: #3730A3;
                        --error: #EF4444;
                        --dark: #0B1120;
                        --darker: #050A14;
                        --card-bg: #1E293B;
                        --text-light: #F1F5F9;
                        --text-muted: #94A3B8;
                    }
                    
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }
                    
                    body {
                        font-family: 'Inter', sans-serif;
                        background: radial-gradient(circle at top left, var(--dark), var(--darker));
                        color: var(--text-light);
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                    }
                    
                    .error-card {
                        max-width: 450px;
                        width: 100%;
                        background: var(--card-bg);
                        border: 1px solid rgba(239, 68, 68, 0.3);
                        border-radius: 32px;
                        padding: 48px 40px;
                        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                        text-align: center;
                    }
                    
                    .error-card h1 {
                        font-size: 32px;
                        margin-bottom: 20px;
                        color: var(--error);
                    }
                    
                    .error-card i {
                        font-size: 64px;
                        color: var(--error);
                        margin-bottom: 20px;
                    }
                    
                    .error-card p {
                        color: var(--text-muted);
                        margin-bottom: 30px;
                    }
                    
                    .error-link {
                        display: inline-block;
                        padding: 15px 30px;
                        background: linear-gradient(135deg, var(--primary), var(--primary-dark));
                        color: white;
                        text-decoration: none;
                        border-radius: 30px;
                        font-weight: 600;
                        transition: all 0.3s ease;
                    }
                    
                    .error-link:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 12px 24px -8px var(--primary);
                    }
                </style>
            </head>
            <body>
                <div class="error-card">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h1>❌ Комната не найдена</h1>
                    <p>Комната с кодом <strong>${roomId}</strong> не существует или была удалена</p>
                    <a href="/" class="error-link">
                        <i class="fas fa-home"></i> В ЛОББИ
                    </a>
                </div>
            </body>
            </html>
        `);
    }
    
    // Получаем имя создателя комнаты (игрока 1)
    const room = rooms.get(roomId);
    const hostId = room.players[0];
    const hostName = room.names[hostId] || 'Игрок';
    
    res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Math Battle — Приглашение в дуэль</title>
            
            <!-- Шрифты -->
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;700;800&display=swap" rel="stylesheet">
            
            <!-- Font Awesome -->
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            
            <style>
                :root {
                    --primary: #4F46E5;
                    --primary-light: #818CF8;
                    --primary-dark: #3730A3;
                    --secondary-light: #5EEAD4;
                    --accent-light: #FCD34D;
                    --dark: #0B1120;
                    --darker: #050A14;
                    --card-bg: #1E293B;
                    --text-light: #F1F5F9;
                    --text-muted: #94A3B8;
                    --border-dark: #334155;
                    --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
                }
                
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                
                body {
                    font-family: 'Inter', sans-serif;
                    background: radial-gradient(circle at top left, var(--dark), var(--darker));
                    color: var(--text-light);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                }
                
                .join-card {
                    max-width: 500px;
                    width: 100%;
                    background: var(--card-bg);
                    border: 1px solid rgba(79, 70, 229, 0.3);
                    border-radius: 32px;
                    padding: 48px 40px;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                    position: relative;
                    overflow: hidden;
                }
                
                .join-card::before {
                    content: '';
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: radial-gradient(circle, rgba(79, 70, 229, 0.1) 0%, transparent 70%);
                    animation: rotate 20s linear infinite;
                    z-index: 0;
                }
                
                @keyframes rotate {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                
                .join-card > * {
                    position: relative;
                    z-index: 1;
                }
                
                h1 {
                    font-size: 42px;
                    font-weight: 800;
                    text-align: center;
                    margin-bottom: 16px;
                    background: linear-gradient(135deg, var(--primary-light), var(--secondary-light), var(--accent-light));
                    -webkit-background-clip: text;
                    background-clip: text;
                    color: transparent;
                }
                
                .challenge-text {
                    text-align: center;
                    font-size: 24px;
                    font-weight: 700;
                    margin-bottom: 8px;
                    color: var(--text-light);
                    line-height: 1.4;
                }
                
                .challenge-name {
                    font-size: 20px;
                    font-weight: 800;
                    color: var(--accent-light);
                    text-shadow: 0 0 20px var(--accent-light);
                    margin-bottom: 24px;
                    text-align: center;
                    word-break: break-word;
                }
                
                .challenge-name i {
                    font-size: 20px;
                    margin-right: 8px;
                    color: var(--primary-light);
                }
                
                .subtitle {
                    text-align: center;
                    color: var(--text-muted);
                    margin-bottom: 40px;
                    font-size: 16px;
                    border-top: 1px solid rgba(79, 70, 229, 0.3);
                    padding-top: 24px;
                }
                
                .input-field {
                    width: 100%;
                    height: 60px;
                    background: rgba(10, 10, 20, 0.9);
                    border: 2px solid var(--border-dark);
                    border-radius: 20px;
                    padding: 0 24px;
                    color: var(--text-light);
                    font-size: 16px;
                    font-family: 'Inter', sans-serif;
                    transition: all 0.3s ease;
                    margin-bottom: 24px;
                }
                
                .input-field:hover {
                    border-color: var(--primary-light);
                }
                
                .input-field:focus {
                    outline: none;
                    border-color: var(--primary);
                    box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.2);
                    background: rgba(20, 20, 30, 0.95);
                }
                
                .join-button {
                    width: 100%;
                    height: 60px;
                    background: linear-gradient(135deg, var(--primary), var(--primary-dark));
                    border: none;
                    border-radius: 30px;
                    color: white;
                    font-size: 18px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    box-shadow: var(--shadow-lg);
                }
                
                .join-button:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 12px 24px -8px var(--primary);
                }
                
                .join-button:active {
                    transform: translateY(0);
                }
                
                .room-code {
                    font-family: 'JetBrains Mono', monospace;
                    color: var(--primary-light);
                    font-weight: 600;
                }
                
                @media (max-width: 480px) {
                    .join-card {
                        padding: 32px 24px;
                    }
                    
                    h1 {
                        font-size: 32px;
                    }
                    
                    .challenge-text {
                        font-size: 20px;
                    }
                    
                    .challenge-name {
                        font-size: 20px;
                    }
                }
            </style>
        </head>
        <body>
            <div class="join-card">
                <h1><i class="fas fa-bolt"></i> MATH BATTLE</h1>
                
                <div class="challenge-name">
                    ${hostName} бросает тебе вызов! 
                </div>
                
                <input type="text" id="playerName" class="input-field" 
                       placeholder="Введи своё имя..." maxlength="20" autocomplete="off">
                
                <button class="join-button" id="joinGameBtn">
                    <i class="fas fa-gamepad"></i> НАЧАТЬ ИГРУ
                </button>
            </div>
            
            <script>
                // Загружаем сохранённое имя при загрузке страницы
                try {
                    const savedName = localStorage.getItem('mathBattle_playerName');
                    const nameInput = document.getElementById('playerName');
                    if (savedName && nameInput) {
                        nameInput.value = savedName;
                    }
                } catch (e) {
                    console.error('Ошибка загрузки имени:', e);
                }
                
                // Функция присоединения
                function joinGame() {
                    const nameInput = document.getElementById('playerName');
                    const name = nameInput ? nameInput.value.trim() : '';
                    
                    if (!name) {
                        alert('Введи своё имя!');
                        nameInput?.focus();
                        return;
                    }
                    
                    if (name.length > 20) {
                        alert('Имя не должно быть длиннее 20 символов');
                        return;
                    }
                    
                    // Сохраняем имя
                    try {
                        localStorage.setItem('mathBattle_playerName', name);
                    } catch (e) {
                        console.error('Ошибка сохранения имени:', e);
                    }
                    
                    // Перенаправляем на главную с данными для автоприсоединения
                    window.location.href = '/?room=${roomId}&name=' + encodeURIComponent(name);
                }
                
                // Обработчики событий
                document.addEventListener('DOMContentLoaded', function() {
                    const nameInput = document.getElementById('playerName');
                    const joinBtn = document.getElementById('joinGameBtn');
                    
                    if (nameInput) {
                        nameInput.focus();
                        nameInput.addEventListener('keypress', function(e) {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                joinGame();
                            }
                        });
                    }
                    
                    if (joinBtn) {
                        joinBtn.addEventListener('click', function(e) {
                            e.preventDefault();
                            joinGame();
                        });
                    }
                });
            </script>
        </body>
        </html>
    `);
});

// ==================== ОБРАБОТЧИКИ SOCKET.IO ====================
io.on('connection', (socket) => {
  console.log(`👤 Пользователь подключился: ${socket.id}`);
  socket.roomId = null;

  // Создание комнаты
  socket.on('createRoom', ({ name }) => {
    try {
      console.log(`📝 Запрос на создание комнаты от игрока ${name}`);
      
      if (!validateName(name)) {
        socket.emit('error', { message: 'Имя должно содержать от 1 до 20 символов' });
        return;
      }
      
      const roomId = generateUniqueRoomId();
      const inviteLink = `${getBaseUrl()}/join/${roomId}`;
      
      rooms.set(roomId, {
        players: [socket.id],
        scores: { [socket.id]: 0 },
        names: { [socket.id]: name.trim() },
        timer: null,
        currentProblem: null,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        status: 'waiting',
        rematchVotes: {},
        gameCount: 0
      });
      
      socket.join(roomId);
      socket.roomId = roomId;
      
      console.log(`✅ Комната создана: ${roomId}, игрок: ${name}`);
      console.log(`🔗 Ссылка для приглашения: ${inviteLink}`);
      
      socket.emit('roomCreated', { 
        roomId, 
        inviteLink,
        name: name.trim(),
        isHost: true
      });
    } catch (error) {
      console.error('❌ Ошибка создания комнаты:', error);
      socket.emit('error', { message: 'Внутренняя ошибка сервера' });
    }
  });

  // Вход в комнату
  socket.on('joinRoom', ({ roomId, name }) => {
    try {
      console.log(`📝 Запрос на вход в комнату ${roomId} от игрока ${name}`);
      
      if (!validateName(name)) {
        socket.emit('error', { message: 'Имя должно содержать от 1 до 20 символов' });
        return;
      }
      
      if (!validateRoomId(roomId)) {
        socket.emit('error', { message: 'Код комнаты должен быть 6 символов (буквы и цифры)' });
        return;
      }
      
      const room = rooms.get(roomId);
      
      if (!room) {
        socket.emit('error', { message: 'Комната не найдена' });
        return;
      }
      
      if (room.players.length >= 2) {
        socket.emit('error', { message: 'Комната уже полна' });
        return;
      }
      
      if (room.players.includes(socket.id)) {
        socket.emit('error', { message: 'Вы уже в этой комнате' });
        return;
      }
      
      room.players.push(socket.id);
      room.scores[socket.id] = 0;
      room.names[socket.id] = name.trim();
      room.status = 'waiting';
      room.lastActivity = Date.now();
      
      socket.join(roomId);
      socket.roomId = roomId;
      
      console.log(`✅ Игрок ${name} присоединился к комнате ${roomId}`);
      
      socket.emit('roomJoined', { 
        roomId, 
        name: name.trim(),
        isHost: false,
        otherPlayer: {
          id: room.players[0],
          name: room.names[room.players[0]],
          score: room.scores[room.players[0]]
        }
      });
      
      io.to(roomId).except(socket.id).emit('playerJoined', { 
        name: name.trim(),
        playerId: socket.id
      });

      if (room.players.length === 2) {
        console.log(`🎮 Оба игрока в комнате ${roomId}, начинаем игру`);
        
        room.status = 'playing';
        
        const playersInfo = room.players.map(id => ({
          name: room.names[id],
          id,
          score: room.scores[id]
        }));
        
        io.to(roomId).emit('gameStart', { 
          players: playersInfo,
          totalTime: 45
        });
        
        // Даем небольшую задержку перед стартом для подготовки
        setTimeout(() => {
          startGameTimer(roomId);
          sendNewProblem(roomId);
        }, 1500);
      }
    } catch (error) {
      console.error('❌ Ошибка входа в комнату:', error);
      socket.emit('error', { message: 'Внутренняя ошибка сервера' });
    }
  });

  // Обработчик рематча (ИСПРАВЛЕНО - используем общую функцию)
  socket.on('rematch', ({ roomId }) => {
    try {
      console.log(`🔥 ПОЛУЧЕН ЗАПРОС РЕМАТЧА: комната ${roomId} от игрока ${socket.id}`);
      
      const room = rooms.get(roomId);
      
      if (!room) {
        console.log(`❌ Комната ${roomId} не найдена`);
        socket.emit('error', { message: 'Комната не найдена' });
        return;
      }
      
      if (!room.players.includes(socket.id)) {
        console.log(`❌ Игрок ${socket.id} не в комнате ${roomId}`);
        socket.emit('error', { message: 'Вы не в этой комнате' });
        return;
      }
      
      console.log(`📊 Статус комнаты ${roomId}: ${room.status}, игроки: ${room.players.join(', ')}`);
      
      room.rematchVotes[socket.id] = true;
      room.lastActivity = Date.now();
      
      const votesCount = Object.keys(room.rematchVotes).length;
      console.log(`✅ Игрок ${room.names[socket.id]} (${socket.id}) готов к рематчу`);
      console.log(`📊 Голоса: ${votesCount} из ${room.players.length}`);
      
      io.to(roomId).emit('playerRematch', {
        playerId: socket.id,
        playerName: room.names[socket.id],
        ready: true
      });
      
      const allReady = room.players.every(id => room.rematchVotes[id]);
      
      if (allReady) {
        console.log(`🎉 ОБА ИГРОКА ГОТОВЫ! Запускаем рематч в комнате ${roomId}`);
        resetGameForRematch(roomId); // Используем общую функцию
      } else {
        console.log(`⏳ Ожидание второго игрока в комнате ${roomId}`);
      }
    } catch (error) {
      console.error('❌ Ошибка рематча:', error);
      socket.emit('error', { message: 'Ошибка при запросе рематча' });
    }
  });

  // Ответ игрока
  socket.on('answer', ({ roomId, answer }) => {
    try {
      const room = rooms.get(roomId);
      
      if (!room || !room.currentProblem) {
        socket.emit('error', { message: 'Игра не активна' });
        return;
      }
      
      if (!room.players.includes(socket.id)) {
        socket.emit('error', { message: 'Вы не в этой комнате' });
        return;
      }
      
      const correctAnswer = room.currentProblem.answer;
      
      if (parseInt(answer) === correctAnswer) {
        room.scores[socket.id]++;
        room.lastActivity = Date.now();
        
        console.log(`✅ Правильный ответ от ${room.names[socket.id]} в комнате ${roomId}`);
        
        io.to(roomId).emit('answerCorrect', {
          playerId: socket.id,
          playerName: room.names[socket.id],
          score: room.scores[socket.id],
          correctAnswer: correctAnswer,
          playerIndex: room.players.indexOf(socket.id)
        });
        
        sendNewProblem(roomId);
      } else {
        console.log(`❌ Неправильный ответ от ${room.names[socket.id]} в комнате ${roomId}`);
        
        socket.emit('answerWrong', {
          correctAnswer: correctAnswer,
          playerAnswer: answer
        });
      }
    } catch (error) {
      console.error('❌ Ошибка обработки ответа:', error);
      socket.emit('error', { message: 'Ошибка обработки ответа' });
    }
  });

  // Отключение
  socket.on('disconnect', () => {
    console.log(`👋 Пользователь отключился: ${socket.id}`);
    
    if (socket.roomId) {
      const room = rooms.get(socket.roomId);
      
      if (room) {
        const playerName = room.names[socket.id];
        
        if (room.players.length === 1) {
          console.log(`🧹 Удаление пустой комнаты ${socket.roomId}`);
          cleanupRoom(socket.roomId);
        } else {
          const otherPlayer = room.players.find(id => id !== socket.id);
          
          if (otherPlayer) {
            console.log(`📢 Уведомление игрока ${otherPlayer} об отключении ${playerName}`);
            
            io.to(otherPlayer).emit('playerLeft', { 
              name: playerName,
              reason: 'disconnected'
            });
            
            if (room.timer) {
              clearInterval(room.timer);
              room.timer = null;
            }
            
            room.players = room.players.filter(id => id !== socket.id);
            delete room.scores[socket.id];
            delete room.names[socket.id];
          }
        }
      }
      
      socket.roomId = null;
    }
  });
});

// Очистка неактивных комнат
setInterval(() => {
  const now = Date.now();
  const activeTimeout = 10 * 60 * 1000;
  const rematchTimeout = 5 * 60 * 1000;
  
  for (const [roomId, room] of rooms.entries()) {
    if (room.status === 'waiting_rematch') {
      if (now - room.lastActivity > rematchTimeout) {
        console.log(`🧹 Удаление неактивной комнаты (нет рематча): ${roomId}`);
        cleanupRoom(roomId);
      }
    } else if (room.status !== 'playing') {
      if (now - room.lastActivity > activeTimeout) {
        console.log(`🧹 Удаление неактивной комнаты: ${roomId}`);
        cleanupRoom(roomId);
      }
    }
  }
}, 5 * 60 * 1000);

// Статический контент
app.use(express.static(path.join(__dirname, 'public')));

// Маршрут для проверки здоровья
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    roomsCount: rooms.size,
    uptime: process.uptime()
  });
});

// Отладка: просмотр всех комнат
app.get('/debug/rooms', (req, res) => {
  const roomsArray = Array.from(rooms.entries()).map(([id, room]) => ({
    id,
    players: room.players.map(playerId => ({
      id: playerId,
      name: room.names[playerId],
      score: room.scores[playerId]
    })),
    status: room.status,
    gameCount: room.gameCount,
    rematchVotes: Object.keys(room.rematchVotes).length,
    createdAt: new Date(room.createdAt).toISOString(),
    lastActivity: new Date(room.lastActivity).toISOString()
  }));
  
  res.json({
    total: rooms.size,
    rooms: roomsArray
  });
});

// Обработка 404
app.use((req, res) => {
  res.status(404).send('Страница не найдена');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`🔗 Базовый URL: ${getBaseUrl()}`);
  console.log(`⚡ Режим: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⏱️ Таймер игры: 45 секунд`);
});