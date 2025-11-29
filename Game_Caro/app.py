from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import uuid


app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

rooms = {}

@app.route('/')
def index():
    return render_template('index.html')

def check_win(board, row, col, symbol):
    directions = [(1, 0), (0, 1), (1, 1), (1, -1)]  # dọc, ngang, chéo chính, chéo phụ

    for dr, dc in directions:
        count = 1

        # Check phía trước
        r, c = row - dr, col - dc
        while 0 <= r < 15 and 0 <= c < 15 and board[r][c] == symbol:
            count += 1
            r -= dr
            c -= dc

        # Check phía sau
        r, c = row + dr, col + dc
        while 0 <= r < 15 and 0 <= c < 15 and board[r][c] == symbol:
            count += 1
            r += dr
            c += dc

        if count >= 5:
            return True

    return False

@socketio.on('join_game')
def on_join(data):
    sid = request.sid
    room = data.get('room')
    join_room(room)

    if room not in rooms:
        rooms[room] = {'players': [sid], 'board': [["" for _ in range(15)] for _ in range(15)], 'turn': 'X'}
        emit('room_created', {'room': room}, room=sid)
    else:
        if len(rooms[room]['players']) < 2:
            rooms[room]['players'].append(sid)
            emit('start_game', {'symbol': 'O'}, room=sid)
            emit('start_game', {'symbol': 'X'}, room=rooms[room]['players'][0])
        else:
            emit('room_full', {}, room=sid)

@socketio.on('make_move')
def on_move(data):
    room = data['room']
    row = data['row']
    col = data['col']
    symbol = data['symbol']

    if room in rooms:
        board = rooms[room]['board']
        if board[row][col] == "":
            board[row][col] = symbol
            emit("update_board", {'row': row, 'col': col, 'symbol': symbol}, room=room)

            if check_win(board, row, col, symbol):
                emit("game_over", {'winner': symbol}, room=room)

if __name__ == '__main__':
    socketio.run(app, debug=True)


