# Homebridge Savant Host Plugin

这是一个用于 Homebridge 的插件，可以将 Savant Host 的场景集成到 HomeKit 中。
由Savant中国区开发，禁止商用，仅用于测试，不承担测试的任何结果。

## 功能特点

- 通过 SSH 连接到 Savant Host
- 自动发现和同步场景
- 支持场景激活
- 自动重连机制
- 可配置的状态轮询间隔
- 场景名称建议不含打开或者关闭字符，Sir会识别出错，
- 此插件在Docker中已经测试工作正常，M芯片的MAC正常，未在linux系统中长时间测试。

## 安装

```bash
npm install -g homebridge-savanthost
```

## 授权系统

本插件采用授权码激活系统，首次使用需要获取授权码：

1. 安装并配置插件后，Homebridge日志中会显示您的设备地址码
2. 请将地址码发送给开发者以获取授权码
3. 在插件配置界面的"授权码"字段中输入授权码后重启Homebridge

## 配置参数说明

- `authCode`: 插件授权码
- `hostType`: 主机类型 (SmartHost、ProHost 或 ProHost Over 11.0.5)
- `ip`: Savant Host 的 IP 地址
- `port`: SSH 端口号
- `username`: SSH 用户名
- `password`: SSH 密码
- `statePollingInterval`: 状态轮询间隔（秒），范围 60-3600，默认 300

## 许可证

MIT
