// Test di js/orario.js: date europee e ore a 12/24
const path = require('path');
const assert = require('assert');
const O = require(path.join(__dirname, '..', 'js', 'orario.js'));
const ref = new Date(2026, 9, 6);
const casi = [
  [O.leggiDataEuropea('6/10/2026', ref), '2026-10-06'], [O.leggiDataEuropea('06.10.26', ref), '2026-10-06'],
  [O.leggiDataEuropea('6-10', ref), '2026-10-06'], [O.leggiDataEuropea('06102026', ref), '2026-10-06'],
  [O.leggiDataEuropea('31/02/2026', ref), null], [O.leggiDataEuropea('', ref), ''], [O.dataEuropea('2026-10-06'), '06/10/2026'],
  [O.oraTesto('16:30', false), '16:30'], [O.oraTesto('16:30', true), '4:30 pm'], [O.oraTesto('00:05', true), '12:05 am'],
  [O.opzioniOra({ day: 'numeric' }).hour12, false],
];
casi.forEach(([a, b], i) => assert.deepStrictEqual(a, b, 'caso ' + i));
console.log(`${casi.length} test passati, 0 falliti`);
