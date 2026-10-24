// In-process events shared by main-process services (e.g. the Library tells Save backup that a game closed).
import { EventEmitter } from 'node:events'

const appEvents = new EventEmitter()
appEvents.setMaxListeners(50)
export default appEvents
