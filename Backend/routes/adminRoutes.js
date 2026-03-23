// routes/adminRoutes.js
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const quizController = require('../controllers/quizController');
const { protectAdmin } = require('../middleware/auth');

// Auth
router.post('/login', authController.loginAdmin);

// Teams (Protected)
router.get('/teams', protectAdmin, adminController.getAllTeams);
router.post('/teams', protectAdmin, adminController.addTeam);
router.delete('/teams/:id', protectAdmin, adminController.deleteTeam);
router.put('/teams/:id/status', protectAdmin, adminController.toggleTeamStatus);
router.post('/teams/:id/logout', protectAdmin, adminController.forceLogoutTeam);
router.post('/scores', protectAdmin, adminController.addScore);
router.get('/scores/logs', protectAdmin, adminController.getScoreLogs);

// Quiz & Buzzer (Protected)
router.get('/questions', protectAdmin, quizController.getQuestions);
router.post('/buzzer/enable', protectAdmin, quizController.enableBuzzer);
router.post('/buzzer/disable', protectAdmin, quizController.disableBuzzer);
router.get('/buzzer/winner/:questionId', protectAdmin, quizController.getWinner);
router.get('/buzzer/logs/:questionId', protectAdmin, quizController.getQuestionBuzzes);

module.exports = router;
