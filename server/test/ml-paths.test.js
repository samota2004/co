import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {projectRoot,resolveModelDirectory,modelDirectory} from '../services/project-paths.js';
import {featureSchema,modelMetadata} from '../services/ml-service.js';

test('Node resolves default and relative model overrides from the project root',()=>{
 assert.equal(modelDirectory,resolveModelDirectory(process.env.CYBERORBIT_MODEL_DIR,projectRoot));
 assert.equal(resolveModelDirectory('artifacts/custom',projectRoot),path.join(projectRoot,'artifacts','custom'));
 assert.equal(resolveModelDirectory(path.join(projectRoot,'other-models'),projectRoot),path.join(projectRoot,'other-models'));
 assert.equal(resolveModelDirectory('~/model-store',projectRoot),path.join(os.homedir(),'model-store'));
});

test('Node active schema retains the saved 21-feature ordering and matching metadata',()=>{
 assert.equal(featureSchema.feature_count,21);
 assert.equal(featureSchema.feature_names.length,21);
 assert.equal(modelMetadata.feature_count,21);
 assert.equal(featureSchema.feature_names[0],'logon_count');
 assert.equal(featureSchema.feature_names[20],'cross_source_activity');
});
