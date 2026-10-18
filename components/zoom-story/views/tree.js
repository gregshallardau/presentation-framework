// components/zoom-story/views/tree.js
// No seesaw: one tree growing right from the origin. `root: { view: 'tree',
// node: 'revenue' }` - the same beats (expand / collapse / set / camera) apply.
import { ANCHOR } from '../layout.js';

export const tree = {
	reach: 0,
	tilts: false,
	links: true,
	tilt: () => 0,
	anchor: () => ({ x: 0, y: 0 }),
	rect: () => ({ x: -ANCHOR.w / 2, y: -ANCHOR.h / 2, w: ANCHOR.w, h: ANCHOR.h }),
	mount(g) { g.innerHTML = ''; },
	update() {},
	readout: () => '',
};
