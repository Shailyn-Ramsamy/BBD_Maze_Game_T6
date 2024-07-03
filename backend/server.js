const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

const pathW = 25; // Path width
const wallW = 10; // Wall width

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const clientOrientationData = {};
let averageOrientation = { beta: 0, gamma: 0 };
let host = null
let start = false

function calculateAverageOrientation() {
  const clientCount = Object.keys(clientOrientationData).length;
  if (clientCount === 0) return { beta: 0, gamma: 0 };

  let totalBeta = 0;
  let totalGamma = 0;

  for (let clientId in clientOrientationData) {
    totalBeta += clientOrientationData[clientId].beta;
    totalGamma += clientOrientationData[clientId].gamma;
  }

  return {
    beta: totalBeta / clientCount,
    gamma: totalGamma / clientCount
  };
}

const rows = 10;
const cols = 10;

const cells = [];
for (let x = 0; x < cols; x++) {
    cells[x] = [];
    for (let y = 0; y < rows; y++) {
        cells[x][y] = {
            x,
            y,
            walls: { top: true, right: true, bottom: true, left: true },
            visited: false
        };
    }
}

function genMaze(x, y) {
  const presentCell = cells[x][y];
  presentCell.visited = true;

  const directions = randomize(['top', 'right', 'bottom', 'left']);

  for (const direction of directions) {
    const dx = { top: 0, right: 1, bottom: 0, left: -1 }[direction];
    const dy = { top: -1, right: 0, bottom: 1, left: 0 }[direction];

    const newX = x + dx;
    const newY = y + dy;
    // if the coordinates are inbound and not on the border
    if (newX > 0 && newX < cols - 1 && newY > 0 && newY < rows - 1) {
      const neighbour = cells[newX][newY];

      // removing walls
      if (!neighbour.visited) {
        presentCell.walls[direction] = false;
        neighbour.walls[{
          top: 'bottom',
          right: 'left',
          bottom: 'top',
          left: 'right',
        }[direction]] = false;
        genMaze(newX, newY);
      }
    }
  }
  generatedMaze = cells.map(row => row.map(cell => ({ ...cell })));
  solutionPath = solveMaze();
}

// Start maze generation from a non-border cell
genMaze(1, 1);

// Convert cells to walls array
const walls = [];
for (let x = 0; x < rows; x++) {
  for (let y = 0; y < cols; y++) {
    const cell = cells[x][y];
    if (x > 0 && cell.walls.left) walls.push({ column: x, row: y, horizontal: false, length: 1 });
    if (y > 0 && cell.walls.top) walls.push({ column: x, row: y, horizontal: true, length: 1 });
  }
}

console.log(walls)

// Map walls to pixel positions
const pixelWalls = walls.map((wall) => ({
  x: wall.column * (pathW + wallW),
  y: wall.row * (pathW + wallW),
  horizontal: wall.horizontal,
  length: wall.length * (pathW + wallW)
}));

function randomize(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function solveMaze() {
  const visited =
    Array.from({ length: rows },
      () => Array(cols).fill(false));
  const path = [];

  function dfs(x, y) {
    if (x < 0 || x >= cols || y < 0 ||
      y >= rows || visited[y][x]) {
      return false;
    }

    visited[y][x] = true;
    path.push({ x, y });

    if (x === cols - 1 && y === rows - 1) {
      return true;
    }

    const cell = generatedMaze[x][y];

    if (!cell.walls.top && dfs(x, y - 1)) {
      return true;
    }
    if (!cell.walls.right && dfs(x + 1, y)) {
      return true;
    }
    if (!cell.walls.bottom && dfs(x, y + 1)) {
      return true;
    }
    if (!cell.walls.left && dfs(x - 1, y)) {
      return true;
    }

    path.pop();
    return false;
  }

  dfs(0, 0);
  return path;
}

io.on('connection', (socket) => {
  console.log('a user connected with ID:', socket.id);

  if (!host){
    host = socket.id
    console.log(host + "is host")
    io.emit('host', host)
  }

  socket.on('startGame', () => {
    start = true; // Set start to true
    io.emit('gameStarted'); // Emit gameStarted event to all clients
  });

  
  io.emit('pixelWalls', pixelWalls);

  io.emit('walls', pixelWalls);

  clientOrientationData[socket.id] = { beta: 0, gamma: 0 };

  socket.on('gyroscopeData', (data) => {
    console.log('Gyroscope data received from', data.socketId, ':', data);
    
    clientOrientationData[data.socketId] = {
      beta: data.beta,
      gamma: data.gamma
    };
    
    averageOrientation = calculateAverageOrientation();
    
    // Broadcast the average orientation to all clients
    io.emit('averageOrientation', averageOrientation);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
    delete clientOrientationData[socket.id];
    averageOrientation = calculateAverageOrientation();
    io.emit('averageOrientation', averageOrientation);

    if (socket.id === host) {
      host = null; // Reset host
      // Optionally, you can assign a new host from the remaining clients
      const remainingClients = Object.keys(clientOrientationData);
      if (remainingClients.length > 0) {
        host = remainingClients[0];
        io.emit('host', host);
      }
    }

  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});