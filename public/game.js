// ==================== ИНИЦИАЛИЗАЦИЯ SOCKET ====================
const socket = io();

// ==================== ГЛОБАЛЬНОЕ СОСТОЯНИЕ ====================
const gameState = {
    playerId: null,
    playerName: '',
    roomId: null,
    isHost: false,
    gameActive: false
};

// ==================== ЗВУКОВЫЕ ЭФФЕКТЫ ====================
const sounds = {
    correctPlayer1: null,
    correctPlayer2: null,
    wrong: null,
    victoryPlayer1: null,
    victoryPlayer2: null,
    initialized: false
};

// Инициализация звуков
function initSounds() {
    if (sounds.initialized) return;
    
    try {
        sounds.correctPlayer1 = new Audio('/sounds/correct1.mp3');
        sounds.correctPlayer2 = new Audio('/sounds/correct2.mp3');
        sounds.wrong = new Audio('/sounds/wrong.mp3');
        sounds.victoryPlayer1 = new Audio('/sounds/victory1.mp3');
        sounds.victoryPlayer2 = new Audio('/sounds/victory2.mp3');
        
        const volume = 0.4;
        const victoryVolume = 0.5;
        
        if (sounds.correctPlayer1) sounds.correctPlayer1.volume = volume;
        if (sounds.correctPlayer2) sounds.correctPlayer2.volume = volume;
        if (sounds.wrong) sounds.wrong.volume = volume;
        if (sounds.victoryPlayer1) sounds.victoryPlayer1.volume = victoryVolume;
        if (sounds.victoryPlayer2) sounds.victoryPlayer2.volume = victoryVolume;
        
        sounds.correctPlayer1.load();
        sounds.correctPlayer2.load();
        sounds.wrong.load();
        sounds.victoryPlayer1.load();
        sounds.victoryPlayer2.load();
        
        sounds.initialized = true;
        console.log('🔊 Звуковые эффекты инициализированы');
    } catch (e) {
        console.error('❌ Ошибка инициализации звуков:', e);
    }
}

function playSound(soundType) {
    if (!sounds.initialized) {
        initSounds();
    }
    
    const sound = sounds[soundType];
    if (!sound) {
        console.log(`🔇 Звук ${soundType} не найден`);
        return;
    }
    
    try {
        sound.currentTime = 0;
        const playPromise = sound.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => {
                console.log('🔇 Звук не воспроизвелся (нужно взаимодействие с пользователем)');
            });
        }
    } catch (e) {
        console.error('❌ Ошибка воспроизведения звука:', e);
    }
}

// ==================== ЭЛЕМЕНТЫ ИНТЕРФЕЙСА ====================
const elements = {
    lobbyScreen: document.getElementById('lobbyScreen'),
    gameScreen: document.getElementById('gameScreen'),
    resultsScreen: document.getElementById('resultsScreen'),
    
    playerName: document.getElementById('playerName'),
    
    roomInfo: document.getElementById('roomInfo'),
    roomCode: document.getElementById('roomCode'),
    
    // ✅ Новые элементы
    qrcode: document.getElementById('qrcode'),
    
    gameTimer: document.getElementById('gameTimer'),
    mathProblem: document.getElementById('mathProblem'),
    answerInput: document.getElementById('answerInput'),
    answerFeedback: document.getElementById('answerFeedback'),
    
    player1Name: document.getElementById('player1Name'),
    player2Name: document.getElementById('player2Name'),
    player1Score: document.getElementById('player1Score'),
    player2Score: document.getElementById('player2Score'),
    
    finalScoreboard: document.getElementById('finalScoreboard'),
    
    notification: document.getElementById('notification'),
    notificationText: document.getElementById('notificationText'),
    
    createRoomBtn: null,
    submitAnswerBtn: null,
    rematchBtn: null,
    backToLobbyBtn: null,
    rematchHint: null
};

// ==================== УТИЛИТЫ ====================

function showNotification(message, type = 'info', duration = 3000) {
    if (!elements.notification || !elements.notificationText) return;
    
    elements.notificationText.textContent = message;
    elements.notification.className = `notification ${type}`;
    elements.notification.classList.remove('hidden');
    
    setTimeout(() => {
        elements.notification.classList.add('hidden');
    }, duration);
}

