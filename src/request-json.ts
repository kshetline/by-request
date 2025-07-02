import { ExtendedRequestOptions, ResponseInfo } from './by-request';
import { requestText } from './request-text';
import { isString } from '@tubular/util';

export async function requestJson(urlOrOptions: string | ExtendedRequestOptions,
                                  options?: ExtendedRequestOptions): Promise<any> {
  if (urlOrOptions && !isString(urlOrOptions))
    delete urlOrOptions.stream;

  if (options)
    delete options.stream;

  const actualOptions = (options || (isString(urlOrOptions) ? null : urlOrOptions));
  const savedInfoCallback = actualOptions && actualOptions.responseInfo;
  let responseInfo: ResponseInfo = null;

  if (savedInfoCallback)
    actualOptions.responseInfo = info => responseInfo = info;

  let text = await requestText(urlOrOptions as any, options, 'utf8');
  let json: any;
  let parsed = false;
  let callback: string = null;

  if (!text.startsWith('/*')) {
    try {
      json = JSON.parse(text);
      parsed = true;
    }
    catch {}
  }

  if (!parsed) {
    // Maybe this is JSONP? First, remove any leading comment.
    text = text.replace(/\/\*.*\*\/\s*(?=.*\()/, '');
    // Look for callback
    const $ = /.*?([A-Za-z$_][0-9A-Za-z$_.]*)\s*\(([^]*)\)/u.exec(text);

    if ($) {
      callback = $[1];
      text = $[2].trim();

      try {
        json = JSON.parse(text);
        parsed = true;
      }
      catch {}
    }
  }

  if (!parsed)
    throw new Error('Valid JSON not found');

  if (savedInfoCallback) {
    if (callback)
      responseInfo.callback = callback;

    savedInfoCallback(responseInfo);
  }

  return json;
}
