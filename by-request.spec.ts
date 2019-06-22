/*
  Copyright © 2019 Kerry Shetline, kerry@shetline.com

  MIT license: https://opensource.org/licenses/MIT

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
  documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
  rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
  persons to whom the Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
  Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
  WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
  COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
  OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
import { requestBinary, requestText, ResponseInfo, wget } from './by-request';
import compression from 'compression';
import express, { Application, Request, Response } from 'express';
import fs from 'fs';
import iconv from 'iconv-lite';

/* -------- Start of test web server -------- */

const app: Application = express();
const port = process.env.TEST_PORT || 3000;

app.use(compression());

app.get('/test1', (req: Request, res: Response) => {
  res.send('Côte d\'Ivoire');
});

app.get('/test2', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain; charset=iso-8859-1');
  res.send(iconv.encode('Côte d\'Ivoire', 'iso-8859-1'));
});

app.get('/test3', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-16le');
  res.send(iconv.encode('Hello, world! 🙂', 'utf-16le', { addBOM: true }));
});

app.get('/test4', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(iconv.encode('Hello, world! 🙂', 'utf-16be'));
});

app.get('/test5', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(iconv.encode('Côte d\'Ivoire', 'utf-8'));
});

app.get('/test6', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain; charset=iso-8859-1');
  res.send(iconv.encode('Côte d\'Ivoire', 'utf-8', { addBOM: true }));
});

app.get('/test7/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);

  res.setHeader('Content-Type', 'text/html');
  res.send(iconv.encode(
    (id === 1 ? '<?xml version="1.0" encoding="macroman"?>' : '') + '\n' +
    '<!-- Ignore this <meta charset="utf-8"> -->\n' +
    (id === 2 ? '<meta charset="macroman">' : '') + '\n' +
    (id === 3 ? '<meta http-equiv="Content-Type" content="text/html; charset=macroman">' : '') + '\n' +
    (id === 4 ? '@charset "macroman";' : '') + '\n' +
    '<div>A Møøse once bit my sister... No realli!</div>', 'macroman'));
});

app.get('/test8', (req: Request, res: Response) => {
  const content = ['Very large content '];

  for (let i = 0; i < 100000; ++i)
    content.push(Math.random().toFixed(3).substr(2));

  res.send(content.join(''));
});

app.get('/test9', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(Buffer.from([0, 1, 2, 3]));
});

app.listen(port, () => {
  console.log(`by-request unit test server listening on ${port}.`);
});

describe('by-request', () => {
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

  it('should read binary data correctly', async done => {
    const content = await requestBinary(`http://localhost:${port}/test9/`);
    expect(Array.from(content)).toEqual([0, 1, 2, 3]);
    done();
  });

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
