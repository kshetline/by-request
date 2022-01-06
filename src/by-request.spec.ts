import chai, { expect } from 'chai';
import { request } from './by-request';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('by-request', () => {
  it('should handle HTTP errors correctly', async function () {
    this.timeout(15000);
    this.slow(10000);
    await expect(request('http://httpstat.us/200')).to.eventually.match(/^(200 OK)?$/);
    await expect(request('http://httpstat.us/400')).to.eventually.be.rejected;
    await expect(request('http://httpstat.us/522?sleep=6000', { timeout: 3000 })).to.eventually.be.rejected;
  });
});
