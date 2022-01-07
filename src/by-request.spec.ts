import chai, { expect } from 'chai';
import { request } from './by-request';
import chaiAsPromised from 'chai-as-promised';
import { port } from './test-server.spec';
// import { stat, unlink, writeFile } from 'fs/promises'; // Would prefer this syntax, but requires Node 14+
const { stat, unlink, writeFile } = require('fs').promises;

chai.use(chaiAsPromised);

describe('by-request', () => {
  it('should handle HTTP errors correctly', async function () {
    this.timeout(15000);
    this.slow(10000);
    await expect(request('http://httpstat.us/200')).to.eventually.match(/^(200 OK)?$/);
    await expect(request('http://httpstat.us/400')).to.eventually.be.rejected;
    await expect(request('http://httpstat.us/522?sleep=6000', { timeout: 3000 })).to.eventually.be.rejected;
  });

  it('should use cache correctly', async function () {
    const url = 'https://file-examples-com.github.io/uploads/2017/02/index.html';
    const path = 'cache/sample.html';

    try {
      await unlink(path);
    }
    catch {}

    let content = await request(url, { cachePath: path });
    expect(content.toString()).to.contain('Lorem ipsum dolor sit amet');
    await expect(stat(path)).to.eventually.be.ok;

    content = await request(url, { cachePath: path });
    expect(content.toString()).to.contain('Lorem ipsum dolor sit amet');

    await writeFile(path, 'foo bar');
    content = await request(url, { cachePath: path });
    expect(content.toString()).to.not.contain('Lorem ipsum dolor sit amet');
    expect(content.toString()).to.equal('foo bar');

    try {
      await unlink(path);
    }
    catch {}
  });

  it('should be able request using POST', async () => {
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
