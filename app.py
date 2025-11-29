from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room
import uuid
import random
import copy
import time
import math
import threading

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

rooms = {}  # Lưu trữ thông tin phòng: {room_id: {players, board, turn, timer, paused, move_count}}
ai_game_state = {"board": [["" for _ in range(15)] for _ in range(15)], "turn": "X", "difficulty": "medium", "timer": None}
player_skins = {}  # Lưu trữ skin của người chơi theo session ID

def start_timer(room, current_symbol):
    """Start a 30-second timer for the current player's turn."""
    if room not in rooms:
        return
    if 'paused' not in rooms[room]:
        rooms[room]['paused'] = False
    rooms[room]['timer'] = time.time() + 30
    while room in rooms and rooms[room]['timer'] and time.time() < rooms[room]['timer'] and not rooms[room]['paused']:
        remaining = rooms[room]['timer'] - time.time()
        if remaining < 0:
            break
        socketio.emit('timer_update', {'remaining': remaining, 'symbol': current_symbol}, room=room)
        socketio.sleep(0.1)
    if room in rooms and rooms[room]['timer'] and time.time() >= rooms[room]['timer'] and not rooms[room]['paused']:
        winner = "O" if current_symbol == "X" else "X"
        socketio.emit('game_over', {'winner': winner, 'winning_cells': [], 'reason': 'timeout'}, room=room)
        rooms[room]['timer'] = None

def shuffle_board(board):
    """Shuffle the entire board randomly, preserving all symbols."""
    flat_board = []
    for row in board:
        for cell in row:
            flat_board.append(cell)
    random.shuffle(flat_board)
    new_board = [["" for _ in range(15)] for _ in range(15)]
    index = 0
    for i in range(15):
        for j in range(15):
            new_board[i][j] = flat_board[index]
            index += 1
    return new_board

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/game')
def game():
    return render_template('index.html')

@app.route('/ai-game')
def ai_game():
    return render_template('ai_game.html')

@app.route('/special-mode')
def special_mode():
    return render_template('special_mode.html')

@app.route('/dynamic-board')
def dynamic_board():
    return render_template('dynamic_board.html')

@app.route('/multiplayer')
def multiplayer():
    return render_template('multiplayer.html')

@app.route('/customize-skin')
def customize_skin():
    return render_template('customize_skin.html')

@app.route('/waiting-rooms', methods=['GET'])
def get_waiting_rooms():
    """Trả về danh sách các phòng chờ (có ít hơn 2 người chơi)."""
    waiting_rooms = [
        {"room_id": room_id, "player_count": len(room_data['players'])}
        for room_id, room_data in rooms.items()
        if len(room_data['players']) < 2
    ]
    return jsonify(waiting_rooms)

def check_win(board, row, col, symbol):
    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
    for dr, dc in directions:
        count = 1
        winning_cells = [(row, col)]
        r, c = row + dr, col + dc
        while 0 <= r < 15 and 0 <= c < 15 and board[r][c] == symbol:
            count += 1
            winning_cells.append((r, c))
            r += dr
            c += dc
        r, c = row - dr, col - dc
        while 0 <= r < 15 and 0 <= c < 15 and board[r][c] == symbol:
            count += 1
            winning_cells.append((r, c))
            r -= dr
            c -= dc
        if count >= 5:
            return True, winning_cells[:5]
    return False, []

def is_board_full(board):
    """Check if the board is completely filled."""
    for row in board:
        for cell in row:
            if cell == "":
                return False
    return True

def get_valid_moves(board, last_move=None):
    moves = []
    if last_move:
        row, col = last_move
        for dr in range(-2, 3):
            for dc in range(-2, 3):
                r, c = row + dr, col + dc
                if 0 <= r < 15 and 0 <= c < 15 and board[r][c] == "":
                    moves.append((r, c))
    else:
        for i in range(15):
            for j in range(15):
                if board[i][j] == "":
                    moves.append((i, j))
    random.shuffle(moves)
    return moves

