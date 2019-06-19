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
import { request } from './by-request';
import express, { Application, Request, Response } from 'express';
import iconv from 'iconv-lite';

const app: Application = express();
const port = process.env.TEST_PORT || 3000;

app.get('/test1', (req: Request, res: Response) => {
  res.send('Côte d\'Ivoire');
});

app.get('/test2', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain; charset=iso-8859-1');
  res.send(iconv.encode('Côte d\'Ivoire', 'iso-8859-1'));
});

app.get('/test3', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-16');
  res.send(iconv.encode('Hello, world! 🙂', 'utf-16'));
});

app.get('/test4', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(iconv.encode('Hello, world! 🙂', 'utf-16'));
});

app.get('/test5', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain');
  res.send(iconv.encode('Côte d\'Ivoire', 'utf-8'));
});

app.listen(port, () => {
  console.log(`by-request unit test server listening on ${port}.`);
});

describe('by-request', () => {
  it('should read UTF-8 text correctly', async done => {
    const content = await request(`http://localhost:${port}/test1/`);
    expect(content).toEqual('Côte d\'Ivoire');
    done();
  });

  it('should read ISO-8859-1 text correctly', async done => {
    const content = await request(`http://localhost:${port}/test2/`);
    expect(content).toEqual('Côte d\'Ivoire');
    done();
  });

  it('should read UTF-16 text correctly', async done => {
    const content = await request(`http://localhost:${port}/test3/`);
    expect(content).toEqual('Hello, world! 🙂');
    done();
  });

  it('should read UTF-16 text correctly when encoding is left out by sender, but specified as default', async done => {
    const content = await request(`http://localhost:${port}/test4/`, 'utf-16');
    expect(content).toBe('Hello, world! 🙂');
    done();
  });

  it('should get garbled text when forcing the wrong encoding', async done => {
    const content = await request(`http://localhost:${port}/test5/`, 'iso-8859-1');
    expect(content).toBe('CÃ´te d\'Ivoire');
    done();
  });
});
