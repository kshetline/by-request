/*
  Copyright © 2019-2022 Kerry Shetline, kerry@shetline.com

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
import { FollowOptions, http, https } from 'follow-redirects';
import { parse as parseUrl } from 'url'; // eslint-disable-line node/no-deprecated-api
import iconv from 'iconv-lite';
import { getReasonPhrase, StatusCodes } from 'http-status-codes';
import { Writable } from 'stream';
import { SecureContextOptions } from 'tls';
import { clone, isString, makePlainASCII, processMillis, toNumber, urlEncodeParams } from '@tubular/util';
import fs, { StatOptions, Stats } from 'fs';
import temp from 'temp';
import * as pathUtil from 'path';
import { spawn } from 'child_process';

temp.track();

// import { lstat, mkdir, readFile, writeFile } from 'fs/promises'; // Would prefer this syntax, but requires Node 14+
const { lstat, mkdir, readFile, writeFile } = require('fs').promises;

const MAX_EXAMINE = 2048;

export interface ResponseInfo {
  bomDetected?: boolean;
  bomRemoved?: boolean;
  cachePath?: string;
  callback?: string;
  charset?: string;
  contentEncoding?: string;
  contentLength?: number;
  contentType?: string;
  fromCache?: boolean;
  stream?: Writable;
}

type ReqOptions = (RequestOptions & SecureContextOptions & {rejectUnauthorized?: boolean, servername?: string} & FollowOptions<RequestOptions>);

export interface ExtendedRequestOptions extends ReqOptions {
  autoDecompress?: boolean;
  body?: Buffer | string;
  cachePath?: string;
  dontDecompress?: boolean;
  dontEndStream?: boolean;
  followRedirects?: boolean; // follow-redirects
  forceEncoding?: boolean;
  ignoreBom?: boolean;
  json?: any;
  keepBom?: boolean;
  maxBodyLength?: number; // follow-redirects
  maxCacheAge?: number;
  maxRedirects?: number; // follow-redirects
  params?: string | Record<string, string | number | boolean | null>;
  progress?: (bytesRead: number, totalBytes: number | undefined) => void;
  responseInfo?: (info: ResponseInfo) => void;
  stream?: Writable; // For internal use only
  streamCreated?: boolean; // For internal use only
  trackRedirects?: boolean; // follow-redirects
}

async function safeLstat(path: string, opts?: StatOptions & { bigint?: false }): Promise<Stats> {
  try {
    return await lstat(path, opts);
  }
  catch {
    return null;
  }
}

async function ensureDirectory(path: string): Promise<void> {
  const parent = pathUtil.dirname(path);

  if (parent)
    await mkdir(parent, { recursive: true });
}

function getCaseInsensitiveProperty(obj: any, key: string) {
  key = key.toLowerCase();

  for (const k of Object.keys(obj || {})) {
    if (isString(k) && k.toLowerCase() === key)
      return obj[k];
  }

  return undefined;
}

function makeError(err: any): Error {
  if (err instanceof Error)
    return err;

  const code = toNumber(err);

  if (code >= 100) {
    try {
      return new Error(`${code}: ${getReasonPhrase(code)}`);
    }
    catch {
      return new Error(`Unknown HTTP status code ${code}`);
    }
  }

  return new Error(err.toString());
}

function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;

  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).toUpperCase().padStart(14, '0');
}

let checkedGzipShell = false;
let hasGzipShell = false;

export async function request(urlOrOptions: string | ExtendedRequestOptions,
                       optionsOrEncoding?: ExtendedRequestOptions | string, anEncoding?: string): Promise<string | Buffer | number> {
  let options: ExtendedRequestOptions;
  let body: Buffer | string;
  let cachePath: string;
  let encoding = anEncoding as BufferEncoding;
  let fromCache = false;

  if (typeof urlOrOptions === 'string') // noinspection JSDeprecatedSymbols
    options = parseUrl(urlOrOptions);

  if (typeof optionsOrEncoding === 'string')
    encoding = (optionsOrEncoding.replace('us-ascii', 'ascii')) as BufferEncoding;
  else if (optionsOrEncoding) {
    if (options)
      Object.assign(options, optionsOrEncoding);
    else
      options = clone(optionsOrEncoding);
  }
  else if (!options)
    options = urlOrOptions as ExtendedRequestOptions;

  if (!options.protocol.endsWith(':'))
    options.protocol += ':';

  if (!options.path.startsWith('/'))
    options.path = '/' + (options.path || '');

  if (!options.headers)
    options.headers = { 'Accept-Encoding': 'gzip,deflate,br' };
  else if (!getCaseInsensitiveProperty(options.headers, 'accept-encoding'))
    options.headers['Accept-Encoding'] = 'gzip,deflate,br';

  let forceEncoding = options.forceEncoding;

  if (!encoding) {
    encoding = 'utf8';
    // Only an explicit encoding will be forced, not this default.
    forceEncoding = false;
  }

  options.method = options.method || (options.body || options.params || options.json ? 'POST' : 'GET');

  let contentType = getCaseInsensitiveProperty(options.headers, 'Content-Type');
  const hadContentType = !!contentType;
  const charset = ((/\bcharset\s*=\s*([\S]+)\s*$/i.exec(contentType || '') ?? [])[1] ?? 'utf8').toLowerCase() as BufferEncoding;

  if (!contentType) {
    if (options.params) {
      body = isString(options.params) ? options.params : urlEncodeParams(options.params);
      contentType = contentType || 'application/x-www-form-urlencoded; charset=UTF-8';
    }
    else if (options.json) {
      body = isString(options.json) ? options.json : JSON.stringify(options.json);
      contentType = contentType || 'application/json; charset=UTF-8';
    }
    else if (options.body) {
      body = options.body;
      contentType = contentType || 'text/plain; charset=UTF-8';
    }
  }
  else
    body = options.body;

  if (!hadContentType && contentType)
    options.headers['Content-Type'] = contentType;

  delete options.body;
  delete options.json;
  delete options.params;

  if (options.cachePath) {
    cachePath = options.cachePath;
    delete options.cachePath;

    if (/[/\\]$/.test(cachePath) || (await safeLstat(cachePath))?.isDirectory()) {
      const url = isString(urlOrOptions) ? urlOrOptions :
        options.protocol + (options.hostname || options.host) +
        (options.port ? ':' + options.port : '') + options.path;
      let base = '';
      let suffix = '';
      let $ = /.+\/([^?&]+)/.exec(options.path);

      if ($) {
        base = makePlainASCII($[1], true).replace(/,/g, '-').replace(/^([^a-z])/i, 'X$1');

        if (($ = /^(.+)(\..+)$/.exec(base))) {
          base = $[1].substring(0, 20) + '-';
          suffix = $[2].substring(0, 8);
        }
        else
          base = base.substring(0, 20) + '-';
      }

      cachePath = pathUtil.join(cachePath, base + cyrb53(url + (body ? body.toString() : '')) + suffix);
    }
  }

  const protocol = (options.protocol === 'https:' ? https : http);
  const stream = options.stream;
  const startTime = processMillis();

  if (!checkedGzipShell) {
    checkedGzipShell = true;
    hasGzipShell = true;

    const gzipProc = spawn('gzip', ['-L']);

    await new Promise<void>(resolve => {
      gzipProc.once('error', () => { hasGzipShell = false; resolve(); });
      gzipProc.stdout.once('end', resolve);
    });
  }

  let canUseCache = false;

  if (cachePath) {
    const stats = await safeLstat(cachePath);

    if (stats && (!options.maxCacheAge || stats.mtimeMs > Date.now() - options.maxCacheAge)) {
      if (options.maxCacheAge) {
        try {
          const contents = await readFile(cachePath, { encoding: encoding === 'binary' ? null : encoding });

          if (options.responseInfo)
            options.responseInfo({ cachePath, fromCache: true });

          return contents;
        }
        catch {}
      }

      canUseCache = true;

      if (!getCaseInsensitiveProperty(options?.headers, 'If-Modified-Since'))
        options.headers = Object.assign(options.headers ?? {}, { 'If-Modified-Since': stats.mtime.toUTCString() });
    }
  }

  delete options.maxCacheAge;

  return new Promise<string | Buffer | number>((resolve, reject) => {
    const reject_ = (err: any) => reject(makeError(err));
    const endStream = !options.dontEndStream && stream !== process.stdout && stream !== process.stderr;
    const reportAndResolve = (content: Buffer | string): void => {
      if (options.responseInfo)
        options.responseInfo({ cachePath, fromCache });

      resolve(content);
    };
    const req = protocol.request(options as any, res => {
      if (200 <= res.statusCode && res.statusCode < 300) {
        let source = res as any;
        let postDecompress = false;
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
          if (contentEncoding === 'x-gzip' && hasGzipShell)
            // createGunzip sometimes chokes with "incorrect header check" errors on 'x-gzip' content,
            // whereas command-line gzip (if available) does not.
            postDecompress = true;
          else if (contentEncoding === 'gzip' || contentEncoding === 'x-gzip' ||
              (options.autoDecompress && /\b(gzip|gzipped|gunzip)\b/.test(contentType))) {
            source = zlib.createGunzip({ windowBits: 15 });
            res.pipe(source);
          }
          else if (contentEncoding === 'deflate' || (options.autoDecompress && /\bdeflate\b/.test(contentType))) {
            source = zlib.createInflateRaw();
            res.pipe(source);
          }
          else if (contentEncoding === 'br') {
            source = zlib.createBrotliDecompress();
            res.pipe(source);
          }
          else if (contentEncoding && contentEncoding !== 'identity') {
            reject_(StatusCodes.UNSUPPORTED_MEDIA_TYPE);
            return;
          }
        }

        if (res !== source) {
          res.once('error', error => {
            if (stream && (endStream || options.streamCreated))
              stream.end();

            reject_(error);
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
            const $ = /\bcharset\s*=\s*['"]?\s*([\w-]+)\b/.exec(contentType);

            if ($)
              charset = $[1].replace('us-ascii', 'ascii');
            else {
              charset = encoding;
              autodetect = true;
            }
          }

          if (!/^(ascii|utf8|utf-8|utf16le|ucs2|base64|binary|hex)$/.test(charset)) {
            if (!iconv.encodingExists(charset)) {
              reject_(StatusCodes.UNSUPPORTED_MEDIA_TYPE);
              return;
            }

            usingIconv = true;
          }
        }

        let content = Buffer.alloc(0);

        source.once('error', (error: any) => {
          if (stream && (endStream || options.streamCreated))
            stream.end();

          reject_(error);
        });

        source.on('data', (data: Buffer) => {
          if (res === source) {
            bytesRead += data.length;

            if (options.progress)
              options.progress(bytesRead, contentLength);
          }

          if (content.length === 0 && !binary && !options.ignoreBom) {
            const bomCharset = checkBOM(data);

            if (bomCharset) {
              if (!forceEncoding) {
                if (!iconv.encodingExists(bomCharset)) {
                  reject_(StatusCodes.UNSUPPORTED_MEDIA_TYPE);
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
                reject_(StatusCodes.UNSUPPORTED_MEDIA_TYPE);
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
                reject_(error);
              }
            });
          }
          else
            content = Buffer.concat([content, data], content.length + data.length);
        });

       source.once('end', () => {
         const wrapUp = () => {
            if (options.progress && contentLength === undefined)
              options.progress(bytesRead, bytesRead);

            if (options.responseInfo) {
              options.responseInfo({
                bomDetected,
                bomRemoved: removeBom,
                cachePath,
                charset: binary ? 'binary' : charset,
                contentEncoding: contentEncoding || 'identity',
                contentLength: bytesRead,
                contentType,
                fromCache,
                stream
              });
            }

            if (stream) {
              if (endStream)
                stream.end();

              resolve(bytesRead);
            }
            else if (binary) {
              if (cachePath)
                ensureDirectory(cachePath).then(() => writeFile(cachePath, content).finally(() => reportAndResolve(content)));
              else
                resolve(content);
            }
            else {
              let text: string;

              if (usingIconv)
                text = iconv.decode(content, charset, { stripBOM: false });
              else
                text = content.toString(charset as BufferEncoding);

              if (removeBom && text.charCodeAt(0) === 0xFEFF)
                text = text.substr(1);

              if (cachePath)
                ensureDirectory(cachePath).then(() => writeFile(cachePath, text, { encoding }).finally(() => reportAndResolve(text)));
              else
                resolve(text);
            }
          };

          if (postDecompress) {
            // Why take all of this trouble to work with a temp file instead of just piping streams?
            // Because if I don't, mysterious "write EPIPE" errors occur that can't be caught and cause
            // the code to fail, even after successfully obtaining the decompressed data. This absurd
            // work-around solves that problem.
            temp.open('by-request-', (err, file) => {
              if (err)
                reject_(err);
              else {
                fs.write(file.fd, content, err => err && reject_(err));
                fs.close(file.fd, err => {
                  if (err)
                    reject_(err);
                  else {
                    const gzipProc = spawn('gzip', ['-dc', file.path]);
                    let decompressed = Buffer.alloc(0);

                    gzipProc.stdout.on('data', d => decompressed = Buffer.concat([decompressed, d], decompressed.length + d.length));
                    gzipProc.stdout.on('error', err => reject_(err));
                    gzipProc.stdout.on('end', () => {
                      content = decompressed;
                      bytesRead = content.length;
                      fs.unlink(file.path, () => {});
                      wrapUp();
                    });
                  }
                });
              }
            });
          }
          else
            wrapUp();
        });
      }
      else {
        if (stream && (endStream || options.streamCreated))
          stream.end();

      if (canUseCache && res.statusCode === 304)
        readFile(cachePath, { encoding: encoding === 'binary' ? null : encoding })
          .then((content: any) => reportAndResolve(content)).catch((err: any) => reject_(err));
      else
        reject_(res.statusCode);
      }
    }).once('error', err => {
      if (canUseCache && err.toString().match(/\b304\b/))
        readFile(cachePath, { encoding: encoding === 'binary' ? null : encoding })
          .then((content: any) => {
            fromCache = true;
            reportAndResolve(content);
          }).catch((err: any) => reject_(err));
      else
        reject_(err);
    });

    req.once('timeout', () => {
      req.abort();
      reject_(`HTTP timeout after ${Math.round(processMillis() - startTime)} msec`);
    });

    if (body) {
      req.write(isString(body) ? Buffer.from(body, charset) : body, err => {
        if (err)
          reject_(err);
        else
          req.end();
      });
    }
    else
      req.end();
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
    if (/^<\?xml\b/.test(tag) && ($ = /\bencoding\s*=\s*['"]\s*([\w-]+)\b/.exec(tag)))
      return $[1];
    else if (/^<meta\b/.test(tag)) {
      if (($ = /\bcharset\s*=\s*['"]?\s*([\w-]+)\b/.exec(tag)))
        return $[1];
      else if (/\bhttp-equiv\s*=\s*['"]?\s*content-type\b/.test(tag) &&
        ($ = /\bcontent\s*=\s*['"]?.*;\s*charset\s*=\s*([\w-]+)\b/.exec(tag)))
        return $[1];
    }
  }

  // CSS charset must come right at the beginning of a file, so no need to worry about comments confusing the issue.
  if (($ = /@charset\s+['"]\s*([\w-]+)\b/.exec(text)))
    return $[1];

  return null;
}
