# Homebridge Savant Host Plugin

这是一个用于 Homebridge 的插件，可以将 Savant Host 的场景集成到 HomeKit 中。

## 功能特点

- 通过 SSH 连接到 Savant Host
- 自动发现和同步场景
- 支持场景激活
- 自动重连机制
- 可配置的状态轮询间隔

## 安装

```bash
npm install -g homebridge-savanthost
```

## 配置

在 Homebridge 的 `config.json` 中添加以下配置：

```json
{
    "platform": "SavantHost",
    "name": "SavantHost",
    "hubs": [
        {
            "hostType": "linux",
            "ip": "YOUR_HOST_IP",
            "port": 22,
            "username": "YOUR_USERNAME",
            "password": "YOUR_PASSWORD",
            "statePollingInterval": 300
        }
    ]
}
```

### 配置参数说明

- `hostType`: 主机类型 (linux 或 macos)
- `ip`: Savant Host 的 IP 地址
- `port`: SSH 端口号
- `username`: SSH 用户名
- `password`: SSH 密码
- `statePollingInterval`: 状态轮询间隔（秒），范围 60-3600，默认 300

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 开发模式运行
npm run dev
```

## 许可证

MIT

<p align="center">

<img src="https://github.com/homebridge/branding/raw/latest/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>

