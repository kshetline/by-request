import chai, { expect } from 'chai';
import { request } from './by-request';
import chaiAsPromised from 'chai-as-promised';
import { port } from './test-server.spec';
// import { stat, unlink, utimes, writeFile } from 'fs/promises'; // Would prefer this syntax, but requires Node 14+
const { stat, unlink, utimes, writeFile } = require('fs').promises;

chai.use(chaiAsPromised);

async function safeDelete(path: string): Promise<void> {
  try {
    await unlink(path);
  }
  catch {}
}

describe('by-request', () => {
  it('should handle HTTP errors correctly', async function () {
    this.timeout(15000);
    this.slow(10000);
    await expect(request('http://httpstat.us/200')).to.eventually.match(/^(200 OK)?$/);
    await expect(request('http://httpstat.us/400')).to.eventually.be.rejected;
    await expect(request('http://httpstat.us/522?sleep=6000', { timeout: 3000 })).to.eventually.be.rejected;
  });

  it('should use cache correctly', async function () {
    this.timeout(15000);
    this.slow(10000);
    const url = 'https://file-examples-com.github.io/uploads/2017/02/index.html';
    const path = 'cache/sample.html';

    await safeDelete(path);
    let content = await request(url, { cachePath: path });
    expect(content.toString()).to.contain('Lorem ipsum dolor sit amet');
    await expect(stat(path)).to.eventually.be.ok;

    content = await request(url, { cachePath: path });
    expect(content.toString()).to.contain('Lorem ipsum dolor sit amet');

    await writeFile(path, 'foo bar');
    content = await request(url, { cachePath: path });
    expect(content.toString()).to.not.contain('Lorem ipsum dolor sit amet');
    expect(content.toString()).to.equal('foo bar');

    // Artificially age cache to test maxCacheAge.
    const dayAgo = Date.now() / 1000 - 86400;
    await utimes(path, dayAgo, dayAgo);
    content = await request(url, { cachePath: path, maxCacheAge: 1000 });
    expect(content.toString()).to.contain('Lorem ipsum dolor sit amet');
    await safeDelete(path);

    let createdPath: string;
    content = await request({
      protocol: 'https',
      host: 'file-examples-com.github.io',
      path: 'uploads/2017/02/index.html',
      cachePath: 'cache',
      responseInfo: info => createdPath = info.cachePath
    });
    expect(content.toString()).to.contain('Lorem ipsum dolor sit amet');
    expect(createdPath).to.be.ok;
    await safeDelete(createdPath);
  });

  it('should be able request using POST', async function () {
    this.timeout(15000);
    this.slow(10000);
    let content = await request(`http://localhost:${port}/test13`, {
      json: { do: 77, re: 'abc', mi: true, so: 'ignored' }
    });
    expect(content.toString()).to.equal('77,abc,true');

    content = await request(`http://localhost:${port}/test13`, {
      headers: { 'content-type': 'application/json' },
      body: '{"do":456,"re":"xyz","mi":false}'
    });
    expect(content.toString()).to.equal('456,xyz,false');

    content = await request(`http://localhost:${port}/test13`, {
      params: 'do=55&re=a+b&mi=%3Ac'
    });
    expect(content.toString()).to.equal('55,a b,:c');

    content = await request(`http://localhost:${port}/test13`, {
      params: { do: 55, re: 'a b', mi: ':d' }
    });
    expect(content.toString()).to.equal('55,a b,:d');

    content = await request(`http://localhost:${port}/test13`, {
      body: 'echo this'
    });
    expect(content.toString()).to.equal('echo this');
  });
});
