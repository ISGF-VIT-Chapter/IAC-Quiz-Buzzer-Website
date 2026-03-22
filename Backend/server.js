const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const adminRoutes = require('./routes/adminRoutes');
const teamRoutes = require('./routes/teamRoutes');

const app = express();
const server = http.createServer(app);

// Socket.io initialization with CORS
const io = new Server(server, {
    cors: {
        origin: '*', // We can lock this down in production
        methods: ['GET', 'POST']
    }
});

// Store io instance internally so controllers can use it via req.app.get('io')
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());

// Basic logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// REST Routes
app.use('/api/admin', adminRoutes);
app.use('/api/team', teamRoutes);

app.get('/', (req, res) => {
    res.send('🚀 QuizMaster Pro Backend is running! (Railway + Redis + PC)');
});

// --- Socket.IO Real-time Logic --- //
io.on('connection', (socket) => {
    console.log(`🔌 New client connected: ${socket.id}`);

    // When a team logs in, they should join their specific room and the 'teams' broadcast room
    socket.on('joinTeam', (teamId) => {
        socket.join(`team_${teamId}`);
        socket.join('teams'); // broadcast room for all teams
        console.log(`🏠 Socket ${socket.id} joined team cell: ${teamId}`);
    });

    // When admin logs in, they join the admin room
    socket.on('joinAdmin', () => {
        socket.join('admin');
        console.log(`👑 Socket ${socket.id} joined admin room`);
    });

    // Handle explicit disconnect from the frontend
    socket.on('disconnect', () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
    });
});

// Start the server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🔥 WebSocket + Express running on http://localhost:${PORT}`);
});
