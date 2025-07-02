import { ResponseInfo } from './by-request';
import chai, { expect } from 'chai';
import { requestText } from './request-text';
import { port, TEST_TEXT_1, TEST_TEXT_2, TEST_TEXT_3 } from './test-server.spec';
import chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('request-text', () => {
  it('should read UTF-8 text correctly', async () => {
    const content = await requestText(`http://localhost:${port}/test1/`);
    expect(content).equals(TEST_TEXT_1);
  });

  it('should read ISO-8859-1 text correctly', async () => {
    const content = await requestText(`http://localhost:${port}/test2/`);
    expect(content).equals(TEST_TEXT_1);
  });

  it('should read text as ISO-8859-1 when Content-Type isn\'t specified', async () => {
    const content = await requestText(`http://localhost:${port}/test2a/`);
    expect(typeof content).equals('string');
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

    await expect(requestText(`http://localhost:${port}/test14`)).to.be.rejectedWith('Unsupported Media Type');
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
    expect(responseInfo.charset).equals('utf-8');
    expect(responseInfo.contentEncoding).equals('br');
  });

  it('should be able to identity various UTF formats according to BOM', async () => {
    let responseInfo: ResponseInfo = null;
    let content = await requestText(`http://localhost:${port}/test12/?enc=utf7`, {
      responseInfo: info => responseInfo = info
    });

    expect(content).equals(TEST_TEXT_3);
    expect(responseInfo.bomRemoved).to.be.true;
    expect(responseInfo.charset).equals('utf7');

    content = await requestText(`http://localhost:${port}/test12/?enc=utf8`, {
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

    content = await requestText(`http://localhost:${port}/test12a/?enc=utf16le!`, {
      responseInfo: info => responseInfo = info
    });

    expect(content).equals(TEST_TEXT_2);
    expect(responseInfo.bomRemoved).to.be.false;
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

    content = await requestText(`http://localhost:${port}/test12a/?enc=utf32le!`, {
      responseInfo: info => responseInfo = info
    });

    expect(content).equals(TEST_TEXT_2);
    expect(responseInfo.bomRemoved).to.be.false;
    expect(responseInfo.charset).equals('utf-32le');

    content = await requestText(`http://localhost:${port}/test12/?enc=utf32be`, {
      responseInfo: info => responseInfo = info
    });

    expect(content).equals(TEST_TEXT_3);
    expect(responseInfo.bomRemoved).to.be.true;
    expect(responseInfo.charset).equals('utf-32be');

    content = await requestText(`http://localhost:${port}/test12a/?enc=utf32be!`, {
      responseInfo: info => responseInfo = info
    });

    expect(content).equals(TEST_TEXT_2);
    expect(responseInfo.bomRemoved).to.be.false;
    expect(responseInfo.charset).equals('utf-32be');

    content = await requestText(`http://localhost:${port}/test15`);
    expect(content).equals('\n');
  });

  it('should handle timeout correctly', async function () {
    this.timeout(15000);
    this.slow(10000);
    await expect(requestText(`http://localhost:${port}/httpstat.us/522?sleep=6000`, { timeout: 3000 })).to.eventually.be.rejected;
  });

  it('should handle deflate-encoded content', async function () {
    this.timeout(10000);
    this.slow(5000);
    const content = await requestText('http://carsten.codimi.de/gzip.yaws/daniels.html?deflate=on');
    expect(content).contains('This document has been transmitted with content encoding `deflate\'.');
  });

  it('should handle Brotli-encoded content', async function () {
    this.timeout(10000);
    this.slow(5000);
    const content = await requestText({
      protocol: 'https',
      host: 'tools-7.kxcdn.com',
      path: 'css/style-028e36f320.css'
    });
    expect(content).contains('Bootstrap v4.5.0');
  });

  it('should not work with binary encoding', async () => {
    await expect(requestText('http://localhost:8080/test9/', 'binary'))
      .to.be.rejectedWith('Binary encoding not permitted. Please use requestBinary.');
  });
});