def evaluate_heuristic(board, symbol, last_move=None):
    opponent = "X" if symbol == "O" else "O"
    score = 0
    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]
    for i in range(15):
        for j in range(15):
            if board[i][j] == "":
                continue
            for dr, dc in directions:
                count = 0
                open_ends = 0
                r, c = i, j
                while 0 <= r < 15 and 0 <= c < 15 and board[r][c] == board[i][j]:
                    count += 1
                    r += dr
                    c += dc
                if 0 <= r < 15 and 0 <= c < 15 and board[r][c] == "":
                    open_ends += 1
                r, c = i - dr, j - dc
                while 0 <= r < 15 and 0 <= c < 15 and board[r][c] == board[i][j]:
                    count += 1
                    r -= dr
                    c -= dc
                if 0 <= r < 15 and 0 <= c < 15 and board[r][c] == "":
                    open_ends += 1
                if board[i][j] == symbol:
                    if count == 4 and open_ends >= 1:
                        score += 1000
                    elif count == 3 and open_ends >= 1:
                        score += 100
                    elif count == 2 and open_ends >= 1:
                        score += 10
                else:
                    if count == 4 and open_ends >= 1:
                        score -= 900
                    elif count == 3 and open_ends >= 1:
                        score -= 90
                    elif count == 2 and open_ends >= 1:
                        score -= 5
    return score

class MCTSNode:
    def __init__(self, board, move=None, parent=None, symbol="O"):
        self.board = copy.deepcopy(board)
        self.move = move
        self.parent = parent
        self.children = []
        self.visits = 0
        self.wins = 0
        self.symbol = symbol
        if move:
            self.board[move[0]][move[1]] = symbol

    def is_terminal(self):
        if self.move:
            return check_win(self.board, self.move[0], self.move[1], self.symbol)[0]
        return False

    def get_uct(self):
        if self.visits == 0:
            return float('inf')
        exploitation = self.wins / self.visits
        exploration = math.sqrt(2 * math.log(self.parent.visits) / self.visits)
        return exploitation + exploration

    def expand(self):
        moves = get_valid_moves(self.board, self.move)
        opponent_symbol = "X" if self.symbol == "O" else "O"
        for move in moves:
            child = MCTSNode(self.board, move, self, opponent_symbol)
            self.children.append(child)

    def simulate(self, difficulty="medium"):
        temp_board = copy.deepcopy(self.board)
        last_move = self.move
        current_symbol = "X" if self.symbol == "O" else "O"
        for _ in range(50):
            moves = get_valid_moves(temp_board, last_move)
            if not moves:
                return 0
            best_move = None
            best_score = float('-inf')
            for move in moves:
                temp_board[move[0]][move[1]] = current_symbol
                score = evaluate_heuristic(temp_board, "O" if current_symbol == "O" else "X", move)
                temp_board[move[0]][move[1]] = ""
                if score > best_score:
                    best_score = score
                    best_move = move
            if difficulty == "easy" and random.random() < 0.7:  # 70% chọn ngẫu nhiên
                best_move = random.choice(moves)
            elif difficulty == "medium" and random.random() < 0.3:  # 30% chọn ngẫu nhiên
                best_move = random.choice(moves)
            temp_board[best_move[0]][best_move[1]] = current_symbol
            if check_win(temp_board, best_move[0], best_move[1], current_symbol)[0]:
                return 1 if current_symbol == "O" else -1
            last_move = best_move
            current_symbol = "X" if current_symbol == "O" else "O"
        final_score = evaluate_heuristic(temp_board, "O", last_move)
        if final_score > 0:
            return 0.5
        elif final_score < 0:
            return -0.5
        return 0

def mcts(board, last_move, time_limit=0.8, difficulty="medium"):
    if difficulty == "easy":
        moves = get_valid_moves(board, last_move)
        if moves:
            return random.choice(moves)  # Chọn ngẫu nhiên ở mức dễ
        return None
    root = MCTSNode(board, symbol="O")
    start_time = time.time()
    while time.time() - start_time < time_limit:
        node = root
        while node.children and not node.is_terminal():
            node = max(node.children, key=lambda c: c.get_uct())
        if not node.is_terminal() and not node.children:
            node.expand()
        sim_node = node
        if node.children:
            sim_node = random.choice(node.children)
        result = sim_node.simulate(difficulty=difficulty)
        while sim_node:
            sim_node.visits += 1
            sim_node.wins += result if sim_node.symbol == "O" else -result
            sim_node = sim_node.parent
    if root.children:
        best_child = max(root.children, key=lambda c: c.visits)
        return best_child.move
    return None

