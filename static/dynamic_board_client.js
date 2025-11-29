const socket = io();
let currentRoom = null;
let mySymbol = "";
let currentTurn = "X";
const board = [];
const boardSize = 15;

const boardDiv = document.getElementById("board");
const info = document.getElementById("info");
const infoContainer = document.getElementById("info-container");
const infoContent = document.getElementById("info-content");
const infoToggle = document.getElementById("info-toggle");
const turnText = document.getElementById("turn");
const timerContainer = document.getElementById("timer");
const progressBar = document.getElementById("progress-bar");
const pauseButton = document.getElementById("pause-button");
const restartButton = document.getElementById("restart-button");
const backButton = document.getElementById("back-button");
const settingsButton = document.getElementById("settings-button");
const loadingSpinner = document.getElementById("loading");
const gameControlsContainer = document.getElementById("game-controls-container");
const gameControlsContent = document.getElementById("game-controls-content");
const gameControlsToggle = document.getElementById("game-controls-toggle");
const chatContainer = document.getElementById("chat-container");
const chatContent = document.getElementById("chat-content");
const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const chatToggle = document.getElementById("chat-toggle");
const settingsModal = document.getElementById("settings-modal");
const settingsClose = document.getElementById("settings-close");
const settingsSave = document.getElementById("settings-save");
const infoPosition = document.getElementById("info-position");
const infoColor = document.getElementById("info-color");
const roomList = document.getElementById("room-list");
const createRoomBtn = document.getElementById("create-room-btn");
const backToHomeBtn = document.getElementById("back-to-home-btn");

const clickSound = new Audio("/static/sounds/click.mp3");
const moveSound = new Audio("/static/sounds/move.mp3");
const winSound = new Audio("/static/sounds/win.mp3");

let isGameControlsOpen = true;
let isChatOpen = true;
let isInfoOpen = true;

// Tải cài đặt từ localStorage
function loadSettings() {
    const savedPosition = localStorage.getItem("infoPosition") || "left";
    const savedColor = localStorage.getItem("infoColor") || "#ffffff";
    infoPosition.value = savedPosition;
    infoColor.value = savedColor;
    applyInfoBoxSettings(savedPosition, savedColor);
}

// Áp dụng cài đặt hộp thông tin
function applyInfoBoxSettings(position, color) {
    infoContainer.style.backgroundColor = color;
    infoContainer.className = `info-container ${position}`;
    localStorage.setItem("infoPosition", position);
    localStorage.setItem("infoColor", color);
}

// Chuyển đổi hộp thông tin
function toggleInfo() {
    isInfoOpen = !isInfoOpen;
    infoToggle.innerText = isInfoOpen ? "−" : "+";
    infoContent.style.display = isInfoOpen ? "block" : "none";
    clickSound.play();
}

// Mở modal cài đặt
function openSettings() {
    settingsModal.style.display = "block";
    clickSound.play();
}

// Đóng modal cài đặt
function closeSettings() {
    settingsModal.style.display = "none";
    clickSound.play();
}

// Lưu cài đặt
function saveSettings() {
    applyInfoBoxSettings(infoPosition.value, infoColor.value);
    closeSettings();
}

// Kích hoạt hiệu ứng confetti
function triggerConfetti() {
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71'],
        disableForReducedMotion: true,
    });
    setTimeout(() => confetti.reset(), 3000);
}

// Áp dụng skin và chủ đề
function applySkinAndTheme() {
    const xSkin = localStorage.getItem('xSkin') || 'X';
    const oSkin = localStorage.getItem('oSkin') || 'O';
    const boardTheme = localStorage.getItem('boardTheme') || 'classic';
    boardDiv.className = `board ${boardTheme}`;
    return { xSkin, oSkin };
}

// Khởi tạo bàn cờ
function createBoard() {
    boardDiv.innerHTML = "";
    const { xSkin, oSkin } = applySkinAndTheme();
    for (let i = 0; i < boardSize; i++) {
        board[i] = [];
        for (let j = 0; j < boardSize; j++) {
            const cell = document.createElement("div");
            cell.className = "cell";
            cell.dataset.row = i;
            cell.dataset.col = j;
            cell.onclick = () => makeMove(i, j, cell);
            boardDiv.appendChild(cell);
            board[i][j] = "";
        }
    }
}

