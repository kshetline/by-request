import chai, { expect } from 'chai';
import {request, ResponseInfo} from './by-request';
import chaiAsPromised from 'chai-as-promised';
import { port } from './test-server.spec';
import { stat, unlink, utimes, writeFile } from 'fs/promises';

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
    await expect(request(`http://localhost:${port}/httpstat.us/200`, 'utf8')).to.eventually.match(/^(200 OK)?$/);
    await expect(request(`http://localhost:${port}/httpstat.us/400`)).to.eventually.be.rejected;
    await expect(request(`http://localhost:${port}/httpstat.us/522?sleep=6000`, { timeout: 3000 })).to.eventually.be.rejected;
  });

  it('should use cache correctly', async function () {
    this.timeout(15000);
    this.slow(10000);

    const path = 'cache/sample.html';
    let url = `http://localhost:${port}/test4/`;
    let createdPath: string;
    const responseInfo = (info: ResponseInfo) => createdPath = info.cachePath;

    await safeDelete(path);
    let content = await request(url, { cachePath: path });
    expect(content.toString()).to.contain('Hello');
    await expect(stat(path)).to.eventually.be.ok;

    content = await request(url + '?rc=304', { cachePath: path });
    expect(content.toString()).to.contain('Hello');

    url = 'https://raw.githubusercontent.com/kshetline/by-request/master/LICENSE';

    await safeDelete(path);
    content = await request(url, { cachePath: path });
    expect(content.toString()).to.contain('this permission notice shall be');
    await expect(stat(path)).to.eventually.be.ok;

    content = await request(url, { cachePath: path, maxCacheAge: 10000, responseInfo });
    expect(content.toString()).to.contain('this permission notice shall be');

    await writeFile(path, 'foo bar');
    content = await request(url, { cachePath: path, maxCacheAge: 900000 });
    expect(content.toString()).to.not.contain('this permission notice shall be');
    expect(content.toString()).to.equal('foo bar');

    // Artificially age cache to test maxCacheAge.
    const dayAgo = Date.now() / 1000 - 86400;
    await utimes(path, dayAgo, dayAgo);
    content = await request(url, { cachePath: path, maxCacheAge: 1000 });
    expect(content.toString()).to.contain('this permission notice shall be');
    await safeDelete(path);

    content = await request({
      protocol: 'https',
      port: 443,
      host: 'raw.githubusercontent.com',
      path: 'kshetline/by-request/master/LICENSE',
      cachePath: 'cache',
      responseInfo
    });
    expect(content.toString()).to.contain('this permission notice shall be');
    expect(createdPath).to.be.ok;
    await safeDelete(createdPath);
    createdPath = null;

    url = 'https://raw.githubusercontent.com/kshetline/by-request/master/README.md';
    content = await request(url, { cachePath: 'cache', responseInfo });
    expect(createdPath).to.be.ok;
    expect(content.toString()).to.contain('for use with promises');

    content = await request(url, { cachePath: 'cache', responseInfo });
    expect(content.toString()).to.contain('for use with promises');

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
      json: '{"do":77,"re":"abc","mi":true,"so":"ignored"}'
    });
    expect(content.toString()).to.equal('77,abc,true');

    content = await request(`http://localhost:${port}/test13`, {
      headers: { 'content-type': 'application/json; charset=utf-8' },
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
