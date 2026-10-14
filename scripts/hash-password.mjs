// Usage: npm run hash-password -- "your password"   -> prints a bcrypt hash for ADMIN_PASSWORD_HASH
import bcrypt from 'bcryptjs';
const pw = process.argv[2];
if (!pw || pw.length < 12) {
  console.error('Provide a password of at least 12 characters: npm run hash-password -- "your password"');
  process.exit(1);
}
console.log(bcrypt.hashSync(pw, 12));
