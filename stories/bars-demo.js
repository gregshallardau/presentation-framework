// stories/bars-demo.js - the balance-demo story, drawn as stacked bars.
// Same nodes, same beats: only the view changes. In and Out stand side by
// side, height = value; expanding a side opens its parts as a column beside it.
import balanceDemo from './balance-demo.js';

export default {
	...balanceDemo,
	root: { view: 'bars', left: 'in', right: 'out' },
	panels: { 'rent-chart': { at: 'rent', side: 'outer', w: 560, h: 330 } },
};