function showScreen(screenName) {
    elements.lobbyScreen?.classList.add('hidden');
    elements.gameScreen?.classList.add('hidden');
    elements.resultsScreen?.classList.add('hidden');
    
    if (screenName === 'lobby') {
        elements.lobbyScreen?.classList.remove('hidden');
    } else if (screenName === 'game') {
        elements.gameScreen?.classList.remove('hidden');
        setTimeout(() => elements.answerInput?.focus(), 100);
    } else if (screenName === 'results') {
        elements.resultsScreen?.classList.remove('hidden');
    }
}

// ✅ ОБНОВЛЕНО: Сбрасываем всё состояние, включая QR-код
function resetGameState() {
    gameState.playerId = null;
    gameState.playerName = '';
    gameState.roomId = null;
    gameState.isHost = false;
    gameState.gameActive = false;
    
    if (elements.roomInfo) elements.roomInfo.classList.add('hidden');
    
    // Очищаем QR-код
    if (elements.qrcode) {
        elements.qrcode.innerHTML = '';
    }
    

    
    if (elements.gameTimer) {
        elements.gameTimer.classList.remove('warning');
        elements.gameTimer.style.animation = '';
    }
    
    if (elements.player1Score) elements.player1Score.textContent = '0';
    if (elements.player2Score) elements.player2Score.textContent = '0';
    
    // ✅ Разблокируем кнопку создания комнаты
    enableCreateRoomButton();
}

// ✅ НОВАЯ ФУНКЦИЯ: Блокировка кнопки создания комнаты
function disableCreateRoomButton() {
    if (elements.createRoomBtn) {
        elements.createRoomBtn.disabled = true;
        elements.createRoomBtn.innerHTML = '<i class="fas fa-spinner fa-pulse"></i> ОЖИДАЕМ ПРОТИВНИКА...';
    }
}

// ✅ НОВАЯ ФУНКЦИЯ: Разблокировка кнопки создания комнаты
function enableCreateRoomButton() {
    if (elements.createRoomBtn) {
        elements.createRoomBtn.disabled = false;
        elements.createRoomBtn.innerHTML = '<i class="fas fa-rocket"></i> СОЗДАТЬ КОМНАТУ';
    }
}

// ✅ НОВАЯ ФУНКЦИЯ: Генерация QR-кода
function generateQRCode(url) {
    if (!elements.qrcode) return;
    
    // Очищаем предыдущий QR-код
    elements.qrcode.innerHTML = '';
    
    // Создаем новый QR-код
    try {
        new QRCode(elements.qrcode, {
            text: url,
            width: 180,
            height: 180,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });
        console.log('✅ QR-код сгенерирован');
    } catch (e) {
        console.error('❌ Ошибка генерации QR-кода:', e);
    }
}

function loadSavedName() {
    const savedName = localStorage.getItem('mathBattle_playerName');
    if (savedName && elements.playerName) {
        elements.playerName.value = savedName;
        console.log('📀 Загружено сохранённое имя:', savedName);
    }
}

function saveName(name) {
    if (name && name.trim().length > 0) {
        localStorage.setItem('mathBattle_playerName', name.trim());
        console.log('💾 Имя сохранено:', name);
    }
}

function checkAutoJoin() {
    const autoRoom = sessionStorage.getItem('autoJoinRoom');
    const autoName = sessionStorage.getItem('autoJoinName');
    
    if (autoName && elements.playerName) {
        elements.playerName.value = autoName;
        sessionStorage.removeItem('autoJoinName');
        
        if (autoRoom) {
            setTimeout(() => {
                joinRoom(autoRoom);
            }, 500);
        }
    }
}

// ==================== ОСНОВНЫЕ ФУНКЦИИ ====================

// ✅ ОБНОВЛЕНО: Блокируем кнопку при создании
function createRoom() {
    const name = elements.playerName?.value.trim();
    
    if (!name || name.length < 1 || name.length > 20) {
        showNotification('Введите имя от 1 до 20 символов!', 'error');
        return;
    }
    
    // Блокируем кнопку
    disableCreateRoomButton();
    
    saveName(name);
    gameState.playerName = name;
    
    console.log('📝 Создание комнаты для игрока:', name);
    socket.emit('createRoom', { name });
}

function joinRoom(roomIdFromParam = null) {
    const name = elements.playerName?.value.trim();
    
    let roomId = roomIdFromParam || sessionStorage.getItem('autoJoinRoom');
    
    if (!name || name.length < 1 || name.length > 20) {
        showNotification('Введите имя от 1 до 20 символов!', 'error');
        return;
    }
    
    if (!roomId || roomId.length !== 6) {
        showNotification('Введите корректный код комнаты (6 символов)', 'error');
        return;
    }
    
    roomId = roomId.toUpperCase();
    saveName(name);
    
    gameState.playerName = name;
    console.log(`🔗 Присоединение к комнате: ${roomId}, имя: ${name}`);
    
    socket.emit('joinRoom', { roomId, name });
    
    sessionStorage.removeItem('autoJoinRoom');
}

