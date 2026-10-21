import assert from 'node:assert/strict';
import {test} from 'node:test';

import {formatWhen, translator} from './i18n.js';

const t = translator('es-ES');
const now = new Date(2026, 9, 21, 18, 0).getTime();

test('translator falls back to English', () => {
    assert.equal(translator('fr')('read'), 'Read');
    assert.equal(t('read'), 'Leído');
});

test('formatWhen names today and yesterday', () => {
    assert.match(formatWhen(new Date(2026, 9, 21, 9, 5).getTime(), 'es-ES', t, now), /^Hoy 09:05$/);
    assert.match(formatWhen(new Date(2026, 9, 20, 23, 59).getTime(), 'es-ES', t, now), /^Ayer 23:59$/);
    assert.doesNotMatch(formatWhen(new Date(2026, 9, 19, 12, 0).getTime(), 'es-ES', t, now), /Hoy|Ayer/);
});
