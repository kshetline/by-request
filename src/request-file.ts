import { ExtendedRequestOptions, request, safeLstat } from './by-request';
import { createWriteStream, rename as _rename, unlink as _unlink } from 'fs';
import { Writable } from 'stream';
import { promisify } from 'util';
import { isString, noop } from '@tubular/util';

const unlink = promisify(_unlink);
const rename = promisify(_rename);

export async function requestFile(urlOrOptions: string | ExtendedRequestOptions,
                                  optionsOrPathOrStream?: ExtendedRequestOptions | string | Writable,
                                  pathOrStream?: string | Writable): Promise<number> {
  // Stream should only be specified directly as a function argument, not as an option within an argument.
  if (urlOrOptions && !isString(urlOrOptions))
    delete urlOrOptions.stream;

  if (optionsOrPathOrStream && !isString(optionsOrPathOrStream) && !(optionsOrPathOrStream as any).write)
    delete (optionsOrPathOrStream as any).stream;

  let url: string;
  let options: ExtendedRequestOptions;
  let path: string;
  let stream: Writable;

  if (isString(pathOrStream))
    path = pathOrStream;
  else if (pathOrStream)
    stream = pathOrStream;

  if (!path && isString(optionsOrPathOrStream))
    path = optionsOrPathOrStream;
  else if (!stream && optionsOrPathOrStream && (optionsOrPathOrStream as any).write && (optionsOrPathOrStream as any).end)
    stream = optionsOrPathOrStream as Writable;
  else if (optionsOrPathOrStream)
    options = optionsOrPathOrStream as ExtendedRequestOptions;

  if (isString(urlOrOptions))
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

  let outPath = path;
  let fromCache = false;

  if (!stream && options.cachePath === path) {
    let index = 0;

    do {
      outPath = `${path}.${index++}`;
    } while (await safeLstat(outPath));

    const responseCallback = options.responseInfo;

    options.responseInfo = info => {
      fromCache = info.fromCache;

      if (responseCallback)
        responseCallback(info);
    };
  }

  if (!stream) {
    stream = createWriteStream(outPath);
    options.streamCreated = true;

    await new Promise<void>((resolve, reject) => {
      stream.on('open', () => resolve());
      stream.on('error', error => reject(error));
    });
  }

  options.stream = stream;

  const length = await request(url || options, url ? options : undefined, 'binary') as unknown as Promise<number>;

  if (fromCache) {
    // eslint-disable-next-line @typescript-eslint/await-thenable,@typescript-eslint/unbound-method
    await promisify(stream.end);
    await unlink(outPath).catch(noop);
  }
  else if (outPath !== path) {
    await unlink(path).catch(noop);
    await rename(outPath, path);
  }

  return length;
}

export const wget = requestFile;