function submitAnswer() {
    if (!gameState.gameActive) {
        showNotification('Игра не активна', 'error');
        return;
    }
    
    if (!gameState.roomId) {
        showNotification('Ошибка: нет комнаты', 'error');
        return;
    }
    
    const answer = elements.answerInput?.value.trim();
    
    if (!answer || isNaN(answer)) {
        showNotification('Введите число!', 'error');
        return;
    }
    
    console.log(`📤 Отправка ответа: комната=${gameState.roomId}, ответ=${answer}`);
    
    socket.emit('answer', { 
        roomId: gameState.roomId, 
        answer: parseInt(answer) 
    });
    
    if (elements.answerInput) {
        elements.answerInput.value = '';
    }
}

function requestRematch() {
    if (!gameState.roomId) {
        showNotification('Ошибка: нет активной комнаты', 'error');
        return;
    }
    
    console.log('🔥 Отправка запроса рематча для комнаты:', gameState.roomId);
    
    socket.emit('rematch', { roomId: gameState.roomId });
    
    if (elements.rematchBtn) {
        elements.rematchBtn.disabled = true;
        elements.rematchBtn.innerHTML = '<i class="fas fa-hourglass-half"></i> ОЖИДАНИЕ СОПЕРНИКА...';
    }
    
    showNotification('Запрос на рематч отправлен. Ожидаем соперника...', 'info');
}

function backToLobby() {
    showScreen('lobby');
    resetGameState();
    showNotification('Возврат в лобби', 'info');
}

// ==================== ОБРАБОТЧИКИ СОБЫТИЙ SOCKET.IO ====================

socket.on('error', (data) => {
    showNotification(data.message, 'error');
    // Разблокируем кнопку при ошибке
    enableCreateRoomButton();
});

// ✅ ОБНОВЛЕНО: Показываем QR-код и индикатор ожидания
socket.on('roomCreated', (data) => {
    gameState.playerId = socket.id;
    gameState.roomId = data.roomId;
    gameState.isHost = true;
    
    // Показываем информацию о комнате
    if (elements.roomInfo) elements.roomInfo.classList.remove('hidden');
    
    // Генерируем QR-код со ссылкой приглашения
    if (data.inviteLink) {
        generateQRCode(data.inviteLink);
        
        // Копируем ссылку в буфер обмена
        navigator.clipboard.writeText(data.inviteLink).catch((err) => {
            console.error('Ошибка копирования ссылки:', err);
        });
        
        // Показываем ссылку
        if (elements.roomCode) {
            elements.roomCode.innerHTML = `<small style="font-size: 14px;">Ссылка скопирована!<br><span style="font-size: 18px;">Отправь другу или покажи QR-код</span></small>`;
        }
    }
    
    showNotification(`⚡ КОМНАТА СОЗДАНА! Ждем друга...`, 'success', 4000);
});

// ✅ ОБНОВЛЕНО: Игрок присоединился - убираем индикатор ожидания
socket.on('playerJoined', (data) => {
    console.log(`👋 Игрок ${data.name} присоединился!`);
});

socket.on('roomJoined', (data) => {
    gameState.playerId = socket.id;
    gameState.roomId = data.roomId;
    gameState.isHost = false;
    
    showNotification(`Вы присоединились к комнате ${data.roomId}!`, 'success');
    showScreen('game');
    
    if (data.otherPlayer && elements.player1Name && elements.player2Name) {
        elements.player1Name.textContent = data.otherPlayer.name;
        elements.player1Name.dataset.playerId = data.otherPlayer.id;
        elements.player1Score.textContent = data.otherPlayer.score;
        
        elements.player2Name.textContent = data.name;
        elements.player2Name.dataset.playerId = socket.id;
        elements.player2Score.textContent = '0';
    }
});

