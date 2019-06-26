import { ResponseInfo } from './by-request';
import { assert, expect } from 'chai';
import { NOT_FOUND } from 'http-status-codes';
import { requestJson } from './request-json';
import { port } from './test-server.spec';

describe('request-binary', () => {
  it('should read JSON data correctly', async () => {
    const content = await requestJson(`http://localhost:${port}/test10/`);

    expect(content).to.deep.equal({ foo: 'bar', baz: 'quux' });
  });

  it('should read JSONP data correctly', async () => {
    const callback = 'my.callback_4577$';
    let responseInfo: ResponseInfo = null;
    const content = await requestJson(`http://localhost:${port}/test10/?callback=${callback}`, {
      responseInfo: info => responseInfo = info
    });

    expect(content).to.deep.equal({ foo: 'bar', baz: 'quux' });
    expect(responseInfo && responseInfo.callback).equals(callback);
  });

  it('should throw an exception for invalid JSON/JSONP', async () => {
    try {
      await requestJson(`http://localhost:${port}/test1/`);
      assert.fail('Bad JSON/JSONP exception should have been thrown.');
    }
    catch (err) {
      expect(err && err.message).equals('Valid JSON not found');
    }
  });

  it('should throw an exception for an HTTP error', async () => {
    try {
      await requestJson(`http://localhost:${port}/doesnt_exist/`);
      assert.fail('Exception for HTTP error should have been thrown.');
    }
    catch (err) {
      expect(err).equals(NOT_FOUND);
    }
  });
});
