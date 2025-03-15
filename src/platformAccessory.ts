import { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import { SavantHostHomebridgePlatform } from './platform.js';

export class SavantHostPlatformAccessory {
  private service: Service;

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
    this.service = this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch, accessory.context.scene.sceneName);

    // 设置开关名称
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.scene.sceneName);

    // 注册开关状态处理器
    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    this.platform.log.debug('创建场景开关:', accessory.context.scene.sceneName);
  }

  /**
   * 处理来自 HomeKit 的 "SET" 请求
   * 当用户改变配件状态时会触发这个请求，例如打开开关
   */
  async setOn(value: CharacteristicValue) {
    // 只在开关打开时触发场景
    if (value) {
      this.platform.log.debug('触发场景:', this.accessory.context.scene.sceneName);
      
      try {
        // 激活场景
        this.platform.activateScene(this.accessory.context.scene);
        
        // 延迟 1 秒后自动关闭开关
        setTimeout(() => {
          this.service.updateCharacteristic(this.platform.Characteristic.On, false);
        }, 1000);
      } catch (error) {
        this.platform.log.error('激活场景时出错:', error);
        throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      }
    }
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
