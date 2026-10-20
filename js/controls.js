import GUI from 'lil-gui';
import { CONFIG_LIMITS } from './settings.js';

export function createCalibrationGUI(host, config, onChange) {
  const gui = new GUI({ container: host, width: 330, title: 'Ajustes SBS' });
  const controllers = [];
  const addNumber = (folder, key, name, step = 0.1) => {
    const [min, max] = CONFIG_LIMITS[key];
    const controller = folder.add(config, key, min, max, step).name(name).onChange(() => onChange(key));
    controllers.push(controller);
    return controller;
  };
  const stereo = gui.addFolder('Paralaje y tamaño');
  addNumber(stereo, 'parallax', 'Paralaje (% ancho)', 0.05);
  addNumber(stereo, 'scale', 'Escala (%)', 1);
  const alignment = gui.addFolder('Alineación');
  addNumber(alignment, 'panX', 'Mover X (% ancho)');
  addNumber(alignment, 'panY', 'Mover Y (% alto)');
  addNumber(alignment, 'vertical', 'Desnivel (% alto)', 0.05);
  const source = gui.addFolder('Formato SBS');
  controllers.push(source.add(config, 'format', { 'Completo (Full-SBS)': 'full', 'Comprimido (Half-SBS)': 'half' }).name('Tipo de SBS').onChange(() => onChange('format')));
  controllers.push(source.add(config, 'swap').name('Intercambiar L/R').onChange(() => onChange('swap')));
  return {
    gui,
    refresh() { controllers.forEach(controller => controller.updateDisplay()); },
    setEnabled(enabled) { host.inert = !enabled; host.querySelectorAll('input,select,button').forEach(input => { input.disabled = !enabled; }); },
    dispose() { gui.destroy(); },
  };
}
