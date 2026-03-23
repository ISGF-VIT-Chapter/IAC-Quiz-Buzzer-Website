// controllers/adminController.js
const prisma = require('../config/db');
const redis = require('../config/redis');
const bcrypt = require('bcryptjs');

const REDIS_SCORE_LOG_KEY = 'quiz:scorelogs';
const getTeamAnsweredSetKey = (teamId) => `quiz:team:${teamId}:answeredQuestions`;

const normalizeQuestionLabel = (label) => {
    const raw = String(label || '').trim();
    const match = raw.match(/\d+/);
    if (match) return `Q${parseInt(match[0], 10)}`;
    return raw.toUpperCase().replace(/\s+/g, '');
};

const isMissingScoreLogTableError = (error) => {
    if (!error) return false;
    // Prisma P2021 = table does not exist.
    if (error.code === 'P2021') return true;
    const msg = String(error.message || '').toLowerCase();
    return msg.includes('scorelog') && msg.includes('does not exist');
};

const buildUniquePositiveQuestionCountMapFromRedis = async (teamIds) => {
    if (!teamIds || teamIds.length === 0) return {};

    const pipeline = redis.pipeline();
    teamIds.forEach((teamId) => {
        pipeline.scard(getTeamAnsweredSetKey(teamId));
    });

    const results = await pipeline.exec();
    const counts = {};

    teamIds.forEach((teamId, idx) => {
        const pair = results[idx] || [];
        const err = pair[0];
        const value = pair[1];
        counts[teamId] = err ? 0 : Number(value || 0);
    });

    return counts;
};

const buildUniquePositiveQuestionCountMap = async (teamIds) => {
    if (!teamIds || teamIds.length === 0) return {};

    try {
        const positiveLogs = await prisma.scoreLog.findMany({
            where: {
                teamId: { in: teamIds },
                points: { gt: 0 }
            },
            select: {
                teamId: true,
                questionLabel: true
            }
        });

        const teamQuestionSets = {};
        positiveLogs.forEach((log) => {
            const normalized = normalizeQuestionLabel(log.questionLabel);
            if (!normalized) return;
            if (!teamQuestionSets[log.teamId]) {
                teamQuestionSets[log.teamId] = new Set();
            }
            teamQuestionSets[log.teamId].add(normalized);
        });

        const counts = {};
        teamIds.forEach((teamId) => {
            counts[teamId] = teamQuestionSets[teamId] ? teamQuestionSets[teamId].size : 0;
        });
        return counts;
    } catch (error) {
        if (isMissingScoreLogTableError(error)) {
            return buildUniquePositiveQuestionCountMapFromRedis(teamIds);
        }
        throw error;
    }
};

// --- Team Management ---

exports.getAllTeams = async (req, res) => {
    try {
        const teams = await prisma.team.findMany({
            select: {
                id: true,
                teamName: true,
                teamCode: true,
                rawPassword: true, // Now returning the explicitly naked password stored for admin
                score: true,
                isActive: true,
                createdAt: true
            },
            orderBy: { createdAt: 'desc' }
        });

        const uniqueCountsByTeamId = await buildUniquePositiveQuestionCountMap(teams.map(t => t.id));
        const teamsWithStats = teams.map(t => ({
            ...t,
            uniqueQuestionsAnswered: uniqueCountsByTeamId[t.id] || 0
        }));

        res.json({ teams: teamsWithStats });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching teams' });
    }
};

