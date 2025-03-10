// Updated server.js (Backend)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(cors());

const users = {};

io.on('connection', socket => {
    console.log(`User connected: ${socket.id}`);

    socket.on('register', userId => {
        users[userId] = socket.id;
        console.log(`User registered: ${userId} -> ${socket.id}`);
    });

    socket.on('call', ({ from, to, offer }) => {
        const recipientSocket = users[to];
        if (recipientSocket) {
            io.to(recipientSocket).emit('incoming-call', { from, offer });
        }
    });

    socket.on('answer', ({ to, answer }) => {
        const recipientSocket = users[to];
        if (recipientSocket) {
            io.to(recipientSocket).emit('call-answered', { answer });
        }
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
        const recipientSocket = users[to];
        if (recipientSocket) {
            io.to(recipientSocket).emit('ice-candidate', { candidate });
        }
    });

    socket.on('disconnect', () => {
        Object.keys(users).forEach(userId => {
            if (users[userId] === socket.id) {
                delete users[userId];
            }
        });
        console.log(`User disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
