// controllers/quizController.js
const prisma = require('../config/db');
const redis = require('../config/redis');

// --- Quiz State & Buzzer Logic ---

exports.enableBuzzer = async (req, res) => {
    // CAPTURE IMMEDIATELY to avoid admin network DB lag from affecting reaction time scores
    const exactStartTime = Date.now().toString();

    try {
        const { questionId } = req.body;

        if (!questionId) {
            return res.status(400).json({ message: 'questionId is required to start buzzer.' });
        }

        // Upstash / ioredis
        await redis.hset('quiz:state', {
            buzzerEnabled: 'true',
            questionId: String(questionId),
            activeRoundStartMs: exactStartTime
        });

        // Clear previous buzzes for this question (if any exist by mistake)
        await redis.del(`quiz:buzzes:${questionId}`);

        // Broadcast to all clients
        const io = req.app.get('io');
        if (io) {
            io.emit('buzzerEnabled', { questionId });
        }

        res.json({ message: 'Buzzer enabled', questionId });
    } catch (error) {
        console.error('Enable buzzer error:', error);
        res.status(500).json({ message: 'Failed to enable buzzer' });
    }
};

exports.disableBuzzer = async (req, res) => {
    try {
        await redis.hset('quiz:state', 'buzzerEnabled', 'false');

        const io = req.app.get('io');
        if (io) {
            io.emit('buzzerDisabled', {});
        }

        res.json({ message: 'Buzzer disabled' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to disable buzzer' });
    }
};

// Evaluate the fastest buzz from Redis Sorted Set
exports.getWinner = async (req, res) => {
    try {
        const { questionId } = req.params;

        // ZRANGE returns the member with the lowest score (earliest timestamp ms)
        const result = await redis.zrange(`quiz:buzzes:${questionId}`, 0, 0, 'WITHSCORES');

        if (!result || result.length === 0) {
            return res.json({ winner: null, message: 'No one buzzed yet.' });
        }

        const [teamId, buzzTimeMs] = result; // [member, score]

        // Fetch team info
        const team = await prisma.team.findUnique({
            where: { id: teamId },
            select: { id: true, teamName: true, teamCode: true }
        });

        res.json({
            winner: {
                teamId: team.id,
                teamName: team.teamName,
                buzzTimeMs: parseInt(buzzTimeMs, 10)
            }
        });
    } catch (error) {
        console.error('Winner calculation error:', error);
        res.status(500).json({ message: 'Error getting winner' });
    }
};

exports.getQuestions = async (req, res) => {
    try {
        const questions = await prisma.question.findMany({
            orderBy: { orderIndex: 'asc' }
        });
        res.json({ questions });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching questions' });
    }
};

exports.getQuestionBuzzes = async (req, res) => {
    try {
        const { questionId } = req.params;
        const buzzes = await prisma.buzzHistory.findMany({
            where: { questionId },
            include: { team: true },
            orderBy: { buzzTimeMs: 'asc' }
        });

        res.json({
            buzzes: buzzes.map(b => ({
                team: b.team.teamName,
                timeMs: Number(b.buzzTimeMs)
            }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching buzzes for question' });
    }
};
