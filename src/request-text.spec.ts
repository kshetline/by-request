import { ResponseInfo } from './by-request';
import { NOT_FOUND } from 'http-status-codes';
import { requestText } from './request-text';
import { port } from './test-server.spec';
import { requestJson } from './request-json';

describe('request-text', () => {
  it('should read UTF-8 text correctly', async done => {
    const content = await requestText(`http://localhost:${port}/test1/`);
    expect(content).toEqual('Côte d\'Ivoire');
    done();
  });

  it('should read ISO-8859-1 text correctly', async done => {
    const content = await requestText(`http://localhost:${port}/test2/`);
    expect(content).toEqual('Côte d\'Ivoire');
    done();
  });

  it('should read UTF-16 text (LE, with BOM) correctly', async done => {
    let content = await requestText(`http://localhost:${port}/test3/`);
    expect(content).toEqual('Hello, world! 🙂');

    content = await requestText(`http://localhost:${port}/test3/`, { ignoreBom: true });
    expect(content).toEqual('\uFEFFHello, world! 🙂');

    done();
  });

  it('should read UTF-16 text correctly when encoding is left out by sender, but specified as default', async done => {
    const content = await requestText(`http://localhost:${port}/test4/`, 'utf-16');
    expect(content).toBe('Hello, world! 🙂');
    done();
  });

  it('should get garbled text when encoding is left out by sender, and the wrong encoding is suggested', async done => {
    const content = await requestText(`http://localhost:${port}/test5/`, 'iso-8859-1');
    expect(content).toBe('CÃ´te d\'Ivoire');
    done();
  });

  it('should get garbled text when correct encoding is left out by sender, but the wrong encoding is forced', async done => {
    const content = await requestText(`http://localhost:${port}/test1/`, { forceEncoding: true }, 'iso-8859-1');
    expect(content).toBe('CÃ´te d\'Ivoire');
    done();
  });

  it('should read UTF-8 with BOM correctly, with BOM overriding conflicting sender-specified charset', async done => {
    let responseInfo: ResponseInfo = null;
    const content = await requestText(`http://localhost:${port}/test6/`, {
      responseInfo: info => responseInfo = info
    });

    expect(content).toEqual('Côte d\'Ivoire');
    expect(responseInfo.bomDetected).toBeTruthy();
    expect(responseInfo.bomRemoved).toBeTruthy();

    done();
  });

  it('should read character encoding embedded near beginning of HTML/XML/CSS content, example "macroman"', async done => {
    let content = await requestText(`http://localhost:${port}/test7/1`);
    expect(content).toContain('A Møøse once bit my sister... No realli!');

    content = await requestText(`http://localhost:${port}/test7/2`);
    expect(content).toContain('A Møøse once bit my sister... No realli!');

    content = await requestText(`http://localhost:${port}/test7/3`);
    expect(content).toContain('A Møøse once bit my sister... No realli!');

    content = await requestText(`http://localhost:${port}/test7/4`);
    expect(content).toContain('A Møøse once bit my sister... No realli!');

    done();
  });

  it('should get progress reports from long streams of input', async done => {
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

    expect(content).toContain('Very large content');
    expect(count > 0).toBeTruthy();
    expect(bytesRead).toBe(totalBytes);
    expect(bytesRead).toBe(responseInfo.contentLength);
    expect(responseInfo.charset).toBe('utf8');
    expect(responseInfo.contentEncoding).toBe('gzip');

    done();
  });

  it('should throw an exception for an HTTP error', async done => {
    try {
      await requestJson(`http://localhost:${port}/doesnt_exist/`);
      expect(false).toBeTruthy('Exception for HTTP error should have been thrown.');
    }
    catch (err) {
      expect(err).toEqual(NOT_FOUND);
    }

    done();
  });
});
