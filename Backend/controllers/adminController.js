// controllers/adminController.js
const prisma = require('../config/db');
const redis = require('../config/redis');
const bcrypt = require('bcryptjs');

// --- Team Management ---

exports.getAllTeams = async (req, res) => {
    try {
        const teams = await prisma.team.findMany({
            select: {
                id: true,
                teamName: true,
                teamCode: true,
                score: true,
                isActive: true,
                createdAt: true
            },
            orderBy: { createdAt: 'desc' }
        });
        res.json({ teams });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching teams' });
    }
};

exports.addTeam = async (req, res) => {
    try {
        const { teamName, teamCode, password } = req.body;

        if (!teamName || !teamCode || !password) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const existingTeam = await prisma.team.findUnique({ where: { teamCode } });
        if (existingTeam) return res.status(400).json({ message: 'Team code already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const team = await prisma.team.create({
            data: {
                teamName,
                teamCode,
                password: hashedPassword,
                score: 0,
                isActive: false
            }
        });

        res.status(201).json({ message: 'Team created', teamId: team.id });
    } catch (error) {
        console.error('Adding team error:', error);
        res.status(500).json({ message: 'Error creating team' });
    }
};

exports.deleteTeam = async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.team.delete({ where: { id } });

        // Attempt to remove them from redis too
        await redis.zrem('quiz:leaderboard', id);

        res.json({ message: 'Team deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting team' });
    }
};

exports.toggleTeamStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        const team = await prisma.team.update({
            where: { id },
            data: { isActive }
        });

        // Broadcast via socketio
        const io = req.app.get('io');
        if (io) {
            io.emit('teamStatusChanged', { teamId: team.id, isActive: team.isActive });
        }

        res.json({ message: 'Team status updated', team });
    } catch (error) {
        res.status(500).json({ message: 'Error updating team status' });
    }
};