socket.on('gameStart', (data) => {
    console.log('🎮 gameStart:', data);
    
    gameState.gameActive = true;
    if (data.roomId) {
        gameState.roomId = data.roomId;
    }
    
    showScreen('game');
    
    if (elements.mathProblem) {
        elements.mathProblem.textContent = 'НАЧИНАЕМ';
    }
    
    if (elements.gameTimer) {
        elements.gameTimer.textContent = data.totalTime || 45;
    }
    
    if (data.players && data.players.length === 2) {
        if (elements.player1Name) {
            elements.player1Name.textContent = data.players[0].name;
            elements.player1Name.dataset.playerId = data.players[0].id;
            elements.player1Score.textContent = data.players[0].score;
        }
        
        if (elements.player2Name) {
            elements.player2Name.textContent = data.players[1].name;
            elements.player2Name.dataset.playerId = data.players[1].id;
            elements.player2Score.textContent = data.players[1].score;
        }
    }
    
    initSounds();
});

socket.on('newProblem', (data) => {
    if (elements.mathProblem) {
        elements.mathProblem.textContent = data.problem + ' = ?';
    }
    
    if (elements.answerFeedback) {
        elements.answerFeedback.innerHTML = '';
        elements.answerFeedback.style.display = 'none';
    }
    
    if (elements.answerInput) {
        elements.answerInput.value = '';
    }
});

socket.on('timerUpdate', (data) => {
    if (elements.gameTimer) {
        elements.gameTimer.textContent = data.timeLeft;
        
        if (data.timeLeft <= 10) {
            elements.gameTimer.classList.add('warning');
        } else {
            elements.gameTimer.classList.remove('warning');
        }
    }
});

socket.on('answerCorrect', (data) => {
    console.log('✅ answerCorrect:', data);
    
    const isPlayer1 = elements.player1Name?.dataset.playerId === data.playerId;
    const isPlayer2 = elements.player2Name?.dataset.playerId === data.playerId;
    
    if (isPlayer1) {
        playSound('correctPlayer1');
    } else if (isPlayer2) {
        playSound('correctPlayer2');
    }
    
    if (isPlayer1) {
        elements.player1Score.textContent = data.score;
    } else if (isPlayer2) {
        elements.player2Score.textContent = data.score;
    }
    
    if (elements.answerFeedback) {
        const isMyAnswer = data.playerId === socket.id;
        elements.answerFeedback.innerHTML = `<span class="correct">✅ ${isMyAnswer ? 'Вы' : data.playerName} правильно! +1 очко</span>`;
        elements.answerFeedback.style.display = 'block';
        
        setTimeout(() => {
            elements.answerFeedback.style.display = 'none';
        }, 800);
    }
});

socket.on('answerWrong', (data) => {
    console.log('❌ answerWrong:', data);
    
    playSound('wrong');
    
    if (socket.id === gameState.playerId && elements.answerFeedback) {
        elements.answerFeedback.innerHTML = `<span class="wrong">❌ Неправильно! Ответ: ${data.correctAnswer}</span>`;
        elements.answerFeedback.style.display = 'block';
        
        setTimeout(() => {
            elements.answerFeedback.style.display = 'none';
        }, 1500);
    }
});

socket.on('playerRematch', (data) => {
    console.log('📩 playerRematch:', data);
    
    if (elements.rematchHint) {
        elements.rematchHint.classList.remove('hidden');
        elements.rematchHint.innerHTML = `👆 ${data.playerName} готов(а)! Нажми "Играть снова"`;
    }
    
    if (data.playerId !== socket.id && elements.rematchBtn && !elements.rematchBtn.disabled) {
        elements.rematchBtn.classList.add('pulse');
    }
});

socket.on('rematchStart', (data) => {
    console.log('🎉 rematchStart:', data);
    
    showNotification('⚡ РЕМАТЧ!', 'success', 2000);
    
    gameState.gameActive = true;
    
    if (elements.player1Score) elements.player1Score.textContent = '0';
    if (elements.player2Score) elements.player2Score.textContent = '0';
    if (elements.gameTimer) elements.gameTimer.textContent = data.totalTime || 45;
    
    if (data.players && data.players.length === 2) {
        if (elements.player1Name) {
            elements.player1Name.textContent = data.players[0].name;
            elements.player1Name.dataset.playerId = data.players[0].id;
        }
        
        if (elements.player2Name) {
            elements.player2Name.textContent = data.players[1].name;
            elements.player2Name.dataset.playerId = data.players[1].id;
        }
    }
    
    if (elements.rematchBtn) {
        elements.rematchBtn.disabled = false;
        elements.rematchBtn.innerHTML = '<i class="fas fa-redo-alt"></i> ИГРАТЬ СНОВА';
        elements.rematchBtn.classList.remove('pulse');
    }
    
    if (elements.rematchHint) {
        elements.rematchHint.classList.add('hidden');
    }
    
    if (elements.answerInput) {
        elements.answerInput.value = '';
        elements.answerInput.focus();
    }
    
    showScreen('game');
});

