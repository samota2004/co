import {test} from 'node:test';
import assert from 'node:assert/strict';
import {updateFeatureState,getUserDayFeatures,getLatestUserDayFeatures,featureState} from '../services/ml-feature-aggregator.js';

test('endpoint events cannot be promoted into CERT user-day features',()=>{
  const before=featureState.size;
  for(const eventType of ['LOGIN','USB_CONNECTED','FILE_CHANGE','NETWORK_CONNECTION','APPLICATION_USAGE','EMAIL']){
    assert.throws(()=>updateFeatureState(featureState,{eventId:'fixed',userId:'employee',deviceId:'device',timestamp:'2026-10-20T12:00:00Z',eventType}),error=>error.code==='ML_DATA_INCOMPLETE'&&error.details.inferenceAllowed===false);
  }
  assert.equal(featureState.size,before);
  assert.equal(getUserDayFeatures(featureState,'employee','2026-10-20'),null);
  assert.equal(getLatestUserDayFeatures(featureState,'employee'),null);
});
