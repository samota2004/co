import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {AGENT_VERSION, DEFAULT_CONFIG} from '../shared/contract.js';

// Run after building: a stale kit can consume a valid enrollment token before
// rejecting a newer backend configuration, leaving a never-connected device.
for (const directory of ['windows', 'install-kit']) {
  test(`${directory} release matches source and accepts the backend enrollment configuration`, async () => {
    const root = new URL(`../dist/${directory}/`, import.meta.url);
    const manifest = JSON.parse(await fs.readFile(new URL('package.json', root), 'utf8'));
    const contract = await import(new URL('shared/contract.js', root));
    assert.equal(manifest.version, AGENT_VERSION, 'Rebuild the distribution before sharing it');
    assert.equal(contract.AGENT_VERSION, AGENT_VERSION);
    assert.deepEqual(contract.validateConfig(DEFAULT_CONFIG), DEFAULT_CONFIG);
    for (const folder of ['src', 'shared', 'native', 'packaging']) {
      const source = new URL(`../${folder}/`, import.meta.url);
      for (const name of await fs.readdir(source, {recursive:true})) {
        if (!(await fs.stat(new URL(name.replaceAll('\\', '/'), source))).isFile()) continue;
        const relative = `${folder}/${name.replaceAll('\\', '/')}`;
        assert.deepEqual(await fs.readFile(new URL(relative, root)),
          await fs.readFile(new URL(`../${relative}`, import.meta.url)),
          `Stale packaged file: ${directory}/${relative}`);
      }
    }
  });
}
