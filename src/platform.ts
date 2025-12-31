import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import axios from 'axios';
import { Bonjour } from 'bonjour-service';
import https from 'https';
import { SavantHostPlatformAccessory } from './platformAccessory';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { activatePlugin, getAddressCode, isPluginActivated } from './auth';

interface SceneInfo {
  sceneName: string;
  sceneId: string;
}

// 声明 EveHomeKitTypes 类型
type CustomServiceType = {
  [key: string]: typeof Service;
};

type CustomCharacteristicType = {
  [key: string]: typeof Characteristic;
};

export class SavantHostHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;


  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  private discoveredCacheUUIDs: string[] = [];

  // 修改类型定义
  private CustomServices: CustomServiceType = {};
  private CustomCharacteristics: CustomCharacteristicType = {};

  private readonly scenes: Map<string, SceneInfo> = new Map();
  private pollTimer: NodeJS.Timeout | null = null;
  private isActivated = false;

  private bonjour: Bonjour;
  private savantHost: { ip: string; port: number; hostname: string } | null = null;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.bonjour = new Bonjour();

    // 初始化为空对象，确保不会出现 undefined
    this.CustomServices = {};
    this.CustomCharacteristics = {};

    // 使用异步 IIFE 来处理动态导入
    (async () => {
      try {
        const { EveHomeKitTypes } = await import('homebridge-lib/lib/EveHomeKitTypes.js');
        if (EveHomeKitTypes) {
          const eve = new EveHomeKitTypes(this.api);
          this.CustomServices = eve.Services as CustomServiceType;
          this.CustomCharacteristics = eve.Characteristics as CustomCharacteristicType;
          this.log.debug('成功加载 EveHomeKitTypes');
        } else {
          this.log.warn('EveHomeKitTypes 模块不可用');
        }
      } catch (error) {
        this.log.error('加载 EveHomeKitTypes 失败:', error);
      }
    })();

    this.log.debug('初始化平台:', this.config.name);

    this.api.on('didFinishLaunching', async () => {
      this.log.debug('执行 didFinishLaunching 回调');
      
      // 检查插件激活状态
      await this.checkActivation();
    });
  }

  // 检查插件激活状态
  private async checkActivation() {
    try {
      // 检查是否已激活
      this.isActivated = await isPluginActivated(this.log);
      
      if (this.isActivated) {
        this.log.info('插件已激活，开始运行...');
        this.startPolling();
        return;
      }
      
      // 获取配置中的授权码
      const authCode = this.config.authCode as string;
      
      if (!authCode) {
        // 获取地址码并提示用户
        const addressCode = await getAddressCode(this.log);
        this.log.warn('插件未激活！请联系开发者获取授权码');
        this.log.warn(`您的设备地址码: ${addressCode}`);
        this.log.warn('请在插件配置中填入授权码后重启Homebridge');
        return;
      }
      
      // 尝试激活插件
      const activationResult = await activatePlugin(authCode, this.log);
      
      if (activationResult) {
        this.isActivated = true;
        this.log.info('插件已成功激活，开始运行...');
        this.startPolling();
      } else {
        const addressCode = await getAddressCode(this.log);
        this.log.error('授权码无效，插件无法启动');
        this.log.warn(`您的设备地址码: ${addressCode}`);
        this.log.warn('请确认授权码正确或联系开发者获取新的授权码');
      }
    } catch (error) {
      this.log.error('检查授权状态出错:', error);
    }
  }

  private startPolling() {
    // 如果未激活，不启动
    if (!this.isActivated) {
      this.log.warn('插件未激活，无法启动轮询');
      return;
    }
    
    // 确保设置了轮询间隔
    let interval = this.config.statePollingInterval || 300;

    // 验证轮询间隔
    if (interval < 60 || interval > 3600) {
      this.log.warn(`轮询间隔 ${interval} 超出范围，将使用默认值 300 秒`);
      interval = 300;
    }

    this.log.info(`使用轮询间隔: ${interval} 秒`);
    
    // 启动发现和同步
    this.discoverAndSync();

    // 设置定时轮询
    this.pollTimer = setInterval(() => {
      this.log.debug(`执行定时场景查询 (间隔: ${interval} 秒)`);
      this.fetchScenes();
    }, interval * 1000);

    // 确保定时器不会阻止进程退出
    this.pollTimer.unref();
  }

  private async discoverAndSync() {
    await this.discoverHost();
    if (this.savantHost) {
      await this.fetchScenes();
    }
  }

  private async discoverHost(): Promise<void> {
    this.log.info('正在搜索 Savant 主机 (OpenAPI)...');
    return new Promise((resolve) => {
      const browser = this.bonjour.find({ type: 'soapi_sdo', protocol: 'tcp' });
      
      let resolved = false;
      
      // 设置发现超时
      setTimeout(() => {
        if (!resolved) {
          this.log.warn('搜索主机超时，未找到 Savant 主机。将在下一次轮询时重试。');
          browser.stop();
          resolve();
        }
      }, 5000);

      browser.on('up', (service) => {
        this.log.debug(`发现服务: ${service.name} (${service.type}) IP:${service.addresses} Port:${service.port}`);
        
        // 自动使用找到的第一个服务
        if (service.addresses && service.addresses.length > 0) {
          // 优先使用 IPv4
          const ip = service.addresses.find((addr: string) => addr.includes('.')) || service.addresses[0];
          this.log.info(`找到主机: ${service.name} (${ip}:${service.port})`);
          this.savantHost = {
            ip: ip,
            port: service.port,
            hostname: service.host || service.name,
          };
          resolved = true;
          browser.stop();
          resolve();
        }
      });
    });
  }

  private async fetchScenes(): Promise<SceneInfo[]> {
    // 如果没有主机信息，尝试重新发现
    if (!this.savantHost) {
      await this.discoverHost();
    }
    
    // 如果仍然没有主机信息，返回空
    if (!this.savantHost) {
      this.log.error('无法获取场景：未连接到主机 (请检查主机是否在线以及是否开启了 OpenAPI)');
      return [];
    }

    try {
      const url = `http://${this.savantHost.ip}:${this.savantHost.port}/config/v1/scenes`;
      this.log.debug('获取场景:', url);
      
      const response = await axios.get(url, {
        timeout: 5000,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });

      const data = response.data;
      if (!Array.isArray(data)) {
        this.log.warn('场景数据格式错误: 期望数组');
        return [];
      }

      // 映射并过滤场景
      const scenes: SceneInfo[] = data.map((s: any) => ({
        sceneName: s.alias || s.name || 'Unknown',
        sceneId: s.id,
      })).filter(s => s.sceneId); // 确保有 ID

      this.log.info(`成功获取 ${scenes.length} 个场景`);
      
      // 只有成功获取到场景列表（即使为空列表，只要是正常的空）才更新配件
      // 这样可以避免因连接错误导致配件被错误删除
      this.updateAccessories(scenes);
      return scenes;

    } catch (error) {
      this.log.error('获取场景失败:', error instanceof Error ? error.message : String(error));
      
      // 如果发生错误，可能是 IP 变了或服务不可用
      // 清除当前主机信息，以便下次轮询时重新发现
      this.log.info('清除当前主机缓存，将在下次轮询时重新搜索主机...');
      this.savantHost = null;
      
      return [];
    }
  }

  private updateAccessories(scenes: SceneInfo[]) {
    const activeSceneIds = new Set<string>();

    for (const scene of scenes) {
      // 使用 UUID 库生成基于 sceneId 的 UUID
      const uuid = this.api.hap.uuid.generate(scene.sceneId);
      activeSceneIds.add(uuid);

      const existingAccessory = this.accessories.get(uuid);

      if (existingAccessory) {
        this.log.debug('恢复现有配件:', existingAccessory.displayName);
        // 更新场景名称
        existingAccessory.context.scene = scene;
        // 确保缓存的配件也更新
        this.api.updatePlatformAccessories([existingAccessory]);
        new SavantHostPlatformAccessory(this, existingAccessory);
      } else {
        this.log.info('添加新配件:', scene.sceneName);
        const accessory = new this.api.platformAccessory(scene.sceneName, uuid);
        accessory.context.scene = scene;
        new SavantHostPlatformAccessory(this, accessory);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.set(uuid, accessory);
      }
    }

    // 移除已删除的场景
    for (const [uuid, accessory] of this.accessories) {
      if (!activeSceneIds.has(uuid)) {
        this.log.info('移除已删除的配件:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.delete(uuid);
      }
    }
  }

  async activateScene(sceneName: string, sceneId: string) {
    if (!this.savantHost) {
      this.log.error('无法激活场景：未连接到主机');
      return;
    }

    try {
      const url = `http://${this.savantHost.ip}:${this.savantHost.port}/config/v1/scenes/${sceneId}/activate`;
      this.log.info(`正在激活场景: ${sceneName} (${sceneId})`);
      
      await axios.post(url, {}, {
        timeout: 5000,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });
      
      this.log.info(`场景激活成功: ${sceneName}`);
    } catch (error) {
      this.log.error('激活场景失败:', error instanceof Error ? error.message : String(error));
    }
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('加载缓存的配件:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }
}
