# Homebridge Savant Host Plugin

[![npm](https://img.shields.io/npm/v/homebridge-savanthost.svg)](https://www.npmjs.com/package/homebridge-savanthost)
[![npm](https://img.shields.io/npm/dt/homebridge-savanthost.svg)](https://www.npmjs.com/package/homebridge-savanthost)

这是一个用于 Homebridge 的插件，可以将 Savant Host 的场景集成到 HomeKit 中。

> **📢 新消息**: 我们现已支持 **Home Assistant**！
> 如果您是 HA 用户，请访问我们的 [SavantHost for Home Assistant](https://github.com/rickyangkai/homeassistant-savanthost) 仓库。

## 功能特点

- **自动发现**: 通过 mDNS/Bonjour 自动发现局域网内的 Savant Host。
- **自动同步**: 自动拉取并同步所有场景。
- **即时控制**: 支持 HomeKit 场景激活。
- **稳定连接**: 内置自动重连与状态轮询机制。
- **广泛兼容**: 在 Docker、macOS (Intel/M芯片) 环境下测试通过。

## 安装

```bash
npm install -g homebridge-savanthost
```

## 授权系统

本插件采用授权码激活系统，首次使用需要获取授权码：

1. 安装并配置插件后，Homebridge 日志中会显示您的 **设备地址码**。
2. 请将地址码发送给开发者以获取 **授权码**。
3. 在插件配置界面的 "授权码" (`authCode`) 字段中输入授权码。
4. 重启 Homebridge。

## 配置说明

建议使用 Homebridge Config UI X 进行图形化配置。

| 参数名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `name` | string | "SavantHost" | 插件名称 |
| `authCode` | string | - | **(必填)** 插件授权码 |
| `statePollingInterval` | number | 300 | 场景同步轮询间隔（秒），范围 60-3600 |

### 示例配置 (config.json)

```json
{
  "platforms": [
    {
      "platform": "SavantHost",
      "name": "SavantHost",
      "authCode": "YOUR_AUTH_CODE_HERE",
      "statePollingInterval": 300
    }
  ]
}
```

## 许可证

MIT License
Copyright (c) 2024-2026 Rick Yang
