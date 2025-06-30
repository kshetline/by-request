import { ExtendedRequestOptions, request } from './by-request';
import { isString } from '@tubular/util';

export function requestBinary(urlOrOptions: string | ExtendedRequestOptions,
                              options?: ExtendedRequestOptions): Promise<Buffer> {
  if (urlOrOptions && !isString(urlOrOptions))
    delete urlOrOptions.stream;

  if (options)
    delete options.stream;

  return request(urlOrOptions as any, options, 'binary') as Promise<Buffer>;
}
