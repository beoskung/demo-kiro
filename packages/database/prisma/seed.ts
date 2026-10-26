import { createPrismaClient, hashPassword, Role } from '../src/index.js';

const prisma = createPrismaClient(
  process.env.DATABASE_URL ?? 'postgresql://erp:erp@localhost:5432/erp',
);

// Demo accounts for the workshop (also shown on the login page). Re-running the seed resets them.
// A store employee is bound to one store; a manager and an administrator are organization-wide.
const demoUsers = [
  { email: 'admin@erp.local', name: 'Admin User', role: Role.ADMINISTRATOR, storeId: null },
  {
    email: 'purchasing@erp.local',
    name: 'Purchasing Officer',
    role: Role.PURCHASING_OFFICER,
    storeId: null,
  },
  {
    email: 'store@erp.local',
    name: 'Store Employee',
    role: Role.STORE_EMPLOYEE,
    storeId: 'store-01',
  },
  { email: 'manager@erp.local', name: 'Manager User', role: Role.MANAGER, storeId: null },
];
const DEMO_PASSWORD = 'password';

async function main() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const user of demoUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { name: user.name, role: user.role, storeId: user.storeId, passwordHash },
      create: { ...user, passwordHash },
    });
  }
  console.log(`Seeded ${demoUsers.length} demo users (password: "${DEMO_PASSWORD}").`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
