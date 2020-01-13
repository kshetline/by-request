import { ExtendedRequestOptions, request } from './by-request';

export async function requestText(urlOrOptions: string | ExtendedRequestOptions, encoding?: string): Promise<string>;
export async function requestText(url: string, options: ExtendedRequestOptions, encoding?: string): Promise<string>;
export async function requestText(urlOrOptions: string | ExtendedRequestOptions,
                                  optionsOrEncoding?: ExtendedRequestOptions | string, encoding?: string): Promise<string> {
  if (encoding === 'binary')
    throw Error('Binary encoding not permitted. Please use requestBinary.');

  if (urlOrOptions && typeof(urlOrOptions) !== 'string')
    delete urlOrOptions.stream;

  if (optionsOrEncoding && typeof(optionsOrEncoding) !== 'string')
    delete optionsOrEncoding.stream;

  return request(urlOrOptions as any, optionsOrEncoding as any, encoding || 'ISO-8859-1') as Promise<string>;
}
