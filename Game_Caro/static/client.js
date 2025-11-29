const socket = io();
let currentRoom = null;
let mySymbol = "";
let currentTurn = "X";
const board = [];
const boardSize = 15;

const boardDiv = document.getElementById("board");
const info = document.getElementById("info");
const turnText = document.getElementById("turn");
const restartButton = document.getElementById("restart-button");

// Khởi tạo bàn cờ
function createBoard() {
    boardDiv.innerHTML = "";
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

// Gửi nước đi
function makeMove(row, col, cell) {
    if (board[row][col] === "" && currentTurn === mySymbol) {
        socket.emit("make_move", { row, col, room: currentRoom, symbol: mySymbol });
    }
}

// Hàm khi người dùng bấm "Vào phòng"
function joinRoom() {
    const roomCode = document.getElementById("room-input").value.trim();
    if (roomCode === "") {
        alert("Please enter a room code!");
        return;
    }
    currentRoom = roomCode;
    socket.emit("join_game", { room: roomCode });
    document.getElementById("room-container").style.display = "none";
    info.innerText = "Waiting for another player...";
}

// Hàm khởi động lại game
function restartGame() {
    socket.emit("join_game", { room: currentRoom });
    restartButton.style.display = "none";
    info.innerText = "Waiting for another player...";
    createBoard();
}

// Lắng nghe phản hồi từ server
socket.on("start_game", (data) => {
    mySymbol = data.symbol;
    info.innerText = `You are '${mySymbol}'. Let's play!`;
    turnText.innerText = `Turn: X`;
    restartButton.style.display = "none";
    createBoard();
});

socket.on("room_full", () => {
    alert("Room is full! Please try a different room.");
    location.reload();
});

socket.on("update_board", (data) => {
    const { row, col, symbol } = data;
    board[row][col] = symbol;
    const index = row * boardSize + col;
    const cell = boardDiv.children[index];
    cell.innerText = symbol;
    cell.classList.add(symbol.toLowerCase()); // Thêm class x hoặc o để áp dụng màu
    currentTurn = symbol === "X" ? "O" : "X";
    turnText.innerText = `Turn: ${currentTurn}`;
});

socket.on("game_over", (data) => {
    info.innerText = `🎉 Player '${data.winner}' wins!`;
    turnText.innerText = "";
    restartButton.style.display = "block";
    // Vô hiệu hóa bàn cờ
    for (let cell of boardDiv.children) {
        cell.onclick = null;
    }
});
