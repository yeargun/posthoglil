import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {execFileSync} from 'node:child_process'
import {root,vendor,upstreamVersion,upstreamCommit} from './sdk-source.mjs'

export function checkUpstreamPin(){
  const published=JSON.parse(readFileSync(join(root,'node_modules/posthog-upstream/package.json'),'utf8'))
  assert.equal(published.version,upstreamVersion,'Installed npm baseline must match the SDK pin')
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:vendor,encoding:'utf8'}).trim()
  assert.equal(commit,upstreamCommit,'Upstream source checkout must match the SDK pin')
  assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:vendor,encoding:'utf8'}).trim(),'','The upstream source control must remain unmodified')
}
