import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { Client } from 'ssh2';
import { SavantHostPlatformAccessory } from './platformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

import { EveHomeKitTypes } from 'homebridge-lib/EveHomeKitTypes';

interface SceneInfo {
  sceneName: string;
  sceneId: string;
  sceneUser: string;
}

interface HubConfig {
  hostType: 'linux' | 'macos';
  ip: string;
  port: number;
  username: string;
  password: string;
  statePollingInterval: number;
}


export class SavantHostHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;


  public readonly accessories: Map<string, PlatformAccessory> = new Map();
  private discoveredCacheUUIDs: string[] = [];

  // This is only required when using Custom Services and Characteristics not support by HomeKit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public readonly CustomServices: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public readonly CustomCharacteristics: any;

  private readonly scenes: Map<string, SceneInfo> = new Map();
  private sshClient: Client | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnected = false;  // 添加连接状态标志

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    // This is only required when using Custom Services and Characteristics not support by HomeKit
    this.CustomServices = new EveHomeKitTypes(this.api).Services;
    this.CustomCharacteristics = new EveHomeKitTypes(this.api).Characteristics;

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

    const hubConfig = this.config.hubs[0] as HubConfig;
    
    // 确保设置了轮询间隔，如果未设置则使用默认值
    if (!hubConfig.statePollingInterval) {
      hubConfig.statePollingInterval = this.config.statePollingInterval || 300;
      this.log.info(`使用轮询间隔: ${hubConfig.statePollingInterval} 秒`);
    }
    
    try {
      await this.establishSSHConnection(hubConfig);
      this.startPolling(hubConfig);
    } catch (error) {
      this.log.error('连接到主机失败:', error);
      this.scheduleReconnect(hubConfig);
    }
  }

  private establishSSHConnection(hubConfig: HubConfig): Promise<void> {
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
          this.scheduleReconnect(hubConfig);
        })
        .connect({
          host: hubConfig.ip,
          port: hubConfig.port,
          username: hubConfig.username,
          password: hubConfig.password,
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

  private scheduleReconnect(hubConfig: HubConfig) {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      this.connectToHub();
    }, hubConfig.statePollingInterval * 1000);
  }

  private startPolling(hubConfig: HubConfig) {
    // 验证轮询间隔
    const interval = hubConfig.statePollingInterval || 300;
    if (interval < 60 || interval > 3600) {
      this.log.warn(`轮询间隔 ${interval} 超出范围，将使用默认值 300 秒`);
      hubConfig.statePollingInterval = 300;
    }

    this.log.info(`开始场景轮询，间隔时间: ${hubConfig.statePollingInterval} 秒`);
    
    // 立即执行第一次查询
    this.log.debug('执行首次场景查询');
    this.fetchScenes(hubConfig);

    const timer = setInterval(() => {
      // 检查SSH连接状态
      if (!this.isConnected) {
        this.log.warn('SSH连接已断开，尝试重新连接');
        this.connectToHub();
        return;
      }

      this.log.debug(`执行定时场景查询 (间隔: ${hubConfig.statePollingInterval} 秒)`);
      this.fetchScenes(hubConfig);
    }, hubConfig.statePollingInterval * 1000);

    // 确保定时器不会阻止进程退出
    timer.unref();
  }

  private async fetchScenes(hubConfig: HubConfig) {
    if (!this.isConnected) {
      this.log.error('SSH 客户端未连接，无法获取场景');
      return;
    }

    // 使用完整路径执行命令
    const command = '/usr/local/bin/sclibridge getSceneNames';

    this.log.info('尝试获取场景列表');
    this.log.debug('执行场景查询命令:', command);

    try {
      this.executeCommand(command, (output) => {
        this.log.debug('收到原始场景数据:', output);
        const scenes = this.parseScenes(output);
        this.log.info(`成功解析 ${scenes.length} 个场景`);
        scenes.forEach(scene => {
          this.log.debug(`场景信息: 名称=${scene.sceneName}, ID=${scene.sceneId}, 用户=${scene.sceneUser}`);
        });
        this.updateAccessories(scenes, hubConfig);
      });
    } catch (error) {
      this.log.error('执行场景查询命令时出错:', error);
      this.isConnected = false;  // 更新连接状态
      this.connectToHub();
    }
  }

  private executeCommand(command: string, callback: (output: string) => void) {
    if (!this.sshClient) {
      this.log.error('SSH 客户端未连接，无法执行命令');
      return;
    }

    this.log.debug('准备执行命令:', command);
    
    // 使用登录 shell 执行命令
    const loginShellCommand = `bash -l -c '${command.replace(/'/g, '\'\\\'\'')}'`;
    
    // 直接执行命令
    this.sshClient.exec(loginShellCommand, {
      env: {
        'TERM': 'xterm',
      },
      pty: true,
    }, (err: Error | undefined, stream) => {
      if (err) {
        this.log.error('执行命令失败:', err);
        return;
      }

      this.log.debug('命令开始执行');
      let output = '';
      let errorOutput = '';

      stream
        .on('data', (data: Buffer) => {
          const str = data.toString();
          // 过滤掉提示符和其他无关输出
          if (!str.includes('→') && !str.match(/^srv:.*$/m)) {
            this.log.debug('收到命令输出 (data):', str);
            output += str;
          }
        })
        .on('stderr', (data: Buffer) => {
          const str = data.toString();
          this.log.error('收到错误输出 (stderr):', str);
          errorOutput += str;
        })
        .on('close', (code: number, signal?: string) => {
          this.log.info(`命令执行完成，退出码: ${code}${signal ? ', 信号: ' + signal : ''}`);
          
          // 清理输出，移除多余的空行和提示符
          output = output.split('\n')
            .filter(line => line.trim() && !line.includes('→') && !line.match(/^srv:.*$/))
            .join('\n');
          
          this.log.debug('清理后的输出:', output || '无输出');
          this.log.debug('错误输出:', errorOutput || '无错误输出');
          
          if (code !== 0) {
            this.log.error(`命令执行失败，退出码: ${code}`);
            this.log.error(`错误输出: ${errorOutput || '无错误输出'}`);
            return;
          }
          
          if (!output.trim()) {
            this.log.warn('命令执行成功但没有输出');
            return;
          }
          callback(output.trim());
        });

      stream.stderr.on('data', (data: Buffer) => {
        const str = data.toString();
        this.log.error('stderr 事件:', str);
      });

      stream.on('error', (err: Error) => {
        this.log.error('流错误:', err);
      });
    });
  }

  private checkLibraries(callback: () => void) {
    // 检查共享库位置
    const checkLibCommand = 'find /usr/local/savant -name "librpmGeneralUtils.so*" -o -name "librpm.so*"';
    
    this.sshClient!.exec(checkLibCommand, (err: Error | undefined, stream) => {
      if (err) {
        this.log.error('检查共享库时出错:', err);
        return;
      }

      let output = '';
      stream
        .on('data', (data: Buffer) => {
          output += data.toString();
        })
        .on('close', (code: number) => {
          if (code === 0 && output.trim()) {
            this.log.info('找到共享库文件:', output.trim());
            
            // 创建必要的符号链接
            const createLinksCommand = `
              mkdir -p /usr/local/savant/rpmlib
              ln -sf /usr/local/savant/lib/librpmGeneralUtils.so* /usr/local/savant/rpmlib/ 2>/dev/null || true
              ln -sf /usr/local/savant/lib/librpm.so* /usr/local/savant/rpmlib/ 2>/dev/null || true
            `;
            
            this.sshClient!.exec(createLinksCommand, (err: Error | undefined, stream) => {
              if (err) {
                this.log.error('创建符号链接时出错:', err);
                return;
              }
              
              stream.on('close', (code: number) => {
                if (code === 0) {
                  this.log.info('成功创建符号链接');
                } else {
                  this.log.error('创建符号链接失败');
                }
                callback();
              });
            });
          } else {
            this.log.error('未找到共享库文件');
            callback();
          }
        });
    });
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

  private updateAccessories(scenes: SceneInfo[], hubConfig: HubConfig) {
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
        existingAccessory.context.hubConfig = hubConfig;
        this.api.updatePlatformAccessories([existingAccessory]);
        new SavantHostPlatformAccessory(this, existingAccessory);
      } else {
        this.log.debug('创建新配件:', scene.sceneName);
        const accessory = new this.api.platformAccessory(scene.sceneName, uuid);
        accessory.context.scene = scene;
        accessory.context.hubConfig = hubConfig;
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

  public activateScene(scene: SceneInfo) {
    if (!this.sshClient) {
      this.log.error('SSH 客户端未连接');
      return;
    }

    const command = `/usr/local/bin/sclibridge activateScene '${scene.sceneName}' '${scene.sceneId}' '${scene.sceneUser}'`;

    this.executeCommand(command, (output) => {
      this.log.debug('场景激活结果:', output);
    });
  }
}
