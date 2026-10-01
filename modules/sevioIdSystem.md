# Overview

Module Name: Sevio User ID Submodule
Module Type: UserID Module
Maintainer: technical@sevio.com

# Description

The Sevio User ID submodule provides the Sevio ID, a device-based identifier issued by Sevio's ID
service, to bid adapters through `bidRequest.userId.sevioId` and as an OpenRTB Extended ID under the
source `adx.ws`.

The ID is fetched from Sevio's ID service once and then kept in first-party storage by Prebid's
`userId` module. The submodule never reads or writes storage itself. While a valid stored ID exists,
no request is made to the ID service.

# Building Prebid with Sevio ID support

```bash
gulp build --modules=userId,sevioIdSystem
```

For EU traffic, also include the TCF modules:

```bash
gulp build --modules=userId,sevioIdSystem,consentManagementTcf,tcfControl
```

# Configuration

```javascript
pbjs.setConfig({
    userSync: {
        userIds: [{
            name: 'sevioId',
            storage: {
                type: 'cookie&html5',
                name: '_sevioId',
                expires: 30
            }
        }]
    }
});
```

| Param under `userSync.userIds[]` | Scope | Type | Description | Example |
| --- | --- | --- | --- | --- |
| `name` | Required | String | The name of this module. Must be exactly `sevioId`. | `'sevioId'` |
| `storage` | Required | Object | Prebid-managed storage for the ID. Without it the module logs an error and provides no ID. | |
| `storage.type` | Required | String | Must be `cookie&html5`. Other values log a warning; the module still works, but without the cookie-first, `localStorage`-fallback behaviour described below. | `'cookie&html5'` |
| `storage.name` | Required | String | Name of the cookie and `localStorage` key. `_sevioId` is recommended, because it is the name Sevio's storage disclosure lists. | `'_sevioId'` |
| `storage.expires` | Required | Number | Days the stored ID is kept. Without it the cookie is session-only and the `localStorage` copy is ignored, so the ID is fetched again on every visit. | `30` |
| `storage.refreshInSeconds` | Optional | Number | Seconds after which the ID is fetched again and both stores are rewritten. | `86400` |
| `bidders` | Optional | Array of strings | Restricts which bidders receive the ID. | `['sevio']` |

The submodule takes no `params`.

# Storage

With `storage.type: 'cookie&html5'`, Prebid writes the ID to both a first-party cookie and
`localStorage`, and reads the cookie first, with `localStorage` as the fallback.

If the cookie is lost (for example to a browser's cap on cookies set by script) while `localStorage`
still holds the ID, Prebid uses the `localStorage` copy and makes no request. The cookie is not
restored until the next fetch rewrites both stores: when `storage.refreshInSeconds` elapses, when the
stored ID expires, or when the consent state changes.

Keys Prebid writes, with `storage.name: '_sevioId'`:

| Storage | Keys |
| --- | --- |
| Cookie (host-only, `SameSite=Lax`) | `_sevioId`, `_sevioId_cst`, `_sevioId_last` |
| `localStorage` | `_sevioId`, `_sevioId_exp`, `_sevioId_cst`, `_sevioId_last` |

The `_last` keys are written only when `storage.refreshInSeconds` is set.

Without a `storage` object the module is inactive: it logs an error, makes no request and provides no
ID.

# Consent

- The submodule declares GVL ID `1393`. When `tcfControl` is enabled, Prebid's TCF enforcement
  requires Purpose 1 consent and vendor consent for GVL ID `1393` before the ID can be stored or read.
- The consent signals present on the page are forwarded to Sevio's ID service as the query
  parameters `gdpr`, `gdpr_consent`, `us_privacy`, `gpp` and `gpp_sid`, together with the stored ID
  (`id`) when one exists. The request is sent with credentials.
- No ID is provided under COPPA. When COPPA applies, the module makes no request, and an ID that is
  already stored is not passed to bidders either.
- **`userSync.enforceStorageType` caveat:** Prebid currently compares each storage write's single
  type with the whole configured `storage.type` string. With `cookie&html5` and
  `userSync.enforceStorageType: true`, every write is blocked and the ID is never stored. Without
  `enforceStorageType`, every write logs a warning but the ID is stored normally. Leave
  `enforceStorageType` unset with this module until that is fixed in Prebid core.

# EID output

```javascript
{
    source: 'adx.ws',
    uids: [{
        id: 'some-random-id-value',
        atype: 1
    }]
}
```