// Cập nhật bàn cờ sau khi xáo trộn
function updateBoardAfterShuffle(newBoard) {
    const { xSkin, oSkin } = applySkinAndTheme();
    for (let i = 0; i < boardSize; i++) {
        for (let j = 0; j < boardSize; j++) {
            board[i][j] = newBoard[i][j];
            const index = i * boardSize + j;
            const cell = boardDiv.children[index];
            cell.innerText = newBoard[i][j] === 'X' ? xSkin : (newBoard[i][j] === 'O' ? oSkin : '');
            cell.classList.remove('x', 'o', 'latest-move');
            if (newBoard[i][j]) {
                cell.classList.add(newBoard[i][j].toLowerCase());
            }
        }
    }
    info.innerText = "Bàn cờ đã được xáo trộn!";
    infoContainer.style.backgroundColor = "#f39c12";
    setTimeout(() => {
        infoContainer.style.backgroundColor = localStorage.getItem("infoColor") || "#ffffff";
    }, 1000);
}

// Gửi nước đi
function makeMove(row, col, cell) {
    if (board[row][col] === "" && currentTurn === mySymbol) {
        socket.emit("make_dynamic_move", { row, col, room: currentRoom, symbol: mySymbol });
        loadingSpinner.style.display = "block";
        moveSound.play();
    }
}

// Lấy danh sách phòng chờ
function fetchWaitingRooms() {
    fetch('/waiting-rooms')
        .then(response => response.json())
        .then(rooms => {
            roomList.innerHTML = "";
            if (rooms.length === 0) {
                roomList.innerHTML = "<li>Không có phòng chờ nào.</li>";
            } else {
                rooms.forEach(room => {
                    const li = document.createElement("li");
                    li.innerHTML = `Phòng: ${room.room_id} (${room.player_count}/2) <button onclick="joinRoom('${room.room_id}')">Tham gia</button>`;
                    roomList.appendChild(li);
                });
            }
        })
        .catch(error => {
            console.error('Lỗi khi lấy danh sách phòng:', error);
            roomList.innerHTML = "<li>Lỗi khi tải danh sách phòng.</li>";
        });
}

// Hàm khi người dùng bấm "Vào phòng"
function joinRoom(roomCode) {
    if (!roomCode) {
        roomCode = document.getElementById("room-input").value.trim();
    }
    if (roomCode === "") {
        alert("Vui lòng nhập mã phòng!");
        return;
    }
    currentRoom = roomCode;
    socket.emit("join_dynamic_game", { room: roomCode });
    document.getElementById("room-container").style.display = "none";
    document.getElementById("game-area").style.display = "flex";
    info.innerText = "Đang chờ người chơi khác...";
    infoContainer.style.backgroundColor = localStorage.getItem("infoColor") || "#ffffff";
    loadingSpinner.style.display = "block";
    clickSound.play();
}

// Hàm tạo phòng mới
function createRoom() {
    socket.emit("create_room");
    clickSound.play();
}

// Khởi động lại game
function restartGame() {
    socket.emit("join_dynamic_game", { room: currentRoom });
    restartButton.style.display = "none";
    pauseButton.style.display = "none";
    gameControlsContainer.style.display = "none";
    chatContainer.style.display = "none";
    info.innerText = "Đang chờ người chơi khác...";
    infoContainer.style.backgroundColor = localStorage.getItem("infoColor") || "#ffffff";
    loadingSpinner.style.display = "block";
    timerContainer.style.display = "none";
    chatMessages.innerHTML = "";
    isGameControlsOpen = true;
    gameControlsToggle.innerText = "−";
    gameControlsContent.style.display = "block";
    isChatOpen = true;
    chatToggle.innerText = "−";
    chatContent.style.display = "block";
    isInfoOpen = true;
    infoToggle.innerText = "−";
    infoContent.style.display = "block";
    createBoard();
    clickSound.play();
}

