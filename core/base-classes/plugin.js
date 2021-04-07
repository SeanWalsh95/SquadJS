export default class Plugin {
  constructor(options) {
    this.options = options;
  }

  mount() {}
  unmount() {}

  async onExampleEvent(info) {}
}
