const assert = require('assert');
const {
  extractSpokenQuantity,
  parseFrenchSpokenNumber
} = require('../services/chantierVoice/utils');

const cases = [
  ['trois', 3],
  ['Trois', 3],
  ['cinq', 5],
  ['douze', 12],
  ['vingt et un', 21],
  ['vingt-et-un', 21],
  ['3', 3],
  ['12', 12]
];

cases.forEach(([input, expected]) => {
  assert.strictEqual(parseFrenchSpokenNumber(input), expected, `parseFrenchSpokenNumber(${input})`);
  assert.strictEqual(extractSpokenQuantity(input), expected, `extractSpokenQuantity(${input})`);
});

console.log('Voice French number checks passed:', cases.length);
