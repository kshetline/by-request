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
import { Writable } from 'stream';

const MAX_EXAMINE = 2048;

export interface ExtendedRequestOptions extends RequestOptions {
  agents?: { http?: typeof http, https?: typeof https };  // follow-redirects
  dontDecompress?: boolean;
  dontEndStream?: boolean;
  followRedirects?: boolean; // follow-redirects
  forceEncoding?: boolean;
  ignoreBom?: boolean;
  keepBom?: boolean;
  maxBodyLength?: number; // follow-redirects
  maxRedirects?: number; // follow-redirects
  progress?: (bytesRead: number, totalBytes: number | undefined) => void;
  responseInfo?: (info: ResponseInfo) => void;
  stream?: Writable; // For internal use only
  streamCreated?: boolean; // For internal use only
  trackRedirects?: boolean; // follow-redirects
}

export interface ResponseInfo {
  bomDetected: boolean;
  bomRemoved: boolean;
  callback?: string;
  charset: string;
  contentEncoding: string;
  contentLength: number;
  contentType: string;
  stream: Writable;
}

export async function request(urlOrOptions: string | ExtendedRequestOptions,
                       optionsOrEncoding?: ExtendedRequestOptions | string, encoding?: string): Promise<string | Buffer | number> {
  let options: ExtendedRequestOptions;

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
    options = urlOrOptions as ExtendedRequestOptions;

  if (!options.headers)
    options.headers = { 'accept-encoding': 'gzip, deflate, br' };
  else if (!options.headers['accept-encoding'])
    options.headers['accept-encoding'] = 'gzip, deflate, br';

  let forceEncoding = options.forceEncoding;

  if (!encoding) {
    encoding = 'utf8';
    // Only an explicit encoding will be forced, not this default.
    forceEncoding = false;
  }

  const protocol = (options.protocol === 'https:' ? https : http);
  const stream = options.stream;

  return new Promise<string | Buffer | number>((resolve, reject) => {
    const endStream = !options.dontEndStream && stream !== process.stdout && stream !== process.stderr;

    protocol.get(options, res => {
      if (200 <= res.statusCode && res.statusCode < 300) {
        let source = res as any;
        const contentEncoding = (res.headers['content-encoding'] || '').toLowerCase();
        const contentType = (res.headers['content-type'] || '').toLowerCase();
        let contentLength = parseInt(res.headers['content-length'], 10);
        contentLength = (isNaN(contentLength) ? undefined : contentLength);
        const binary = (encoding === 'binary' || !!options.stream ||
          (isBinary(contentType) && (!encoding || !iconv.encodingExists(encoding))));
        let usingIconv = false;
        let charset: string;
        let autodetect = !forceEncoding && !binary;
        let bytesRead = 0;
        let bomDetected = false;
        let removeBom = false;

        if (!options.dontDecompress || !binary) {
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
        }

        if (res !== source) {
          res.on('error', error => {
            if (stream && (endStream || options.streamCreated))
              stream.end();

            reject(error);
          });

          res.on('data', (data: Buffer) => {
            bytesRead += data.length;

            if (options.progress)
              options.progress(bytesRead, contentLength);
          });
        }

        if (!binary) {
          if (forceEncoding)
            charset = encoding;
          else {
            const $ = /\bcharset\s*=\s*['"]?\s*([\w\-]+)\b/.exec(contentType);

            if ($)
              charset = $[1] === 'utf-8' ? 'utf8' : $[1];
            else {
              charset = encoding;
              autodetect = true;
            }
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

        source.on('error', (error: any) => {
          if (stream && (endStream || options.streamCreated))
            stream.end();

          reject(error);
        });

        source.on('data', (data: Buffer) => {
          if (res === source) {
            bytesRead += data.length;

            if (options.progress)
              options.progress(bytesRead, contentLength);
          }

          if (content.length === 0 && !options.ignoreBom) {
            const bomCharset = checkBOM(data);

            if (bomCharset) {
              if (!forceEncoding) {
                if (!iconv.encodingExists(bomCharset)) {
                  reject(UNSUPPORTED_MEDIA_TYPE);
                  return;
                }

                charset = bomCharset;
                usingIconv = (bomCharset !== 'utf8');
                autodetect = false;
              }

              bomDetected = true;

              if (!options.keepBom)
                removeBom = true;
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

          if (stream) {
            stream.write(data, error => {
              if (error) {
                stream.end();
                reject(error);
              }
            });
          }
          else
            content = Buffer.concat([content, data], content.length + data.length);
        });

        source.on('end', () => {
          if (options.progress && contentLength === undefined)
            options.progress(bytesRead, bytesRead);

          if (options.responseInfo) {
            options.responseInfo({
              bomDetected,
              bomRemoved: removeBom,
              charset: binary ? 'binary' : charset,
              contentEncoding: contentEncoding || 'identity',
              contentLength: bytesRead,
              contentType,
              stream
            });
          }

          if (stream) {
            if (endStream)
              stream.end();

            resolve(bytesRead);
          }
          else if (binary)
            resolve(content);
          else {
            let text: string;

            if (usingIconv)
              text = iconv.decode(content, charset, { stripBOM: false });
            else
              text = content.toString(charset);

            if (removeBom && text.charCodeAt(0) === 0xFEFF)
              text = text.substr(1);

            resolve(text);
          }
        });
      }
      else {
        if (stream && (endStream || options.streamCreated))
          stream.end();

        reject(res.statusCode);
      }
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
    return 'utf-32be';
  else if (bom[0] === 0xFF && bom[1] === 0xFE && bom[2] === 0x00 && bom[3] === 0x00)
    return 'utf-32le';
  else if (bom[0] === 0xFE && bom[1] === 0xFF)
    return 'utf-16be';
  else if (bom[0] === 0xFF && bom[1] === 0xFE)
    return 'utf-16le';
  else if (bom[0] === 0xEF && bom[1] === 0xBB && bom[2] === 0xBF)
    return 'utf8';
  else if (bom[0] === 0x2B && bom[1] === 0x2F && bom[2] === 0x76 &&
           (bom[3] === 0x2B || bom[3] === 0x2F || bom[3] === 0x38 || bom[3] === 0x39))
    return 'utf7';

  return null;
}

function lookForEmbeddedEncoding(buffer: Buffer): string {
  // First make sure this isn't likely to be a 16- or 32-bit encoding.
  const start = Array.from(buffer.slice(0, Math.min(buffer.length, 4)));

  if (start[0] === 0 && start[1] === 0 && (start[2] !== 0 || start[3] !== 0))
    return 'utf-32be';
  else if ((start[0] !== 0 || start[1] !== 0) && start[2] === 0 && start[3] === 0)
    return 'utf-32le';
  else if (start[0] === 0 && start[1] !== 0)
    return 'utf-16be';
  else if (start[0] !== 0 && start[1] === 0)
    return 'utf-16le';

  const text = buffer.slice(0, Math.min(buffer.length, MAX_EXAMINE)).toString('ascii').toLowerCase().replace('\n', ' ').trim();
  // Strip line breaks and comments first
  const tagText = text.replace(/\n+/g, ' ').replace(/<!--.*?-->/g, '').trim();
  // Break into tags
  const tags = tagText.replace(/[^<]*(<[^>]*>)[^<]*/g, '$1\n').split('\n').filter(tag => !/^<\//u.test(tag));
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
