// controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');

// --- ADMIN AUTH ---

exports.loginAdmin = async (req, res) => {
    try {
        const { username, password } = req.body;

        const admin = await prisma.adminUser.findUnique({
            where: { username }
        });

        if (admin && (await bcrypt.compare(password, admin.password))) {
            const token = jwt.sign(
                { userId: admin.id, role: admin.role },
                process.env.ADMIN_JWT_SECRET,
                { expiresIn: '12h' }
            );

            res.json({
                message: 'Admin login successful',
                token,
                user: {
                    id: admin.id,
                    username: admin.username,
                    role: admin.role
                }
            });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (error) {
        console.error("Admin Login Error:", error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

// --- TEAM AUTH ---

exports.loginTeam = async (req, res) => {
    try {
        const { teamCode, password } = req.body;

        const team = await prisma.team.findUnique({
            where: { teamCode }
        });

        if (!team) {
            return res.status(401).json({ message: 'Invalid Team Code or Password' });
        }

        if (await bcrypt.compare(password, team.password)) {

            // Prevent double logins unless allowed
            if (team.isActive) {
                return res.status(400).json({ message: 'Team is already logged in elsewhere.' });
            }

            // Mark team as active
            await prisma.team.update({
                where: { id: team.id },
                data: { isActive: true }
            });

            const token = jwt.sign(
                { teamId: team.id, teamCode: team.teamCode, role: 'participant' },
                process.env.JWT_SECRET,
                { expiresIn: '12h' }
            );

            // We should broadcast this to admin via socket from the route when possible,
            // or from the frontend once it connects to the socket with the team token.

            res.status(200).json({
                message: 'Login successful',
                token,
                team: {
                    id: team.id,
                    teamName: team.teamName,
                    teamCode: team.teamCode
                }
            });
        } else {
            res.status(401).json({ message: 'Invalid Team Code or Password' });
        }
    } catch (error) {
        console.error("Team Login Error:", error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

exports.logoutTeam = async (req, res) => {
    try {
        const { teamId } = req.user; // from protectTeam middleware

        await prisma.team.update({
            where: { id: teamId },
            data: { isActive: false }
        });

        res.status(200).json({ message: 'Logout successful' });
    } catch (error) {
        console.error("Team Logout Error:", error);
        res.status(500).json({ message: 'Server error during logout' });
    }
};
