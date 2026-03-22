const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding database...');

    // Hash the default admin password
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // Upsert ensures we don't duplicate if it exists already
    const admin = await prisma.adminUser.upsert({
        where: { username: 'admin' },
        update: {}, // do nothing if it exists
        create: {
            username: 'admin',
            password: hashedPassword,
            role: 'superadmin'
        }
    });

    console.log(`✅ Default admin created/verified! Username: ${admin.username} / Password: admin123`);
}

main()
    .catch((e) => {
        console.error('❌ Error seeding DB:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
