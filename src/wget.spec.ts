import fs from 'fs';
import { wget } from './wget';
import { port } from './test-server.spec';

describe('wget', () => {
  it('should be able to download a file using wget', async done => {
    const path = 'sample.txt';

    if (fs.existsSync(path))
      fs.unlinkSync(path);

    await wget(`http://localhost:${port}/test1/`, path);
    expect(fs.readFileSync('sample.txt').toString('utf8')).toEqual('Côte d\'Ivoire');
    fs.unlinkSync(path);

    done();
  });
});
