import { requestJson } from './request-json';
import { port } from './test-server.spec';
import { ResponseInfo } from './by-request';

describe('request-binary', () => {
  it('should read JSON data correctly', async done => {
    const content = await requestJson(`http://localhost:${port}/test10/`);

    expect(content).toEqual({ foo: 'bar', baz: 'quux' });

    done();
  });

  it('should read JSONP data correctly', async done => {
    const callback = 'my.callback_4577$';
    let responseInfo: ResponseInfo = null;
    const content = await requestJson(`http://localhost:${port}/test10/?callback=${callback}`, {
      responseInfo: info => responseInfo = info
    });

    expect(content).toEqual({ foo: 'bar', baz: 'quux' });
    expect(responseInfo && responseInfo.callback).toEqual(callback);

    done();
  });

  it('should throw an exception for invalid JSON/JSONP', async done => {
    try {
      await requestJson(`http://localhost:${port}/test1/`);
      expect(false).toBeTruthy('Bad JSON/JSONP exception should have been thrown.');
    }
    catch (err) {
      expect(err && err.message).toEqual('Valid JSON not found');
    }

    done();
  });
});