@socketio.on('join_game')
def on_join(data):
    sid = request.sid
    room = data.get('room')
    join_room(room)
    if room not in rooms:
        rooms[room] = {'players': [sid], 'board': [["" for _ in range(15)] for _ in range(15)], 'turn': 'X', 'timer': None, 'paused': False, 'move_count': 0}
        emit('room_created', {'room': room}, room=sid)
    else:
        if len(rooms[room]['players']) < 2:
            rooms[room]['players'].append(sid)
            emit('start_game', {'symbol': 'O'}, room=sid)
            emit('start_game', {'symbol': 'X'}, room=rooms[room]['players'][0])
            socketio.start_background_task(start_timer, room, 'X')
        else:
            emit('room_full', {}, room=sid)

@socketio.on('join_dynamic_game')
def on_join_dynamic(data):
    sid = request.sid
    room = data.get('room')
    join_room(room)
    if room not in rooms:
        rooms[room] = {'players': [sid], 'board': [["" for _ in range(15)] for _ in range(15)], 'turn': 'X', 'timer': None, 'paused': False, 'move_count': 0}
        emit('room_created', {'room': room}, room=sid)
    else:
        if len(rooms[room]['players']) < 2:
            rooms[room]['players'].append(sid)
            emit('start_dynamic_game', {'symbol': 'O'}, room=sid)
            emit('start_dynamic_game', {'symbol': 'X'}, room=rooms[room]['players'][0])
            socketio.start_background_task(start_timer, room, 'X')
        else:
            emit('room_full', {}, room=sid)

@socketio.on('create_room')
def on_create_room():
    """Tạo một phòng mới với ID duy nhất."""
    sid = request.sid
    room_id = str(uuid.uuid4())[:8]  # Tạo ID phòng ngẫu nhiên (8 ký tự)
    rooms[room_id] = {'players': [sid], 'board': [["" for _ in range(15)] for _ in range(15)], 'turn': 'X', 'timer': None, 'paused': False, 'move_count': 0}
    join_room(room_id)
    emit('room_created', {'room': room_id}, room=sid)

@socketio.on('make_move')
def on_move(data):
    room = data['room']
    row = data['row']
    col = data['col']
    symbol = data['symbol']
    if room in rooms:
        board = rooms[room]['board']
        if board[row][col] == "" and not rooms[room]['paused']:
            board[row][col] = symbol
            rooms[room]['turn'] = 'O' if symbol == 'X' else 'X'
            emit("update_board", {'row': row, 'col': col, 'symbol': symbol}, room=room)
            is_win, winning_cells = check_win(board, row, col, symbol)
            if is_win:
                emit("game_over", {'winner': symbol, 'winning_cells': winning_cells, 'reason': 'win'}, room=room)
                rooms[room]['timer'] = None
                rooms[room]['paused'] = False
            elif is_board_full(board):
                emit("game_over", {'winner': None, 'winning_cells': [], 'reason': 'draw'}, room=room)
                rooms[room]['timer'] = None
                rooms[room]['paused'] = False
            else:
                next_symbol = 'O' if symbol == 'X' else 'X'
                rooms[room]['timer'] = None
                socketio.start_background_task(start_timer, room, next_symbol)

@socketio.on('make_dynamic_move')
def on_dynamic_move(data):
    room = data['room']
    row = data['row']
    col = data['col']
    symbol = data['symbol']
    if room in rooms:
        board = rooms[room]['board']
        if board[row][col] == "" and not rooms[room]['paused']:
            board[row][col] = symbol
            rooms[room]['move_count'] += 1
            rooms[room]['turn'] = 'O' if symbol == 'X' else 'X'
            emit("update_board", {'row': row, 'col': col, 'symbol': symbol}, room=room)
            is_win, winning_cells = check_win(board, row, col, symbol)
            if is_win:
                emit("game_over", {'winner': symbol, 'winning_cells': winning_cells, 'reason': 'win'}, room=room)
                rooms[room]['timer'] = None
                rooms[room]['paused'] = False
            elif is_board_full(board):
                emit("game_over", {'winner': None, 'winning_cells': [], 'reason': 'draw'}, room=room)
                rooms[room]['timer'] = None
                rooms[room]['paused'] = False
            else:
                if rooms[room]['move_count'] % 3 == 0:
                    board = shuffle_board(board)
                    rooms[room]['board'] = board
                    emit("shuffle_board", {'board': board}, room=room)
                next_symbol = 'O' if symbol == 'X' else 'X'
                rooms[room]['timer'] = None
                socketio.start_background_task(start_timer, room, next_symbol)

