// routes/teamRoutes.js
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const teamController = require('../controllers/teamController');
const { protectTeam } = require('../middleware/auth');

// Auth
router.post('/login', authController.loginTeam);
router.post('/logout', protectTeam, authController.logoutTeam);

// Profile
router.get('/profile', protectTeam, teamController.getTeamProfile);

// Buzzer Interaction
router.post('/buzz', protectTeam, teamController.buzz);

module.exports = router;
