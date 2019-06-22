import { requestBinary } from './request-binary';
import { port } from './test-server.spec';

describe('request-binary', () => {
  it('should read binary data correctly', async done => {
    const content = await requestBinary(`http://localhost:${port}/test9/`);
    expect(Array.from(content)).toEqual([0, 1, 2, 3]);
    done();
  });
});
