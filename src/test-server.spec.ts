import compression from 'compression';
import express, { Application, Request, Response } from 'express';
import iconv from 'iconv-lite';

export const port = process.env.TEST_PORT || 3000;

if (!(global as any).testServerStarted) {
  (global as any).testServerStarted = true;
  const app: Application = express();

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

  app.on('end', () => console.log('server terminated'));
}
