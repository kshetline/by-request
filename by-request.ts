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
import { RequestOptions } from 'http';
import zlib from 'zlib';
import { http, https } from 'follow-redirects';
import { parse as parseUrl } from 'url';
import iconv from 'iconv-lite';
import { UNSUPPORTED_MEDIA_TYPE } from 'http-status-codes';

const MAX_EXAMINE = 2048;

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
          reject(UNSUPPORTED_MEDIA_TYPE);
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
              reject(UNSUPPORTED_MEDIA_TYPE);
              return;
            }

            usingIconv = true;
          }
        }

        let content = Buffer.alloc(0);

        source.on('data', (data: Buffer) => {
          if (content.length === 0) {
            const bom = checkBOM(data);

            if (bom) {
              const [bomLength, bomCharset] = bom.split(':');

              if (!iconv.encodingExists(bomCharset)) {
                reject(UNSUPPORTED_MEDIA_TYPE);
                return;
              }

              charset = bomCharset;
              usingIconv = true;
              autodetect = false;
              // Remove BOM
              data = data.slice(Number(bomLength));
            }
          }

          if (autodetect && content.length === 0) {
            const embeddedEncoding = lookForEmbeddedEncoding(data);

            if (embeddedEncoding) {
              if (!iconv.encodingExists(embeddedEncoding)) {
                reject(UNSUPPORTED_MEDIA_TYPE);
                return;
              }

              charset = embeddedEncoding;
              usingIconv = true;
              autodetect = false;
            }
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

  if (bom[0] === 0x00 && bom[1] === 0x00 && bom[2] === 0xFE && bom[3] === 0xFF)
    return '4:utf-32be';
  else if (bom[0] === 0xFF && bom[1] === 0xFE && bom[2] === 0x00 && bom[3] === 0x00)
    return '4:utf-32le';
  else if (bom[0] === 0xFE && bom[1] === 0xFF)
    return '2:utf-16be';
  else if (bom[0] === 0xFF && bom[1] === 0xFE)
    return '2:utf-16le';
  else if (bom[0] === 0xEF && bom[1] === 0xBB && bom[2] === 0xBF)
    return '3:utf8';

  return null;
}

function lookForEmbeddedEncoding(buffer: Buffer): string {
  // First make sure this isn't likely to be a 16- or 32-bit encoding.
  const start = Array.from(buffer.slice(0, Math.min(buffer.length, 4)));

  if (start[0] === 0 && start[1] === 0 && (start[2] !== 0 || start[3] !== 0)) {
    return 'utf-32be';
  }
  else if ((start[0] !== 0 || start[1] !== 0) && start[2] === 0 && start[3] === 0) {
    return 'utf-32le';
  }
  else if (start[0] === 0 && start[1] !== 0) {
    return 'utf-16be';
  }
  else if (start[0] !== 0 && start[1] === 0) {
    return 'utf-16le';
  }

  let text = buffer.slice(0, Math.min(buffer.length, MAX_EXAMINE)).toString('ascii').toLowerCase().replace('\n', ' ').trim();
  // Strip line breaks and comments first
  let tagText = text.replace(/\n+/g, ' ').replace(/<!--.*?-->/g, '').trim();
  // Break into tags
  const tags = tagText.replace(/[^<]*(<[^>]*>)[^<]*/g, '$1\n').split('\n').filter(tag => !/^<\//.test(tag));
  let $: string[];

  for (const tag of tags) {
    if (/^<\?xml\b/.test(tag) && ($ = /\bencoding\s*=\s*['"]\s*([\w\-]+)\b/.exec(tag)))
      return $[1];
    else if (/^<meta\b/.test(tag)) {
      if (($ = /\bcharset\s*=\s*['"]?\s*([\w\-]+)\b/.exec(tag)))
        return $[1];
      else if (/\bhttp-equiv\s*=\s*['"]?\s*content-type\b/.test(tag) &&
        ($ = /\bcontent\s*=\s*['"]?.*;\s*charset\s*=\s*([\w\-]+)\b/.exec(tag)))
        return $[1];
    }
  }

  // CSS charset must come right at the beginning of a file, so no need to worry about comments confusing the issue.
  if (($ = /@charset\s+['"]\s*([\w\-]+)\b/.exec(text)))
    return $[1];

  return null;
}
