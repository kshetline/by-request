import { RequestOptions } from 'http';
import zlib from 'zlib';
import { http, https } from 'follow-redirects';
import { parse as parseUrl } from 'url';
import iconv from 'iconv-lite';

export async function request(urlOrOptions: string | RequestOptions, encoding?: string): Promise<string | Buffer>;
export async function request(url: string, options: RequestOptions, encoding?: string): Promise<string | Buffer>;
export async function request(urlOrOptions: string | RequestOptions, optionsOrEncoding?: RequestOptions | string, encoding?: string): Promise<string | Buffer> {
  let options: RequestOptions;

  if (typeof urlOrOptions === 'string')
    options = parseUrl(urlOrOptions);

  if (typeof optionsOrEncoding === 'string')
    encoding = optionsOrEncoding;
  else if (optionsOrEncoding) {
    if (options)
      Object.assign(options, optionsOrEncoding);
    else
      options = optionsOrEncoding;
  }
  else if (!options)
    options = urlOrOptions as RequestOptions;

  if (!options.headers)
    options.headers = { 'accept-encoding': 'gzip, deflate, br' };
  else if (!options.headers['accept-encoding'])
    options.headers['accept-encoding'] = 'gzip, deflate, br';

  if (!encoding)
    encoding = 'utf8';

  const protocol = (options.protocol === 'https:' ? https : http);

  return new Promise<string | Buffer>((resolve, reject) => {
    protocol.get(options, res => {
      if (res.statusCode === 200) {
        let source = res as any;
        const contentEncoding = (res.headers['content-encoding'] || '').toLowerCase();
        const contentType = (res.headers['content-type'] || '').toLowerCase();
        const binary = (encoding === 'binary' || isBinary(contentType));
        let usingIconv = false;
        let charset: string;
        let autodetect = false;

        if (contentEncoding === 'gzip') {
          source = zlib.createGunzip();
          res.pipe(source);
        }
        else if (contentEncoding === 'deflate') {
          source = zlib.createInflate();
          res.pipe(source);
        }
        else if (contentEncoding === 'br') {
          source = zlib.createBrotliDecompress();
          res.pipe(source);
        }
        else if (contentEncoding && contentEncoding !== 'identity') {
          reject(415); // Unsupported Media Type
          return;
        }

        if (!binary) {
          const $ = /\bcharset\s*=\s*['"]?\s*([\w\-]+)\b/.exec(contentType);

          if ($)
            charset = $[1] === 'utf-8' ? 'utf8' : $[1];
          else {
            charset = encoding;
            autodetect = true;
          }

          if (!/^(ascii|utf8|utf16le|ucs2|base64|binary|hex)$/.test(charset)) {
            if (!iconv.encodingExists(charset)) {
              reject(415); // Unsupported Media Type
              return;
            }

            usingIconv = true;
          }
        }

        let content = Buffer.alloc(0);

        source.on('data', (data: Buffer) => {
          if (content.length === 0)
            checkBOM(data);
          if (autodetect && content.length === 0) {
            const sample = data.toString('ascii').toLowerCase().replace('\n', ' ').trim();
            console.log(sample);
          }

          content = Buffer.concat([content, data], content.length + data.length);
        });

        source.on('end', () => {
          if (binary)
            resolve(content);
          else if (usingIconv)
            resolve(iconv.decode(content, charset));
          else
            resolve(content.toString(charset));
        });
      }
      else
        reject(res.statusCode);
    }).on('error', err => reject(err));
  });
}

function isBinary(contentType: string): boolean {
  let $: string[];

  if (/;\s*charset\s*=/i.test(contentType))
    return false;

  // Remove anything other than MIME type.
  contentType = contentType.replace(/;.*$/, '').trim();

  if (/^text\//i.test(contentType) || /\+xml$/i.test(contentType))
    return false;
  else if (($ = /^application\/(.+)/i.exec(contentType)))
    return !/^(javascript|ecmascript|json|ld\+json|rtf)$/i.test($[1]);
  else
    return true;
}

function checkBOM(buffer: Buffer): string {
  if (!buffer || buffer.length < 2)
    return null;

  const bom = Array.from(buffer.slice(0, Math.min(buffer.length, 4)));

  if (bom[0] === 0x00 && bom[1] === 0x00 && bom[2] === 0xFE && bom[3] == 0xFF)
    return '4:utf-32be';
  else if (bom[0] === 0xFF && bom[1] === 0xFE && bom[2] === 0x00 && bom[3] == 0x00)
    return '4:utf-32le';
  else if (bom[0] === 0xFE && bom[1] === 0xFF)
    return '2:utf-16be';
  else if (bom[0] === 0xFF && bom[1] === 0xFE)
    return '2:utf-16le';
  else if (bom[0] === 0xEF && bom[1] === 0xBB && bom[2] === 0xBF)
    return '3:utf8';

  return null;
}
