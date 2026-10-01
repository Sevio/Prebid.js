/**
 * This module adds the Sevio ID to the User ID module
 * The {@link module:modules/userId} module is required
 * @module modules/sevioIdSystem
 * @requires module:modules/userId
 */

import { formatQS, logError, logInfo, logWarn } from '../src/utils.js';
import { submodule } from '../src/hook.js';
import { qualifiedAjaxBuilder } from '../src/ajax.js';
import { coppaDataHandler } from '../src/consentHandler.js';
import { MODULE_TYPE_UID } from '../src/activities/modules.js';
import { getUserSyncParams } from '../libraries/userSyncUtils/userSyncUtils.js';

import type { IdProviderSpec } from './userId/spec.ts';

const MODULE_NAME = 'sevioId' as const;
const GVLID = 1393;
export const ID_ENDPOINT = 'https://sevio-id-endpoint.invalid/id';
const EID_SOURCE = 'adx.ws';
const LOG_PREFIX = 'sevioId: ';
const RECOMMENDED_STORAGE_TYPES = ['cookie', 'html5'];

/**
 * The Sevio ID module takes no params.
 */
export type SevioIdParams = Record<string, never>;

declare module './userId/spec' {
  interface UserId {
    sevioId: string;
  }
  interface ProvidersToId {
    sevioId: 'sevioId';
  }
  interface ProviderParams {
    sevioId: SevioIdParams;
  }
}

function isRecommendedStorageType(type: string) {
  const types = type.split('&').map(t => t.trim());
  return types.length === RECOMMENDED_STORAGE_TYPES.length &&
    types.every((t, i) => t === RECOMMENDED_STORAGE_TYPES[i]);
}

function fetchId(callback: (id?: string) => void, consentData, storedId) {
  const params = {
    ...getUserSyncParams(consentData?.gdpr, consentData?.usp, consentData?.gpp),
    ...(storedId ? { id: storedId } : {})
  };
  const url = `${ID_ENDPOINT}?${formatQS(params)}`;
  const callbacks = {
    success(response) {
      let id;
      try {
        id = JSON.parse(response)?.id;
      } catch (e) {
        logError(`${LOG_PREFIX}could not parse the ID response`, e);
        callback();
        return;
      }
      if (typeof id === 'string' && id !== '') {
        callback(id);
      } else {
        logError(`${LOG_PREFIX}the ID response has no 'id'`, response);
        callback();
      }
    },
    error(error) {
      logError(`${LOG_PREFIX}the ID request failed`, error);
      callback();
    }
  };
  qualifiedAjaxBuilder(MODULE_TYPE_UID, MODULE_NAME)(url, callbacks, undefined, { method: 'GET', withCredentials: true });
}

export const sevioIdSubmodule: IdProviderSpec<typeof MODULE_NAME> = {
  name: MODULE_NAME,
  gvlid: GVLID,
  decode(value) {
    if (coppaDataHandler.getCoppa()) {
      logInfo(`${LOG_PREFIX}IDs are not provided for COPPA requests`);
      return undefined;
    }
    return typeof value === 'string' && value !== '' ? { sevioId: value } : undefined;
  },
  getId(config, consentData, storedId) {
    if (consentData?.coppa) {
      logInfo(`${LOG_PREFIX}IDs are not provided for COPPA requests`);
      return;
    }
    if (!config?.storage) {
      logError(`${LOG_PREFIX}'storage' must be configured; use type 'cookie&html5'`);
      return;
    }
    if (!isRecommendedStorageType(String(config.storage.type))) {
      logWarn(`${LOG_PREFIX}storage type '${config.storage.type}' is not recommended; use 'cookie&html5'`);
    }
    return { callback: (cb) => fetchId(cb, consentData, storedId) };
  },
  eids: {
    sevioId: (values) => ({
      source: EID_SOURCE,
      uids: values.map(id => ({ id, atype: 1 }))
    })
  }
};

submodule('userId', sevioIdSubmodule);
