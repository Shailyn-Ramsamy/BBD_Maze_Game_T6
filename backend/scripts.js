/*

If you want to know how this game works, you can find a source code walkthrough video here: https://youtu.be/bTk6dcAckuI

Follow me on twitter for more: https://twitter.com/HunorBorbely

*/

const socket = io();
let socketId = null;
isHost = false;

Math.minmax = (value, limit) => {
  return Math.max(Math.min(value, limit), -limit);
};

const distance2D = (p1, p2) => {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
};

// Angle between the two points
const getAngle = (p1, p2) => {
  let angle = Math.atan((p2.y - p1.y) / (p2.x - p1.x));
  if (p2.x - p1.x < 0) angle += Math.PI;
  return angle;
};

// The closest a ball and a wall cap can be
const closestItCanBe = (cap, ball) => {
  let angle = getAngle(cap, ball);

  const deltaX = Math.cos(angle) * (wallW / 2 + ballSize / 2);
  const deltaY = Math.sin(angle) * (wallW / 2 + ballSize / 2);

  return { x: cap.x + deltaX, y: cap.y + deltaY };
};

// Roll the ball around the wall cap
const rollAroundCap = (cap, ball) => {
  // The direction the ball can't move any further because the wall holds it back
  let impactAngle = getAngle(ball, cap);

  // The direction the ball wants to move based on it's velocity
  let heading = getAngle(
    { x: 0, y: 0 },
    { x: ball.velocityX, y: ball.velocityY }
  );

  // The angle between the impact direction and the ball's desired direction
  // The smaller this angle is, the bigger the impact
  // The closer it is to 90 degrees the smoother it gets (at 90 there would be no collision)
  let impactHeadingAngle = impactAngle - heading;

  // Velocity distance if not hit would have occurred
  const velocityMagnitude = distance2D(
    { x: 0, y: 0 },
    { x: ball.velocityX, y: ball.velocityY }
  );
  // Velocity component diagonal to the impact
  const velocityMagnitudeDiagonalToTheImpact =
    Math.sin(impactHeadingAngle) * velocityMagnitude;

  // How far should the ball be from the wall cap
  const closestDistance = wallW / 2 + ballSize / 2;

  const rotationAngle = Math.atan(
    velocityMagnitudeDiagonalToTheImpact / closestDistance
  );

  const deltaFromCap = {
    x: Math.cos(impactAngle + Math.PI - rotationAngle) * closestDistance,
    y: Math.sin(impactAngle + Math.PI - rotationAngle) * closestDistance
  };

  const x = ball.x;
  const y = ball.y;
  const velocityX = ball.x - (cap.x + deltaFromCap.x);
  const velocityY = ball.y - (cap.y + deltaFromCap.y);
  const nextX = x + velocityX;
  const nextY = y + velocityY;

  return { x, y, velocityX, velocityY, nextX, nextY };
};

// Decreases the absolute value of a number but keeps it's sign, doesn't go below abs 0
const slow = (number, difference) => {
  if (Math.abs(number) <= difference) return 0;
  if (number > difference) return number - difference;
  return number + difference;
};

const mazeElement = document.getElementById("maze");

document.addEventListener("DOMContentLoaded", function () {
  var overlay = document.getElementById('overlay');
  var button = document.getElementById('join-button');

  button.addEventListener('click', function () {
    overlay.style.display = 'none'; // Hide the overlay when "Join" is clicked
  });
});

// const joystickButton = document.getElementById("joystick-head");
// joystickButton.addEventListener("click", startGame);

socket.on('host', (host) => {
  if (socket.id === host) {
    isHost = true;
    document.getElementById('start-game-button').style.display = 'block';
  }
});

document.getElementById('start-game-button').addEventListener('click', () => {
  if (isHost) {
    socket.emit('startGame');
  }
});

socket.on('pixelWalls', (pixelWalls) => {
  pixelWalls.forEach(({ x, y, horizontal, length }) => {
    const wall = document.createElement("div");
    wall.setAttribute("class", "wall");
    wall.style.cssText = `
          left: ${x}px;
          top: ${y}px;
          width: ${wallW}px;
          height: ${length}px;
          transform: rotate(${horizontal ? -90 : 0}deg);
      `;
    mazeElement.appendChild(wall);
  });
});

