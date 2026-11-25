export class StatsPanel {
  constructor(hudRoot, renderPipeline) {
    this.hudRoot = hudRoot;
    this.renderPipeline = renderPipeline;
    this.hardwareInfo = renderPipeline.getDebugGpuInfo();
  }

  getHardwareInfo() {
    return this.hardwareInfo;
  }

  update(dt) {}
}
