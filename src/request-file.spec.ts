import fs from 'fs';
import { requestFile, wget } from './request-file';
import { port } from './test-server.spec';

describe('wget', () => {
  it('should be able to download a text file', async done => {
    const path = 'sample.txt';

    if (fs.existsSync(path))
      fs.unlinkSync(path);

    await requestFile(`http://localhost:${port}/test1/`, path);
    expect(fs.readFileSync(path).toString('utf8')).toEqual('Côte d\'Ivoire');
    fs.unlinkSync(path);

    done();
  });

  it('should be able to download a binary file', async done => {
    const path = 'sample.bin';

    if (fs.existsSync(path))
      fs.unlinkSync(path);

    await wget(`http://localhost:${port}/test9/`, path);
    expect(Array.from(fs.readFileSync(path))).toEqual([0, 1, 2, 3]);
    fs.unlinkSync(path);

    done();
  });
});
