import {spec} from 'modules/smaatoBidAdapter.js';
import * as utils from 'src/utils.js';
import {config} from 'src/config.js';

// load modules that register ORTB processors
import 'src/prebid.js'
import 'modules/currency.js';
import 'modules/userId/index.js';
import 'modules/multibid/index.js';
import 'modules/priceFloors.js';
import 'modules/consentManagementTcf.js';
import 'modules/consentManagementUsp.js';

const IMAGE_SYNC_URL = 'https://s.ad.smaato.net/c/?adExInit=p'
const IFRAME_SYNC_URL = 'https://s.ad.smaato.net/i/?adExInit=p'

const ADTYPE_IMG = 'Img';
const ADTYPE_VIDEO = 'Video';
const ADTYPE_NATIVE = 'Native';

const REFERRER = 'http://example.com/page.html'
const CONSENT_STRING = 'HFIDUYFIUYIUYWIPOI87392DSU'
const AUCTION_ID = '6653';

const defaultBidderRequest = {
  bidderRequestId: 'mock-uuid',
  gdprConsent: {
    consentString: CONSENT_STRING,
    gdprApplies: true
  },
  uspConsent: 'uspConsentString',
  refererInfo: {
    ref: REFERRER,
  },
  timeout: 1200,
  auctionId: AUCTION_ID
};

const BANNER_PREBID_MEDIATYPE = {
  sizes: [[300, 50]]
}

const singleBannerBidRequest = {
  bidder: 'smaato',
  params: {
    publisherId: 'publisherId',
    adspaceId: 'adspaceId'
  },
  mediaTypes: {
    banner: BANNER_PREBID_MEDIATYPE
  },
  adUnitCode: '/19968336/header-bid-tag-0',
  transactionId: 'transactionId',
  sizes: [[300, 50]],
  bidId: 'bidId',
  bidderRequestId: 'bidderRequestId',
  src: 'client',
  bidRequestsCount: 1,
  bidderRequestsCount: 1,
  bidderWinsCount: 0
};

const extractPayloadOfFirstAndOnlyRequest = (reqs) => {
  expect(reqs).to.have.length(1);
  return JSON.parse(reqs[0].data);
}

