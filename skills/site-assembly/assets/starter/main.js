import { initAgentBuild } from './agent-build.js';

const preference = matchMedia('(prefers-reduced-motion: reduce)');
const setTour = initAgentBuild(preference);

function update() {
  setTour(!preference.matches);
}

preference.addEventListener('change', update);
update();