// Tạm dừng/tiếp tục game
function togglePause() {
    if (pauseButton.innerText === "Tạm dừng") {
        socket.emit("pause_game", { room: currentRoom });
        pauseButton.innerText = "Tiếp tục";
    } else {
        socket.emit("resume_game", { room: currentRoom });
        pauseButton.innerText = "Tạm dừng";
    }
    clickSound.play();
}

// Bật/tắt cửa sổ điều khiển game
function toggleGameControls() {
    isGameControlsOpen = !isGameControlsOpen;
    gameControlsToggle.innerText = isGameControlsOpen ? "−" : "+";
    gameControlsContent.style.display = isGameControlsOpen ? "block" : "none";
    clickSound.play();
}

// Bật/tắt cửa sổ chat
function toggleChat() {
    isChatOpen = !isChatOpen;
    chatToggle.innerText = isChatOpen ? "−" : "+";
    chatContent.style.display = isChatOpen ? "block" : "none";
    if (isChatOpen) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    clickSound.play();
}

// Gửi tin nhắn chat
function sendMessage() {
    const message = chatInput.value.trim();
    if (message) {
        socket.emit("send_message", { room: currentRoom, symbol: mySymbol, message: message });
        chatInput.value = "";
        clickSound.play();
    }
}

// Xử lý phím Enter trong chat
chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        sendMessage();
    }
});

// Xử lý các nút điều khiển
backButton.addEventListener("click", () => {
    window.location.href = "/";
    clickSound.play();
});

pauseButton.addEventListener("click", togglePause);

restartButton.addEventListener("click", restartGame);

settingsButton.addEventListener("click", openSettings);

settingsClose.addEventListener("click", closeSettings);

settingsSave.addEventListener("click", saveSettings);

createRoomBtn.addEventListener("click", createRoom);

backToHomeBtn.addEventListener("click", () => {
    window.location.href = "/";
    clickSound.play();
});

// Load settings and fetch waiting rooms on page load
document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    fetchWaitingRooms();
    setInterval(fetchWaitingRooms, 5000); // Cập nhật danh sách phòng mỗi 5 giây
});

// Lắng nghe phản hồi từ server
socket.on("room_created", (data) => {
    currentRoom = data.room;
    document.getElementById("room-container").style.display = "none";
    document.getElementById("game-area").style.display = "flex";
    info.innerText = `Phòng ${data.room} đã được tạo. Đang chờ người chơi khác...`;
    infoContainer.style.backgroundColor = localStorage.getItem("infoColor") || "#ffffff";
    loadingSpinner.style.display = "block";
});

socket.on("start_dynamic_game", (data) => {
    mySymbol = data.symbol;
    info.innerText = `Bạn là '${mySymbol}'. Chơi nào!`;
    infoContainer.style.backgroundColor = "#2ecc71"; // Màu xanh cho bắt đầu
    setTimeout(() => {
        infoContainer.style.backgroundColor = localStorage.getItem("infoColor") || "#ffffff";
    }, 1000);
    turnText.innerText = `Lượt: X`;
    timerContainer.style.display = "block";
    progressBar.style.width = "100%";
    pauseButton.style.display = "block";
    backButton.style.display = "block";
    settingsButton.style.display = "block";
    restartButton.style.display = "none";
    gameControlsContainer.style.display = "block";
    isGameControlsOpen = true;
    gameControlsToggle.innerText = "−";
    gameControlsContent.style.display = "block";
    chatContainer.style.display = "block";
    isChatOpen = true;
    chatToggle.innerText = "−";
    chatContent.style.display = "block";
    isInfoOpen = true;
    infoToggle.innerText = "−";
    infoContent.style.display = "block";
    loadingSpinner.style.display = "none";
    createBoard();
});

socket.on("room_full", () => {
    alert("Phòng đã đầy! Hãy thử phòng khác.");
    loadingSpinner.style.display = "none";
    document.getElementById("room-container").style.display = "block";
    document.getElementById("game-area").style.display = "none";
    fetchWaitingRooms();
});

