# by-request [![Build Status](https://travis-ci.com/kshetline/by-request.svg?branch=master)](https://travis-ci.com/kshetline/by-request)

## Simple Node HTTP/HTTPS client for use with promises and async/await

The **by-request** package provides four ways to retrieve data via HTTP/HTTPS, all of which return `Promise`s, and all of which are suitable for use with `async`/`await`:

* `requestBinary(`...`): Promise<Buffer>`
* `requestFile(`...`): Promise<number>` (_can also output to `Writable` streams instead of files_)
* `requestJson(`...`): Promise<any>`
* `requestText(`...`): Promise<string>`

GET and POST requests are handled, and optional automatic file caching can be used.

### Installation

[![NPM Stats](https://nodei.co/npm/by-request.png?downloads=true&downloadRank=true)](https://npmjs.org/packages/by-request/)

`npm install by-request`

### Examples

```typescript
const audio = await requestBinary('https://musicalstuff.net/some_song.mp3');
```

```typescript
const forecast = await requestText('https://forekast.info/forecast/local/', {
    cacheDir: 'weather-cache/',
    maxCacheAge: 900000, // 15 minutes
    params: { city: 'poughkeepsie', state: 'ny', country: 'us' }
  });
```

```typescript
const options = {progress: (bytesRead, totalBytes) => {
  if (totalBytes)
    console.log((bytesRead / totalBytes * 100).toFixed(1) + '% downloaded');
  else
    console.log((bytesRead / 1024).toFixed(1) + 'K downloaded');
}};

requestFile('https://tedious.org/2014/07/meeting_minutes.docx', options, 'documents/tldnr/').then(length => {
  console.log('Document retrieved, length in bytes: ' + length);
}).catch(err => {
  console.error('Something went wrong: ' + err.message);
});
```

```typescript
let whereAmI = await requestJson('http://ip-api.com/json/');
```

```typescript
let currentTemperature = parseFloat((await requestText('https://howhotisit.biz/forecast/?zip=02134'))
      .replace(/.*Current temperature:\s*([-.0-9]+).*/is, '$1'));
```

HTTP(S) redirects are automatically handled using [follow-redirects](https://github.com/follow-redirects/follow-redirects), and a wide variety of character encodings are supported using [iconv-lite](https://github.com/ashtuchkin/iconv-lite).

HTTP(S) responses which are compressed using the `gzip`, `deflate` or `br` methods are automatically decompressed. (When using `requestBinary()` or `requestFile()`, this automatic decompression can be disabled.)

URLs can be specified either as strings or via an `ExtendedRequestOptions` object. When a URL is specified as a string, additional options can still be specified via a subsequent `ExtendedRequestOptions` parameter.

`ExtendedRequestOptions` is an extension of the standard Node [`RequestOptions`](https://nodejs.org/api/http.html#http_http_request_options_callback) object. Those options have been extended as follows:

```typescript
interface ExtendedRequestOptions extends RequestOptions {
  autoDecompress?: boolean;
  body?: Buffer | string; // For POST requests
  cachePath?: string;
  dontDecompress?: boolean;
  dontEndStream?: boolean;
  followRedirects?: boolean; // follow-redirects
  forceEncoding?: boolean;
  ignoreBom?: boolean;
  json?: any; // For POST requests
  keepBom?: boolean;
  maxBodyLength?: number; // follow-redirects
  maxCacheAge?: number;
  maxRedirects?: number; // follow-redirects
  params?: string | Record<string, string | number | boolean | null>; // For POST requests
  progress?: (bytesRead: number, totalBytes: number | undefined) => void;
  responseInfo?: (info: ResponseInfo) => void;
  trackRedirects?: boolean; // follow-redirects
}
```

For the options marked "follow-redirects", see the [follow-redirects documentation](https://github.com/follow-redirects/follow-redirects/blob/master/README.md).

The other options are available as follows:

* `autoDecompress`: If a response has a `Content-Type` of gzip, gzipped, or gunzip, automatically decompress the content rather than returning the compressed data.
* `body`: If a `body` for a request is provided, the request will be made using the POST method, and the `body` will be sent as part of the request. The `Content-Type` header will automatically be `text/plain; charset=UTF-8` unless you provide an overriding header value.
* `cachePath`: This is either a file path for where cached data should be stored under a specific file name for the current request, or a directory (indicated using a `'/'` at the end of the path) where cached data will be stored using auto-generated file names.
* `dontDecompress`: For use with `requestBinary()` and `requestFile()`, set to `true` to prevent automatic decompression of `gzip`, `deflate`, or `br` data.
* `dontEndStream`: For use with `requestFile()`, this prevents `stream.end()` from automatically being called when `requestFile()` terminates. This option applies to either a stream passed in as an argument (in lieu of a file path), or to the internally-created file output stream. If you choose not to end the internally-created stream automatically, you should also use the `responseInfo` callback so that you can access that stream to end it later. Errors will always end any internally-created stream.
* `forceEncoding`: For use with `requestText()`, setting this to `true` causes the `encoding` argument passed into the function to override any encoding specified by the retrieved data itself.
* `ignoreBom`: By default `requestJson()` and `requestText()` look to see if a UTF-7, -8, -16, or -32 BOM [(Byte Order Mark)](https://en.wikipedia.org/wiki/Byte_order_mark) is present as one way of determining content character encoding. Setting `ignoreBom` to `true` allows the BOM to be ignored.
* `json`: Causes a POST request to be made, either using a `string` value treated as a literal JSON body, or any other type of value which will be stringified to create the POSTed `application/json; charset=UTF-8` body.
* `keepBom`: If a BOM is detected by `requestJson()` or `requestText()`, it is normally deleted. Set `keepBom` to `true` to preserve the BOM.
* `maxCacheAge`: When using the `cacheDir` option, this parameter allows you to ignore cached data older than `maxCacheAge` milliseconds.
* `params`: Causes a POST request to be made, either using a `string` value treated as a literal pre-URL-encoded string of name and values, or a name/value pair object which will be URL-encoded to create the POSTed `application/x-www-form-urlencoded; charset=UTF-8` body.
* `progress`: As seen in the `requestFile()` example at the beginning of this document, this is an optional callback that provides feedback during the retrieval of large resources, returning the number of bytes read at a particular point in time, and, if known (otherwise `undefined`), the total number of bytes expected.
* `responseInfo`: This optional callback provides meta-information about the resource which has been retrieved and the retrieval process. The data provided looks like this:

```typescript
interface ResponseInfo {
  bomDetected: boolean;
  bomRemoved: boolean;
  cachePath?: string;
  callback?: string;
  charset: string;
  contentEncoding: string;
  contentLength: number;
  contentType: string;
  stream: Writable;
}
```

* `bomDetected`: Whether or not a BOM was detected.
* `bomRemoved`: Whether or not a BOM was removed.
* `callback`: If JSONP data has been retrieved, this is the name of the callback function.
* `cachePath`: If the `cacheDir` option is used, this is the name of the file where data has been cached. If the cache was used rather than making a fresh HTTP/HTTPS request, this will be the only feedback received.
* `charset`: The character encoding ultimately used to interpret text or JSON data. This will be `'binary'` for binary and file operations.
* `contentEncoding`: The value of the HTTP `Content-Encoding` header.
* `contentLength`: The total number of bytes read. For compressed data, this is the compressed length, not the expanded length.
* `contentType`: The value of the HTTP `Content-Type` header.
* `stream`: When using `requestFile()`, this is either the stream that was passed into the function, or the stream that was created for the file path.

Note: If you provide your own `Content-Type` header, only the `body` option is valid for POSTed content (`json` and `params` options will be ignored), and you are responsible for correctly encoding the provided `body`. All requests without using the `body`, `json`, or `params` options use the GET method, rather than POST.

### Functions

#### `requestBinary(`...`)`

```typescript
async function requestBinary(urlOrOptions: string | ExtendedRequestOptions,
                             options?: ExtendedRequestOptions): Promise<Buffer>
```

Gets binary data as a `Buffer`. Apart from decompression (which can be optionally disabled), data is retrieved as sent, with no character encoding transformations performed.

#### `requestFile(`...`)` (or `wget(`...`)`)

```typescript
async function requestFile(urlOrOptions: string | ExtendedRequestOptions,
                           optionsOrPathOrStream?: ExtendedRequestOptions | string | Writable,
                           pathOrStream?: string | Writable): Promise<number>
```

Retrieves an HTTP(S) resource to save as a file, or to send to a `Writable` output stream. Apart from decompression (which can be optionally disabled), data is retrieved as sent, with no character encoding transformations performed. The function returns the length of the file.

If a path string is specified that does not end in a slash (`/`), that path is used as the complete file path for saving the retrieved data. If it does end in a slash, it is treated as a directory, and the complete file path is formed by extracting a file name from the end of the URL of the resource.

If no path (or `Writable` stream) is specified, only a URL, the file name is extracted from the end of the URL, and the file is created in the current working directory.

#### `requestJson(`...`)`

```typescript
async function requestJson(urlOrOptions: string | ExtendedRequestOptions,
                           options?: ExtendedRequestOptions): Promise<any>
```

Gets JSON or JSONP data, returning it as whatever data type is applicable. If JSONP data is detected, the `responseInfo` callback can be used to retrieve the name of the JSONP callback function.

Since JSON is now almost universally encoded using UTF-8, no encoding parameter is provided for this function, and the retrieved data will be decoded by something other than UTF-8 only if the HTTP `Content-Type` header, or a BOM marker, indicate otherwise. Should the odd case arise where you need to force the use of a different encoding, use `requestText()` instead, along with `JSON.parse()`.

#### `requestText(`...`)`

```typescript
async function requestText(urlOrOptions: string | ExtendedRequestOptions, encoding?: string): Promise<string>

async function requestText(url: string, options: ExtendedRequestOptions, encoding?: string): Promise<string>

async function requestText(urlOrOptions: string | ExtendedRequestOptions,
                           optionsOrEncoding?: ExtendedRequestOptions | string, encoding?: string): Promise<string>
```

Gets text data and returns it as a string. The character encoding scheme used to decode the text is applied according to the following order of priority:

1. The `encoding` parameter (or `optionsOrEncoding` parameter, as a string value) when the `forceEncoding` option is `true`. This will override any declared encoding based on a BOM, HTTP headers, or text content.
1. The encoding expressed via a BOM, if present, and if not ignored via the `ignoreBom` option.
1. The `charset` value, if provided, in the HTTP `Content-Type` header.
1. The UTF-16 or UTF-32 encoding implied by the pattern of zero and non-zero values in the first four bytes of the HTTP(S) content.
1. Any content-specified encoding that can be seen by looking within the first 2K of data, interpreting that data as if it were ASCII, and finding declarations such as these:

    `<?xml version="1.0" encoding="iso-8859-1"?>`

    `<meta charset="iso-8859-1">`

    `<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">`

    `@charset "iso-8859-1"`

1. The `encoding` parameter (or `optionsOrEncoding` parameter, as a string value) when the `forceEncoding` option is `false` (or not specified).
1. UTF-8.

### Error handling

When using these functions via the returned `Promise`, the `Promise` `catch` method should be used to handle errors. When using `async`/`await`, errors should be caught using `try`/`catch`.

Possible errors include bad HTTP status codes, timeouts and other I/O errors, corrupted or invalid data, unsupported character encodings, and invalid function parameters or options.
