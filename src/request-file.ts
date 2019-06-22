import { ExtendedRequestOptions, request } from './by-request';
import { createWriteStream } from 'fs';
import { Writable } from 'stream';

export async function requestFile(urlOrOptions: string | ExtendedRequestOptions,
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

export const wget = requestFile;
