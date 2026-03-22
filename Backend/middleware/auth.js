// middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * Protect routes for Admins only
 */
exports.protectAdmin = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no admin token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);

        if (decoded.role !== 'admin' && decoded.role !== 'superadmin') {
            return res.status(403).json({ message: 'Forbidden: Admin access only.' });
        }

        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Admin token is invalid or expired.' });
    }
};

/**
 * Protect routes for Teams (participants) only
 */
exports.protectTeam = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Not authorized, no team token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.role !== 'participant') {
            return res.status(403).json({ message: 'Forbidden: Participant access only.' });
        }

        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Team token is invalid or expired.' });
    }
};
