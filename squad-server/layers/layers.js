import axios from 'axios';

import Logger from 'core/logger';

import Layer from './layer.js';

class Layers {
  constructor() {
    this.layers = [];

    this.pulled = false;
  }

  async pull(force = false) {
    if (this.pulled && !force) {
      Logger.verbose('Layers', 2, 'Already pulled layers.');
      return;
    }
    if (force) Logger.verbose('Layers', 1, 'Forcing update to layer information...');

    this.layers = [];

    Logger.verbose('Layers', 1, 'Pulling layers...');
    const response = await axios.get(
      'https://cdn.jsdelivr.net/gh/Squad-Wiki-Editorial/squad-wiki-pipeline-map-data@dev/completed_output/_Current%20Version/finished.json'
    );

    for (const layer of response.data.Maps) {
      this.layers.push(new Layer(layer));
    }

    try {
      Logger.verbose('Layers', 1, 'Pulling layers...');
      const response = await axios.get(
        'https://raw.githubusercontent.com/Squad-Wiki-Editorial/squad-wiki-pipeline-map-data/dev/completed_output/2.0/finished_2.0.json'
      );

      for (const layer of response.data.Maps) {
        this.layers.push(new Layer(layer));
      }

      Logger.verbose('Layers', 1, `Pulled ${this.layers.length} layers.`);

      this.pulled = true;
    } catch (error) {
      Logger.verbose('Layers', 1, `Error pulling layers: ${error.message}`);
      Logger.verbose('Layers', 3, 'ERROR:', error);
    }

    this.pulled = true;

    return this.layers;
  }

  async getLayerByCondition(condition) {
    await this.pull();

    const matches = this.layers.filter(condition);
    if (matches.length === 1) return matches[0];

    return null;
  }

  getLayerByName(name) {
    return this.getLayerByCondition((layer) => layer.name === name);
  }

  getLayerByClassname(classname) {
    return this.getLayerByCondition((layer) => layer.classname === classname);
  }
}

export default new Layers();
