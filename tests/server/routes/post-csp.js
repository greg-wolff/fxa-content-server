/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define([
  'intern',
  'intern!object',
  'intern/chai!assert',
  'intern/dojo/node!../helpers/init-logging',
  'intern/dojo/node!fs',
  'intern/dojo/node!path',
  'intern/dojo/node!../../../server/lib/configuration',
  'intern/dojo/node!proxyquire',
  'intern/dojo/node!sinon',
  'intern/dojo/node!got'
], function (intern, registerSuite, assert, initLogging, fs, path, config,
  proxyquire, sinon, got) {

  const REPORT_URL = intern.config.fxaContentRoot.replace(/\/$/, '') + '/_/csp-violation';
  const VALID_CSP_REPORT = {
    'csp-report': {
      'blocked-uri': 'http://bing.com',
      'document-uri': 'https://accounts.firefox.com/signin',
      'original-policy': 'connect-src https://accounts.firefox.com',
      'referrer': 'https://addons.mozilla.org/?',
      'source-file': 'https://accounts.firefox.com',
      'violated-directive': 'style-src'
    }
  };

  // ensure we don't get any module from the cache, but to load it fresh every time
  proxyquire.noPreserveCache();
  var suite = {
    name: 'post-csp'
  };
  var mockRequest = {
    body: {
      'csp-report': {
        'blocked-uri': 'http://bing.com'
      }
    },
    'get': function () {}
  };

  var mockResponse = {
    json: function () {}
  };

  suite['it works with csp reports'] = function () {
    var writer = sinon.spy();
    var postCsp = proxyquire(path.join(process.cwd(), 'server', 'lib', 'routes', 'post-csp'), {})({ write: writer });
    // check 5 times that all messages drop
    postCsp.process(mockRequest, mockResponse);
    postCsp.process(mockRequest, mockResponse);
    postCsp.process(mockRequest, mockResponse);
    postCsp.process(mockRequest, mockResponse);
    postCsp.process(mockRequest, mockResponse);

    assert.equal(writer.callCount, 5);
  };

  suite['it strips PII from the referrer and source fields'] = function () {
    var mockRequest = {
      body: {
        'csp-report': {
          'blocked-uri': 'http://bing.com',
          'referrer': 'https://addons.mozilla.org/?email=testuser@testuser.com&notaffected=1',
          'source-file': 'https://accounts.firefox.com/settings?uid=bigscaryuid&email=testuser@testuser.com&notaffected=1'
        }
      },
      'get': function () {}
    };

    var writer = sinon.spy();
    var postCsp = proxyquire(path.join(process.cwd(), 'server', 'lib', 'routes', 'post-csp'), {})({ write: writer });

    postCsp.process(mockRequest, mockResponse);

    var entry = writer.args[0][0];
    assert.equal(entry.referrer, 'https://addons.mozilla.org/?notaffected=1');
    assert.equal(entry.source, 'https://accounts.firefox.com/settings?notaffected=1');
  };

  suite['works correctly if query params do not contain PII'] = function () {
    var mockRequest = {
      body: {
        'csp-report': {
          'blocked-uri': 'http://bing.com',
          'referrer': 'https://addons.mozilla.org/?notaffected=1',
          'source-file': 'https://accounts.firefox.com/settings?notaffected=1'
        }
      },
      'get': function () {}
    };

    var writer = sinon.spy();
    var postCsp = proxyquire(path.join(process.cwd(), 'server', 'lib', 'routes', 'post-csp'), {})({ write: writer });

    postCsp.process(mockRequest, mockResponse);

    var entry = writer.args[0][0];
    assert.equal(entry.referrer, 'https://addons.mozilla.org/?notaffected=1');
    assert.equal(entry.source, 'https://accounts.firefox.com/settings?notaffected=1');
  };

  suite['works correctly if no query params'] = function () {
    var mockRequest = {
      body: VALID_CSP_REPORT,
      'get': function () {}
    };

    var writer = sinon.spy();
    var postCsp = proxyquire(path.join(process.cwd(), 'server', 'lib', 'routes', 'post-csp'), {})({ write: writer });

    postCsp.process(mockRequest, mockResponse);

    var entry = writer.args[0][0];
    assert.equal(entry.referrer, 'https://addons.mozilla.org/?');
    assert.equal(entry.source, 'https://accounts.firefox.com');
  };

  suite['#post csp - returns 400 if CSP report is invalid'] = {
    'blocked-uri ()': testInvalidCspValue('blocked-uri', ''),
    'blocked-uri not a URL (1)': testInvalidCspValue('blocked-uri', 1),
    'column-number negative (-1)': testInvalidCspValue('column-number', -1),
    'column-number not a number (a)': testInvalidCspValue('column-number', 'a'),
    'csp-report ({})': testInvalidCspReport({
      'csp-report': {}
    }),
    'csp-report not set': testInvalidCspReport({}),
    'disposition not a string (1)': testInvalidCspValue('disposition', 1),
    'document-uri empty ()': testInvalidCspValue('document-uri', ''),
    'document-uri invalid scheme (telnet)': testInvalidCspValue('document-uri', 'telnet://bing.com'),
    'effective-directive not a string (true)': testInvalidCspValue('effective-directive', true),
    'line-number negative (-1)': testInvalidCspValue('line-number', -1),
    'line-number not a number (a)': testInvalidCspValue('line-number', 'a'),
    'original-policy empty ()': testInvalidCspValue('original-policy', ''),
    'referrer not a string (null)': testInvalidCspValue('referrer', null),
    'script-sample not a string (123)': testInvalidCspValue('script-sample', 123),
    'source-file not a string (123)': testInvalidCspValue('script-sample', 123),
    'status-code negative (-1)': testInvalidCspValue('status-code', -1),
    'status-code not a number (false)': testInvalidCspValue('status-code', false),
    'violated-directive empty ()': testInvalidCspValue('violated-directive', ''),
    'violated-directive not a string (321)': testInvalidCspValue('violated-directive', 321),
  };

  suite['#post csp - returns 400 if csp-report is empty'] = function () {
    testInvalidCspReport({
      'csp-report': {}
    });
  };

  suite['#post csp - returns 200 if CSP report is valid'] = {
    'blocked-uri (eval)': testValidCspValue('blocked-uri', 'eval'),
    'blocked-uri (inline)': testValidCspValue('blocked-uri', 'inline'),
    'blocked-uri (self)': testValidCspValue('blocked-uri', 'self'),
    'column-number missing': testValidCspValue('column-number', undefined),
    'disposition missing': testValidCspValue('disposition', undefined),
    'effective-directive missing': testValidCspValue('effective-directive', undefined),
    'line-number missing': testValidCspValue('line-number', undefined),
    'referrer empty ()': testValidCspValue('referrer', ''),
    'script-sample empty ()': testValidCspValue('script-sample', ''),
    'script-sample missing': testValidCspValue('script-sample', undefined),
    'source-file empty ()': testValidCspValue('source-file', ''),
    'source-file missing': testValidCspValue('source-file', undefined),
    'status-code missing': testValidCspValue('status-code', undefined),
    'valid': testValidCspValue(VALID_CSP_REPORT)
  };

  function testInvalidCspReport(cspReport) {
    return function () {
      return got.post(REPORT_URL, {
        body: JSON.stringify(cspReport),
        headers: { 'Content-Type': 'application/json' }
      })
      .then(assert.fail, (resp) => {
        //console.log('resp', resp);
        assert.equal(resp.statusCode, 400);
        assert.equal(resp.statusMessage, 'Bad Request');
      });
    };
  }

  function testInvalidCspValue(fieldName, fieldValue) {
    var cspReport = deepCopy(VALID_CSP_REPORT);

    cspReport['csp-report'][fieldName] = fieldValue;
    return testInvalidCspReport(cspReport);
  }

  function testValidCspReport(cspReport) {
    return function () {
      return got.post(REPORT_URL, {
        body: JSON.stringify(cspReport),
        headers: { 'Content-Type': 'application/json' }
      })
      .then((resp) => {
        assert.equal(resp.statusCode, 200);
      });
    };
  }

  function testValidCspValue(fieldName, fieldValue) {
    var cspReport = deepCopy(VALID_CSP_REPORT);

    cspReport['csp-report'][fieldName] = fieldValue;
    return testValidCspReport(cspReport);
  }

  function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }


  registerSuite(suite);
});
