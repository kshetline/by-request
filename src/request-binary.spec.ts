import { expect } from 'chai';
import { requestBinary } from './request-binary';
import { port } from './test-server.spec';
import * as zlib from 'zlib';

describe('request-binary', () => {
  it('should read binary data correctly', async function () {
    this.timeout(10000);
    this.slow(5000);

    let content = await requestBinary(`http://localhost:${port}/test9/`);
    expect(Array.from(content)).to.deep.equal([0, 1, 2, 3]);

    // Also https://en.wikipedia.org/wiki/MIT_License
    content = await requestBinary({
      protocol: 'https',
      host: 'opensource.org',
      path: '/license/MIT'
    });
    expect(content.toString('utf8')).to.contain('copies or substantial portions');
  });

  it('should be able to defeat automatic decompression of a gzipped response', async () => {
    const content = await requestBinary(`http://localhost:${port}/test8/`, { dontDecompress: true });
    let unzipped = Buffer.alloc(0);

    try {
      unzipped = zlib.brotliDecompressSync(content);
    }
    catch (err) {
      expect(false).to.be.true(err);
    }

    expect(unzipped.toString()).to.contain('Very large content');
  });

  it('should detect and catch an exception for corrupted data', async () => {
    const content = await requestBinary(`http://localhost:${port}/test11/`);
    expect(content.length).equals(8);

    return requestBinary(`http://localhost:${port}/test11/?corrupt=true`).then(() =>
      expect(false).to.be.true('Exception failed to be thrown for corrupt data')
    ).catch(err =>
      expect(err).to.be.ok
    );
  });

  it('should be able to auto-gunzip gzipped content type', async () => {
    const content = await requestBinary(`http://localhost:${port}/test11/?asgzip=true`, { autoDecompress: true });

    expect(content.length).equals(8);
  });

  it('should fail on unknown encoding', async () => {
    await expect(requestBinary(`http://localhost:${port}/test11/?asfoo=true`, { autoDecompress: true })).to.be.rejected;
  });
});
