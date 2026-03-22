// config/db.js
// Prisma Client singleton — prevents multiple instances in development

const { PrismaClient } = require('@prisma/client');

let prisma;

if (process.env.NODE_ENV === 'production') {
    prisma = new PrismaClient();
} else {
    // In development, reuse the client across hot-reloads
    if (!global.__prisma) {
        global.__prisma = new PrismaClient({
            log: ['query', 'error', 'warn'],
        });
    }
    prisma = global.__prisma;
}

module.exports = prisma;