const noteElement = document.getElementById("note"); // Note element for instructions and game won, game failed texts

let hardMode = false;
let previousTimestamp;
let gameInProgress;
let mouseStartX;
let mouseStartY;
let accelerationX;
let accelerationY;
let frictionX;
let frictionY;

const pathW = 25; // Path width
const wallW = 10; // Wall width
const ballSize = 10; // Width and height of the ball
const holeSize = 18;

const debugMode = false;

let balls = [];
let ballElements = [];
let holeElements = [];

socket.on('connect', () => {
  socketId = socket.id;
  console.log('Connected with socket ID:', socketId);
});

if (window.DeviceOrientationEvent) {
  window.addEventListener('deviceorientation', handleOrientation);
} else if (window.DeviceMotionEvent) {
  window.addEventListener('devicemotion', handleMotion);
} else {
  console.log("Device orientation or motion not supported.");
}

function handleOrientation(event) {
  const beta = event.beta;
  const gamma = event.gamma;

  // Emit orientation data to the server with socket ID
  socket.emit('gyroscopeData', { socketId, beta, gamma });

  console.log(`Orientation - Beta: ${beta}, Gamma: ${gamma}`);
}

// Listen for average orientation updates from the server
socket.on('averageOrientation', (averageOrientation) => {
  console.log('Received average orientation:', averageOrientation);

  // Apply the average orientation to the maze
  const rotationY = averageOrientation.gamma * 0.8; // Adjust the multiplier based on sensitivity
  const rotationX = averageOrientation.beta * 0.8; // Adjust the multiplier based on sensitivity

  if (window.matchMedia("(min-width: 768px)").matches) {
    mazeElement.style.cssText = `
      transform: rotateY(${rotationY}deg) rotateX(${-rotationX}deg)
    `;
  }
});

let initialGamma = 0;

if (window.DeviceOrientationEvent) {
  // Listen for deviceorientation event
  window.addEventListener("deviceorientation", function (event) {
    if (initialGamma === 0) {
      initialGamma = event.gamma; // Store initial gamma angle
      setInitialMazeOrientation(initialGamma);
    }
  }, true);
} else {
  console.log("Sorry, your browser doesn't support Device Orientation");
}

function setInitialMazeOrientation(initialGamma) {
  // Adjust the maze tilt based on the gyroscope readings
  const rotationY = initialGamma * 0.8; // Adjust the multiplier based on sensitivity
  const rotationX = 0; // Adjust based on your specific requirements

  mazeElement.style.cssText = `
    transform: rotateY(${rotationY}deg) rotateX(${-rotationX}deg);
  `;
}

const colors = ['#FF0000', '#00FF00', '#0000FF', '#e603da']; // Array of predefined colors
let currentColorIndex = 0;

function getNextColor() {
  const color = colors[currentColorIndex];
  currentColorIndex = (currentColorIndex + 1) % colors.length; // Move to the next color, wrapping around if needed
  return color;
}

const mazecolors = ['#581717', '#2a662d', '#373e7a', '#4c2368']; // Array of predefined colors
let mazecurrentColorIndex = 0;

function mazegetNextColor() {
  const mazecolor = mazecolors[mazecurrentColorIndex];
  mazecurrentColorIndex = (mazecurrentColorIndex + 1) % mazecolors.length; // Move to the next color, wrapping around if needed
  return mazecolor;
}

const backgroundElement = document.querySelector('.background');



function createBallElement(ball) {
  const ballElement = document.createElement('div');
  ballElement.className = 'ball';
  ballElement.id = `ball-${ball.id}`;
  ballElement.style.left = `${ball.x}px`;
  ballElement.style.top = `${ball.y}px`;
  ballElement.style.width = `${ballSize}px`;
  ballElement.style.height = `${ballSize}px`;
  ballElement.style.backgroundColor = getNextColor();



  mazeElement.appendChild(ballElement);
  balls.push(ball);
  ballElements.push(ballElement);
}

socket.on('newBall', (ball) => {
  if (ball.id !== socket.id) { // Check if the ball's socketId is not the same as the current client's socketId
    createBallElement(ball);
  }
});

