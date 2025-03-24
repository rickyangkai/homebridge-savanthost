import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import type { Logging } from 'homebridge';

interface AuthData {
  deviceId: string;
  activated: boolean;
  authCode?: string;
}

// 授权状态存储路径
const AUTH_FILE_PATH = path.join(os.homedir(), '.homebridge', 'savanthost-auth.json');

// 获取设备MAC地址
export async function getDeviceId(): Promise<string> {
  const networkInterfaces = os.networkInterfaces();
  
  // 尝试获取第一个非内部的网络接口的MAC地址
  for (const key of Object.keys(networkInterfaces)) {
    const interfaces = networkInterfaces[key];
    if (interfaces) {
      for (const intrfc of interfaces) {
        // 跳过内部接口和没有MAC地址的接口
        if (!intrfc.internal && intrfc.mac && intrfc.mac !== '00:00:00:00:00:00') {
          // 移除MAC地址中的冒号，转为大写
          return intrfc.mac.replace(/:/g, '').toUpperCase();
        }
      }
    }
  }
  
  // 如果无法获取MAC地址，生成一个基于主机名的唯一ID
  const fallbackId = crypto.createHash('md5').update(os.hostname()).digest('hex').toUpperCase().slice(0, 16);
  return fallbackId;
}

// 生成地址码
export async function generateAddressCode(deviceId: string): Promise<string> {
  // 对设备ID进行混淆处理，生成16位地址码
  const hash = crypto.createHash('sha256').update(deviceId + 'SavantHost').digest('hex');
  return hash.substring(0, 16).toUpperCase();
}

// 验证授权码
export function validateAuthCode(addressCode: string, authCode: string): boolean {
  // 实现验证逻辑：对地址码进行特定算法处理后生成授权码
  // 这里简单实现为对地址码进行反转后再进行SHA256哈希取前16位
  const expectedAuthCode = crypto.createHash('sha256')
    .update(addressCode.split('').reverse().join('') + 'SavantHostAuth')
    .digest('hex')
    .substring(0, 16)
    .toUpperCase();
  
  return authCode.toUpperCase() === expectedAuthCode;
}

// 读取授权信息
export async function getAuthData(log: Logging): Promise<AuthData> {
  try {
    const data = await fs.readFile(AUTH_FILE_PATH, 'utf-8');
    return JSON.parse(data) as AuthData;
  } catch (error) {
    log.debug('未找到授权文件或文件读取错误');
    // 获取设备ID并生成新的授权数据
    const deviceId = await getDeviceId();
    const newAuthData: AuthData = {
      deviceId,
      activated: false,
    };
    
    // 保存新的授权数据
    await saveAuthData(newAuthData, log);
    return newAuthData;
  }
}

// 保存授权信息
export async function saveAuthData(authData: AuthData, log: Logging): Promise<void> {
  try {
    await fs.mkdir(path.dirname(AUTH_FILE_PATH), { recursive: true });
    await fs.writeFile(AUTH_FILE_PATH, JSON.stringify(authData, null, 2));
  } catch (error) {
    log.error('保存授权数据失败:', error);
    throw error;
  }
}

// 激活插件
export async function activatePlugin(authCode: string, log: Logging): Promise<boolean> {
  try {
    const authData = await getAuthData(log);
    if (authData.activated) {
      log.info('插件已激活');
      return true;
    }
    
    const addressCode = await generateAddressCode(authData.deviceId);
    log.debug(`设备ID: ${authData.deviceId}, 地址码: ${addressCode}`);
    
    if (validateAuthCode(addressCode, authCode)) {
      authData.activated = true;
      authData.authCode = authCode;
      await saveAuthData(authData, log);
      log.info('插件已成功激活');
      return true;
    } else {
      log.error('授权码无效');
      return false;
    }
  } catch (error) {
    log.error('激活过程中出错:', error);
    return false;
  }
}

// 检查插件是否已激活
export async function isPluginActivated(log: Logging): Promise<boolean> {
  try {
    const authData = await getAuthData(log);
    return authData.activated;
  } catch (error) {
    log.error('检查授权状态失败:', error);
    return false;
  }
}

// 获取地址码
export async function getAddressCode(log: Logging): Promise<string> {
  try {
    const authData = await getAuthData(log);
    return await generateAddressCode(authData.deviceId);
  } catch (error) {
    log.error('获取地址码失败:', error);
    throw error;
  }
} 