// controllers/teamController.js
const prisma = require('../config/db');
const redis = require('../config/redis');

// --- Buzzer Logic for Teams ---

exports.buzz = async (req, res) => {
    try {
        const { teamId } = req.user;

        // 1. Is the buzzer enabled?
        const state = await redis.hgetall('quiz:state');

        // Check if the buzzer is actually active
        if (!state || state.buzzerEnabled !== 'true') {
            return res.status(400).json({ message: 'Buzzer is currently disabled.' });
        }

        const { questionId } = state;

        // 2. Has this team already buzzed for this question?
        const existingBuzz = await redis.zscore(`quiz:buzzes:${questionId}`, teamId);

        if (existingBuzz !== null) {
            return res.status(400).json({ message: 'You have already buzzed for this question.' });
        }

        // 3. Register the buzz with a precise MS timestamp score
        // Lower score is faster (better)
        const buzzTimeMs = Date.now();
        await redis.zadd(`quiz:buzzes:${questionId}`, buzzTimeMs, teamId);

        // Save history to PG
        await prisma.buzzHistory.create({
            data: {
                teamId,
                questionId,
                buzzTimeMs: BigInt(buzzTimeMs),
                wasFirst: false // We evaluate 'first' later via the admin API
            }
        });

        res.json({ message: 'Buzz registered successfully!', timestamp: buzzTimeMs });

    } catch (error) {
        console.error('Buzzer Registration Error:', error);
        res.status(500).json({ message: 'Error registering buzz' });
    }
};

exports.getTeamProfile = async (req, res) => {
    try {
        const team = await prisma.team.findUnique({
            where: { id: req.user.teamId },
            select: {
                teamName: true,
                teamCode: true,
                score: true,
                isActive: true
            }
        });

        res.json({ team });
    } catch (error) {
        res.status(500).json({ message: 'Error getting team profile' });
    }
};
