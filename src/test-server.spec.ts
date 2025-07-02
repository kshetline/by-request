import compression from 'compression';
import express, { Application, Request, Response } from 'express';
import iconv from 'iconv-lite';
import * as zlib from 'zlib';
import { Server } from 'http';
import * as bodyParser from 'body-parser';
import { toNumber, isString, sleep } from '@tubular/util';
import { StatusCodes } from 'http-status-codes';

export const TEST_TEXT_1 = 'Côte d\'Ivoire';
export const TEST_TEXT_2 = 'Hello, world! 🙂';
export const TEST_TEXT_3 = '❝Some more text 😱 to try ☔ 샘플 텍스트❞';
export const TEST_TEXT_4 = `<html>
<head><meta http-equiv="Content-Type" content="text/html; charset=foo"></head>
<body></body>
</html>`;

export const port = process.env.TEST_PORT || 3000;

if (!(global as any).testServerStarted) {
  (global as any).testServerStarted = true;
  const app: Application = express();

  app.use(bodyParser.json());
  app.use(bodyParser.text());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(compression());

 // eslint-disable-next-line @typescript-eslint/no-misused-promises
  app.use('/httpstat.us', async (req: Request, res: Response) => {
    const url = req.url.slice(1).replace(/\?.*$/, '');

    if (req.query.sleep)
      await sleep(toNumber(req.query.sleep));

    if (req.query.type)
      res.setHeader('Content-Type', String(req.query.type));

    if (req.query.enc)
      res.setHeader('Content-Encoding', String(req.query.enc));

    if (url === '200') {
      res.status(200).send(Buffer.from('200 OK'));
    }
    else if (url === '400') {
      res.status(400).send(Buffer.from('Bad Request'));
    }
    else if (url === '522') {
      res.status(522).send(Buffer.from('Connection Timeout'));
    }
    else if (req.url && toNumber(url) > 0) {
      res.sendStatus(toNumber(url));
    }
  });

  app.get('/test1', (req: Request, res: Response) => {
    res.send(TEST_TEXT_1);
  });

  app.get('/test2', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/plain; charset=iso-8859-1');
    res.send(iconv.encode(TEST_TEXT_1, 'iso-8859-1'));
  });

  app.get('/test2a', (req: Request, res: Response) => {
    res.removeHeader('Content-Type');
    res.send(iconv.encode(TEST_TEXT_1, 'utf-8'));
  });

  app.get('/test3', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-16le');
    res.send(iconv.encode(TEST_TEXT_2, 'utf-16le', { addBOM: true }));
  });

  app.get('/test4', (req: Request, res: Response) => {
    const rc = toNumber(req.query.rc || req.params.rc);

    if (rc) {
      if (rc === 304) {
        res.sendStatus(304);
        return;
      }

      res.status(toNumber(req.query.rc));
    }

    res.setHeader('Content-Type', 'text/plain');
    res.send(iconv.encode(TEST_TEXT_2, 'utf-16be'));
  });

  app.get('/test5', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/plain');
    res.send(iconv.encode(TEST_TEXT_1, 'utf-8'));
  });

  app.get('/test6', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/plain; charset=iso-8859-1');
    res.send(iconv.encode(TEST_TEXT_1, 'utf-8', { addBOM: true }));
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
      content.push(Math.random().toFixed(3).substring(2));

    res.send(content.join(''));
  });

  app.get('/test9', (req: Request, res: Response) => {
    if (req.headers['if-modified-since'])
      res.status(StatusCodes.NOT_MODIFIED).send('304');
    else {
      if (req.query.type)
        res.setHeader('Content-Type', String(req.query.type));
      else
        res.setHeader('Content-Type', 'application/octet-stream');

      res.send(Buffer.from([0, 1, 2, 3]));
    }
  });

  app.get('/test10', (req: Request, res: Response) => {
    const json = { foo: 'bar', baz: 'quux' };
    const callback = req.query.callback;

    if (callback)
      res.jsonp(json);
    else
      res.json(json);
  });

  app.get('/test11', (req: Request, res: Response) => {
    const corrupt = !!req.query.corrupt;
    const asGzip = !!req.query.asgzip;
    const asFoo = !!req.query.asfoo;
    const data = [0, 1, 2, 3, 4, 5, 6, 7];
    const content = Buffer.from(data);
    let zipped = zlib.gzipSync(content);

    if (corrupt) {
      const data2 = Array.from(zipped);
      zipped[10] = 0;
      zipped = Buffer.from(data2);
    }

    if (asGzip) {
      res.setHeader('Content-Encoding', 'x-gzip');
      res.setHeader('Content-Type', 'application/x-gzip');
    }
    else if (asFoo)
      res.setHeader('Content-Encoding', 'foo');
    else
      res.setHeader('Content-Encoding', 'gzip');

    res.send(zipped);
  });

  app.get('/test12a', (req: Request, res: Response) => {
    let addBOM = true;
    let enc = req.query.enc?.toString();

    if (enc.endsWith('!')) {
      enc = enc.slice(0, -1);
      addBOM = false;
    }

    res.setHeader('Content-Type', 'text/plain');
    res.send(iconv.encode(TEST_TEXT_2, enc, { addBOM }));
  });

  app.get('/test12', (req: Request, res: Response) => {
    let addBOM = true;
    let enc = req.query.enc?.toString();

    if (enc.endsWith('!')) {
      enc = enc.slice(0, -1);
      addBOM = false;
    }

    res.setHeader('Content-Type', 'text/plain');
    res.send(iconv.encode(TEST_TEXT_3, enc, { addBOM }));
  });

  app.post('/test13', (req: Request, res: Response) => {
    let response = '?';

    if (isString(req.body))
      response = req.body;
    else if (req.body)
      response = [req.body.do, req.body.re, req.body.mi].join();

    res.setHeader('Content-Type', 'text/plain');
    res.send(response);
  });

  app.get('/test14', (req: Request, res: Response) => {
    res.send(TEST_TEXT_4);
  });

  app.get('/test15', (req: Request, res: Response) => {
    res.send(Buffer.from([10]));
  });

  let server: Server;

  before(() => {
    server = app.listen(port, () => {
      console.log(`by-request unit test server listening on ${port}.`);
    });
  });

  after(() => {
    if (server) {
      server.close(() => {
        server = null;
        (global as any).testServerStarted = false;
        console.log('server terminated');
      });
    }
  });

  app.on('end', () => console.log('server terminated'));
}
