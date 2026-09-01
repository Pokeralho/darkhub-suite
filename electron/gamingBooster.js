

import { exec } from 'node:child_process'
import { EventEmitter } from 'node:events'
import os from 'node:os'
import ManagedProcessRegistry from './services/ManagedProcessRegistry.js'

export class GamingBooster extends EventEmitter {
  constructor() {
    super()
    this.isRunning = false
    this.interval = null
  }

  async start(independent = false) {
    if (this.isRunning) return
    this.isRunning = true

    const mode = independent ? 'Modo Independente' : 'Modo Overlay'
    this.emit('log', `Gaming Booster iniciado - ${mode} (Ultra Low Latency)`)

    this.interval = setInterval(async () => {
      if (!this.isRunning) return

      try {
        await this.prioritizeGameProcesses()

        if (!independent) {
          this.emit('log', 'Otimizações em tempo real aplicadas')
        }
      } catch (err) {
        this.emit('error', err.message)
      }
    }, independent ? 90000 : 60000)
  }

  stop() {
    if (!this.isRunning) return
    this.isRunning = false
    if (this.interval) clearInterval(this.interval)
    this.emit('log', 'Gaming Booster parado')
  }

  async prioritizeGameProcesses() {
    const gameProcesses = ['cs2', 'valorant', 'fortnite', 'minecraft', 'warframe', 'league of legends', 'overwatch', 'apex', 'javaw', 'fortniteclient-win64-shipping', 'r5apex']

    return new Promise((resolve) => {
      exec('tasklist /FO CSV /NH', { windowsHide: true }, (err, stdout) => {
        if (!err && stdout) {
          const lines = stdout.split('\n')
          for (const line of lines) {
            const parts = line.split('","')
            if (parts.length >= 2) {
              const name = parts[0].replace(/"/g, '').toLowerCase().replace('.exe', '')
              const pid = parseInt(parts[1], 10)
              if (gameProcesses.includes(name) && !isNaN(pid)) {
                // Pula PIDs já gerenciados por outro mecanismo (ex: Ultra
                // Low Latency Mode do latencyGuardian.js), evitando que os
                // dois sistemas escrevam prioridade no mesmo processo por
                // vias diferentes (os.setPriority vs PowerShell
                // PriorityClass) sem coordenação.
                if (ManagedProcessRegistry.isManaged(pid)) continue
                try {
                  os.setPriority(pid, os.constants.priority.PRIORITY_HIGH)
                } catch (e) {}
              }
            }
          }
        }
        resolve()
      })
    })
  }

  async clearStandbyMemory() {
    // Migrado para uso apenas na ferramenta dedicada do latencyGuardian.
    // O GC() do PowerShell apenas limpava a memória do próprio PowerShell.
  }
}

export const gamingBooster = new GamingBooster()
