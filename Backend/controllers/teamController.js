// controllers/teamController.js
const prisma = require('../config/db');
const redis = require('../config/redis');

// --- Buzzer Logic for Teams ---

exports.buzz = async (req, res) => {
    // CAPTURE IMMEDIATELY to avoid Redis network lag adding seconds to their time!
    const buzzTimeMs = Date.now();

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
        await redis.zadd(`quiz:buzzes:${questionId}`, buzzTimeMs, teamId);

        // Save history to PG (InBackground)
        prisma.buzzHistory.create({
            data: {
                teamId,
                questionId,
                buzzTimeMs: BigInt(buzzTimeMs),
                wasFirst: false
            }
        }).catch(err => console.error("PG History error:", err));

        // 4. Check if this buzz was the FASTEST
        const rank = await redis.zrank(`quiz:buzzes:${questionId}`, teamId);

        const io = req.app.get('io');
        let broadcastTeamName = 'Unknown Team';
        let payload = null;

        if (io) {
            const team = await prisma.team.findUnique({
                where: { id: teamId },
                select: { teamName: true }
            });
            if (team) broadcastTeamName = team.teamName;

            const activeStart = parseInt(state.activeRoundStartMs) || buzzTimeMs;
            const timeDiffMs = buzzTimeMs - activeStart;
            const timeDiffFormatted = (timeDiffMs / 1000).toFixed(3) + "s";

            payload = {
                teamId: teamId,
                teamName: broadcastTeamName,
                buzzTimeMs: buzzTimeMs,
                timeDiff: timeDiffFormatted,
                rank: rank + 1
            };

            // Only notify participants of the "winner" (First place) to gray out their screens
            if (rank === 0) {
                // Don't auto-lock! Let others keep buzzing to record their reaction times. 
                // However, their screens naturally lock on the frontend when they receive `buzzWinner`.
                io.emit('buzzWinner', payload);
            }

            // Alert Admin Dashboard of EVERY buzz so it can populate the scrollable table
            io.emit('teamBuzzed', payload);
        }

        res.json({ message: 'Buzz registered successfully!', timestamp: buzzTimeMs, payload: payload });

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
