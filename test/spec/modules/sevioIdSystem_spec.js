import * as utils from '../../../src/utils.js';
import { server } from 'test/mocks/xhr.js';
import { config } from 'src/config.js';
import { hook } from '../../../src/hook.js';
import { getGlobal } from '../../../src/prebidGlobal.js';
import { allConsent } from '../../../src/consentHandler.js';
import { ID_ENDPOINT, sevioIdSubmodule } from 'modules/sevioIdSystem.js';
import { createEidsArray } from '../../../modules/userId/eids.js';
import {
  COOKIE_SUFFIXES,
  coreStorage,
  getConsentHash,
  HTML5_SUFFIXES,
  init,
  setSubmoduleRegistry
} from '../../../modules/userId/index.js';

const STORAGE_NAME = '_sevioId';
const EXPIRED_COOKIE_DATE = 'Thu, 01 Jan 1970 00:00:01 GMT';

describe('Sevio ID System', function () {
  let sandbox;

  const validConfig = {
    name: 'sevioId',
    storage: { type: 'cookie&html5', name: STORAGE_NAME, expires: 30 }
  };

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    sandbox.stub(utils, 'logError');
    sandbox.stub(utils, 'logWarn');
    sandbox.stub(utils, 'logInfo');
  });

  afterEach(function () {
    sandbox.restore();
    config.resetConfig();
  });

  function requestParams(request) {
    return Object.fromEntries(new URL(request.url).searchParams.entries());
  }

  describe('module registration', function () {
    it('has the expected name and numeric gvlid', function () {
      expect(sevioIdSubmodule.name).to.equal('sevioId');
      expect(sevioIdSubmodule.gvlid).to.equal(1393);
    });

    it('does not define extendId', function () {
      expect(sevioIdSubmodule.extendId).to.be.undefined;
    });
  });

  describe('decode', function () {
    it('returns the ID for a non-empty string', function () {
      expect(sevioIdSubmodule.decode('abc')).to.deep.equal({ sevioId: 'abc' });
    });

    it('returns undefined for anything else', function () {
      expect(sevioIdSubmodule.decode(undefined)).to.be.undefined;
      expect(sevioIdSubmodule.decode('')).to.be.undefined;
      expect(sevioIdSubmodule.decode({})).to.be.undefined;
    });

    it('returns undefined under COPPA', function () {
      config.setConfig({ coppa: true });
      expect(sevioIdSubmodule.decode('abc')).to.be.undefined;
    });
  });

  describe('eids', function () {
    it('produces an adx.ws EID with atype 1', function () {
      const eids = createEidsArray(sevioIdSubmodule.decode('abc'), new Map(Object.entries(sevioIdSubmodule.eids)));
      expect(eids).to.deep.equal([{ source: 'adx.ws', uids: [{ id: 'abc', atype: 1 }] }]);
    });
  });

  describe('getId', function () {
    const consentData = {
      gdpr: { gdprApplies: true, consentString: 'CONSENT' },
      usp: '1YNN',
      gpp: { gppString: 'GPPSTRING', applicableSections: [7, 8] }
    };

    it('returns nothing and makes no request under COPPA', function () {
      const result = sevioIdSubmodule.getId(validConfig, { coppa: true });
      expect(result).to.be.undefined;
      expect(server.requests.length).to.equal(0);
    });

    it('returns nothing, logs an error and makes no request without storage', function () {
      const result = sevioIdSubmodule.getId({ name: 'sevioId' }, {});
      expect(result).to.be.undefined;
      expect(server.requests.length).to.equal(0);
      sinon.assert.calledOnce(utils.logError);
    });

    it('does not warn for the cookie&html5 storage type', function () {
      sevioIdSubmodule.getId(validConfig, {});
      sinon.assert.notCalled(utils.logWarn);
    });

    ['cookie', 'html5', 'html5&cookie'].forEach(type => {
      it(`warns but still returns a callback for storage type '${type}'`, function () {
        const result = sevioIdSubmodule.getId({ ...validConfig, storage: { ...validConfig.storage, type } }, {});
        sinon.assert.calledOnce(utils.logWarn);
        expect(result.callback).to.be.a('function');
      });
    });

    it('makes no request until the callback runs', function () {
      const result = sevioIdSubmodule.getId(validConfig, consentData);
      expect(result).to.have.all.keys('callback');
      expect(server.requests.length).to.equal(0);
    });

    it('sends a GET with credentials and the consent params', function () {
      sevioIdSubmodule.getId(validConfig, consentData).callback(sinon.spy());
      expect(server.requests.length).to.equal(1);
      const request = server.requests[0];
      expect(request.method).to.equal('GET');
      expect(request.withCredentials).to.be.true;
      expect(request.url.split('?')[0]).to.equal(ID_ENDPOINT);
      expect(requestParams(request)).to.deep.equal({
        gdpr: '1',
        gdpr_consent: 'CONSENT',
        us_privacy: '1YNN',
        gpp: 'GPPSTRING',
        gpp_sid: '7,8'
      });
    });

    it('adds the stored ID to the request when there is one', function () {
      sevioIdSubmodule.getId(validConfig, consentData, 'stored-id').callback(sinon.spy());
      expect(requestParams(server.requests[0]).id).to.equal('stored-id');
    });

    it('sends no consent params when there is no consent data', function () {
      sevioIdSubmodule.getId(validConfig, undefined).callback(sinon.spy());
      expect(requestParams(server.requests[0])).to.deep.equal({});
    });

    it('passes the ID from a successful response', function () {
      const callback = sinon.spy();
      sevioIdSubmodule.getId(validConfig, consentData).callback(callback);
      server.requests[0].respond(200, { 'Content-Type': 'application/json' }, JSON.stringify({ id: 'abc' }));
      sinon.assert.calledOnceWithExactly(callback, 'abc');
      sinon.assert.notCalled(utils.logError);
    });

    [
      ['a missing id', JSON.stringify({})],
      ['an empty id', JSON.stringify({ id: '' })],
      ['a non-string id', JSON.stringify({ id: 123 })],
      ['invalid JSON', 'not json']
    ].forEach(([desc, body]) => {
      it(`passes nothing and logs an error for ${desc}`, function () {
        const callback = sinon.spy();
        sevioIdSubmodule.getId(validConfig, consentData).callback(callback);
        server.requests[0].respond(200, { 'Content-Type': 'application/json' }, body);
        sinon.assert.calledOnceWithExactly(callback);
        sinon.assert.calledOnce(utils.logError);
      });
    });

    it('passes nothing and logs an error on an HTTP error', function () {
      const callback = sinon.spy();
      sevioIdSubmodule.getId(validConfig, consentData).callback(callback);
      server.requests[0].respond(500, {}, '');
      sinon.assert.calledOnceWithExactly(callback);
      sinon.assert.calledOnce(utils.logError);
    });
  });

  describe('through the userId core with cookie&html5 storage', function () {
    const future = () => new Date(Date.now() + 60 * 60 * 1000).toUTCString();

    function clearStorage() {
      COOKIE_SUFFIXES.forEach(suffix => coreStorage.setCookie(STORAGE_NAME + suffix, '', EXPIRED_COOKIE_DATE));
      HTML5_SUFFIXES.forEach(suffix => coreStorage.removeDataFromLocalStorage(STORAGE_NAME + suffix));
    }

    function seedCookie(id) {
      coreStorage.setCookie(STORAGE_NAME, id, future());
      coreStorage.setCookie(`${STORAGE_NAME}_cst`, getConsentHash(), future());
    }

    function seedLocalStorage(id) {
      coreStorage.setDataInLocalStorage(STORAGE_NAME, id);
      coreStorage.setDataInLocalStorage(`${STORAGE_NAME}_exp`, future());
      coreStorage.setDataInLocalStorage(`${STORAGE_NAME}_cst`, getConsentHash());
    }

    function startUserId() {
      init(config);
      setSubmoduleRegistry([sevioIdSubmodule]);
      config.setConfig({
        userSync: {
          syncDelay: 0,
          auctionDelay: 100,
          userIds: [validConfig]
        }
      });
    }

    async function waitForRequest() {
      for (let i = 0; i < 20 && server.requests.length === 0; i++) {
        await new Promise(resolve => setTimeout(resolve));
      }
    }

    function sevioEids() {
      return (getGlobal().getUserIdsAsEids() || []).filter(eid => eid.source === 'adx.ws');
    }

    before(function () {
      hook.ready();
    });

    beforeEach(function () {
      allConsent.reset();
      clearStorage();
    });

    afterEach(function () {
      clearStorage();
      config.resetConfig();
      init(config);
    });

    it('uses the cookie ID over localStorage and leaves localStorage untouched', async function () {
      seedCookie('id-cookie');
      seedLocalStorage('id-ls');
      startUserId();
      await getGlobal().getUserIdsAsync();

      expect(getGlobal().getUserIds().sevioId).to.equal('id-cookie');
      expect(sevioEids()).to.deep.equal([{ source: 'adx.ws', uids: [{ id: 'id-cookie', atype: 1 }] }]);
      expect(coreStorage.getDataFromLocalStorage(STORAGE_NAME)).to.equal('id-ls');
      expect(server.requests.length).to.equal(0);
    });

    it('uses the localStorage ID when the cookie is missing, without a request or a cookie write', async function () {
      seedLocalStorage('id-ls');
      startUserId();
      await getGlobal().getUserIdsAsync();

      expect(getGlobal().getUserIds().sevioId).to.equal('id-ls');
      expect(server.requests.length).to.equal(0);
      expect(coreStorage.getCookie(STORAGE_NAME)).to.not.be.ok;
    });

    it('fetches an ID when nothing is stored and writes it to both stores', async function () {
      startUserId();
      const ids = getGlobal().getUserIdsAsync();
      await waitForRequest();

      expect(server.requests.length).to.equal(1);
      server.requests[0].respond(200, { 'Content-Type': 'application/json' }, JSON.stringify({ id: 'id-new' }));
      await ids;

      expect(getGlobal().getUserIds().sevioId).to.equal('id-new');
      expect(coreStorage.getCookie(STORAGE_NAME)).to.equal('id-new');
      expect(coreStorage.getDataFromLocalStorage(STORAGE_NAME)).to.equal('id-new');
    });

    it('provides no ID, no EID and makes no request under COPPA, even with a stored ID', async function () {
      config.setConfig({ coppa: true });
      seedCookie('id-cookie');
      seedLocalStorage('id-cookie');
      startUserId();
      await getGlobal().getUserIdsAsync();

      expect(getGlobal().getUserIds()).to.not.have.property('sevioId');
      expect(sevioEids()).to.deep.equal([]);
      expect(server.requests.length).to.equal(0);
    });
  });
});
