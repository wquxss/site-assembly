import { initAgentBuild } from '../skills/site-assembly/assets/starter/agent-build.js';

const preference = matchMedia('(prefers-reduced-motion: reduce)');
const setTour = initAgentBuild(preference, {
  fitEnd: false,
  labels: { pause: 'Pause tour', resume: 'Resume tour', replay: 'Replay tour' },
  names: ['Layout', 'Visuals', 'Detail', 'Copy', 'Headlines', 'Editing', 'Interface', 'Navigation', 'Build'],
  cursorPrefix: 'AI · ',
});
const update = () => setTour(!preference.matches);
preference.addEventListener('change', update);
update();
