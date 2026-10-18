// stories/balance-demo.js - a <deck-zoom-story> story, picked up automatically
// by name: <deck-zoom-story story="balance-demo">. Authoring guide:
// components/zoom-story/README.md.
//
// Monthly cash flow as a seesaw: two numbers, a balance, what tips it, what
// sits inside each side, then everything folded back into In and Out.
export default {
	root: { view: 'balance', left: 'in', right: 'out' },
	format: { prefix: '$' },
	nodes: {
		in: { label: 'In', tone: 'success', children: ['salary', 'side'] },
		salary: { label: 'Salary', children: ['base', 'overtime'] },
		base: { label: 'Base pay', value: 4200 },
		overtime: { label: 'Overtime', value: 600 },
		side: { label: 'Side income', children: ['freelance', 'sales'] },
		freelance: { label: 'Freelance', value: 700 },
		sales: { label: 'Online sales', value: 500 },

		out: { label: 'Out', tone: 'danger', children: ['housing', 'living'] },
		housing: { label: 'Housing', children: ['rent', 'utilities'] },
		rent: { label: 'Rent', value: 2200 },
		utilities: { label: 'Utilities', value: 400 },
		living: { label: 'Living', children: ['food', 'transport', 'fun'] },
		food: { label: 'Food', value: 1500 },
		transport: { label: 'Transport', value: 900 },
		fun: { label: 'Fun', value: 1000 },
	},
	// a chart placed in the world, beside Rent; the slide supplies the element
	panels: {
		'rent-chart': { at: 'rent', side: 'outer', w: 560, h: 330 },
	},
	beats: [
		/* 0 */ { show: 'in,out', camera: 'in,out' },          // two numbers
		/* 1 */ { show: 'root', camera: 'auto' },              // on a seesaw, in balance
		/* 2 */ { set: { rent: '+1200' } },                    // Out grows: it tips
		/* 3 */ { hint: ['raise:in', 'lower:out'] },           // two ways back
		/* 4 */ { expand: 'in,out', camera: 'auto' },          // what's inside each side
		/* 5 */ { expand: 'in.*,out.*', camera: 'auto' },      // and inside those
		/* 6 */ { camera: 'rent,rent-chart' },                 // why: rent's trend
		/* 7 */ { set: { freelance: '+1200' }, hide: 'rent-chart', camera: 'auto' }, // raise In: balance again
		/* 8 */ { collapse: '*', camera: 'in,out,root' }, // fold it all back
	],
};
