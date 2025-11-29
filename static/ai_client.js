const socket = io();
let mySymbol = "X";
let currentTurn = "X";
const board = [];
const boardSize = 15;

const boardDiv = document.getElementById("board");
const info = document.getElementById("info");
const turnText = document.getElementById("turn");
const timerContainer = document.getElementById("timer");
const progressBar = document.getElementById("progress-bar");
const restartButton = document.getElementById("restart-button");
const loadingSpinner = document.getElementById("loading");
const difficultySelect = document.getElementById("difficulty");

const clickSound = new Audio("/static/sounds/click.mp3");
const moveSound = new Audio("/static/sounds/move.mp3");
const winSound = new Audio("/static/sounds/win.mp3");

let timerInterval = null;

function startTimer() {
    clearTimer();
    let timeLeft = 30;
    progressBar.style.width = "100%";
    timerInterval = setInterval(() => {
        timeLeft -= 0.1; // Cập nhật mỗi 100ms để có hoạt ảnh mượt mà
        const percentage = (timeLeft / 30) * 100;
        progressBar.style.width = `${percentage}%`;
        if (timeLeft <= 0) {
            clearTimer();
            socket.emit("timeout_ai");
        }
    }, 100);
}

function clearTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
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
    applySkinAndTheme();
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

// Gửi nước đi của người chơi
function makeMove(row, col, cell) {
    if (board[row][col] === "" && currentTurn === mySymbol) {
        socket.emit("make_move_ai", { row, col, symbol: mySymbol });
        loadingSpinner.style.display = "block";
        moveSound.play();
        clearTimer();
    }
}

// Khởi động lại game
function restartGame() {
    socket.emit("restart_ai_game");
    restartButton.style.display = "none";
    info.innerText = "Bạn là 'X'. Bắt đầu chơi!";
    turnText.innerText = "Lượt: X";
    timerContainer.style.display = "block";
    currentTurn = "X";
    createBoard();
    setDifficulty();
    startTimer();
}

// Thiết lập mức độ khó
function setDifficulty() {
    const difficulty = difficultySelect.value;
    socket.emit("set_difficulty", { difficulty });
}

// Khởi tạo bàn cờ, timer và mức độ khó khi tải trang
createBoard();
setDifficulty();
startTimer();

// Lắng nghe thay đổi mức độ khó
difficultySelect.addEventListener("change", () => {
    setDifficulty();
    clickSound.play();
});

// Lắng nghe phản hồi từ server
socket.on("update_board_ai", (data) => {
    const { row, col, symbol } = data;
    if (row === -1 && col === -1) {
        createBoard();
        startTimer();
        return;
    }
    board[row][col] = symbol;
    const index = row * boardSize + col;
    const cell = boardDiv.children[index];
    const xSkin = localStorage.getItem('xSkin') || 'X';
    const oSkin = localStorage.getItem('oSkin') || 'O';
    cell.innerText = symbol === 'X' ? xSkin : oSkin;
    cell.classList.add(symbol.toLowerCase());
    currentTurn = symbol === "X" ? "O" : "X";
    turnText.innerText = `Lượt: ${currentTurn}`;
    loadingSpinner.style.display = "none";
    moveSound.play();
    if (currentTurn === "X") {
        startTimer();
    }
});

socket.on("game_over_ai", (data) => {
    clearTimer();
    const xSkin = localStorage.getItem('xSkin') || 'X';
    const oSkin = localStorage.getItem('oSkin') || 'O';
    let message = "";
    if (data.reason === "timeout") {
        message = `🤖 AI thắng với '${oSkin}' vì bạn hết thời gian!`;
    } else if (data.reason === "win") {
        message = data.winner === mySymbol ? `🎉 Bạn thắng với '${xSkin}'!` : `🤖 AI thắng với '${oSkin}'!`;
        if (data.winning_cells && data.winning_cells.length) {
            data.winning_cells.forEach(([row, col]) => {
                const index = row * boardSize + col;
                const cell = boardDiv.children[index];
                cell.classList.add("winning");
            });
        }
    } else if (data.reason === "draw") {
        message = "🎉 Trò chơi kết thúc hòa!";
    }
    info.innerText = message;
    turnText.innerText = "";
    timerContainer.style.display = "none";
    restartButton.style.display = "block";
    loadingSpinner.style.display = "none";
    winSound.play();
    for (let cell of boardDiv.children) {
        cell.onclick = null;
    }
});

socket.on("difficulty_set", (data) => {
    info.innerText = `Mức độ khó đã được đặt thành: ${data.difficulty === 'easy' ? 'Dễ' : data.difficulty === 'medium' ? 'Trung bình' : 'Khó'}`;
    setTimeout(() => {
        info.innerText = "Bạn là 'X'. Bắt đầu chơi!";
    }, 1000);
});