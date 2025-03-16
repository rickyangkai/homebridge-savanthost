import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { Client } from 'ssh2';
import { SavantHostPlatformAccessory } from './platformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

interface SceneInfo {
  sceneName: string;
  sceneId: string;
  sceneUser: string;
}

interface HubConfig {
  hostType: 'SmartHost' | 'ProHost';
  ip: string;
  port: number;
  username: string;
  password: string;
  statePollingInterval: number;
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
  private sshClient: Client | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnected = false;  // 添加连接状态标志
  private hubConfig: HubConfig | null = null;

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    // 初始化为空对象，确保不会出现 undefined
    this.CustomServices = {};
    this.CustomCharacteristics = {};

    // 使用异步 IIFE 来处理动态导入
    (async () => {
      try {
        const module = await import('homebridge-lib/EveHomeKitTypes');
        if (module && module.EveHomeKitTypes) {
          const eve = new module.EveHomeKitTypes(this.api);
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

    this.api.on('didFinishLaunching', () => {
      this.log.debug('执行 didFinishLaunching 回调');
      this.connectToHub();
    });
  }

  private async connectToHub() {
    if (!this.config.hubs?.[0]) {
      this.log.error('未找到有效的主机配置');
      return;
    }

    this.hubConfig = this.config.hubs[0] as HubConfig;
    
    // 确保设置了轮询间隔，如果未设置则使用默认值
    if (!this.hubConfig.statePollingInterval) {
      this.hubConfig.statePollingInterval = this.config.statePollingInterval || 300;
      this.log.info(`使用轮询间隔: ${this.hubConfig.statePollingInterval} 秒`);
    }
    
    try {
      await this.establishSSHConnection();
      this.startPolling();
    } catch (error) {
      this.log.error('连接到主机失败:', error);
      this.scheduleReconnect();
    }
  }

  private establishSSHConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.sshClient = new Client();
      
      this.sshClient
        .on('ready', () => {
          this.log.info('SSH 连接已建立');
          this.isConnected = true;  // 设置连接状态
          resolve();
        })
        .on('error', (err) => {
          this.log.error('SSH 连接错误:', err);
          this.isConnected = false;  // 更新连接状态
          reject(err);
        })
        .on('close', () => {
          this.log.warn('SSH 连接已关闭');
          this.isConnected = false;  // 更新连接状态
          this.scheduleReconnect();
        })
        .connect({
          host: this.hubConfig!.ip,
          port: this.hubConfig!.port,
          username: this.hubConfig!.username,
          password: this.hubConfig!.password,
          algorithms: {
            serverHostKey: ['ssh-rsa', 'ecdsa-sha2-nistp256', 'ssh-ed25519'],
          },
          hostVerifier: () => true,
          keepaliveInterval: 30000,       // 30秒发送一次保活包
          keepaliveCountMax: 5,           // 最多尝试5次保活
          readyTimeout: 30000,            // 连接超时时间30秒
          debug: (message: string) => {
            this.log.debug('SSH Debug:', message);
          },
        });
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      this.connectToHub();
    }, this.hubConfig!.statePollingInterval * 1000);
  }

  private startPolling() {
    // 验证轮询间隔
    const interval = this.hubConfig!.statePollingInterval || 300;
    if (interval < 60 || interval > 3600) {
      this.log.warn(`轮询间隔 ${interval} 超出范围，将使用默认值 300 秒`);
      this.hubConfig!.statePollingInterval = 300;
    }

    this.log.info(`开始场景轮询，间隔时间: ${this.hubConfig!.statePollingInterval} 秒`);
    
    // 立即执行第一次查询
    this.log.debug('执行首次场景查询');
    this.fetchScenes();

    const timer = setInterval(() => {
      // 检查SSH连接状态
      if (!this.isConnected) {
        this.log.warn('SSH连接已断开，尝试重新连接');
        this.connectToHub();
        return;
      }

      this.log.debug(`执行定时场景查询 (间隔: ${this.hubConfig!.statePollingInterval} 秒)`);
      this.fetchScenes();
    }, this.hubConfig!.statePollingInterval * 1000);

    // 确保定时器不会阻止进程退出
    timer.unref();
  }

