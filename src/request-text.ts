import { ExtendedRequestOptions, request } from './by-request';
import { isString } from '@tubular/util';

export async function requestText(urlOrOptions: string | ExtendedRequestOptions, encoding?: string): Promise<string>;
export async function requestText(url: string, options: ExtendedRequestOptions, encoding?: string): Promise<string>;
export async function requestText(urlOrOptions: string | ExtendedRequestOptions,
                                  optionsOrEncoding?: ExtendedRequestOptions | string, encoding?: string): Promise<string> {
  if (encoding == null && isString(optionsOrEncoding)) {
    encoding = optionsOrEncoding;
    optionsOrEncoding = undefined;
  }

  if (encoding === 'binary')
    throw Error('Binary encoding not permitted. Please use requestBinary.');

  if (urlOrOptions && !isString(urlOrOptions))
    delete urlOrOptions.stream;

  if (optionsOrEncoding && !isString(optionsOrEncoding))
    delete optionsOrEncoding.stream;

  return await request(urlOrOptions as any, optionsOrEncoding as any, encoding || 'utf-8') as string;
}
