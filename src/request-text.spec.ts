import { ResponseInfo } from './by-request';
import { expect } from 'chai';
import { requestText } from './request-text';
import { port, TEST_TEXT_1, TEST_TEXT_2, TEST_TEXT_3 } from './test-server.spec';

describe('request-text', () => {
  it('should read UTF-8 text correctly', async () => {
    const content = await requestText(`http://localhost:${port}/test1/`);
    expect(content).equals(TEST_TEXT_1);
  });

  it('should read ISO-8859-1 text correctly', async () => {
    const content = await requestText(`http://localhost:${port}/test2/`);
    expect(content).equals(TEST_TEXT_1);
  });

  it('should read UTF-16 text (LE, with BOM) correctly', async () => {
    let content = await requestText(`http://localhost:${port}/test3/`);
    expect(content).equals(TEST_TEXT_2);

    content = await requestText(`http://localhost:${port}/test3/`, { ignoreBom: true });
    expect(content).equals('\uFEFF' + TEST_TEXT_2);
  });

  it('should read UTF-16 text correctly when encoding is left out by sender, but specified as default', async () => {
    const content = await requestText(`http://localhost:${port}/test4/`, 'utf-16');
    expect(content).equals(TEST_TEXT_2);
  });

  it('should get garbled text when encoding is left out by sender, and the wrong encoding is suggested', async () => {
    const content = await requestText(`http://localhost:${port}/test5/`, 'iso-8859-1');
    expect(content).equals('CÃ´te d\'Ivoire');
  });

  it('should get garbled text when correct encoding is left out by sender, but the wrong encoding is forced', async () => {
    const content = await requestText(`http://localhost:${port}/test1/`, { forceEncoding: true }, 'iso-8859-1');
    expect(content).equals('CÃ´te d\'Ivoire');
  });

  it('should read UTF-8 with BOM correctly, with BOM overriding conflicting sender-specified charset', async () => {
    let responseInfo: ResponseInfo = null;
    const content = await requestText(`http://localhost:${port}/test6/`, {
      responseInfo: info => responseInfo = info
    });

    expect(content).equals(TEST_TEXT_1);
    expect(responseInfo.bomDetected).to.be.true;
    expect(responseInfo.bomRemoved).to.be.true;
  });

  it('should read character encoding embedded near beginning of HTML/XML/CSS content, example "macroman"', async () => {
    let content = await requestText(`http://localhost:${port}/test7/1`);
    expect(content).to.contain('A Møøse once bit my sister... No realli!');

    content = await requestText(`http://localhost:${port}/test7/2`);
    expect(content).to.contain('A Møøse once bit my sister... No realli!');

    content = await requestText(`http://localhost:${port}/test7/3`);
    expect(content).to.contain('A Møøse once bit my sister... No realli!');

    content = await requestText(`http://localhost:${port}/test7/4`);
    expect(content).to.contain('A Møøse once bit my sister... No realli!');
  });

  it('should get progress reports from long streams of input', async () => {
    let count = 0;
    let bytesRead = 0;
    let totalBytes = -1;
    let responseInfo: ResponseInfo = null;
    const content = await requestText(`http://localhost:${port}/test8/`, {
      progress: (b, t) => {
        ++count;
        bytesRead = b;
        totalBytes = t;
      },
      responseInfo: info => responseInfo = info
    });

    expect(content).to.contain('Very large content');
    expect(count > 0).to.be.true;
    expect(bytesRead).equals(totalBytes);
    expect(bytesRead).equals(responseInfo.contentLength);
    expect(responseInfo.charset).equals('utf8');
    expect(responseInfo.contentEncoding).equals('gzip');
  });

  it('should be able to identity various UTF formats according to BOM', async () => {
    let responseInfo: ResponseInfo = null;
    let content = await requestText(`http://localhost:${port}/test12/?enc=utf8`, {
      responseInfo: info => responseInfo = info
    });

    expect(content).equals(TEST_TEXT_3);
    expect(responseInfo.bomRemoved).to.be.true;
    expect(responseInfo.charset).equals('utf8');

    content = await requestText(`http://localhost:${port}/test12/?enc=utf16le`, {
      responseInfo: info => responseInfo = info
    });

    expect(content).equals(TEST_TEXT_3);
    expect(responseInfo.bomRemoved).to.be.true;
    expect(responseInfo.charset).equals('utf-16le');

    content = await requestText(`http://localhost:${port}/test12/?enc=utf16be`, {
      responseInfo: info => responseInfo = info
    });

    expect(content).equals(TEST_TEXT_3);
    expect(responseInfo.bomRemoved).to.be.true;
    expect(responseInfo.charset).equals('utf-16be');

    content = await requestText(`http://localhost:${port}/test12/?enc=utf32le`, {
      responseInfo: info => responseInfo = info
    });

    expect(content).equals(TEST_TEXT_3);
    expect(responseInfo.bomRemoved).to.be.true;
    expect(responseInfo.charset).equals('utf-32le');

    content = await requestText(`http://localhost:${port}/test12/?enc=utf32be`, {
      responseInfo: info => responseInfo = info
    });

    expect(content).equals(TEST_TEXT_3);
    expect(responseInfo.bomRemoved).to.be.true;
    expect(responseInfo.charset).equals('utf-32be');
  });
});