socket.on('existingBalls', (existingBalls) => {
  existingBalls.forEach(ball => {
    backgroundElement.style.backgroundColor = mazegetNextColor()
    createBallElement(ball);
  });
});

socket.on('removeBall', (ballId) => {
  const ballElement = document.getElementById(`ball-${ballId}`);
  if (ballElement) {
    mazeElement.removeChild(ballElement);
  }
  balls = balls.filter(ball => ball.id !== ballId);
  ballElements = ballElements.filter(element => element.id !== `ball-${ballId}`);
});

socket.on('updateBallPositions', (updatedBalls) => {
  updateBallPositionsOnUI(updatedBalls);
});

function updateBallPositionsOnUI(updatedBalls) {
  updatedBalls.forEach((ball) => {
    updateBallPosition(ball);
  });
}

function updateBallPosition(ball) {
  console.log(ball.x);
  const ballElement = document.getElementById(`ball-${ball.id}`);
  if (ballElement) {
    ballElement.style.left = `${ball.x}px`;
    ballElement.style.top = `${ball.y}px`;
  }
}

const endElement = document.getElementById("end");

function getColorName(rgb) {
  // Remove spaces and split the RGB string
  const [r, g, b] = rgb.replace(/\s/g, '').slice(4, -1).split(',').map(Number);

  // Define common colors
  const colorMap = {
    '255,0,0': 'Red',
    '0,255,0': 'Green',
    '0,0,255': 'Blue',
    '230,3,218': 'Purple',
    // Add more colors as needed
  };

  // Check if the RGB values match any predefined color
  const colorKey = `${r},${g},${b}`;
  if (colorMap[colorKey]) {
    return colorMap[colorKey];
  }

  // If no match, return the original RGB string
  return rgb;
}

function announceWinner(color) {

  const colorName = getColorName(color);

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = color;
  overlay.style.display = 'flex';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  overlay.style.zIndex = '9999';
  overlay.style.opacity = '0';
  overlay.style.transition = 'opacity 0.5s ease-in-out';

  const message = document.createElement('div');

  let text;

  if (colour = "") {

  }

  message.textContent = `${colorName} has won!`;
  message.style.color = 'white';
  message.style.fontSize = '3rem';
  message.style.fontWeight = 'bold';
  message.style.textAlign = 'center';
  message.style.padding = '20px';
  message.style.backgroundColor = color;
  message.style.borderRadius = '10px';

  overlay.appendChild(message);
  document.body.appendChild(overlay);

  // Fade in the overlay
  setTimeout(() => {
    overlay.style.opacity = '1';
  }, 0);

  // Remove the overlay after 5 seconds
  setTimeout(() => {
    overlay.style.opacity = '0';
    setTimeout(() => {
      document.body.removeChild(overlay);
    }, 500); // Wait for fade-out transition to complete
  }, 5000);
}
// Function to check if a ball has reached the end
function checkWinCondition(ball) {
  const ballRect = ball.getBoundingClientRect();
  const endRect = endElement.getBoundingClientRect();

  if (
    ballRect.left >= endRect.left &&
    ballRect.right <= endRect.right &&
    ballRect.top >= endRect.top &&
    ballRect.bottom <= endRect.bottom
  ) {
    // Notify the server that the game is won
    socket.emit('gameWon', ball.id);
  }
}

// Call checkWinCondition for each ball on a regular interval (e.g., every frame update)
function checkAllBalls() {
  ballElements.forEach(ballElement => {
    const ball = balls.find(b => `ball-${b.id}` === ballElement.id);
    if (ball) {
      checkWinCondition(ballElement);
    }
  });
}

socket.on('gameWon', (ballId) => {
  console.log("YESSSSSSSSSSSSSSSSSSSSS")

  const ballElement = ballElements.find(element => element.id === ballId);

  if (ballElement) {
    const ballColor = ballElement.style.backgroundColor;
    announceWinner(ballColor)
  } else {
    console.log("Ball element not found for ID:", ballId);
  }
});


// Example: Call checkAllBalls every 100 milliseconds
setInterval(checkAllBalls, 100);
