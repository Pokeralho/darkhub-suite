// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TRACKING_BEGIN as B, TRACKING_END as E, stripTrackingBlocks } from '../electron/services/security/hostsBlock.js';

describe('hosts file: DarkHub tracking section', () => {
  it('removes a complete section and nothing else', () => {
    expect(stripTrackingBlocks(['127.0.0.1 a', B, '127.0.0.1 t1', '127.0.0.1 t2', E, '10.0.0.5 nas'])).toEqual(['127.0.0.1 a', '10.0.0.5 nas']);
    expect(stripTrackingBlocks([B, '127.0.0.1 t1', E, 'x', B, '127.0.0.1 t2', E, 'y'])).toEqual(['x', 'y']);
  });

  it('a section with no END loses only its marker: the lines after it are the user\'s', () => {
    // this used to return ['127.0.0.1 a'] and the next write deleted the rest of the file
    expect(stripTrackingBlocks(['127.0.0.1 a', B, '127.0.0.1 t1', '10.0.0.5 nas', '192.168.0.2 printer'])).toEqual(['127.0.0.1 a', '127.0.0.1 t1', '10.0.0.5 nas', '192.168.0.2 printer']);
    // an unterminated section followed by a complete one
    expect(stripTrackingBlocks([B, '10.0.0.5 nas', B, '127.0.0.1 t1', E, 'z'])).toEqual(['10.0.0.5 nas', 'z']);
  });

  it('drops a stray END marker and leaves a file without sections untouched', () => {
    expect(stripTrackingBlocks(['a', E, 'b'])).toEqual(['a', 'b']);
    expect(stripTrackingBlocks(['# comment', '', '127.0.0.1 localhost'])).toEqual(['# comment', '', '127.0.0.1 localhost']);
  });
});