describe('smaatoBidAdapterTest', () => {
  describe('isBidRequestValid', () => {
    it('is invalid, when params object is not present', () => {
      expect(spec.isBidRequestValid({})).to.be.false;
    });

    it('is invalid, when params object is empty', () => {
      expect(spec.isBidRequestValid({params: {}})).to.be.false;
    });

    it('is invalid, when publisherId is present but of wrong type', () => {
      expect(spec.isBidRequestValid({params: {publisherId: 123}})).to.be.false;
    });

    describe('for ad pod / long form video requests', () => {
      const ADPOD = {video: {context: 'adpod'}}
      it('is invalid, when adbreakId is missing', () => {
        expect(spec.isBidRequestValid({mediaTypes: ADPOD, params: {publisherId: '123'}})).to.be.false;
      });

      it('is invalid, when adbreakId is present but of wrong type', () => {
        expect(spec.isBidRequestValid({mediaTypes: ADPOD, params: {publisherId: '123', adbreakId: 456}})).to.be.false;
      });

      it('is valid, when required params are present', () => {
        expect(spec.isBidRequestValid({mediaTypes: ADPOD, params: {publisherId: '123', adbreakId: '456'}})).to.be.true;
      });

      it('is invalid, when forbidden adspaceId param is present', () => {
        expect(spec.isBidRequestValid({
          mediaTypes: ADPOD,
          params: {publisherId: '123', adbreakId: '456', adspaceId: '42'}
        })).to.be.false;
      });
    });

    describe('for non adpod requests', () => {
      it('is invalid, when adspaceId is missing', () => {
        expect(spec.isBidRequestValid({params: {publisherId: '123'}})).to.be.false;
      });

      it('is invalid, when adspaceId is present but of wrong type', () => {
        expect(spec.isBidRequestValid({params: {publisherId: '123', adspaceId: 456}})).to.be.false;
      });

      it('is valid, when required params are present for minimal request', () => {
        expect(spec.isBidRequestValid({params: {publisherId: '123', adspaceId: '456'}})).to.be.true;
      });

      it('is invalid, when forbidden adbreakId param is present', () => {
        expect(spec.isBidRequestValid({params: {publisherId: '123', adspaceId: '456', adbreakId: '42'}})).to.be.false;
      });
    });
  });

  describe('buildRequests', () => {
    const BANNER_OPENRTB_IMP = {
      format: [
        {
          h: 50,
          w: 300
        }
      ],
      topframe: 0,
    }

    describe('common', () => {
      const MINIMAL_BIDDER_REQUEST = {
        refererInfo: {
          ref: REFERRER,
        }
      };

      let sandbox;
      beforeEach(() => {
        sandbox = sinon.createSandbox();
      });

      afterEach(() => {
        sandbox.restore();
      })

      it('auction type is 1 (first price auction)', () => {
        const reqs = spec.buildRequests([singleBannerBidRequest], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.at).to.be.equal(1);
      })

      it('can override endpoint', () => {
        const overridenEndpoint = 'https://prebid/bidder';
        const updatedBidRequest = utils.deepClone(singleBannerBidRequest);
        utils.deepSetValue(updatedBidRequest, 'params.endpoint', overridenEndpoint);

        const reqs = spec.buildRequests([updatedBidRequest], defaultBidderRequest);

        expect(reqs).to.have.length(1);
        expect(reqs[0].url).to.equal(overridenEndpoint);
      });

      it('sends correct imp', () => {
        const reqs = spec.buildRequests([singleBannerBidRequest], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.imp).to.deep.equal([
          {
            id: 'bidId',
            banner: BANNER_OPENRTB_IMP,
            tagid: 'adspaceId',
            secure: 1
          }
        ]);
      });

      it('sends bidfloor when configured', () => {
        const singleBannerBidRequestWithFloor = Object.assign({}, singleBannerBidRequest);
        singleBannerBidRequestWithFloor.getFloor = function (arg) {
          if (arg.currency === 'USD' &&
              arg.mediaType === 'banner' &&
              JSON.stringify(arg.size) === JSON.stringify([300, 50])) {
            return {
              currency: 'USD',
              floor: 0.123
            }
          }
        }
        const reqs = spec.buildRequests([singleBannerBidRequestWithFloor], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.imp[0].bidfloor).to.be.equal(0.123);
      });

      it('bidfloor uses catch-all when multiple sizes', () => {
        const singleBannerMultipleSizesBidRequestWithFloor = Object.assign({}, singleBannerBidRequest, {
          mediaTypes: {
            banner: {
              sizes: [[320, 50], [320, 250]]
            }
          }
        });
        singleBannerMultipleSizesBidRequestWithFloor.getFloor = function (arg) {
          if (arg.size === '*') {
            return {
              currency: 'USD',
              floor: 0.101
            }
          }
        }
        const reqs = spec.buildRequests([singleBannerMultipleSizesBidRequestWithFloor], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.imp[0].bidfloor).to.be.equal(0.101);
      });

      it('sends undefined bidfloor when not a function', () => {
        const singleBannerBidRequestWithFloor = Object.assign({}, singleBannerBidRequest);
        singleBannerBidRequestWithFloor.getFloor = 0

        const reqs = spec.buildRequests([singleBannerBidRequestWithFloor], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.imp[0].bidfloor).to.be.undefined
      });

      it('sends undefined bidfloor when invalid', () => {
        const singleBannerBidRequestWithFloor = Object.assign({}, singleBannerBidRequest);
        singleBannerBidRequestWithFloor.getFloor = function () {
          return undefined;
        }
        const reqs = spec.buildRequests([singleBannerBidRequestWithFloor], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.imp[0].bidfloor).to.be.undefined
      });

      it('sends undefined bidfloor when not a number', () => {
        const singleBannerBidRequestWithFloor = Object.assign({}, singleBannerBidRequest);
        singleBannerBidRequestWithFloor.getFloor = function () {
          return {
            currency: 'USD',
          }
        }
        const reqs = spec.buildRequests([singleBannerBidRequestWithFloor], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.imp[0].bidfloor).to.be.undefined;
      });

      it('sends undefined bidfloor when wrong currency', () => {
        const singleBannerBidRequestWithFloor = Object.assign({}, singleBannerBidRequest);
        singleBannerBidRequestWithFloor.getFloor = function () {
          return {
            currency: 'EUR',
            floor: 0.123
          }
        }
        const reqs = spec.buildRequests([singleBannerBidRequestWithFloor], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.imp[0].bidfloor).to.be.undefined;
      });

      it('sends correct site', () => {
        const reqs = spec.buildRequests([singleBannerBidRequest], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.site.id).to.exist.and.to.be.a('string');
        expect(req.site.domain).to.exist.and.to.be.a('string');
        expect(req.site.page).to.exist.and.to.be.a('string');
        expect(req.site.ref).to.equal(REFERRER);
        expect(req.site.publisher.id).to.equal('publisherId');
      })

      it('sends correct site from ortb2', () => {
        const domain = 'domain';
        const page = 'page';
        const ref = 'ref';
        const ortb2 = {
          site: {
            name: 'example',
            domain: domain,
            page: page,
            ref: ref
          },
        };

        const reqs = spec.buildRequests([singleBannerBidRequest], {...defaultBidderRequest, ortb2});

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.site.id).to.exist.and.to.be.a('string');
        expect(req.site.domain).to.equal(domain);
        expect(req.site.page).to.equal(page);
        expect(req.site.ref).to.equal(ref);
        expect(req.site.publisher.id).to.equal('publisherId');
        expect(req.dooh).to.be.undefined;
      })

      it('sends correct dooh from ortb2', () => {
        const name = 'name';
        const domain = 'domain';
        const keywords = 'keyword1,keyword2';
        const venuetypetax = 1;
        const ortb2 = {
          dooh: {
            name: name,
            domain: domain,
            keywords: keywords,
            venuetypetax: venuetypetax
          },
        };

        const reqs = spec.buildRequests([singleBannerBidRequest], {...defaultBidderRequest, ortb2});

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.dooh.id).to.exist.and.to.be.a('string');
        expect(req.dooh.name).to.equal(name);
        expect(req.dooh.domain).to.equal(domain);
        expect(req.dooh.keywords).to.equal(keywords);
        expect(req.dooh.venuetypetax).to.equal(venuetypetax);
        expect(req.dooh.publisher.id).to.equal('publisherId');
        expect(req.site).to.be.undefined;
      })

      it('sends correct device from ortb2', () => {
        const language = 'language'
        const ua = 'ua'
        const sua = 'sua'
        const dnt = 1
        const w = 2
        const h = 3
        const ortb2 = {
          device: {
            language: language,
            ua: ua,
            sua: sua,
            dnt: dnt,
            w: w,
            h: h
          },
        };

        const reqs = spec.buildRequests([singleBannerBidRequest], {...defaultBidderRequest, ortb2});

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.device.language).to.equal(language);
        expect(req.device.ua).to.equal(ua);
        expect(req.device.sua).to.equal(sua);
        expect(req.device.dnt).to.equal(dnt);
        expect(req.device.w).to.equal(w);
        expect(req.device.h).to.equal(h);
      })

      it('sends gdpr applies if exists', () => {
        const reqs = spec.buildRequests([singleBannerBidRequest], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.regs.ext.gdpr).to.equal(1);
        expect(req.user.ext.consent).to.equal(CONSENT_STRING);
      });

      it('sends correct coppa from ortb2', () => {
        const ortb2 = {
          regs: {
            coppa: 1
          },
        };

        const reqs = spec.buildRequests([singleBannerBidRequest], {...defaultBidderRequest, ortb2});

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.regs.coppa).to.equal(1);
      })

      it('sends no gdpr applies if no gdpr exists', () => {
        const reqs = spec.buildRequests([singleBannerBidRequest], MINIMAL_BIDDER_REQUEST);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.regs.ext.gdpr).to.not.exist;
        expect(req.user.ext.consent).to.not.exist;
      });

      it('sends us_privacy if exists', () => {
        const reqs = spec.buildRequests([singleBannerBidRequest], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.regs.ext.us_privacy).to.equal('uspConsentString');
      });

      it('sends gpp', () => {
        const ortb2 = {
          regs: {
            gpp: 'gppString',
            gpp_sid: [7]
          }
        };

        const reqs = spec.buildRequests([singleBannerBidRequest], {...defaultBidderRequest, ortb2});

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.regs.ext.gpp).to.eql('gppString');
        expect(req.regs.ext.gpp_sid).to.eql([7]);
      });

      it('sends no schain if no schain exists', () => {
        const reqs = spec.buildRequests([singleBannerBidRequest], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.source.ext.schain).to.not.exist;
      });

      it('sends instl if instl exists', () => {
        const instl = {instl: 1};
        const bidRequestWithInstl = Object.assign({}, singleBannerBidRequest, {ortb2Imp: instl});

        const reqs = spec.buildRequests([bidRequestWithInstl], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.imp[0].instl).to.equal(1);
      });

      it('sends tmax', () => {
        const reqs = spec.buildRequests([singleBannerBidRequest], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.tmax).to.equal(1200);
      });

      it('sends no us_privacy if no us_privacy exists', () => {
        const reqs = spec.buildRequests([singleBannerBidRequest], MINIMAL_BIDDER_REQUEST);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.regs.ext.us_privacy).to.not.exist;
      });

      it('sends first party data', () => {
        const ortb2 = {
          site: {
            keywords: 'power tools,drills',
            publisher: {
              id: 'otherpublisherid',
              name: 'publishername'
            }
          },
          user: {
            keywords: 'a,b',
            gender: 'M',
            yob: 1984
          },
          device: {
            ifa: 'ifa',
            geo: {
              lat: 53.5488,
              lon: 9.9872
            }
          }
        };

        const reqs = spec.buildRequests([singleBannerBidRequest], {...defaultBidderRequest, ortb2});

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.user.gender).to.equal('M');
        expect(req.user.yob).to.equal(1984);
        expect(req.user.keywords).to.eql('a,b');
        expect(req.user.ext.consent).to.equal(CONSENT_STRING);
        expect(req.site.keywords).to.eql('power tools,drills');
        expect(req.site.publisher.id).to.equal('publisherId');
        expect(req.device.ifa).to.equal('ifa');
        expect(req.device.geo.lat).to.equal(53.5488);
        expect(req.device.geo.lon).to.equal(9.9872);
      });

      it('sends user first party data when user is not defined', () => {
        const reqs = spec.buildRequests([singleBannerBidRequest], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.user.gender).be.undefined;
        expect(req.user.yob).to.be.undefined;
        expect(req.user.keywords).to.be.undefined;
        expect(req.user.ext.consent).to.equal(CONSENT_STRING);
      });

      it('has no user ids', () => {
        const reqs = spec.buildRequests([singleBannerBidRequest], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.user.ext.eids).to.not.exist;
      });

      it('sends dsa', () => {
        const ortb2 = {
          regs: {
            ext: {
              dsa: {
                dsarequired: 2,
                pubrender: 0,
                datatopub: 1,
                transparency: [
                  {
                    domain: 'testdomain.com',
                    dsaparams: [1, 2, 3]
                  }
                ]
              }
            }
          }
        };

        const reqs = spec.buildRequests([singleBannerBidRequest], {...defaultBidderRequest, ortb2});

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.regs.ext.dsa.dsarequired).to.eql(2);
        expect(req.regs.ext.dsa.pubrender).to.eql(0);
        expect(req.regs.ext.dsa.datatopub).to.eql(1);
        expect(req.regs.ext.dsa.transparency[0].domain).to.eql('testdomain.com');
        expect(req.regs.ext.dsa.transparency[0].dsaparams).to.eql([1, 2, 3]);
      });

      it('sends no dsa', () => {
        const ortb2 = {
          regs: {
            ext: {}
          }
        };

        const reqs = spec.buildRequests([singleBannerBidRequest], {...defaultBidderRequest, ortb2});

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.regs.ext.dsa).to.be.undefined;
      });
    });

    describe('multiple requests', () => {
      it('build individual server request for each bid request', () => {
        const bidRequest1 = utils.deepClone(singleBannerBidRequest);
        const bidRequest1BidId = '1111';
        utils.deepSetValue(bidRequest1, 'bidId', bidRequest1BidId);
        const bidRequest2 = utils.deepClone(singleBannerBidRequest);
        const bidRequest2BidId = '2222';
        utils.deepSetValue(bidRequest2, 'bidId', bidRequest2BidId);

        const reqs = spec.buildRequests([bidRequest1, bidRequest2], defaultBidderRequest);

        expect(reqs).to.have.length(2);
        expect(JSON.parse(reqs[0].data).imp[0].id).to.be.equal(bidRequest1BidId);
        expect(JSON.parse(reqs[1].data).imp[0].id).to.be.equal(bidRequest2BidId);
      });
    });

    describe('buildRequests for video imps', () => {
      const VIDEO_OUTSTREAM_PREBID_MEDIATYPE = {
        context: 'outstream',
        playerSize: [[768, 1024]],
        mimes: ['video/mp4', 'video/quicktime', 'video/3gpp', 'video/x-m4v'],
        minduration: 5,
        maxduration: 30,
        startdelay: 0,
        linearity: 1,
        protocols: [7],
        skip: 1,
        skipmin: 5,
        api: [7],
        ext: {rewarded: 0}
      };
      const VIDEO_OUTSTREAM_OPENRTB_IMP = {
        mimes: ['video/mp4', 'video/quicktime', 'video/3gpp', 'video/x-m4v'],
        minduration: 5,
        startdelay: 0,
        linearity: 1,
        h: 1024,
        maxduration: 30,
        skip: 1,
        protocols: [7],
        ext: {
          rewarded: 0
        },
        skipmin: 5,
        api: [7],
        w: 768
      };
      const singleVideoBidRequest = {
        bidder: 'smaato',
        params: {
          publisherId: 'publisherId',
          adspaceId: 'adspaceId'
        },
        mediaTypes: {
          video: VIDEO_OUTSTREAM_PREBID_MEDIATYPE
        },
        adUnitCode: '/19968336/header-bid-tag-0',
        transactionId: 'transactionId',
        bidId: 'bidId',
        bidderRequestId: 'bidderRequestId',
        src: 'client',
        bidRequestsCount: 1,
        bidderRequestsCount: 1,
        bidderWinsCount: 0
      };

      if (FEATURES.VIDEO) {
        it('sends correct video imps', () => {
          const reqs = spec.buildRequests([singleVideoBidRequest], defaultBidderRequest);

          const req = extractPayloadOfFirstAndOnlyRequest(reqs);
          expect(req.imp[0].id).to.be.equal('bidId');
          expect(req.imp[0].tagid).to.be.equal('adspaceId');
          expect(req.imp[0].bidfloor).to.be.undefined;
          expect(req.imp[0].video).to.deep.equal(VIDEO_OUTSTREAM_OPENRTB_IMP);
        });

        it('sends bidfloor when configured', () => {
          const singleVideoBidRequestWithFloor = Object.assign({}, singleVideoBidRequest);
          singleVideoBidRequestWithFloor.getFloor = function (arg) {
            if (arg.currency === 'USD' &&
                arg.mediaType === 'video' &&
                JSON.stringify(arg.size) === JSON.stringify([768, 1024])) {
              return {
                currency: 'USD',
                floor: 0.456
              }
            }
          }
          const reqs = spec.buildRequests([singleVideoBidRequestWithFloor], defaultBidderRequest);

          const req = extractPayloadOfFirstAndOnlyRequest(reqs);
          expect(req.imp[0].bidfloor).to.be.equal(0.456);
        });

        it('sends instl if instl exists', () => {
          const instl = {instl: 1};
          const bidRequestWithInstl = Object.assign({}, singleVideoBidRequest, {ortb2Imp: instl});

          const reqs = spec.buildRequests([bidRequestWithInstl], defaultBidderRequest);

          const req = extractPayloadOfFirstAndOnlyRequest(reqs);
          expect(req.imp[0].instl).to.equal(1);
        });

        it('splits multi format bid requests', () => {
          const combinedBannerAndVideoBidRequest = {
            bidder: 'smaato',
            params: {
              publisherId: 'publisherId',
              adspaceId: 'adspaceId'
            },
            mediaTypes: {
              banner: BANNER_PREBID_MEDIATYPE,
              video: VIDEO_OUTSTREAM_PREBID_MEDIATYPE
            },
            adUnitCode: '/19968336/header-bid-tag-0',
            transactionId: 'transactionId',
            sizes: [[300, 50]],
            bidId: 'bidId',
            bidderRequestId: 'bidderRequestId',
            src: 'client',
            bidRequestsCount: 1,
            bidderRequestsCount: 1,
            bidderWinsCount: 0
          };

          const reqs = spec.buildRequests([combinedBannerAndVideoBidRequest], defaultBidderRequest);

          expect(reqs).to.have.length(2);
          expect(JSON.parse(reqs[0].data).imp[0].banner).to.deep.equal(BANNER_OPENRTB_IMP);
          expect(JSON.parse(reqs[0].data).imp[0].video).to.not.exist;
          expect(JSON.parse(reqs[1].data).imp[0].banner).to.not.exist;
          expect(JSON.parse(reqs[1].data).imp[0].video).to.deep.equal(VIDEO_OUTSTREAM_OPENRTB_IMP);
        });

        describe('ad pod / long form video', () => {
          describe('required parameters with requireExactDuration false', () => {
            const ADBREAK_ID = 'adbreakId';
            const ADPOD = 'adpod';
            const BID_ID = '4331';
            const W = 640;
            const H = 480;
            const ADPOD_DURATION = 300;
            const DURATION_RANGE = [15, 30];
            const longFormVideoBidRequest = {
              params: {
                publisherId: 'publisherId',
                adbreakId: ADBREAK_ID,
              },
              mediaTypes: {
                video: {
                  context: ADPOD,
                  playerSize: [[W, H]],
                  adPodDurationSec: ADPOD_DURATION,
                  durationRangeSec: DURATION_RANGE,
                  requireExactDuration: false
                }
              },
              bidId: BID_ID
            };

            it('sends required fields', () => {
              const reqs = spec.buildRequests([longFormVideoBidRequest], defaultBidderRequest);

              const req = extractPayloadOfFirstAndOnlyRequest(reqs);
              expect(req.id).to.exist;
              expect(req.imp.length).to.be.equal(ADPOD_DURATION / DURATION_RANGE[0]);
              expect(req.imp[0].id).to.be.equal(BID_ID);
              expect(req.imp[0].tagid).to.be.equal(ADBREAK_ID);
              expect(req.imp[0].bidfloor).to.be.undefined;
              expect(req.imp[0].video.ext.context).to.be.equal(ADPOD);
              expect(req.imp[0].video.w).to.be.equal(W);
              expect(req.imp[0].video.h).to.be.equal(H);
              expect(req.imp[0].video.maxduration).to.be.equal(DURATION_RANGE[1]);
              expect(req.imp[0].video.sequence).to.be.equal(1);
              expect(req.imp[1].id).to.be.equal(BID_ID);
              expect(req.imp[1].tagid).to.be.equal(ADBREAK_ID);
              expect(req.imp[1].bidfloor).to.be.undefined;
              expect(req.imp[1].video.ext.context).to.be.equal(ADPOD);
              expect(req.imp[1].video.w).to.be.equal(W);
              expect(req.imp[1].video.h).to.be.equal(H);
              expect(req.imp[1].video.maxduration).to.be.equal(DURATION_RANGE[1]);
              expect(req.imp[1].video.sequence).to.be.equal(2);
            });

            it('sends instl if instl exists', () => {
              const instl = {instl: 1};
              const bidRequestWithInstl = Object.assign({}, longFormVideoBidRequest, {ortb2Imp: instl});

              const reqs = spec.buildRequests([bidRequestWithInstl], defaultBidderRequest);

              const req = extractPayloadOfFirstAndOnlyRequest(reqs);
              expect(req.imp[0].instl).to.equal(1);
              expect(req.imp[1].instl).to.equal(1);
            });

            it('sends bidfloor when configured', () => {
              const longFormVideoBidRequestWithFloor = Object.assign({}, longFormVideoBidRequest);
              longFormVideoBidRequestWithFloor.getFloor = function (arg) {
                if (arg.currency === 'USD' &&
                    arg.mediaType === 'video' &&
                    JSON.stringify(arg.size) === JSON.stringify([640, 480])) {
                  return {
                    currency: 'USD',
                    floor: 0.789
                  }
                }
              }
              const reqs = spec.buildRequests([longFormVideoBidRequestWithFloor], defaultBidderRequest);

              const req = extractPayloadOfFirstAndOnlyRequest(reqs);
              expect(req.imp[0].bidfloor).to.be.equal(0.789);
              expect(req.imp[1].bidfloor).to.be.equal(0.789);
            });

            it('sends brand category exclusion as true when config is set to true', () => {
              config.setConfig({adpod: {brandCategoryExclusion: true}});

              const reqs = spec.buildRequests([longFormVideoBidRequest], defaultBidderRequest);

              const req = extractPayloadOfFirstAndOnlyRequest(reqs);
              expect(req.imp[0].video.ext.brandcategoryexclusion).to.be.equal(true);
            });

            it('sends brand category exclusion as false when config is set to false', () => {
              config.setConfig({adpod: {brandCategoryExclusion: false}});

              const reqs = spec.buildRequests([longFormVideoBidRequest], defaultBidderRequest);

              const req = extractPayloadOfFirstAndOnlyRequest(reqs);
              expect(req.imp[0].video.ext.brandcategoryexclusion).to.be.equal(false);
            });

            it('sends brand category exclusion as false when config is not set', () => {
              const reqs = spec.buildRequests([longFormVideoBidRequest], defaultBidderRequest);

              const req = extractPayloadOfFirstAndOnlyRequest(reqs);
              expect(req.imp[0].video.ext.brandcategoryexclusion).to.be.equal(false);
            });
          });
          describe('required parameters with requireExactDuration true', () => {
            const ADBREAK_ID = 'adbreakId';
            const ADPOD = 'adpod';
            const BID_ID = '4331';
            const W = 640;
            const H = 480;
            const ADPOD_DURATION = 5;
            const DURATION_RANGE = [5, 15, 25];
            const longFormVideoBidRequest = {
              params: {
                publisherId: 'publisherId',
                adbreakId: ADBREAK_ID,
              },
              mediaTypes: {
                video: {
                  context: ADPOD,
                  playerSize: [[W, H]],
                  adPodDurationSec: ADPOD_DURATION,
                  durationRangeSec: DURATION_RANGE,
                  requireExactDuration: true
                }
              },
              bidId: BID_ID
            };

            it('sends required fields', () => {
              const reqs = spec.buildRequests([longFormVideoBidRequest], defaultBidderRequest);

              const req = extractPayloadOfFirstAndOnlyRequest(reqs);
              expect(req.id).to.exist;
              expect(req.imp.length).to.be.equal(DURATION_RANGE.length);
              expect(req.imp[0].id).to.be.equal(BID_ID);
              expect(req.imp[0].tagid).to.be.equal(ADBREAK_ID);
              expect(req.imp[0].video.ext.context).to.be.equal(ADPOD);
              expect(req.imp[0].video.w).to.be.equal(W);
              expect(req.imp[0].video.h).to.be.equal(H);
              expect(req.imp[0].video.minduration).to.be.equal(DURATION_RANGE[0]);
              expect(req.imp[0].video.maxduration).to.be.equal(DURATION_RANGE[0]);
              expect(req.imp[0].video.sequence).to.be.equal(1);
              expect(req.imp[1].id).to.be.equal(BID_ID);
              expect(req.imp[1].tagid).to.be.equal(ADBREAK_ID);
              expect(req.imp[1].video.ext.context).to.be.equal(ADPOD);
              expect(req.imp[1].video.w).to.be.equal(W);
              expect(req.imp[1].video.h).to.be.equal(H);
              expect(req.imp[1].video.minduration).to.be.equal(DURATION_RANGE[1]);
              expect(req.imp[1].video.maxduration).to.be.equal(DURATION_RANGE[1]);
              expect(req.imp[1].video.sequence).to.be.equal(2);
              expect(req.imp[2].id).to.be.equal(BID_ID);
              expect(req.imp[2].tagid).to.be.equal(ADBREAK_ID);
              expect(req.imp[2].video.ext.context).to.be.equal(ADPOD);
              expect(req.imp[2].video.w).to.be.equal(W);
              expect(req.imp[2].video.h).to.be.equal(H);
              expect(req.imp[2].video.minduration).to.be.equal(DURATION_RANGE[2]);
              expect(req.imp[2].video.maxduration).to.be.equal(DURATION_RANGE[2]);
              expect(req.imp[2].video.sequence).to.be.equal(3);
            });
          });

          describe('forwarding of optional parameters', () => {
            const MIMES = ['video/mp4', 'video/quicktime', 'video/3gpp', 'video/x-m4v'];
            const STARTDELAY = 0;
            const LINEARITY = 1;
            const SKIP = 1;
            const PROTOCOLS = [7];
            const SKIPMIN = 5;
            const API = [7];
            const validBasicAdpodBidRequest = {
              params: {
                publisherId: 'publisherId',
                adbreakId: 'adbreakId',
              },
              mediaTypes: {
                video: {
                  context: 'adpod',
                  playerSize: [640, 480],
                  adPodDurationSec: 300,
                  durationRangeSec: [15, 30],
                  mimes: MIMES,
                  startdelay: STARTDELAY,
                  linearity: LINEARITY,
                  skip: SKIP,
                  protocols: PROTOCOLS,
                  skipmin: SKIPMIN,
                  api: API
                }
              },
              bidId: 'bidId'
            };

            it('sends general video fields when they are present', () => {
              const reqs = spec.buildRequests([validBasicAdpodBidRequest], defaultBidderRequest);

              const req = extractPayloadOfFirstAndOnlyRequest(reqs);
              expect(req.imp[0].video.mimes).to.eql(MIMES);
              expect(req.imp[0].video.startdelay).to.be.equal(STARTDELAY);
              expect(req.imp[0].video.linearity).to.be.equal(LINEARITY);
              expect(req.imp[0].video.skip).to.be.equal(SKIP);
              expect(req.imp[0].video.protocols).to.eql(PROTOCOLS);
              expect(req.imp[0].video.skipmin).to.be.equal(SKIPMIN);
              expect(req.imp[0].video.api).to.eql(API);
            });

            it('sends series name when parameter is present', () => {
              const SERIES_NAME = 'foo'
              const adpodRequestWithParameter = utils.deepClone(validBasicAdpodBidRequest);
              adpodRequestWithParameter.mediaTypes.video.tvSeriesName = SERIES_NAME;

              const reqs = spec.buildRequests([adpodRequestWithParameter], defaultBidderRequest);

              const req = extractPayloadOfFirstAndOnlyRequest(reqs);
              expect(req.site.content.series).to.be.equal(SERIES_NAME);
            });

            it('sends episode name when parameter is present', () => {
              const EPISODE_NAME = 'foo'
              const adpodRequestWithParameter = utils.deepClone(validBasicAdpodBidRequest);
              adpodRequestWithParameter.mediaTypes.video.tvEpisodeName = EPISODE_NAME;

              const reqs = spec.buildRequests([adpodRequestWithParameter], defaultBidderRequest);

              const req = extractPayloadOfFirstAndOnlyRequest(reqs);
              expect(req.site.content.title).to.be.equal(EPISODE_NAME);
            });

            it('sends season number as string when parameter is present', () => {
              const SEASON_NUMBER_AS_NUMBER_IN_PREBID_REQUEST = 42
              const SEASON_NUMBER_AS_STRING_IN_OUTGOING_REQUEST = '42'
              const adpodRequestWithParameter = utils.deepClone(validBasicAdpodBidRequest);
              adpodRequestWithParameter.mediaTypes.video.tvSeasonNumber = SEASON_NUMBER_AS_NUMBER_IN_PREBID_REQUEST;

              const reqs = spec.buildRequests([adpodRequestWithParameter], defaultBidderRequest);

              const req = extractPayloadOfFirstAndOnlyRequest(reqs);
              expect(req.site.content.season).to.be.equal(SEASON_NUMBER_AS_STRING_IN_OUTGOING_REQUEST);
            });

            it('sends episode number when parameter is present', () => {
              const EPISODE_NUMBER = 42
              const adpodRequestWithParameter = utils.deepClone(validBasicAdpodBidRequest);
              adpodRequestWithParameter.mediaTypes.video.tvEpisodeNumber = EPISODE_NUMBER;

              const reqs = spec.buildRequests([adpodRequestWithParameter], defaultBidderRequest);

              const req = extractPayloadOfFirstAndOnlyRequest(reqs);
              expect(req.site.content.episode).to.be.equal(EPISODE_NUMBER);
            });

            it('sends content length when parameter is present', () => {
              const LENGTH = 42
              const adpodRequestWithParameter = utils.deepClone(validBasicAdpodBidRequest);
              adpodRequestWithParameter.mediaTypes.video.contentLengthSec = LENGTH;

              const reqs = spec.buildRequests([adpodRequestWithParameter], defaultBidderRequest);

              const req = extractPayloadOfFirstAndOnlyRequest(reqs);
              expect(req.site.content.len).to.be.equal(LENGTH);
            });

            it('sends livestream as 1 when content mode parameter is live', () => {
              const adpodRequestWithParameter = utils.deepClone(validBasicAdpodBidRequest);
              adpodRequestWithParameter.mediaTypes.video.contentMode = 'live';

              const reqs = spec.buildRequests([adpodRequestWithParameter], defaultBidderRequest);

              const req = extractPayloadOfFirstAndOnlyRequest(reqs);
              expect(req.site.content.livestream).to.be.equal(1);
            });

            it('sends livestream as 0 when content mode parameter is on-demand', () => {
              const adpodRequestWithParameter = utils.deepClone(validBasicAdpodBidRequest);
              adpodRequestWithParameter.mediaTypes.video.contentMode = 'on-demand';

              const reqs = spec.buildRequests([adpodRequestWithParameter], defaultBidderRequest);

              const req = extractPayloadOfFirstAndOnlyRequest(reqs);
              expect(req.site.content.livestream).to.be.equal(0);
            });

            it('doesn\'t send any optional parameters when none are present', () => {
              const reqs = spec.buildRequests([validBasicAdpodBidRequest], defaultBidderRequest);

              const req = extractPayloadOfFirstAndOnlyRequest(reqs);
              expect(req.imp[0].video.ext.requireExactDuration).to.not.exist;
              expect(req.site.content).to.not.exist;
            });
          });
        });
      }
    });

    if (FEATURES.NATIVE) {
      describe('buildRequests for native imps', () => {
        const NATIVE_OPENRTB_REQUEST = {
          ver: '1.2',
          assets: [
            {
              id: 4,
              required: 1,
              img: {
                type: 3,
                w: 150,
                h: 50,
              }
            },
            {
              id: 2,
              required: 1,
              img: {
                type: 2,
                w: 50,
                h: 50
              }
            },
            {
              id: 0,
              required: 1,
              title: {
                len: 80
              }
            },
            {
              id: 1,
              required: 1,
              data: {
                type: 1
              }
            },
            {
              id: 3,
              required: 1,
              data: {
                type: 2
              }
            },
            {
              id: 5,
              required: 1,
              data: {
                type: 3
              }
            },
            {
              id: 6,
              required: 1,
              data: {
                type: 4
              }
            },
            {
              id: 7,
              required: 1,
              data: {
                type: 5
              }
            },
            {
              id: 8,
              required: 1,
              data: {
                type: 6
              }
            },
            {
              id: 9,
              required: 1,
              data: {
                type: 7
              }
            },
            {
              id: 10,
              required: 0,
              data: {
                type: 8
              }
            },
            {
              id: 11,
              required: 1,
              data: {
                type: 9
              }
            },
            {
              id: 12,
              require: 0,
              data: {
                type: 10
              }
            },
            {
              id: 13,
              required: 0,
              data: {
                type: 11
              }
            },
            {
              id: 14,
              required: 1,
              data: {
                type: 12
              }
            }
          ]
        };

        const singleNativeBidRequest = {
          bidder: 'smaato',
          params: {
            publisherId: 'publisherId',
            adspaceId: 'adspaceId'
          },
          nativeOrtbRequest: NATIVE_OPENRTB_REQUEST,
          adUnitCode: '/19968336/header-bid-tag-0',
          transactionId: 'transactionId',
          bidId: 'bidId',
          bidderRequestId: 'bidderRequestId',
          src: 'client',
          bidRequestsCount: 1,
          bidderRequestsCount: 1,
          bidderWinsCount: 0
        };

        it('sends correct native imps', () => {
          const reqs = spec.buildRequests([singleNativeBidRequest], defaultBidderRequest);

          const req = extractPayloadOfFirstAndOnlyRequest(reqs);
          expect(req.imp[0].id).to.be.equal('bidId');
          expect(req.imp[0].tagid).to.be.equal('adspaceId');
          expect(req.imp[0].bidfloor).to.be.undefined;
          expect(req.imp[0].native.request).to.deep.equal(JSON.stringify(NATIVE_OPENRTB_REQUEST));
        });

        it('sends bidfloor when configured', () => {
          const singleNativeBidRequestWithFloor = Object.assign({}, singleNativeBidRequest);
          singleNativeBidRequestWithFloor.getFloor = function (arg) {
            if (arg.currency === 'USD' &&
                arg.mediaType === 'native' &&
                JSON.stringify(arg.size) === JSON.stringify([150, 50])) {
              return {
                currency: 'USD',
                floor: 0.123
              }
            }
          }
          const reqs = spec.buildRequests([singleNativeBidRequestWithFloor], defaultBidderRequest);

          const req = extractPayloadOfFirstAndOnlyRequest(reqs);
          expect(req.imp[0].bidfloor).to.be.equal(0.123);
        });
      });
    }
    describe('in-app requests', () => {
      const LOCATION = {
        lat: 33.3,
        lon: -88.8
      }
      const DEVICE_ID = 'aDeviceId'
      const inAppBidRequestWithoutAppParams = {
        bidder: 'smaato',
        params: {
          publisherId: 'publisherId',
          adspaceId: 'adspaceId'
        },
        mediaTypes: {
          banner: BANNER_PREBID_MEDIATYPE
        },
        adUnitCode: '/19968336/header-bid-tag-0',
        transactionId: 'transactionId',
        sizes: [[300, 50]],
        bidId: 'bidId',
        bidderRequestId: 'bidderRequestId',
        src: 'client',
        bidRequestsCount: 1,
        bidderRequestsCount: 1,
        bidderWinsCount: 0
      };

      it('when geo and ifa info present, then add both to device object', () => {
        const inAppBidRequest = utils.deepClone(inAppBidRequestWithoutAppParams);
        inAppBidRequest.params.app = {ifa: DEVICE_ID, geo: LOCATION};

        const reqs = spec.buildRequests([inAppBidRequest], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.device.geo).to.deep.equal(LOCATION);
        expect(req.device.ifa).to.equal(DEVICE_ID);
      });

      it('when geo and ifa info present and fpd present, then prefer fpd', () => {
        const ortb2 = {
          device: {
            ifa: 'ifa',
            geo: {
              lat: 53.5488,
              lon: 9.9872
            }
          }
        };

        const inAppBidRequest = utils.deepClone(inAppBidRequestWithoutAppParams);
        inAppBidRequest.params.app = {ifa: DEVICE_ID, geo: LOCATION};

        const reqs = spec.buildRequests([inAppBidRequest], {...defaultBidderRequest, ortb2});

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.device.geo.lat).to.equal(53.5488);
        expect(req.device.geo.lon).to.equal(9.9872);
        expect(req.device.ifa).to.equal('ifa');
      });

      it('when ifa is present but geo is missing, then add only ifa to device object', () => {
        const inAppBidRequest = utils.deepClone(inAppBidRequestWithoutAppParams);
        inAppBidRequest.params.app = {ifa: DEVICE_ID};

        const reqs = spec.buildRequests([inAppBidRequest], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.device.geo).to.not.exist;
        expect(req.device.ifa).to.equal(DEVICE_ID);
      });

      it('when geo is present but ifa is missing, then add only geo to device object', () => {
        const inAppBidRequest = utils.deepClone(inAppBidRequestWithoutAppParams);
        inAppBidRequest.params.app = {geo: LOCATION};

        const reqs = spec.buildRequests([inAppBidRequest], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.device.geo).to.deep.equal(LOCATION);
        expect(req.device.ifa).to.not.exist;
      });

      it('when app param does not exist, then add no specific device info', () => {
        const reqs = spec.buildRequests([inAppBidRequestWithoutAppParams], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.device.geo).to.not.exist;
        expect(req.device.ifa).to.not.exist;
      });
    });

    describe('user ids in requests', () => {
      it('user ids are added to user.ext.eids', () => {
        const userIdBidRequest = {
          bidder: 'smaato',
          params: {
            publisherId: 'publisherId',
            adspaceId: 'adspaceId'
          },
          mediaTypes: {
            banner: BANNER_PREBID_MEDIATYPE
          },
          adUnitCode: '/19968336/header-bid-tag-0',
          transactionId: 'transactionId',
          sizes: [[300, 50]],
          bidId: 'bidId',
          bidderRequestId: 'bidderRequestId',
          src: 'client',
          bidRequestsCount: 1,
          bidderRequestsCount: 1,
          bidderWinsCount: 0,
          userId: {
            criteoId: '123456',
            tdid: '89145'
          },
          userIdAsEids: [
            {id: 1}, {id: 2}
          ]
        };

        const reqs = spec.buildRequests([userIdBidRequest], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.user.ext.eids).to.eql(userIdBidRequest.userIdAsEids);
      });
    });

    describe('schain in request', () => {
      it('schain is added to source.ext.schain', () => {
        const schain = {
          ver: '1.0',
          complete: 1,
          nodes: [
            {
              'asi': 'asi',
              'sid': 'sid',
              'rid': 'rid',
              'hp': 1
            }
          ]
        };
        const bidRequestWithSchain = Object.assign({}, singleBannerBidRequest, {
          ortb2: {
            source: {
              ext: {
                schain: schain
              }
            }
          }
        });

        const reqs = spec.buildRequests([bidRequestWithSchain], defaultBidderRequest);

        const req = extractPayloadOfFirstAndOnlyRequest(reqs);
        expect(req.source.ext.schain).to.deep.equal(schain);
      });
    });
  });

  describe('interpretResponse', () => {
    function buildBidRequest(payloadAsJsObj = {imp: [{}]}) {
      return {
        method: 'POST',
        url: 'https://prebid.ad.smaato.net/oapi/prebid',
        data: JSON.stringify(payloadAsJsObj)
      }
    }

    const NATIVE_RESPONSE = {
      ver: '1.2',
      link: {
        url: 'https://link.url',
        clicktrackers: [
          'http://click.url/v1/click?e=prebid'
        ]
      },
      assets: [
        {
          id: 0,
          required: 1,
          title: {
            text: 'Title'
          }
        },
        {
          id: 2,
          required: 1,
          img: {
            type: 1,
            url: 'https://logo.png',
            w: 40,
            h: 40
          }
        },
        {
          id: 4,
          required: 1,
          img: {
            type: 3,
            url: 'https://main.png',
            w: 480,
            h: 320
          }
        },
        {
          id: 3,
          required: 1,
          data: {
            type: 2,
            value: 'Desc'
          }
        },
        {
          id: 14,
          required: 1,
          data: {
            type: 12,
            value: 'CTAText'
          }
        },
        {
          id: 5,
          required: 0,
          data: {
            type: 3,
            value: '2 stars'
          }
        }
      ],
      eventtrackers: [
        {
          event: 2,
          method: 1,
          url: 'https://js.url'
        },
        {
          event: 1,
          method: 1,
          url: 'http://view.url/v1/view?e=prebid'
        }
      ],
      privacy: 'https://privacy.com/'
    }

    const buildOpenRtbBidResponse = (adType) => {
      let adm = '';

      switch (adType) {
        case ADTYPE_IMG:
          adm = '<a rel="nofollow" href="https://prebid.net/click"><img src="https://prebid.net/images/image.png" alt="" width="480" height="320" /></a>'
          break;
        case ADTYPE_VIDEO:
          adm = '<VAST version="2.0"></VAST>';
          break;
        case ADTYPE_NATIVE:
          adm = JSON.stringify({native: NATIVE_RESPONSE})
          break;
        default:
          throw Error('Invalid AdType');
      }

      return {
        body: {
          bidid: '04db8629-179d-4bcd-acce-e54722969006',
          cur: 'USD',
          ext: {},
          id: '5ebea288-f13a-4754-be6d-4ade66c68877',
          seatbid: [
            {
              bid: [
                {
                  'adm': adm,
                  'adomain': [
                    'smaato.com'
                  ],
                  'bidderName': 'smaato',
                  'cid': 'CM6523',
                  'crid': 'CR69381',
                  'dealid': '12345',
                  'id': '6906aae8-7f74-4edd-9a4f-f49379a3cadd',
                  'impid': '226416e6e6bf41',
                  'iurl': 'https://prebid/iurl',
                  'nurl': 'https://prebid/nurl',
                  'price': 0.01,
                  'w': 350,
                  'h': 50,
                  'ext': {
                    curls: ['https://prebid/track/click/1']
                  }
                }
              ],
              seat: 'CM6523'
            }
          ],
        },
        headers: {
          get: function (header) {
            if (header === 'X-SMT-ADTYPE') {
              return adType;
            }
          }
        }
      };
    };

    it('returns empty array on no bid responses', () => {
      const response_with_empty_body = {body: {}};

      const bids = spec.interpretResponse(response_with_empty_body, buildBidRequest());

      expect(bids).to.be.empty;
    });

    describe('non ad pod', () => {
      it('single banner response', () => {
        const bids = spec.interpretResponse(buildOpenRtbBidResponse(ADTYPE_IMG), buildBidRequest());

        expect(bids).to.deep.equal([
          {
            requestId: '226416e6e6bf41',
            cpm: 0.01,
            width: 350,
            height: 50,
            ad: '<div style="cursor:pointer" onclick="fetch(decodeURIComponent(\'https%3A%2F%2Fprebid%2Ftrack%2Fclick%2F1\'), {cache: \'no-cache\'});"><a rel="nofollow" href="https://prebid.net/click"><img src="https://prebid.net/images/image.png" alt="" width="480" height="320" /></a></div>',
            ttl: 300,
            creativeId: 'CR69381',
            dealId: '12345',
            netRevenue: true,
            currency: 'USD',
            mediaType: 'banner',
            meta: {
              advertiserDomains: ['smaato.com'],
              agencyId: 'CM6523',
              networkName: 'smaato',
              mediaType: 'banner'
            }
          }
        ]);
      });

      it('single video response', () => {
        const bids = spec.interpretResponse(buildOpenRtbBidResponse(ADTYPE_VIDEO), buildBidRequest());

        expect(bids).to.deep.equal([
          {
            requestId: '226416e6e6bf41',
            cpm: 0.01,
            width: 350,
            height: 50,
            vastXml: '<VAST version="2.0"></VAST>',
            ttl: 300,
            creativeId: 'CR69381',
            dealId: '12345',
            netRevenue: true,
            currency: 'USD',
            mediaType: 'video',
            meta: {
              advertiserDomains: ['smaato.com'],
              agencyId: 'CM6523',
              networkName: 'smaato',
              mediaType: 'video'
            }
          }
        ]);
      });

      it('single native response', () => {
        const bids = spec.interpretResponse(buildOpenRtbBidResponse(ADTYPE_NATIVE), buildBidRequest());

        expect(bids).to.deep.equal([
          {
            requestId: '226416e6e6bf41',
            cpm: 0.01,
            width: 350,
            height: 50,
            native: {
              ortb: NATIVE_RESPONSE
            },
            ttl: 300,
            creativeId: 'CR69381',
            dealId: '12345',
            netRevenue: true,
            currency: 'USD',
            mediaType: 'native',
            meta: {
              advertiserDomains: ['smaato.com'],
              agencyId: 'CM6523',
              networkName: 'smaato',
              mediaType: 'native'
            }
          }
        ]);
      });

      it('ignores bid response with invalid ad type', () => {
        const serverResponse = buildOpenRtbBidResponse(ADTYPE_IMG);
        serverResponse.headers.get = (header) => {
          if (header === 'X-SMT-ADTYPE') {
            return undefined;
          }
        };

        const bids = spec.interpretResponse(serverResponse, buildBidRequest());

        expect(bids).to.be.empty;
      });
    });

    describe('ad pod', () => {
      const bidRequestWithAdpodContext = buildBidRequest({imp: [{video: {ext: {context: 'adpod'}}}]});
      const PRIMARY_CAT_ID = 1337
      const serverResponse = {
        body: {
          bidid: '04db8629-179d-4bcd-acce-e54722969006',
          cur: 'USD',
          ext: {},
          id: '5ebea288-f13a-4754-be6d-4ade66c68877',
          seatbid: [
            {
              bid: [
                {
                  adm: '<VAST version="2.0"></VAST>',
                  adomain: [
                    'smaato.com'
                  ],
                  bidderName: 'smaato',
                  cid: 'CM6523',
                  crid: 'CR69381',
                  dealid: '12345',
                  id: '6906aae8-7f74-4edd-9a4f-f49379a3cadd',
                  impid: '226416e6e6bf41',
                  iurl: 'https://prebid/iurl',
                  nurl: 'https://prebid/nurl',
                  price: 0.01,
                  w: 350,
                  h: 50,
                  cat: [PRIMARY_CAT_ID],
                  ext: {
                    duration: 42
                  }
                }
              ],
              seat: 'CM6523'
            }
          ]
        },
        headers: {get: () => undefined}
      };

      it('sets required values for adpod bid from server response', () => {
        const bids = spec.interpretResponse(serverResponse, bidRequestWithAdpodContext);

        expect(bids).to.deep.equal([
          {
            requestId: '226416e6e6bf41',
            cpm: 0.01,
            width: 350,
            height: 50,
            vastXml: '<VAST version="2.0"></VAST>',
            ttl: 300,
            creativeId: 'CR69381',
            dealId: '12345',
            netRevenue: true,
            currency: 'USD',
            mediaType: 'video',
            video: {
              context: 'adpod',
              durationSeconds: 42
            },
            meta: {
              advertiserDomains: ['smaato.com'],
              agencyId: 'CM6523',
              networkName: 'smaato',
              mediaType: 'video'
            }
          }
        ]);
      });

      it('sets primary category id in case of enabled brand category exclusion', () => {
        config.setConfig({adpod: {brandCategoryExclusion: true}});

        const bids = spec.interpretResponse(serverResponse, bidRequestWithAdpodContext)

        expect(bids[0].meta.primaryCatId).to.be.equal(PRIMARY_CAT_ID)
      })
    });

    it('uses correct TTL when expire header exists', () => {
      const clock = sinon.useFakeTimers();
      clock.tick(2000);
      const resp = buildOpenRtbBidResponse(ADTYPE_IMG);
      resp.headers.get = (header) => {
        if (header === 'X-SMT-ADTYPE') {
          return ADTYPE_IMG;
        }
        if (header === 'X-SMT-Expires') {
          return 2000 + (400 * 1000);
        }
      };

      const bids = spec.interpretResponse(resp, buildBidRequest());

      expect(bids[0].ttl).to.equal(400);

      clock.restore();
    });

    it('uses net revenue flag send from server', () => {
      const resp = buildOpenRtbBidResponse(ADTYPE_IMG);
      resp.body.seatbid[0].bid[0].ext = {net: false};

      const bids = spec.interpretResponse(resp, buildBidRequest());

      expect(bids[0].netRevenue).to.equal(false);
    });

    it('uses dsa object sent from server', () => {
      const resp = buildOpenRtbBidResponse(ADTYPE_IMG);
      const dsa = {
        behalf: 'advertiser',
        paid: 'advertiser',
        adrender: 1,
        transparency: [
          {
            domain: 'dsp1domain.com',
            dsaparams: [1, 2]
          }
        ]
      };
      resp.body.seatbid[0].bid[0].ext.dsa = dsa;

      const bids = spec.interpretResponse(resp, buildBidRequest());

      expect(bids[0].meta.dsa).to.deep.equal(dsa);
    });

    it('does not use dsa object if not sent from server', () => {
      const resp = buildOpenRtbBidResponse(ADTYPE_IMG);
      resp.body.seatbid[0].bid[0].ext = {}

      const bids = spec.interpretResponse(resp, buildBidRequest());

      expect(bids[0].meta.dsa).to.be.undefined;
    });
  });

  describe('getUserSyncs', () => {
    afterEach(() => {
      config.resetConfig();
    })

    it('when pixelEnabled and iframeEnabled false then returns no syncs', () => {
      expect(spec.getUserSyncs()).to.be.empty
    })

    it('when pixelEnabled true then returns image sync', () => {
      expect(spec.getUserSyncs({pixelEnabled: true}, null, null, null)).to.deep.equal(
        [
          {
            type: 'image',
            url: IMAGE_SYNC_URL
          }
        ]
      )
    })

    it('when iframeEnabled true then returns iframe sync', () => {
      expect(spec.getUserSyncs({iframeEnabled: true}, null, null, null)).to.deep.equal(
        [
          {
            type: 'iframe',
            url: IFRAME_SYNC_URL
          }
        ]
      )
    })

    it('when iframeEnabled true and syncsPerBidder then returns iframe sync', () => {
      config.setConfig({userSync: {syncsPerBidder: 5}});
      expect(spec.getUserSyncs({iframeEnabled: true}, null, null, null)).to.deep.equal(
        [
          {
            type: 'iframe',
            url: `${IFRAME_SYNC_URL}&maxUrls=5`
          }
        ]
      )
    })

    it('when iframeEnabled and pixelEnabled true then returns iframe sync', () => {
      expect(spec.getUserSyncs({pixelEnabled: true, iframeEnabled: true}, null, null, null)).to.deep.equal(
        [
          {
            type: 'iframe',
            url: IFRAME_SYNC_URL
          }
        ]
      )
    })

    it('when pixelEnabled true and gdprConsent then returns image sync with gdpr params', () => {
      expect(spec.getUserSyncs({pixelEnabled: true}, null, {gdprApplies: true, consentString: CONSENT_STRING}, null)).to.deep.equal(
        [
          {
            type: 'image',
            url: `${IMAGE_SYNC_URL}&gdpr=1&gdpr_consent=${CONSENT_STRING}`
          }
        ]
      )
    })

    it('when iframeEnabled true and gdprConsent then returns iframe with gdpr params', () => {
      expect(spec.getUserSyncs({iframeEnabled: true}, null, {gdprApplies: true, consentString: CONSENT_STRING}, null)).to.deep.equal(
        [
          {
            type: 'iframe',
            url: `${IFRAME_SYNC_URL}&gdpr=1&gdpr_consent=${CONSENT_STRING}`
          }
        ]
      )
    })

    it('when pixelEnabled true and gdprConsent without gdpr then returns pixel sync with gdpr_consent', () => {
      expect(spec.getUserSyncs({pixelEnabled: true}, null, {consentString: CONSENT_STRING}, null), null).to.deep.equal(
        [
          {
            type: 'image',
            url: `${IMAGE_SYNC_URL}&gdpr_consent=${CONSENT_STRING}`
          }
        ]
      )
    })

    it('when iframeEnabled true and gdprConsent without gdpr then returns iframe sync with gdpr_consent', () => {
      expect(spec.getUserSyncs({iframeEnabled: true}, null, {consentString: CONSENT_STRING}, null), null).to.deep.equal(
        [
          {
            type: 'iframe',
            url: `${IFRAME_SYNC_URL}&gdpr_consent=${CONSENT_STRING}`
          }
        ]
      )
    })
  })
});
