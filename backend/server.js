const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Create an Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Handle new WebSocket connections
io.on('connection', (socket) => {
    console.log('a user connected');

    // Handle player move events
    socket.on('playerMove', (data) => {
        console.log('Player moved:', data);
        // Broadcast the move to all other clients
        socket.broadcast.emit('playerMoved', data);
    });

    // Handle disconnections
    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});

// Define the port and host
const PORT = process.env.PORT || 3000;
const HOST = '192.168.47.108'; // Replace with your computer's local IP address

// Start the server
server.listen(PORT, HOST, () => {
    console.log(`Server is running on http://${HOST}:${PORT}`);
});
