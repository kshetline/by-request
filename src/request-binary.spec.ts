import { expect } from 'chai';
import { requestBinary } from './request-binary';
import { request, ResponseInfo } from './by-request';
import { port } from './test-server.spec';
import * as zlib from 'zlib';
import { mkdir, rm, unlink } from 'fs/promises';

async function safeDelete(path: string): Promise<void> {
  try {
    await unlink(path);
  }
  catch {}
}

describe('request-binary', () => {
  after(async () => {
    try {
      await rm('cache', { recursive: true, force: true });
      await mkdir('cache');
    }
    catch {}
  });

  it('should read binary data correctly', async function () {
    this.timeout(10000);
    this.slow(5000);

    let content = await request(`http://localhost:${port}/test9/?type=image%2Fpng`, null, 'foo') as Buffer;
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

  it('should use cache correctly', async function () {
    this.timeout(15000);
    this.slow(10000);

    let url = `http://localhost:${port}/test9/`;
    let createdPath: string;
    let bytes: number;
    const responseInfo = (info: ResponseInfo) => createdPath = info.cachePath;
    const progress = (_read: number, total: number) => bytes = total;

    let content = await requestBinary(url, { cachePath: 'cache', responseInfo, progress });
    expect(Array.from(content)).to.deep.equal([0, 1, 2, 3]);
    expect(createdPath).to.be.ok;

    content = await requestBinary(url, { cachePath: 'cache', responseInfo, progress });
    expect(Array.from(content)).to.deep.equal([0, 1, 2, 3]);
    expect(bytes).to.equal(4);
    await safeDelete(createdPath);
  });
});
