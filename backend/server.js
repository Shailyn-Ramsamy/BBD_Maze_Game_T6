const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const clientOrientationData = {};
let averageOrientation = { beta: 0, gamma: 0 };

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

io.on('connection', (socket) => {
  console.log('a user connected with ID:', socket.id);

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
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});