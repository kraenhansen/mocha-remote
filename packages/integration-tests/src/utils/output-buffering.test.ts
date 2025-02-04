import assert from 'assert';

import * as ob from './output-buffering';

/* eslint no-console: off */

describe('Output buffering', () => {
  it('Captures and returns the output', () => {
    const disable = ob.enable();
    console.log('Hello!');
    const output = disable();
    assert(output instanceof Buffer);
    const outputStr = output.toString('utf8');
    assert.equal(outputStr, 'Hello!\n');
  });
});