exports.addScore = async (req, res) => {
    try {
        const { teamId, questionLabel, points } = req.body;

        if (!teamId || !questionLabel || points === undefined || points === null) {
            return res.status(400).json({ message: 'teamId, questionLabel and points are required' });
        }

        const parsedPoints = Number(points);
        if (!Number.isFinite(parsedPoints) || !Number.isInteger(parsedPoints)) {
            return res.status(400).json({ message: 'points must be an integer value' });
        }

        const cleanedQuestionLabel = String(questionLabel).trim();
        if (!cleanedQuestionLabel) {
            return res.status(400).json({ message: 'questionLabel cannot be empty' });
        }

        let txResult;
        try {
            txResult = await prisma.$transaction(async (tx) => {
                const createdLog = await tx.scoreLog.create({
                    data: {
                        teamId,
                        questionLabel: cleanedQuestionLabel,
                        points: parsedPoints
                    },
                    include: {
                        team: {
                            select: {
                                teamName: true
                            }
                        }
                    }
                });

                const updatedTeam = await tx.team.update({
                    where: { id: teamId },
                    data: {
                        score: {
                            increment: parsedPoints
                        }
                    },
                    select: {
                        id: true,
                        teamName: true,
                        score: true,
                        isActive: true
                    }
                });

                return { createdLog, updatedTeam };
            });
        } catch (error) {
            if (!isMissingScoreLogTableError(error)) throw error;

            // Graceful fallback: preserve scoring even before ScoreLog migration exists.
            const updatedTeam = await prisma.team.update({
                where: { id: teamId },
                data: {
                    score: {
                        increment: parsedPoints
                    }
                },
                select: {
                    id: true,
                    teamName: true,
                    score: true,
                    isActive: true
                }
            });

            const fallbackLog = {
                id: `redis-${Date.now()}`,
                teamId,
                questionLabel: cleanedQuestionLabel,
                points: parsedPoints,
                createdAt: new Date().toISOString(),
                team: {
                    teamName: updatedTeam.teamName
                }
            };

            await redis.lpush(REDIS_SCORE_LOG_KEY, JSON.stringify(fallbackLog));
            await redis.ltrim(REDIS_SCORE_LOG_KEY, 0, 199);

            if (parsedPoints > 0) {
                await redis.sadd(getTeamAnsweredSetKey(teamId), normalizeQuestionLabel(cleanedQuestionLabel));
            }

            txResult = { createdLog: fallbackLog, updatedTeam };
        }

        const uniqueCountsByTeamId = await buildUniquePositiveQuestionCountMap([teamId]);
        const uniqueQuestionsAnswered = uniqueCountsByTeamId[teamId] || 0;

        const io = req.app.get('io');
        if (io) {
            io.emit('scoreUpdated', {
                teamId,
                score: txResult.updatedTeam.score,
                uniqueQuestionsAnswered
            });
        }

        res.status(201).json({
            message: 'Score recorded successfully',
            scoreLog: txResult.createdLog,
            team: {
                ...txResult.updatedTeam,
                uniqueQuestionsAnswered
            }
        });
    } catch (error) {
        console.error('Add score error:', error);
        res.status(500).json({ message: 'Error recording score' });
    }
};

exports.getScoreLogs = async (req, res) => {
    try {
        const scoreLogs = await prisma.scoreLog.findMany({
            include: {
                team: {
                    select: {
                        teamName: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 200
        });

        res.json({ scoreLogs });
    } catch (error) {
        if (isMissingScoreLogTableError(error)) {
            const fallbackLogsRaw = await redis.lrange(REDIS_SCORE_LOG_KEY, 0, 199);
            const fallbackLogs = fallbackLogsRaw
                .map((entry) => {
                    try {
                        return JSON.parse(entry);
                    } catch (_) {
                        return null;
                    }
                })
                .filter(Boolean);

            return res.json({ scoreLogs: fallbackLogs });
        }
        console.error('Get score logs error:', error);
        res.status(500).json({ message: 'Error fetching score logs' });
    }
};

exports.resetScores = async (req, res) => {
    try {
        const teams = await prisma.team.findMany({
            select: { id: true }
        });

        await prisma.team.updateMany({
            data: { score: 0 }
        });

        try {
            await prisma.scoreLog.deleteMany({});
        } catch (error) {
            if (!isMissingScoreLogTableError(error)) throw error;
        }

        const pipeline = redis.pipeline();
        pipeline.del(REDIS_SCORE_LOG_KEY);
        teams.forEach((team) => {
            pipeline.del(getTeamAnsweredSetKey(team.id));
        });
        await pipeline.exec();

        const io = req.app.get('io');
        if (io) {
            io.emit('scoreReset', { at: new Date().toISOString() });
        }

        res.json({ message: 'Scores and question status reset successfully' });
    } catch (error) {
        console.error('Reset scores error:', error);
        res.status(500).json({ message: 'Error resetting score data' });
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
                rawPassword: password,
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
        await redis.del(getTeamAnsweredSetKey(id));

        // Broadcast removal so the client force-logs out
        const io = req.app.get('io');
        if (io) {
            io.emit('teamRemoved', { teamId: id });
        }

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

exports.forceLogoutTeam = async (req, res) => {
    try {
        const { id } = req.params;
        const team = await prisma.team.update({
            where: { id },
            data: { isActive: false }
        });

        const io = req.app.get('io');
        if (io) {
            // Signal the specific team's broadcast group to forcefully evict their browser
            io.to(`team_${id}`).emit('teamLoggedOut', { message: 'Admin forced logout' });
            // Alert admin dashboard to flip icon
            io.emit('teamStatusChanged', { teamId: id, isActive: false });
        }

        res.json({ message: 'Team successfully logged out', team });
    } catch (error) {
        console.error("Force Logout Error:", error);
        res.status(500).json({ message: 'Error forcibly logging out team' });
    }
};
