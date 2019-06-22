import { ExtendedRequestOptions, request } from './by-request';

export async function requestBinary(urlOrOptions: string | ExtendedRequestOptions,
                                    options?: ExtendedRequestOptions): Promise<Buffer> {
  return request(urlOrOptions as any, options, 'binary') as Promise<Buffer>;
}
