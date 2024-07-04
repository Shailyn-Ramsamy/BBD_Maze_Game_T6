const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

const clients = new Map();
const balls = new Map();

const pathW = 25; // Path width
const wallW = 10; // Wall width
const ballSize = 10;
const maxVelocity = 1.5;
const gravity = 2;
const friction = 0.01;

function updateBallPhysics(ball, averageOrientation, timeElapsed) {
  const accelerationX = gravity * Math.sin((averageOrientation.gamma / 180) * Math.PI);
  const accelerationY = gravity * Math.sin((averageOrientation.beta / 180) * Math.PI);
  const frictionX = gravity * Math.cos((averageOrientation.gamma / 180) * Math.PI) * friction;
  const frictionY = gravity * Math.cos((averageOrientation.beta / 180) * Math.PI) * friction;

  const velocityChangeX = accelerationX * timeElapsed;
  const velocityChangeY = accelerationY * timeElapsed;
  const frictionDeltaX = frictionX * timeElapsed;
  const frictionDeltaY = frictionY * timeElapsed;

  ball.velocityX = updateVelocity(ball.velocityX, velocityChangeX, frictionDeltaX);
  ball.velocityY = updateVelocity(ball.velocityY, velocityChangeY, frictionDeltaY);

  ball.nextX = ball.x + ball.velocityX;
  ball.nextY = ball.y + ball.velocityY;

  handleWallCollisions(ball);

  ball.x = ball.nextX;
  ball.y = ball.nextY;
}

function updateVelocity(velocity, velocityChange, frictionDelta) {
  if (velocityChange === 0) {
    return slow(velocity, frictionDelta);
  } else {
    velocity += velocityChange;
    velocity -= Math.sign(velocityChange) * frictionDelta;
    return Math.max(Math.min(velocity, maxVelocity), -maxVelocity);
  }
}

function slow(number, difference) {
  if (Math.abs(number) <= difference) return 0;
  if (number > difference) return number - difference;
  return number + difference;
}

function handleWallCollisions(ball) {
  pixelWalls.forEach((wall) => {
    if (wall.horizontal) {
      if (
        ball.nextY + ballSize / 2 >= wall.y - wallW / 2 &&
        ball.nextY - ballSize / 2 <= wall.y + wallW / 2 &&
        ball.nextX >= wall.x &&
        ball.nextX <= wall.x + wall.length
      ) {
        if (ball.y < wall.y) {
          ball.nextY = wall.y - wallW / 2 - ballSize / 2;
        } else {
          ball.nextY = wall.y + wallW / 2 + ballSize / 2;
        }
        ball.velocityY = -ball.velocityY / 3;
      }
    } else {
      if (
        ball.nextX + ballSize / 2 >= wall.x - wallW / 2 &&
        ball.nextX - ballSize / 2 <= wall.x + wallW / 2 &&
        ball.nextY >= wall.y &&
        ball.nextY <= wall.y + wall.length
      ) {
        if (ball.x < wall.x) {
          ball.nextX = wall.x - wallW / 2 - ballSize / 2;
        } else {
          ball.nextX = wall.x + wallW / 2 + ballSize / 2;
        }
        ball.velocityX = -ball.velocityX / 3;
      }
    }
  });
}

let gameRunning = true;

function gameLoop() {
  if (!gameRunning) {
    return; // Exit the function if gameRunning is false
  }
  const now = Date.now();
  const timeElapsed = (now - lastUpdate) / 16; // Assuming 60 FPS
  lastUpdate = now;

  balls.forEach((ball) => {
    updateBallPhysics(ball, averageOrientation, timeElapsed);
  });

  console.log(balls)

  io.emit('updateBallPositions', Array.from(balls.values()));

  setTimeout(gameLoop, 1000 / 60); // Run at 60 FPS
}

let lastUpdate = Date.now();
let gameStarted = false;


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

const MAX_CLIENTS = 5;
const ballPositions = [
  { column: 1, row: 1 },
  { column: 8, row: 1 },
  { column: 1, row: 8 },
  { column: 8, row: 8 }
];

io.on('connection', (socket) => {
  console.log('a user connected with ID:', socket.id);

  if (!host) {
    host = socket.id
    console.log(host + "is host")
    io.emit('host', host)
  }


  else if (clients.size < MAX_CLIENTS) {
    const ballPosition = ballPositions[clients.size];
    const ball = {
      id: socket.id,
      x: ballPosition.column * (wallW + pathW) + (wallW / 2 + pathW / 2),
      y: ballPosition.row * (wallW + pathW) + (wallW / 2 + pathW / 2),
      velocityX: 0,
      velocityY: 0
    };
    clients.set(socket.id, { ballPosition });
    balls.set(socket.id, ball);

    // Notify all clients about the new ball
    io.emit('newBall', ball);

    // Send the current state of all balls to the new client
    socket.emit('existingBalls', Array.from(balls.values()));
  } else {
    console.log('Maximum number of clients reached. Rejecting connection.');
    socket.disconnect(true);
    return;
  }

  socket.on('startGame', () => {
    if (!gameStarted) {
      gameStarted = true;
      lastUpdate = Date.now();
      gameLoop();
    }
    io.emit('gameStarted');
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

  socket.on('gameWon', (ballId) => {
    // Implement win logic here, e.g., broadcast a win event to all clients
    console.log(`Ball ${ballId} has won the game!`);

    // Broadcast the win event to all clients
    gameRunning = false;
    io.emit('gameWon', ballId);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
    if (clients.has(socket.id)) {
      clients.delete(socket.id);
      balls.delete(socket.id);
      io.emit('removeBall', socket.id);
    }
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