import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import { SavantHostHomebridgePlatform } from './platform.js';

export class SavantHostPlatformAccessory {
  private switchService: Service;

  constructor(
    private readonly platform: SavantHostHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // 设置配件信息
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Savant')
      .setCharacteristic(this.platform.Characteristic.Model, 'Scene Switch')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.scene.sceneId);

    // 获取或创建开关服务
    this.switchService = this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch, accessory.context.scene.sceneName);

    // 设置开关名称
    this.switchService.setCharacteristic(this.platform.Characteristic.Name, accessory.context.scene.sceneName);

    // 注册开关状态处理器
    this.switchService.getCharacteristic(this.platform.Characteristic.On)
      .onSet(async (value) => {
        if (value) {
          const scene = this.accessory.context.scene;
          this.platform.log.debug('激活场景:', scene.sceneName);
          await this.platform.activateScene(scene.sceneName, scene.sceneId);
          // 延迟100ms后自动关闭开关
          setTimeout(() => {
            this.switchService.updateCharacteristic(this.platform.Characteristic.On, false);
          }, 100);
        }
      });

    this.platform.log.debug('创建场景开关:', accessory.context.scene.sceneName);
  }

  /**
   * 处理来自 HomeKit 的 "GET" 请求
   * 当 HomeKit 需要知道配件的当前状态时会触发这个请求
   */
  async getOn(): Promise<CharacteristicValue> {
    // 始终返回关闭状态，因为这是瞬时开关
    return false;
  }
}