@socketio.on('pause_game')
def on_pause(data):
    room = data['room']
    if room in rooms and not rooms[room]['paused']:
        rooms[room]['paused'] = True
        remaining = rooms[room]['timer'] - time.time() if rooms[room]['timer'] else 0
        rooms[room]['timer'] = remaining
        emit('game_paused', {'remaining': remaining}, room=room)

@socketio.on('resume_game')
def on_resume(data):
    room = data['room']
    if room in rooms and rooms[room]['paused']:
        rooms[room]['paused'] = False
        current_symbol = rooms[room]['turn']
        rooms[room]['timer'] = time.time() + rooms[room]['timer']
        socketio.start_background_task(start_timer, room, current_symbol)

@socketio.on('send_message')
def on_send_message(data):
    room = data['room']
    symbol = data['symbol']
    message = data['message'].strip()
    if room in rooms and message:
        emit('receive_message', {'symbol': symbol, 'message': message}, room=room)

@socketio.on('set_difficulty')
def on_set_difficulty(data):
    global ai_game_state
    difficulty = data['difficulty']
    if difficulty in ["easy", "medium", "hard"]:
        ai_game_state['difficulty'] = difficulty
        emit("difficulty_set", {'difficulty': difficulty})

@socketio.on('make_move_ai')
def on_move_ai(data):
    global ai_game_state
    row = data['row']
    col = data['col']
    symbol = data['symbol']
    board = ai_game_state['board']
    difficulty = ai_game_state['difficulty']
    if board[row][col] == "":
        board[row][col] = symbol
        emit("update_board_ai", {'row': row, 'col': col, 'symbol': symbol})
        is_win, winning_cells = check_win(board, row, col, symbol)
        if is_win:
            emit("game_over_ai", {'winner': symbol, 'winning_cells': winning_cells, 'reason': 'win'})
            ai_game_state['timer'] = None
            return
        if is_board_full(board):
            emit("game_over_ai", {'winner': None, 'winning_cells': [], 'reason': 'draw'})
            ai_game_state['timer'] = None
            return
        ai_game_state['timer'] = None
        time_limit = 0.3 if difficulty == "easy" else 0.8 if difficulty == "medium" else 1.5
        ai_move = mcts(board, (row, col), time_limit=time_limit, difficulty=difficulty)
        if ai_move:
            ai_row, ai_col = ai_move
            board[ai_row][ai_col] = "O"
            emit("update_board_ai", {'row': ai_row, 'col': ai_col, 'symbol': "O"})
            is_win, winning_cells = check_win(board, ai_row, ai_col, "O")
            if is_win:
                emit("game_over_ai", {'winner': "O", 'winning_cells': winning_cells, 'reason': 'win'})
                ai_game_state['timer'] = None
            elif is_board_full(board):
                emit("game_over_ai", {'winner': None, 'winning_cells': [], 'reason': 'draw'})
                ai_game_state['timer'] = None

@socketio.on('timeout_ai')
def on_timeout_ai():
    global ai_game_state
    if ai_game_state['turn'] == "X":  # Người chơi hết thời gian
        emit("game_over_ai", {'winner': "O", 'winning_cells': [], 'reason': 'timeout'})
        ai_game_state['timer'] = None

@socketio.on('restart_ai_game')
def on_restart_ai():
    global ai_game_state
    ai_game_state = {"board": [["" for _ in range(15)] for _ in range(15)], "turn": "X", "difficulty": ai_game_state.get('difficulty', 'medium'), "timer": None}
    emit("update_board_ai", {'row': -1, 'col': -1, 'symbol': ""})

if __name__ == '__main__':
    socketio.run(app, debug=True)