socket.on("update_board", (data) => {
    const { row, col, symbol } = data;
    board[row][col] = symbol;
    const index = row * boardSize + col;
    const cell = boardDiv.children[index];
    const xSkin = localStorage.getItem('xSkin') || 'X';
    const oSkin = localStorage.getItem('oSkin') || 'O';
    cell.innerText = symbol === 'X' ? xSkin : oSkin;
    cell.classList.add(symbol.toLowerCase());
    document.querySelectorAll('.cell.latest-move').forEach(oldCell => {
        oldCell.classList.remove('latest-move');
    });
    cell.classList.add('latest-move');
    currentTurn = symbol === "X" ? "O" : "X";
    turnText.innerText = `Lượt: ${currentTurn}`;
    loadingSpinner.style.display = "none";
    progressBar.style.width = "100%";
    moveSound.play();
});

socket.on("shuffle_board", (data) => {
    updateBoardAfterShuffle(data.board);
    loadingSpinner.style.display = "none";
});

socket.on("timer_update", (data) => {
    const percentage = (data.remaining / 30) * 100;
    progressBar.style.width = `${percentage}%`;
});

socket.on("game_paused", (data) => {
    pauseButton.innerText = "Tiếp tục";
    info.innerText = "Trò chơi đã tạm dừng";
    infoContainer.style.backgroundColor = "#3498db"; // Màu xanh cho tạm dừng
    setTimeout(() => {
        infoContainer.style.backgroundColor = localStorage.getItem("infoColor") || "#ffffff";
    }, 1000);
    const percentage = (data.remaining / 30) * 100;
    progressBar.style.width = `${percentage}%`;
});

socket.on("receive_message", (data) => {
    const messageDiv = document.createElement("div");
    messageDiv.className = `chat-message ${data.symbol.toLowerCase()}-message`;
    const xSkin = localStorage.getItem('xSkin') || 'X';
    const oSkin = localStorage.getItem('oSkin') || 'O';
    messageDiv.innerText = `${data.symbol === 'X' ? xSkin : oSkin}: ${data.message}`;
    chatMessages.appendChild(messageDiv);
    if (isChatOpen) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
});

socket.on("game_over", (data) => {
    let message = "";
    const xSkin = localStorage.getItem('xSkin') || 'X';
    const oSkin = localStorage.getItem('oSkin') || 'O';
    if (data.reason === "timeout") {
        message = data.winner === mySymbol ? `🎉 Bạn thắng với '${mySymbol === 'X' ? xSkin : oSkin}' vì '${mySymbol === 'O' ? xSkin : oSkin}' hết giờ!` : `🎉 Người chơi '${data.winner === 'X' ? xSkin : oSkin}' thắng vì bạn hết giờ!`;
    } else if (data.reason === "win") {
        message = data.winner === mySymbol ? `🎉 Bạn thắng với '${mySymbol === 'X' ? xSkin : oSkin}'!` : `🎉 Người chơi '${data.winner === 'X' ? xSkin : oSkin}' thắng!`;
        if (data.winning_cells && data.winning_cells.length) {
            data.winning_cells.forEach(([row, col]) => {
                const index = row * boardSize + col;
                const cell = boardDiv.children[index];
                cell.classList.remove('latest-move');
                cell.classList.add("winning");
            });
        }
    } else if (data.reason === "draw") {
        message = "🎉 Trò chơi kết thúc hòa!";
    }
    info.innerText = message;
    infoContainer.style.backgroundColor = "#f1c40f"; // Màu vàng cho kết thúc trò chơi
    setTimeout(() => {
        infoContainer.style.backgroundColor = localStorage.getItem("infoColor") || "#ffffff";
    }, 1000);
    triggerConfetti();
    turnText.innerText = "";
    timerContainer.style.display = "none";
    pauseButton.style.display = "none";
    backButton.style.display = "block";
    settingsButton.style.display = "block";
    restartButton.style.display = "block";
    gameControlsContainer.style.display = "block";
    chatContainer.style.display = "none";
    loadingSpinner.style.display = "none";
    winSound.play();
    for (let cell of boardDiv.children) {
        cell.onclick = null;
    }
});