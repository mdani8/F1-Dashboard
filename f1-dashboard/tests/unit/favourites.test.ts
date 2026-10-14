import assert from 'node:assert/strict';
import test from 'node:test';
import { driverKey, sanitizeFavourites, teamKey } from '../../src/shared/domain/favourites.js';

void test('favourites match driver identity across number changes and distinguish the Red Bull teams', () => {
  assert.equal(driverKey({ code: 'VER', number: 1 }), driverKey({ code: 'VER', number: 33 }));
  assert.equal(
    driverKey({ givenName: 'George', familyName: 'Russell' }),
    driverKey({ name: 'George RUSSELL' }),
  );
  assert.equal(teamKey({ constructorId: 'red_bull' }), teamKey('Oracle Red Bull Racing'));
  assert.equal(teamKey({ constructorId: 'rb' }), teamKey('Visa Cash App Racing Bulls'));
  assert.notEqual(teamKey('Racing Bulls'), teamKey('Red Bull Racing'));
  assert.deepEqual(
    sanitizeFavourites({
      drivers: ['code:NOR', 'code:NOR', '<script>', null],
      teams: ['mclaren', 'mclaren', 5],
    }),
    { drivers: ['code:NOR'], teams: ['mclaren'] },
  );
});
