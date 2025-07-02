import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import fs from 'fs';
import { requestFile, wget } from './request-file';
import { port, TEST_TEXT_1 } from './test-server.spec';
import { Writable } from 'stream';

chai.use(chaiAsPromised);

describe('request-file', () => {
  it('should be able to download a text file', async function () {
    this.retries(3);
    const path = 'sample.txt';

    if (fs.existsSync(path))
      fs.unlinkSync(path);

    await requestFile(`http://localhost:${port}/test1/`, path);
    expect(fs.readFileSync(path).toString('utf8')).equals(TEST_TEXT_1);
    fs.unlinkSync(path);
  });

  it('should be able to download a binary file', async function () {
    this.retries(3);
    const path = 'cache/test9';

    try {
      fs.mkdirSync('cache');
    }
    catch {}

    await wget({
      protocol: 'http',
      host: 'localhost',
      port,
      path: '/test9/'
    }, 'cache/');
    expect(Array.from(fs.readFileSync(path))).to.deep.equal([0, 1, 2, 3]);
    fs.unlinkSync(path);
  });

  it('should throw exception for bad file destination', async function () {
    await expect(requestFile(`http://localhost:${port}/test1/`, 'nope/sample.txt')).to.be.rejected;
  });

  it('should be able to use same path for cache file and new file', async function () {
    this.slow(1500);
    this.timeout(3000);

    const path = 'cache/sample.bin';
    let gotResponse = false;

    if (fs.existsSync(path))
      fs.unlinkSync(path);

    await expect(requestFile(`http://localhost:${port}/test9/`, {
      cachePath: path,
      responseInfo: () => gotResponse = true
    }, path)).to.eventually.be.ok;
    const stats = fs.statSync(path);
    expect(stats).to.be.ok;
    await new Promise(resolve => setTimeout(resolve, 1000));
    await expect(requestFile(`http://localhost:${port}/test9/`, { cachePath: path }, path)).to.eventually.be.ok;
    const stats2 = fs.statSync(path);
    expect(stats2.mtimeMs).to.equal(stats.mtimeMs);
    expect(gotResponse).to.be.true;
    await expect(requestFile(`http://localhost:${port}/test9/`,
      { cachePath: path, maxCacheAge: 10000 }, path)).to.eventually.be.ok;

    fs.unlinkSync(path);
  });

  class BufferCollector extends Writable {
    private chunks: Uint8Array[] = [];
    buffer: Buffer;

    _write(chunk: Uint8Array, _encoding: string, callback: (error?: Error | null) => void) {
      this.chunks.push(chunk);
      callback();
    }

    _final(callback: (error?: Error | null) => void) {
      this.buffer = Buffer.concat(this.chunks);
      callback();
    }
  }

  it('should be able to download a stream', async function () {
    await expect(wget(`http://localhost:${port}`)).to.be.rejected;
    expect(wget({ protocol: 'http', host: 'localhost', port })).to.be.rejected;

    let stream = new BufferCollector();

    await wget(`http://localhost:${port}/test9/`, stream);
    expect(Array.from(stream.buffer)).to.deep.equal([0, 1, 2, 3]);

    stream = new BufferCollector();
    await wget(`http://localhost:${port}/test9/`, { dontEndStream: true }, stream);
    expect(stream.closed).to.be.false;
    stream.end();
    expect(Array.from(stream.buffer)).to.deep.equal([0, 1, 2, 3]);

    stream = new BufferCollector();
    await wget(`http://localhost:${port}/test9/`, null, stream);
    expect(Array.from(stream.buffer)).to.deep.equal([0, 1, 2, 3]);
  });
});
