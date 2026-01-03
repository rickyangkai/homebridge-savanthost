#!/bin/bash

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Homebridge SavantHost 一键发布脚本 ===${NC}"

# 检查 npm 登录状态
echo -e "\n${GREEN}检查 NPM 登录状态...${NC}"
npm whoami > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${RED}错误: 您尚未登录 NPM。请先运行 'npm login' 登录。${NC}"
    exit 1
fi

# 1. 获取并显示当前版本
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "当前版本: ${YELLOW}$CURRENT_VERSION${NC}"

# 2. 提示输入新版本号
read -p "请输入新版本号 (例如 1.0.2): " NEW_VERSION

if [ -z "$NEW_VERSION" ]; then
    echo -e "${RED}错误: 版本号不能为空${NC}"
    exit 1
fi

# 3. 执行构建
echo -e "\n${GREEN}Step 1: 正在构建项目 (npm run build)...${NC}"
npm run build
if [ $? -ne 0 ]; then
    echo -e "${RED}构建失败，请检查代码错误${NC}"
    exit 1
fi

# 4. 提交当前所有更改
echo -e "\n${GREEN}Step 2: 检查并提交未保存的更改...${NC}"
if [ -n "$(git status --porcelain)" ]; then
    echo "发现未提交的更改，正在自动提交..."
    git add .
    git commit -m "chore: update before release $NEW_VERSION"
else
    echo "工作区已干净"
fi

# 5. 更新版本号 (npm version)
# 这会自动修改 package.json, package-lock.json, commit 并打 tag
echo -e "\n${GREEN}Step 3: 更新版本号到 $NEW_VERSION ...${NC}"
npm version $NEW_VERSION -m "chore: release %s"
if [ $? -ne 0 ]; then
    echo -e "${RED}版本更新失败，请检查版本号格式是否正确${NC}"
    exit 1
fi

# 6. 推送到 GitHub
echo -e "\n${GREEN}Step 4: 推送到 GitHub...${NC}"
git push && git push --tags
if [ $? -ne 0 ]; then
    echo -e "${RED}推送 GitHub 失败${NC}"
    exit 1
fi

# 7. 发布到 NPM
echo -e "\n${GREEN}Step 5: 发布到 NPM...${NC}"
npm publish
if [ $? -ne 0 ]; then
    echo -e "${RED}发布 NPM 失败${NC}"
    exit 1
fi

echo -e "\n${GREEN}🎉 发布成功！版本 $NEW_VERSION 已推送至 GitHub 并发布到 NPM。${NC}"
