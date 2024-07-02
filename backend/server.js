const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);

// Serve static files from the root directory
app.use(express.static(__dirname));

// Route for serving the index.html
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Object to store client orientation data
const clientOrientationData = {};

io.on('connection', (socket) => {
  console.log('a user connected with ID:', socket.id);

  // Initialize client data
  clientOrientationData[socket.id] = {
    alpha: 0,
    beta: 0,
    gamma: 0
  };

  socket.on('gyroscopeData', (data) => {
    console.log('Gyroscope data received from', data.socketId, ':', data);
    
    // Update client orientation data
    clientOrientationData[data.socketId] = {
      alpha: data.alpha,
      beta: data.beta,
      gamma: data.gamma
    };
    
    // Optionally, broadcast the updated data to all clients
    io.emit('allClientData', clientOrientationData);
  });

  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
    
    // Remove client data when they disconnect
    delete clientOrientationData[socket.id];
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`listening on *:${PORT}`);
});