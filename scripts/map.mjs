// Regenerates docs/map (and the graphify graph) with the feature-map tool kept outside the repository.
// Tool location: NEXUS_PYTOOLS env var, else D:/Workspace/NexusOrchestrator/pytools.
//   npm run map                -> rebuild docs/map, then `graphify update .` when graphify is installed
//   npm run map:find -- <term> -> look up a screen, IPC channel or function
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const dir = process.env.NEXUS_PYTOOLS || 'D:/Workspace/NexusOrchestrator/pytools'
const tool = path.join(dir, 'electron_feature_map.py')
if (!fs.existsSync(tool)) {
  console.error(`map: ${tool} not found. Set NEXUS_PYTOOLS to the folder that has electron_feature_map.py.`)
  process.exit(1)
}

const [mode, ...rest] = process.argv.slice(2)
const args = [tool, '--project', '.', ...(mode === 'find' ? ['--find', ...rest] : [])]
const py = spawnSync(process.env.PYTHON || 'python', args, { stdio: 'inherit' })
if (py.status !== 0) process.exit(py.status ?? 1)

if (mode !== 'find') {
  const g = spawnSync('graphify', ['update', '.'], { stdio: 'inherit', shell: false })
  if (g.error) console.warn('map: graphify not found; docs/map was updated, the graph was not.')
  else if (g.status !== 0) process.exit(g.status ?? 1)
}
