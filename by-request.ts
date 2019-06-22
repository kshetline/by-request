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
import { createWriteStream } from 'fs';
import { RequestOptions } from 'http';
import zlib from 'zlib';
import { http, https } from 'follow-redirects';
import { parse as parseUrl } from 'url';
import iconv from 'iconv-lite';
import { UNSUPPORTED_MEDIA_TYPE } from 'http-status-codes';
import { Writable } from 'stream';

const MAX_EXAMINE = 2048;

export interface ExtendedRequestOptions extends RequestOptions {
  agents?: { http?: typeof http, https?: typeof https };  // from follow-redirects
  dontDecompress?: boolean;
  dontEndStream?: boolean;
  followRedirects?: boolean; // from follow-redirects
  forceEncoding?: boolean;
  ignoreBom?: boolean;
  keepBom?: boolean;
  maxBodyLength?: number; // from follow-redirects
  maxRedirects?: number; // from follow-redirects
  progress?: (bytesRead: number, totalBytes: number | undefined) => void;
  responseInfo?: (info: ResponseInfo) => void;
  stream?: Writable;
  trackRedirects?: boolean; // from follow-redirects
}

export interface ResponseInfo {
  bomDetected: boolean;
  bomRemoved: boolean;
  charset: string;
  contentEncoding: string;
  contentLength: number;
  contentType: string;
  stream: Writable;
}

export async function requestText(urlOrOptions: string | ExtendedRequestOptions, encoding?: string): Promise<string>;
export async function requestText(url: string, options: ExtendedRequestOptions, encoding?: string): Promise<string>;
export async function requestText(urlOrOptions: string | ExtendedRequestOptions,
                                  optionsOrEncoding?: ExtendedRequestOptions | string, encoding?: string): Promise<string> {
  if (encoding === 'binary')
    throw Error('Binary encoding not permitted. Please use requestBinary.');

  return request(urlOrOptions as any, optionsOrEncoding as any, encoding) as Promise<string>;
}

export async function requestBinary(urlOrOptions: string | ExtendedRequestOptions,
                                    options?: ExtendedRequestOptions): Promise<Buffer> {
  return request(urlOrOptions as any, options, 'binary') as Promise<Buffer>;
}

export async function wget(urlOrOptions: string | ExtendedRequestOptions,
                           optionsOrPathOrStream?: ExtendedRequestOptions | string | Writable,
                           pathOrStream?: string | Writable): Promise<number> {
  let url: string;
  let options: ExtendedRequestOptions;
  let path: string;
  let stream: Writable;

  if (typeof pathOrStream === 'string')
    path = pathOrStream;
  else if (pathOrStream)
    stream = pathOrStream;

  if (!path && typeof optionsOrPathOrStream === 'string')
    path = optionsOrPathOrStream;
  else if (!stream && optionsOrPathOrStream && (optionsOrPathOrStream as any).write && (optionsOrPathOrStream as any).end)
    stream = optionsOrPathOrStream as Writable;
  else if (optionsOrPathOrStream)
    options = optionsOrPathOrStream as ExtendedRequestOptions;

  if (typeof urlOrOptions === 'string')
    url = urlOrOptions;
  else if (!options)
    options = urlOrOptions;

  if (!options)
    options = {};

  const urlFile = (url || options.path || '').replace(/\/$/, '').replace(/.*\//, '');
  const pathIsDirectory = path && /\/$/.test(path);

  if (pathIsDirectory)
    path += urlFile;
  else if (!path)
    path = urlFile;

  if (!path && !stream)
    throw new Error('A Writable stream, a file path, or a URL from which a file name can be extracted must be provided.');

  if (!stream) {
    stream = createWriteStream(path);

    await new Promise((resolve, reject) => {
      stream.on('open', () => resolve());
      stream.on('error', error => reject(error));
    });
  }

  options.stream = stream;

  return request(url || options, url ? options : undefined, 'binary') as Promise<number>;
}

async function request(urlOrOptions: string | ExtendedRequestOptions,
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

  if (!encoding)
    encoding = 'utf8';

  const protocol = (options.protocol === 'https:' ? https : http);
  const stream = options.stream;

  return new Promise<string | Buffer | number>((resolve, reject) => {
    protocol.get(options, res => {
      if (res.statusCode === 200) {
        let source = res as any;
        const contentEncoding = (res.headers['content-encoding'] || '').toLowerCase();
        const contentType = (res.headers['content-type'] || '').toLowerCase();
        let contentLength = parseInt(res.headers['content-length'], 10);
        contentLength = (isNaN(contentLength) ? undefined : contentLength);
        const binary = (encoding === 'binary' || !!options.stream || isBinary(contentType));
        const endStream = !options.dontEndStream && stream !== process.stdout && stream !== process.stderr;
        let usingIconv = false;
        let charset: string;
        let autodetect = !options.forceEncoding && !binary;
        let bytesRead = 0;
        let bomDetected = false;
        let bomRemoved = false;

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
          res.on('data', (data: Buffer) => {
            bytesRead += data.length;

            if (options.progress)
              options.progress(bytesRead, contentLength);
          });
        }

        if (!binary) {
          if (options.forceEncoding)
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

        source.on('data', (data: Buffer) => {
          if (res === source) {
            bytesRead += data.length;

            if (options.progress)
              options.progress(bytesRead, contentLength);
          }

          if (content.length === 0 && !options.ignoreBom) {
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
              bomDetected = true;

              if (!options.keepBom) {
                data = data.slice(Number(bomLength));
                bomRemoved = true;
              }
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
              bomRemoved,
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
          else if (usingIconv)
            resolve(iconv.decode(content, charset, options.ignoreBom ? { stripBOM: false } : undefined));
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

  const text = buffer.slice(0, Math.min(buffer.length, MAX_EXAMINE)).toString('ascii').toLowerCase().replace('\n', ' ').trim();
  // Strip line breaks and comments first
  const tagText = text.replace(/\n+/g, ' ').replace(/<!--.*?-->/g, '').trim();
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
