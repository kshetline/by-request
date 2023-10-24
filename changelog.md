# Change Log

## 1.3.4

* Fix possible crash in protocol check.
* Fix unit test broken by missing URL target.

## 1.3.3

* Move @types/follow-redirects to dependencies from devDependencies.

## 1.3.2

* Allow `requestFile()` (a.k.a. `wget`) to use the same path for both cache file and output file.
* Fix reporting of `fromCache` in `ResponseInfo`.

## 1.3.1

* `follow-redirects` security update.

## 1.3.0

* Added POST request handling.
* Added optional file caching.
* Improved handling of possibly-noncompliant gzip data streams that cause zlib to fail.

## 1.2.5

* Restored ability to handle streams marked as gzip or deflate by ContentType rather than by ContentEncoding.

## 1.2.4

* Update dependencies.

## 1.2.3

* Fix handling of timeouts.
* Update dependencies.

## 1.1.4

* Use `UTF-8` as encoding for `requestText` when `Content-Type` isn't provided.

## 1.1.3

* Make sure `requestText` returns string data, even when `Content-Type` isn't provided.

## 1.1.2

* Added auto-detection of UTF-7 via BOM.
* My merge request to add UTF-32 support to iconv-lite has been approved, so now this project has gone back to using the official release of iconv-lite.

## 1.1.1

* No feature changes or bug fixes, just updated unit testing to use mocha and chai instead of jasmine.

## 1.1.0

* Added support for UTF-32 encoding.

## 1.0.2

* First public release.
