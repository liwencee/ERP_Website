import fs from 'fs';

module.exports = async () => {
  const dbPath = './prisma/test.db';
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
};
