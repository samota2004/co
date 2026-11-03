import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('official Mac release script uses the same employee ZIP name and preserves its checksum sidecar',async()=>{
  const script=await fs.readFile(new URL('../packaging/release/build-macos.sh',import.meta.url),'utf8');
  assert.match(script,/CYBERORBIT-macOS-Employee\.zip/);
  assert.match(script,/candidate_checksum="\$candidate\.sha256"/);
  assert.match(script,/mv "\$candidate_checksum" "\$output\.sha256"/);
  assert.doesNotMatch(script,/CYBERORBIT-macOS-Install-Kit\.zip/);
  assert.match(script,/Unsupported build CPU/);
});
