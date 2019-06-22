import { requestBinary } from './request-binary';
import { port } from './test-server.spec';

describe('request-binary', () => {
  it('should read binary data correctly', async done => {
    let content = await requestBinary(`http://localhost:${port}/test9/`);
    expect(Array.from(content)).toEqual([0, 1, 2, 3]);

    content = await requestBinary('https://opensource.org/licenses/MIT');
    expect(content.toString('utf8')).toContain('copies or substantial portions');

    done();
  });
});
