import assert from 'node:assert/strict';
import {test} from 'node:test';

import {postIdFromElementId} from './post_id.js';

test('post ids come from center and thread posts only', () => {
    const id = 'abcdefghijklmnopqrstuvwxyz';
    assert.equal(postIdFromElementId(`post_${id}`), id);
    assert.equal(postIdFromElementId(`rhsPost_${id}`), id);
    assert.equal(postIdFromElementId(`searchResult_${id}`), null);
    assert.equal(postIdFromElementId('post_user:12345'), null);
});
