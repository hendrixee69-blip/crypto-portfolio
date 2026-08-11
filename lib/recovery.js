const crypto = require('crypto');

// Groups of 4 alphanumeric characters, uppercase, excluding easily-confused
// characters (0/O, 1/I/L) — e.g. "7K4P-QX2M-9BVT-4RNW". Readable enough to
// copy/write down by hand if needed.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateRecoveryCode() {
  const groups = [];
  for (let g = 0; g < 4; g++) {
    let group = '';
    for (let i = 0; i < 4; i++) {
      group += ALPHABET[crypto.randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join('-');
}

module.exports = { generateRecoveryCode };
