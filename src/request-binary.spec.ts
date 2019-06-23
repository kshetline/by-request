import { requestBinary } from './request-binary';
import { port } from './test-server.spec';
import * as zlib from 'zlib';

describe('request-binary', () => {
  it('should read binary data correctly', async done => {
    let content = await requestBinary(`http://localhost:${port}/test9/`);
    expect(Array.from(content)).toEqual([0, 1, 2, 3]);

    content = await requestBinary('https://opensource.org/licenses/MIT');
    expect(content.toString('utf8')).toContain('copies or substantial portions');

    done();
  });

  it('should be able to defeat automatic decompression of a gzipped response', async done => {
    const content = await requestBinary(`http://localhost:${port}/test8/`, { dontDecompress: true });
    let unzipped = Buffer.alloc(0);

    try {
      unzipped = zlib.gunzipSync(content);
    }
    catch (err) {
      expect(false).toBeTruthy(err);
    }

    expect(unzipped.toString()).toContain('Very large content');

    done();
  });

  it('should detect and catch an exception for corrupted data', async done => {
    let content = await requestBinary(`http://localhost:${port}/test11/`);
    expect(content.length).toEqual(8);

    try {
      content = await requestBinary(`http://localhost:${port}/test11/?corrupt=true`);
      expect(false).toBeTruthy('Exception failed to be thrown for corrupt data');
    }
    catch (err) {
      expect(err);
    }

    done();
  });
});