socket.on('gameOver', (data) => {
    console.log('🏁 gameOver:', data);
    
    gameState.gameActive = false;
    
    const winnerId = data.winner;
    
    if (winnerId && !data.isTie) {
        const isWinnerPlayer1 = elements.player1Name?.dataset.playerId === winnerId;
        const isWinnerPlayer2 = elements.player2Name?.dataset.playerId === winnerId;
        
        if (isWinnerPlayer1) {
            playSound('victoryPlayer1');
        } else if (isWinnerPlayer2) {
            playSound('victoryPlayer2');
        }
    }
    
    let html = '<div class="final-scoreboard">';
    const players = Object.keys(data.scores);
    
    const [p1Id, p2Id] = players;
    const isTie = data.scores[p1Id] === data.scores[p2Id];
    
    data.isTie = isTie;
    
    players.forEach((playerId) => {
        let isWinner = false;
        let medal = '';
        
        if (isTie) {
            medal = '🤝';
        } else {
            isWinner = playerId === data.winner;
            medal = isWinner ? '🏆' : '';
        }
        
        html += `
            <div class="score-item ${isWinner ? 'winner' : ''} ${isTie ? 'tie' : ''}">
                <h3>${medal} ${data.names[playerId]}</h3>
                <p class="final-score">${data.scores[playerId]} очков</p>
            </div>
        `;
    });
    
    html += '</div>';
    
    if (isTie) {
        html += '<p class="tie-message">🤝 НИЧЬЯ! 🤝</p>';
    }
    
    if (elements.finalScoreboard) {
        elements.finalScoreboard.innerHTML = html;
    }
    
    showScreen('results');
    
    if (elements.rematchBtn) {
        elements.rematchBtn.disabled = false;
        elements.rematchBtn.innerHTML = '<i class="fas fa-redo-alt"></i> ИГРАТЬ СНОВА';
        elements.rematchBtn.classList.remove('pulse');
    }
    
    if (elements.rematchHint) {
        elements.rematchHint.classList.add('hidden');
    }
});

socket.on('playerLeft', (data) => {
    gameState.gameActive = false;
    showNotification('Соперник покинул игру. Возврат в лобби...', 'error');
    
    setTimeout(() => {
        showScreen('lobby');
        resetGameState();
    }, 3000);
});

// ==================== ИНИЦИАЛИЗАЦИЯ ПОСЛЕ ЗАГРУЗКИ DOM ====================
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Инициализация Math Battle...');
    
    elements.createRoomBtn = document.getElementById('createRoomBtn');
    elements.submitAnswerBtn = document.getElementById('submitAnswerBtn');
    elements.rematchBtn = document.getElementById('rematchBtn');
    elements.backToLobbyBtn = document.getElementById('backToLobbyBtn');
    elements.rematchHint = document.getElementById('rematchHint');
    
    loadSavedName();
    checkAutoJoin();
    
    if (elements.createRoomBtn) {
        elements.createRoomBtn.addEventListener('click', function(e) {
            e.preventDefault();
            createRoom();
        });
    }
    
    if (elements.submitAnswerBtn) {
        elements.submitAnswerBtn.addEventListener('click', function(e) {
            e.preventDefault();
            submitAnswer();
        });
    }
    
    if (elements.rematchBtn) {
        elements.rematchBtn.addEventListener('click', function(e) {
            e.preventDefault();
            requestRematch();
        });
    }
    
    if (elements.backToLobbyBtn) {
        elements.backToLobbyBtn.addEventListener('click', function(e) {
            e.preventDefault();
            backToLobby();
        });
    }
    
    if (elements.playerName) {
        elements.playerName.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                createRoom();
            }
        });
    }
    
    if (elements.answerInput) {
        elements.answerInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitAnswer();
            }
        });
    }
    
    if (elements.mathProblem) {
        elements.mathProblem.textContent = 'НАЧАЛИ';
    }
    
    showScreen('lobby');
    
    console.log('✅ Инициализация завершена');
});

window.createRoom = createRoom;
window.joinRoom = joinRoom;
window.submitAnswer = submitAnswer;
window.requestRematch = requestRematch;
window.backToLobby = backToLobby;



console.log('✅ game.js загружен, версия с QR-кодом и блокировкой кнопки');