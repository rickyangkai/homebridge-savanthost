# Homebridge Savant Host Plugin

这是一个用于 Homebridge 的插件，可以将 Savant Host 的场景集成到 HomeKit 中。
由Savant中国区开发，禁止商用，仅用于测试。
## 功能特点

- 通过 SSH 连接到 Savant Host
- 自动发现和同步场景
- 支持场景激活
- 自动重连机制
- 可配置的状态轮询间隔
- 目前未解决问题。SmartHost长时间使用SSH连接服务，会导致主机22端口禁用。
## 安装

```bash
npm install -g homebridge-savanthost
```

### 配置参数说明

- `hostType`: 主机类型 (SmartHost 或 ProHost)
- `ip`: Savant Host 的 IP 地址
- `port`: SSH 端口号
- `username`: SSH 用户名
- `password`: SSH 密码
- `statePollingInterval`: 状态轮询间隔（秒），范围 60-3600，默认 300

## 许可证

MIT
