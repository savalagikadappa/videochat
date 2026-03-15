require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

const app = express();
const server = http.createServer(app);

// Environment variables
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || '*';
const REDIS_URL = process.env.REDIS_URL || null;

// Allow CORS for Express HTTP routes (if any)
app.use(cors({
    origin: FRONTEND_URL === '*' ? '*' : FRONTEND_URL.split(','),
    methods: ['GET', 'POST']
}));

// Configure Socket.IO with restrictive CORS
const io = new Server(server, {
    cors: {
        origin: FRONTEND_URL === '*' ? '*' : FRONTEND_URL.split(','),
        methods: ['GET', 'POST'],
    },
});

// Setup Redis Adapter if REDIS_URL is provided (for scaling across multiple Node instances)
if (REDIS_URL) {
    console.log('Redis URL found, configuring Redis adapter for Socket.IO...');
    const pubClient = createClient({ url: REDIS_URL });
    const subClient = pubClient.duplicate();

    Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
        io.adapter(createAdapter(pubClient, subClient));
        console.log('Successfully connected to Redis and configured Socket.IO adapter.');
    }).catch(err => {
        console.error('Failed to connect to Redis:', err);
    });
}

/**
 * Handle basic health check route instead of serving React app
 * Vercel or your frontend host will handle serving the static React files
 */
app.get('/', (req, res) => {
    res.send('Videochat signaling server is running');
});

// Store user ID to socket ID mapping
// Note: In a fully distributed Redis setup, this purely memory-based 'users' object 
// might need to be replaced with a Redis HSET depending on exact room semantics.
// However, the Redis adapter natively handles broadcasting to specific socket IDs across instances.
const users = {};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('register', (userId) => {
        users[userId] = socket.id;
        console.log(`User ${userId} registered with socket ${socket.id}`);
    });

    socket.on('call', ({ from, to, offer }) => {
        const targetSocketId = users[to];
        if (targetSocketId) {
            io.to(targetSocketId).emit('incoming-call', { from, offer });
        } else {
            // Emitting back to the caller using their socket ID if target not found locally
            socket.emit('call-error', 'User not found or offline');
        }
    });

    socket.on('answer', ({ to, answer }) => {
        const targetSocketId = users[to];
        if (targetSocketId) {
            io.to(targetSocketId).emit('call-answered', { answer });
        }
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
        const targetSocketId = users[to];
        if (targetSocketId) {
            io.to(targetSocketId).emit('ice-candidate', { candidate });
        }
    });

    socket.on('end-call', ({ to }) => {
        const targetSocketId = users[to];
        if (targetSocketId) {
            io.to(targetSocketId).emit('end-call');
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (const [userId, socketId] of Object.entries(users)) {
            if (socketId === socket.id) {
                delete users[userId];
                break;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});