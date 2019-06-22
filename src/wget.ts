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
import { ExtendedRequestOptions, request } from './by-request';
import { createWriteStream } from 'fs';
import { Writable } from 'stream';

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
