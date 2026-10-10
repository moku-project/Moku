import { meta } from './meta'
import { library } from './library'
import { progress } from './progress'
import { discovery } from './discovery'
import { downloads } from './downloads'
import { repositories } from './repositories'
import { extensions } from './extensions'
import { folders } from './folders'
import { automation } from './automation'
import { trackers } from './trackers'
import { serverSettings } from './serverSettings'
import { contentFilter } from './contentFilter'
import { storage } from './storage'
import { auth } from './auth'

export const tsunagu = {
	...meta,
	...library,
	...progress,
	...discovery,
	...downloads,
	...repositories,
	...extensions,
	...folders,
	...automation,
	...trackers,
	...serverSettings,
	...contentFilter,
	...storage,
	...auth,
}
