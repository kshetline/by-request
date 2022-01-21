import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import fs from 'fs';
import { requestFile, wget } from './request-file';
import { port, TEST_TEXT_1 } from './test-server.spec';

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
    const path = 'sample.bin';

    if (fs.existsSync(path))
      fs.unlinkSync(path);

    await wget(`http://localhost:${port}/test9/`, path);
    expect(Array.from(fs.readFileSync(path))).to.deep.equal([0, 1, 2, 3]);
    fs.unlinkSync(path);
  });

  it('should be able to use same path for cache file and new file', async function () {
    this.slow(1500);
    this.timeout(3000);

    const path = 'cache/sample.bin';

    if (fs.existsSync(path))
      fs.unlinkSync(path);

    await expect(requestFile(`http://localhost:${port}/test9/`, { cachePath: path }, path)).to.eventually.be.ok;
    const stats = fs.statSync(path);
    expect(stats).to.be.ok;
    await new Promise(resolve => setTimeout(resolve, 1000));
    await expect(requestFile(`http://localhost:${port}/test9/`, {  cachePath: path }, path)).to.eventually.be.ok;
    const stats2 = fs.statSync(path);
    expect(stats2.mtimeMs).to.equal(stats.mtimeMs);

    fs.unlinkSync(path);
  });
});