  private getScliPath(): string {
    return this.hubConfig!.hostType === 'ProHost' 
      ? '/Users/rpm/Applications/RacePointMedia/sclibridge'
      : '/usr/local/bin/sclibridge';
  }

  private async executeCommand(command: string): Promise<{ stdout: string; stderr: string }> {
    const scliPath = this.getScliPath();
    const fullCommand = `${scliPath} ${command}`;
    this.log.debug('准备执行命令:', fullCommand);

    if (!this.sshClient) {
      this.log.error('SSH 客户端未连接，无法执行命令');
      return { stdout: '', stderr: '' };
    }

    return new Promise((resolve, reject) => {
      // 根据主机类型设置不同的环境变量和路径
      const setupCommands = this.hubConfig!.hostType === 'ProHost'
        ? [
          'export PATH="/Users/rpm/Applications/RacePointMedia:$PATH"',
          'cd /Users/rpm/Applications/RacePointMedia',  // 切换到正确的目录
        ]
        : [
          'export PATH="/usr/local/bin:$PATH"',
          'cd /usr/local/bin',
        ];

      // 组合所有命令
      const wrappedCommand = [...setupCommands, fullCommand].join(' && ');
      
      this.log.debug('完整命令:', wrappedCommand);
      
      this.sshClient!.exec(wrappedCommand, (err, stream) => {
        if (err) {
          this.log.error('执行命令失败:', err);
          reject(err);
          return;
        }

        let output = '';
        let errorOutput = '';

        stream.on('data', (data: Buffer) => {
          const str = data.toString();
          this.log.debug('收到命令输出:', str);
          output += str;
        });

        stream.stderr.on('data', (data: Buffer) => {
          const str = data.toString();
          this.log.debug('收到错误输出:', str);
          errorOutput += str;
        });

        stream.on('close', (code: number) => {
          this.log.debug('命令执行完成，退出码:', code);
          this.log.debug('清理后的输出:', output.trim());
          this.log.debug('错误输出:', errorOutput || '无错误输出');

          if (code !== 0) {
            this.log.error(`命令执行失败，退出码: ${code}`);
            this.log.error(`错误输出: ${errorOutput || '无错误输出'}`);
            resolve({ stdout: '', stderr: errorOutput });
            return;
          }

          resolve({ stdout: output.trim(), stderr: errorOutput });
        });
      });
    });
  }

  private async fetchScenes(): Promise<SceneInfo[]> {
    if (!this.isConnected) {
      this.log.error('SSH 客户端未连接，无法获取场景');
      return [];
    }

    try {
      this.log.debug('尝试获取场景列表');
      const command = 'getSceneNames';
      this.log.debug('执行场景查询命令:', `${this.getScliPath()} ${command}`);
      
      const { stdout } = await this.executeCommand(command);
      this.log.debug('收到原始场景数据:', stdout);
      const scenes = this.parseScenes(stdout);
      this.log.info(`成功解析 ${scenes.length} 个场景`);
      scenes.forEach(scene => {
        this.log.debug(`场景信息: 名称=${scene.sceneName}, ID=${scene.sceneId}, 用户=${scene.sceneUser}`);
      });
      this.updateAccessories(scenes);
      return scenes;
    } catch (error) {
      this.log.error('执行场景查询命令时出错:', error);
      this.isConnected = false;  // 更新连接状态
      await this.connectToHub();
      return [];
    }
  }

  private parseScenes(output: string): SceneInfo[] {
    if (!output) {
      this.log.warn('没有收到场景数据');
      return [];
    }

    const lines = output.split('\n').filter(line => line.trim());
    this.log.debug('场景数据行数:', lines.length);

    return lines.map(line => {
      this.log.debug('处理场景数据行:', line);
      const [sceneName, sceneId, sceneUser] = line.split(',').map(item => item.trim());
      if (!sceneName || !sceneId || !sceneUser) {
        this.log.warn('无效的场景数据行:', line);
        return null;
      }
      return { sceneName, sceneId, sceneUser };
    }).filter((scene): scene is SceneInfo => scene !== null);
  }

