import { ExtendedRequestOptions, request } from './by-request';

export async function requestBinary(urlOrOptions: string | ExtendedRequestOptions,
                                    options?: ExtendedRequestOptions): Promise<Buffer> {
  if (urlOrOptions && typeof urlOrOptions !== 'string')
    delete urlOrOptions.stream;

  if (options)
    delete options.stream;

  return request(urlOrOptions as any, options, 'binary') as Promise<Buffer>;
}
