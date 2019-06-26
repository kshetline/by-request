import { expect } from 'chai';
import fs from 'fs';
import { requestFile, wget } from './request-file';
import { port, TEST_TEXT_1 } from './test-server.spec';

describe('request-file', () => {
  it('should be able to download a text file', async () => {
    const path = 'sample.txt';

    if (fs.existsSync(path))
      fs.unlinkSync(path);

    await requestFile(`http://localhost:${port}/test1/`, path);
    expect(fs.readFileSync(path).toString('utf8')).equals(TEST_TEXT_1);
    fs.unlinkSync(path);
  });

  it('should be able to download a binary file', async () => {
    const path = 'sample.bin';

    if (fs.existsSync(path))
      fs.unlinkSync(path);

    await wget(`http://localhost:${port}/test9/`, path);
    expect(Array.from(fs.readFileSync(path))).to.deep.equal([0, 1, 2, 3]);
    fs.unlinkSync(path);
  });
});
