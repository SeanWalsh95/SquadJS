export default class BaseServer {
  constructor(options, connectors) {
    // Connetors is a map of name -> instance.
    this.connectors = connectors;

    // Stores a list of active plugins.
    this.plugins = [];
  }

  // Add the plugin to a list of active plugins on mount.
  mount(plugin) {
    this.plugins.push(plugin);
    plugin.mount();
  }

  unmount(plugin) {
    this.plugins = this.plugins.filter((plugin) => !plugin);
    plugin.unmount(); // Again not async.
  }

  // Calls all plugin's method for event.
  async callPluginMethod(name, data) {
    await Promise.allSettled(this.plugins.map((plugin) => plugin[name](data)));
  }
}