  private updateAccessories(scenes: SceneInfo[]) {
    this.log.debug('开始更新配件列表');
    this.log.debug('当前场景数量:', scenes.length);
    
    // 重置已发现的配件列表
    this.discoveredCacheUUIDs = [];
    this.scenes.clear(); // 清空现有场景列表

    // 创建一个 Map 来跟踪场景 ID 和对应的用户列表
    const sceneIdUsers = new Map<string, Set<string>>();

    // 首先收集所有相同 ID 的场景的用户
    for (const scene of scenes) {
      const users = sceneIdUsers.get(scene.sceneId) || new Set<string>();
      users.add(scene.sceneUser);
      sceneIdUsers.set(scene.sceneId, users);
    }

    for (const scene of scenes) {
      this.log.debug('处理场景:', scene.sceneName);
      const uuid = this.api.hap.uuid.generate(scene.sceneId);
      this.log.debug('场景UUID:', uuid);
      
      // 获取此场景 ID 的所有用户
      const users = sceneIdUsers.get(scene.sceneId);
      if (users && users.size > 1) {
        this.log.info(`场景 "${scene.sceneName}" (ID: ${scene.sceneId}) 有多个用户: ${Array.from(users).join(', ')}`);
      }

      // 添加到发现列表
      this.discoveredCacheUUIDs.push(uuid);
      this.scenes.set(scene.sceneName, scene);

      const existingAccessory = this.accessories.get(uuid);
      if (existingAccessory) {
        this.log.debug('更新现有配件:', scene.sceneName);
        
        // 检查是否需要更新用户
        if (existingAccessory.context.scene.sceneUser !== scene.sceneUser) {
          this.log.info(`更新场景 "${scene.sceneName}" 的用户从 "${existingAccessory.context.scene.sceneUser}" 到 "${scene.sceneUser}"`);
        }
        
        existingAccessory.context.scene = scene;
        this.api.updatePlatformAccessories([existingAccessory]);
        new SavantHostPlatformAccessory(this, existingAccessory);
      } else {
        this.log.debug('创建新配件:', scene.sceneName);
        const accessory = new this.api.platformAccessory(scene.sceneName, uuid);
        accessory.context.scene = scene;
        new SavantHostPlatformAccessory(this, accessory);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.set(uuid, accessory);
      }
    }

    // 移除不存在的配件
    const accessoriesToRemove: PlatformAccessory[] = [];
    for (const [uuid, accessory] of this.accessories) {
      if (!this.discoveredCacheUUIDs.includes(uuid)) {
        this.log.info('从缓存中移除配件:', accessory.displayName);
        accessoriesToRemove.push(accessory);
        this.accessories.delete(uuid);
      }
    }

    if (accessoriesToRemove.length > 0) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRemove);
    }

    this.log.debug('配件更新完成');
    this.log.debug('当前配件数量:', this.accessories.size);
    this.log.debug('当前场景数量:', this.scenes.size);
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('从缓存加载配件:', accessory.displayName);
    this.accessories.set(accessory.UUID, accessory);
  }

  public async activateScene(sceneName: string, sceneId: string, sceneUser: string): Promise<void> {
    if (!this.sshClient) {
      this.log.error('SSH 客户端未连接');
      return;
    }

    try {
      const command = `activateScene '${sceneName}' '${sceneId}' '${sceneUser}'`;
      this.log.debug('执行场景激活命令:', `${this.getScliPath()} ${command}`);
      
      const { stdout } = await this.executeCommand(command);
      this.log.debug('场景激活结果:', stdout);
    } catch (error) {
      this.log.error('执行场景激活命令时出错:', error);
    }
  }
}
