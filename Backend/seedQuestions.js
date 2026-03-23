const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    await prisma.question.deleteMany({});
    const questions = [
        { questionText: 'What is the capital of France?', correctAnswer: 'Paris', orderIndex: 1 },
        { questionText: 'What is the largest planet in our solar system?', correctAnswer: 'Jupiter', orderIndex: 2 },
        { questionText: 'What is the chemical symbol for gold?', correctAnswer: 'Au', orderIndex: 3 },
        { questionText: 'Who wrote Romeo and Juliet?', correctAnswer: 'William Shakespeare', orderIndex: 4 },
        { questionText: 'In what year did World War II end?', correctAnswer: '1945', orderIndex: 5 },
        { questionText: 'What is the hardest natural substance on Earth?', correctAnswer: 'Diamond', orderIndex: 6 },
        { questionText: 'What is the largest ocean on Earth?', correctAnswer: 'Pacific Ocean', orderIndex: 7 },
        { questionText: 'Who painted the Mona Lisa?', correctAnswer: 'Leonardo da Vinci', orderIndex: 8 },
        { questionText: 'What is the main ingredient in guacamole?', correctAnswer: 'Avocado', orderIndex: 9 },
        { questionText: 'What is the boiling point of water in Celsius?', correctAnswer: '100', orderIndex: 10 }
    ];
    await prisma.question.createMany({ data: questions });
    console.log('Seeded 10 questions successfully.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
